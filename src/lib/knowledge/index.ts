// Chỉ mục truy xuất Second Brain. Notion là nguồn chuẩn; ở đây chỉ lưu bản đọc lại để tìm nhanh (FTS5) và dẫn link về Notion.
// Không có đường sửa nội dung trong hệ thống: mọi thay đổi tri thức phải làm ở Notion rồi đồng bộ lại.
import { createHash } from "node:crypto";
import { inArray, sql } from "drizzle-orm";
import { getDb, getSqlite, schema } from "@/db";
import { ftsQuery, statusRank, type KnowledgeHit, type KnowledgePage } from "./types";

type Row = typeof schema.knowledgeIndex.$inferSelect;

const toPage = (r: Row): KnowledgePage => ({ ...r, labels: safeArr(r.labels) });

function safeArr(s: string): string[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

export interface PageInput {
  id: string;
  title: string;
  url: string;
  section?: string;
  area?: string;
  kind?: string;
  status?: string;
  labels?: string[];
  sourceGrade?: string;
  notionEditedAt?: string | null;
  body?: string;
}

const normId = (id: string) => id.replace(/-/g, "").toLowerCase();

/** Ghi (thêm hoặc cập nhật) trang vào chỉ mục và bảng tìm kiếm trong một giao dịch. Trả về số trang thay đổi. */
export function upsertPages(pages: PageInput[], origin: "notion_sync" | "snapshot"): { changed: number; unchanged: number } {
  const sqlite = getSqlite();
  const now = new Date().toISOString();
  let changed = 0;
  let unchanged = 0;
  const getHash = sqlite.prepare("SELECT body_hash AS h, body AS b FROM knowledge_index WHERE id = ?");
  const upsert = sqlite.prepare(
    `INSERT INTO knowledge_index (id, title, url, section, area, kind, status, labels, source_grade, notion_edited_at, body, body_hash, origin, synced_at)
     VALUES (@id, @title, @url, @section, @area, @kind, @status, @labels, @sourceGrade, @notionEditedAt, @body, @bodyHash, @origin, @syncedAt)
     ON CONFLICT(id) DO UPDATE SET title=excluded.title, url=excluded.url, section=excluded.section, area=excluded.area, kind=excluded.kind,
       status=excluded.status, labels=excluded.labels, source_grade=excluded.source_grade, notion_edited_at=excluded.notion_edited_at,
       body=excluded.body, body_hash=excluded.body_hash, origin=excluded.origin, synced_at=excluded.synced_at`,
  );
  const delFts = sqlite.prepare("DELETE FROM knowledge_fts WHERE id = ?");
  const insFts = sqlite.prepare("INSERT INTO knowledge_fts (id, title, body) VALUES (?, ?, ?)");
  const tx = sqlite.transaction((items: PageInput[]) => {
    for (const p of items) {
      const id = normId(p.id);
      const prev = getHash.get(id) as { h: string; b: string } | undefined;
      // body undefined = trang không đổi trên Notion, giữ nội dung đã có
      const body = (p.body ?? prev?.b ?? "").normalize("NFC");
      const bodyHash = createHash("sha256").update(`${p.title}\n${p.status}\n${body}`).digest("hex");
      upsert.run({
        id,
        title: p.title.normalize("NFC"),
        url: p.url,
        section: p.section ?? "",
        area: p.area ?? "",
        kind: p.kind ?? "",
        status: (p.status ?? "DRAFT").toUpperCase(),
        labels: JSON.stringify(p.labels ?? []),
        sourceGrade: p.sourceGrade ?? "",
        notionEditedAt: p.notionEditedAt ?? null,
        body,
        bodyHash,
        origin,
        syncedAt: now,
      });
      if (prev?.h === bodyHash) {
        unchanged++;
        continue;
      }
      delFts.run(id);
      insFts.run(id, p.title.normalize("NFC"), body);
      changed++;
    }
  });
  tx(pages);
  return { changed, unchanged };
}

export interface SearchOptions {
  area?: string;
  includeArchived?: boolean;
  limit?: number;
}

/**
 * Tìm trong chỉ mục: khớp toàn văn (gõ có dấu hay không dấu đều được), xếp theo độ liên quan cộng trọng số trạng thái
 * (ACTIVE trước VERIFIED trước DRAFT). Không khớp đủ mọi từ thì nới sang khớp bất kỳ từ nào.
 */
export function searchKnowledge(q: string, opts: SearchOptions = {}): KnowledgeHit[] {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);
  const sqlite = getSqlite();
  const run = (match: string) =>
    sqlite
      .prepare(
        `SELECT k.*, bm25(knowledge_fts, 0, 4.0, 1.0) AS score, snippet(knowledge_fts, 2, '[', ']', '…', 16) AS snip
         FROM knowledge_fts JOIN knowledge_index k ON k.id = knowledge_fts.id
         WHERE knowledge_fts MATCH ? ${opts.includeArchived ? "" : "AND k.status != 'ARCHIVED'"} ${opts.area ? "AND k.area = ?" : ""}
         ORDER BY score + (CASE k.status WHEN 'ACTIVE' THEN 0 WHEN 'VERIFIED' THEN 1.5 WHEN 'DRAFT' THEN 3 ELSE 6 END) ASC
         LIMIT ${limit}`,
      )
      .all(...(opts.area ? [match, opts.area] : [match])) as (Record<string, unknown> & { score: number; snip: string })[];
  let rows: ReturnType<typeof run> = [];
  const and = ftsQuery(q, "and");
  if (and) rows = run(and);
  if (rows.length === 0) {
    const or = ftsQuery(q, "or");
    if (or && or !== and) rows = run(or);
  }
  return rows.map((r) => ({
    page: toPage({
      id: String(r.id), title: String(r.title), url: String(r.url), section: String(r.section), area: String(r.area), kind: String(r.kind),
      status: String(r.status), labels: String(r.labels), sourceGrade: String(r.source_grade), notionEditedAt: (r.notion_edited_at as string) ?? null,
      body: String(r.body), bodyHash: String(r.body_hash), origin: String(r.origin), syncedAt: String(r.synced_at),
    }),
    snippet: String(r.snip ?? ""),
    score: Number(r.score),
  }));
}

export function getKnowledgePages(ids: string[]): KnowledgePage[] {
  const clean = [...new Set(ids.map(normId))].filter(Boolean);
  if (!clean.length) return [];
  return getDb().select().from(schema.knowledgeIndex).where(inArray(schema.knowledgeIndex.id, clean)).all().map(toPage);
}

export function listKnowledge(): KnowledgePage[] {
  return getDb()
    .select()
    .from(schema.knowledgeIndex)
    .all()
    .map(toPage)
    .sort((a, b) => (statusRank[a.status] ?? 5) - (statusRank[b.status] ?? 5) || a.title.localeCompare(b.title, "vi"));
}

export interface KnowledgeStats {
  total: number;
  byStatus: Record<string, number>;
  byArea: Record<string, number>;
  lastSyncedAt: string | null;
  origins: string[];
}

export function knowledgeStats(): KnowledgeStats {
  const rows = getDb()
    .select({ status: schema.knowledgeIndex.status, area: schema.knowledgeIndex.area, origin: schema.knowledgeIndex.origin, at: schema.knowledgeIndex.syncedAt })
    .from(schema.knowledgeIndex)
    .all();
  const byStatus: Record<string, number> = {};
  const byArea: Record<string, number> = {};
  for (const r of rows) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    const a = r.area || "Chung";
    byArea[a] = (byArea[a] ?? 0) + 1;
  }
  const last = rows.reduce<string | null>((m, r) => (!m || r.at > m ? r.at : m), null);
  return { total: rows.length, byStatus, byArea, lastSyncedAt: last, origins: [...new Set(rows.map((r) => r.origin))] };
}

/** Ảnh chụp chỉ mục (JSON) do phiên Claude tạo qua kết nối Notion chỉ đọc, dùng khi hệ thống chưa có token Notion. */
export interface KnowledgeSnapshot {
  takenAt: string;
  takenBy: string;
  note?: string;
  pages: PageInput[];
}

export function importKnowledgeSnapshot(snap: KnowledgeSnapshot): { changed: number; unchanged: number; pages: number } {
  if (!snap || !Array.isArray(snap.pages)) throw new Error("Ảnh chụp không đúng định dạng: thiếu danh sách pages");
  const valid = snap.pages.filter((p) => p && typeof p.id === "string" && /^[0-9a-f-]{32,36}$/i.test(p.id) && typeof p.title === "string" && typeof p.url === "string");
  const r = upsertPages(valid, "snapshot");
  getDb().run(sql`INSERT INTO settings (key, value) VALUES ('knowledge.snapshot', ${JSON.stringify({ takenAt: snap.takenAt, takenBy: snap.takenBy, note: snap.note ?? "", pages: valid.length })}) ON CONFLICT(key) DO UPDATE SET value = excluded.value`);
  return { ...r, pages: valid.length };
}
