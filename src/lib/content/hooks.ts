// Bảng Hook & kịch bản video ngắn (Personal Brand System bước 3). Phần LOGIC ở đây (không gọi AI): ngữ cảnh căn cứ, luật ngôn từ theo
// nền tảng, lưu / chọn / bỏ hook, hook nhập tay. Phần gọi AI (10 hook mỗi lần) ở src/lib/ai.ts › generateHooks, qua Đội AI "AI Hook & Ý tưởng".
import { and, desc, eq, inArray, isNull, like, or } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { searchKnowledge } from "@/lib/knowledge";
import { usableStatus } from "@/lib/knowledge/types";
import { VLOG_MAX_SEC, vlogTemplate } from "./formats";
import { FIRST_PERSON_CLAIM, cleanBeats } from "./vlog-script";
import { policyIssues } from "./policy";
import { experienceSuggestions } from "./owner-experience";

export const HOOK_COUNT = 10; // sơ đồ OWNER: "mỗi lần gọi trả về 10 kết quả"
// OWNER 26/10: "content viết ra nên là dạng vlog chia sẻ dưới 1 phút" (trước: dưới 3 phút). Chỉ áp cho hook / kịch bản MỚI:
// cảnh báo luật lưu lúc tạo hook, nên hook / video đã làm không đổi.
export const MAX_SHORT_SEC = VLOG_MAX_SEC;
export const HOOK_PLATFORMS = ["facebook", "instagram", "tiktok", "youtube"] as const;

export interface HookBasis {
  kind: "finding" | "knowledge" | "insight";
  id: string;
  label: string;
  /** Tư liệu kinh nghiệm OWNER (Case Study / [OWNER] / N1–N2 / OWNER_VIEW) — hook kể chuyện riêng chỉ được dựa vào loại này. */
  owner?: boolean;
}

/** Hook chưa dựa trên tư liệu kinh nghiệm OWNER → vlog chia sẻ cần OWNER kể chuyện thật (nhãn "cần chuyện thật"). */
export const needsRealStory = (basis: HookBasis[]) => !basis.some((b) => b.owner);

export interface HookRow {
  id: string;
  batchId: string;
  topic: string;
  hook: string;
  angle: string;
  beats: string[];
  durationSec: number;
  platforms: string[];
  basis: HookBasis[];
  policyIssues: string[];
  source: "ai" | "manual";
  status: "new" | "picked" | "rejected";
  contentId: string | null;
  researchId: string | null;
  createdBy: string;
  createdAt: string;
}

// Luật ngôn từ theo nền tảng: src/lib/content/policy.ts (hàm thuần, dùng được cả trong trình duyệt). Giữ tên xuất cũ.
export { POLICY_RULES, policyIssues } from "./policy";

// ---------- Căn cứ cho AI: phát hiện nghiên cứu đã kiểm (bước 2) + Second Brain + insight đã duyệt ----------
export interface HookContext {
  text: string;
  basis: HookBasis[];
}

/** `researchId`: tạo hook từ một chủ đề nghiên cứu (bước 2 → 3) — chỉ dùng insight của chính chủ đề đó (kể cả insight theo luật / AI). */
export function hookContext(topic: string, researchId?: string): HookContext {
  const db = getDb();
  // Bỏ ký tự đại diện của LIKE (% _) khỏi từ khoá chủ đề
  const words = topic.toLowerCase().replace(/[%_\\]/g, " ").split(/\s+/).filter((w) => w.length >= 3).slice(0, 6);
  // Chỉ insight đã duyệt: đề xuất của AI tự nghiên cứu (chờ duyệt) không vào hook cho tới khi OWNER duyệt
  const findings = researchId
    ? db.select().from(schema.researchFindings).where(and(eq(schema.researchFindings.taskId, researchId), eq(schema.researchFindings.verifyOk, true), eq(schema.researchFindings.reviewStatus, "approved"))).limit(20).all()
    : db
        .select()
        .from(schema.researchFindings)
        .where(and(eq(schema.researchFindings.verifyOk, true), eq(schema.researchFindings.reviewStatus, "approved"), words.length ? or(...words.flatMap((w) => [like(schema.researchFindings.statement, `%${w}%`), like(schema.researchFindings.contentTopics, `%${w}%`)])) : undefined))
        .limit(8)
        .all();
  const knowledge = searchKnowledge(topic || "khách hàng", { limit: 10 }).filter((h) => usableStatus(h.page.status)).slice(0, 6);
  const insights = db.select().from(schema.insights).where(eq(schema.insights.status, "approved")).limit(8).all();
  // Tư liệu kinh nghiệm OWNER (SK-KNW-01: kinh nghiệm là nguồn sự thật) — có thì hook kể chuyện riêng được phép, chỉ đúng chi tiết trong đó
  const owner = experienceSuggestions(topic, { researchId, limit: 4 });
  const ownerKeys = new Set(owner.map((o) => `${o.kind}:${o.id}`));
  const basis: HookBasis[] = [
    ...findings.map((f) => ({ kind: "finding" as const, id: f.id, label: f.statement.slice(0, 120), ...(ownerKeys.has(`finding:${f.id}`) ? { owner: true } : {}) })),
    ...knowledge.map((h) => ({ kind: "knowledge" as const, id: h.page.id, label: h.page.title, ...(ownerKeys.has(`knowledge:${h.page.id}`) ? { owner: true } : {}) })),
    ...insights.map((i) => ({ kind: "insight" as const, id: i.id, label: i.title })),
  ];
  for (const o of owner) if (!basis.some((b) => b.kind === o.kind && b.id === o.id)) basis.push({ kind: o.kind, id: o.id, label: o.title.slice(0, 120), owner: true });
  const text = [
    `Phát hiện nghiên cứu đã kiểm (bước 2):\n${findings.map((f) => `- [finding:${f.id}] (${f.classification}) ${f.statement}${f.application ? ` — ứng dụng: ${f.application}` : ""}`).join("\n") || "(chưa có phát hiện khớp chủ đề)"}`,
    `Second Brain (ACTIVE / VERIFIED):\n${knowledge.map((h) => `- [knowledge:${h.page.id}] ${h.page.title}: ${h.page.body.slice(0, 600)}`).join("\n") || "(chưa có trang khớp)"}`,
    `Insight khách hàng đã duyệt:\n${insights.map((i) => `- [insight:${i.id}] ${i.title}: ${i.detail}`).join("\n") || "(chưa có)"}`,
    `KINH NGHIỆM THẬT CỦA OWNER (Second Brain [OWNER] / Case Study / Quan điểm OWNER):\n${owner.map((o) => `- [${o.kind}:${o.id}] (${o.tag}${o.draft ? " · nháp" : ""}) ${o.title}: ${o.snippet}`).join("\n") || "(KHÔNG CÓ — không viết hook kể trải nghiệm riêng)"}`,
  ].join("\n\n");
  return { text, basis };
}

// ---------- Lưu / đọc / chọn ----------
const newId = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const json = <T>(s: string, d: T): T => {
  try {
    return JSON.parse(s) as T;
  } catch {
    return d;
  }
};

export interface HookInput {
  hook: string;
  angle?: string;
  beats?: string[];
  durationSec?: number;
  platforms?: string[];
  basisRefs?: string[]; // "finding:<id>" | "knowledge:<id>" | "insight:<id>" — chỉ giữ ref có trong ngữ cảnh đã đưa
}

export function saveHooks(topic: string, items: HookInput[], opts: { source: "ai" | "manual"; by: string; allowed?: HookBasis[]; researchId?: string }): { batchId: string; ids: string[] } {
  const batchId = newId("hb");
  const now = new Date().toISOString();
  const allowed = new Map((opts.allowed ?? []).map((b) => [`${b.kind}:${b.id}`, b]));
  const rows = items
    .filter((i) => i.hook.trim())
    // Hook AI kể trải nghiệm riêng ngôi thứ nhất mà không dựa trên tư liệu OWNER → BỎ (không chỉ gắn nhãn): hệ thống không bịa chuyện.
    // Hook OWNER nhập tay là lời của chính anh — giữ.
    .filter((i) => opts.source !== "ai" || !FIRST_PERSON_CLAIM.test(i.hook) || (i.basisRefs ?? []).some((r) => allowed.get(r)?.owner))
    .map((i) => {
      const platforms = (i.platforms ?? []).filter((p) => (HOOK_PLATFORMS as readonly string[]).includes(p));
      const plats = platforms.length ? platforms : [...HOOK_PLATFORMS];
      const beats = (i.beats ?? []).map((b) => b.trim()).filter(Boolean).slice(0, 8);
      const durationSec = Math.max(5, Math.round(i.durationSec ?? 60));
      const basis = (i.basisRefs ?? []).map((r) => allowed.get(r)).filter((b): b is HookBasis => !!b);
      return {
        id: newId("hk"),
        batchId,
        topic: topic.slice(0, 300),
        hook: i.hook.trim().slice(0, 300),
        angle: (i.angle ?? "").trim().slice(0, 300),
        beats: JSON.stringify(beats),
        durationSec,
        platforms: JSON.stringify(plats),
        basis: JSON.stringify(basis),
        policyIssues: JSON.stringify(policyIssues([i.hook, i.angle ?? "", ...beats].join("\n"), plats, durationSec)),
        source: opts.source,
        status: "new",
        researchId: opts.researchId ?? null,
        createdBy: opts.by,
        createdAt: now,
      };
    });
  if (rows.length) getDb().insert(schema.hookIdeas).values(rows).run();
  return { batchId, ids: rows.map((r) => r.id) };
}

function toRow(r: typeof schema.hookIdeas.$inferSelect): HookRow {
  return {
    ...r,
    beats: json<string[]>(r.beats, []),
    platforms: json<string[]>(r.platforms, []),
    basis: json<HookBasis[]>(r.basis, []),
    policyIssues: json<string[]>(r.policyIssues, []),
    source: r.source === "manual" ? "manual" : "ai",
    status: r.status === "picked" || r.status === "rejected" ? r.status : "new",
  };
}

/** `topic`: hook của một chủ đề — có research_id đó, hoặc lô cũ chưa có research_id (bên gọi lọc tiếp theo tên). `status`: chỉ một trạng thái. */
export function listHooks(limit = 200, where: { topic?: string; status?: HookRow["status"] } = {}): HookRow[] {
  const conds = [
    where.topic ? or(eq(schema.hookIdeas.researchId, where.topic), isNull(schema.hookIdeas.researchId)) : undefined,
    where.status ? eq(schema.hookIdeas.status, where.status) : undefined,
  ].filter((c) => c !== undefined);
  return getDb().select().from(schema.hookIdeas).where(conds.length ? and(...conds) : undefined).orderBy(desc(schema.hookIdeas.createdAt)).limit(limit).all().map(toRow);
}

/** Hook đã sinh ra các kịch bản này (hook_ideas.content_id). */
export function hooksByContent(contentIds: string[]): HookRow[] {
  if (!contentIds.length) return [];
  return getDb().select().from(schema.hookIdeas).where(inArray(schema.hookIdeas.contentId, contentIds)).all().map(toRow);
}

/** Số đếm gọn của mọi hook (không giới hạn) để đếm theo chủ đề trên bảng chủ đề. */
export function hookStubs(): { id: string; researchId: string | null; topic: string; status: string; contentId: string | null }[] {
  return getDb().select({ id: schema.hookIdeas.id, researchId: schema.hookIdeas.researchId, topic: schema.hookIdeas.topic, status: schema.hookIdeas.status, contentId: schema.hookIdeas.contentId }).from(schema.hookIdeas).all();
}

/** Chọn hook → tạo nội dung kịch bản (đang viết) mang hook + dàn ý + khung vlog; đi tiếp luồng Kịch bản & nội dung hiện có. */
export function pickHook(id: string): { ok: true; contentId: string } | { ok: false; error: string } {
  const db = getDb();
  const h = db.select().from(schema.hookIdeas).where(eq(schema.hookIdeas.id, id)).get();
  if (!h) return { ok: false, error: "Không tìm thấy hook" };
  if (h.status === "rejected") return { ok: false, error: "Hook đã bỏ, không chọn được" };
  if (h.status === "picked" && h.contentId) return { ok: true, contentId: h.contentId };
  const r = toRow(h);
  const beats = r.source === "ai" ? cleanBeats(r.beats).beats : r.beats;
  const contentId = newId("ct");
  const now = new Date().toISOString();
  db.insert(schema.contentItems)
    .values({
      id: contentId,
      title: r.hook.slice(0, 200),
      format: "script",
      status: "in_progress",
      insightId: r.basis.find((b) => b.kind === "insight")?.id ?? null,
      pillar: r.topic.slice(0, 100),
      hook: r.hook,
      // Dàn ý: hook AI tạo trước bộ lọc có thể mang ghi chú nội bộ ("AI suy luận, chưa kiểm chứng"…) → bỏ; dàn ý OWNER nhập tay giữ nguyên
      outline: JSON.stringify(beats),
      // Điền sẵn khung vlog chia sẻ < 1 phút (hook ở cảnh 1, dàn ý vào từng cảnh) — câu chuyện thật để OWNER kể
      draft: vlogTemplate({ title: r.hook.slice(0, 120), hook: r.hook, beats }),
      assignee: "human",
      createdAt: now,
      source: r.source === "ai" ? "ai" : "manual",
    })
    .run();
  db.update(schema.hookIdeas).set({ status: "picked", contentId }).where(eq(schema.hookIdeas.id, id)).run();
  return { ok: true, contentId };
}

export function rejectHook(id: string): void {
  getDb().update(schema.hookIdeas).set({ status: "rejected" }).where(and(eq(schema.hookIdeas.id, id), eq(schema.hookIdeas.status, "new"))).run();
}
