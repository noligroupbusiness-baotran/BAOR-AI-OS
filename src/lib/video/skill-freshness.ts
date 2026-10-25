// Skill dựng video lấy từ Notion (OWNER 25/10/2026): bộ dựng làm theo 3 trang skill — Skill ESV (9:16), Skill Edit Video Ngang (16:9),
// Phần chung (A). Second Brain tự đồng bộ các trang này (cần token Notion). Mỗi trang có "mốc bộ dựng" = mã băm nội dung lúc bộ dựng
// được cập nhật theo skill; trang trên Notion đổi khác mốc → báo OWNER / MASTER: skill đã đổi, bộ dựng cần cập nhật cho khớp
// (skill là chữ, bộ dựng là mã — không âm thầm dựng sai skill). Lần đầu thấy trang: "chưa xác nhận" cho tới khi OWNER / MASTER
// xác nhận bộ dựng đang khớp bản đó (không tự lấy làm mốc — trang có thể đã đổi trước lần đồng bộ đầu).
import { inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getSetting, setSetting } from "@/lib/admin";

export const SKILL_PAGES = [
  { key: "esv", title: "Skill ESV (9:16)", pageId: "4004ceb9517d81198fc4da9f9339234e" },
  { key: "ngang", title: "Skill Edit Video Ngang (16:9)", pageId: "4004ceb9517d81849441f9d0f3757538" },
  { key: "chung", title: "Phần chung (A)", pageId: "4014ceb9517d81b3bdc0f9917b05c190" },
] as const;

export interface SkillState {
  key: string;
  title: string;
  state: "ok" | "changed" | "unconfirmed" | "missing";
  editedAt: string | null;
  baselineAt: string | null;
}

interface Baseline {
  hash: string;
  editedAt: string | null;
  at: string;
}

const baseKey = (pageId: string) => `video.skillBaseline.${pageId}`;

function readBaseline(pageId: string): Baseline | null {
  try {
    return JSON.parse(getSetting(baseKey(pageId)) ?? "null") as Baseline | null;
  } catch {
    return null;
  }
}

export function skillStatus(): SkillState[] {
  const rows = getDb()
    .select({ id: schema.knowledgeIndex.id, hash: schema.knowledgeIndex.bodyHash, editedAt: schema.knowledgeIndex.notionEditedAt })
    .from(schema.knowledgeIndex)
    .where(inArray(schema.knowledgeIndex.id, SKILL_PAGES.map((p) => p.pageId)))
    .all();
  return SKILL_PAGES.map((p) => {
    const r = rows.find((x) => x.id === p.pageId);
    if (!r) return { key: p.key, title: p.title, state: "missing", editedAt: null, baselineAt: null };
    const b = readBaseline(p.pageId);
    if (!b) return { key: p.key, title: p.title, state: "unconfirmed", editedAt: r.editedAt ?? null, baselineAt: null };
    return { key: p.key, title: p.title, state: b.hash === r.hash ? "ok" : "changed", editedAt: r.editedAt ?? null, baselineAt: b.at };
  });
}

/** MASTER đã cập nhật bộ dựng theo skill mới (sau khi kiểm): nội dung hiện tại thành mốc. */
export function acceptSkillVersions(): number {
  const rows = getDb()
    .select({ id: schema.knowledgeIndex.id, hash: schema.knowledgeIndex.bodyHash, editedAt: schema.knowledgeIndex.notionEditedAt })
    .from(schema.knowledgeIndex)
    .where(inArray(schema.knowledgeIndex.id, SKILL_PAGES.map((p) => p.pageId)))
    .all();
  for (const r of rows) setSetting(baseKey(r.id), JSON.stringify({ hash: r.hash, editedAt: r.editedAt ?? null, at: new Date().toISOString() }));
  return rows.length;
}

/** Một câu ghi vào ghi chú bản dựng khi skill trên Notion đã đổi (rỗng khi khớp / chưa đồng bộ được). */
export function skillChangeNote(): string {
  const changed = skillStatus().filter((s) => s.state === "changed");
  return changed.length ? ` ⚠ Skill trên Notion đã đổi (${changed.map((c) => c.title).join(", ")}) — bộ dựng đang theo bản cũ, cần cập nhật.` : "";
}
