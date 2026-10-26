// Bài đăng theo skill (Personal Brand System 6.1: "tự viết bài phù hợp với từng tên hook, nội dung video, theo skill trong Second Brain").
// Phần LOGIC (không AI): tìm skill viết content trong Second Brain, dựng caption theo cấu trúc skill từ kịch bản đã duyệt, kiểm luật.
// Phần AI (tuỳ chọn, qua Đội AI "AI Viết bài đăng"): src/lib/ai.ts › generateCaption — bản nháp lưu lại, OWNER sửa trước khi lên lịch.
import { spokenScriptText } from "@/lib/content/vlog-script";
import { eq } from "drizzle-orm";
import { getDb, getSqlite, schema } from "@/db";
import { getSetting, setSetting } from "@/lib/admin";
import { policyIssues } from "@/lib/content/hooks";
import { statusRank } from "@/lib/knowledge/types";

export interface CaptionSkill {
  id: string;
  title: string;
  status: string;
  body: string;
}

const SKILL_TITLE = /content|caption|bài đăng|viết bài|copywrit/i;
const NOT_CAPTION = /edit|video|b-roll|dựng|học một sản phẩm/i;

/** Skill viết content trong 02 SKILL: OWNER chỉ định (publishing.captionSkillId) hoặc trang khớp tên, ưu tiên ACTIVE > VERIFIED > DRAFT. */
export function captionSkill(): CaptionSkill | null {
  const rows = getSqlite()
    .prepare("select id, title, status, body from knowledge_index where section like '02%' and status != 'ARCHIVED'")
    .all() as CaptionSkill[];
  const pinned = getSetting("publishing.captionSkillId");
  if (pinned) {
    const p = rows.find((r) => r.id === pinned);
    if (p) return p;
  }
  return rows.filter((r) => SKILL_TITLE.test(r.title) && !NOT_CAPTION.test(r.title)).sort((a, b) => (statusRank[a.status] ?? 5) - (statusRank[b.status] ?? 5))[0] ?? null;
}

export interface CaptionDraft {
  text: string;
  source: "skill-template" | "ai" | "fallback";
  skill: { id: string; title: string; status: string } | null;
}

const CTA = "Bạn từng gặp tình huống này chưa? Bình luận để mình trả lời trong video sau.";

/** Caption theo cấu trúc mặc định của skill (Hook → tình huống / bài học → CTA), chỉ dùng chữ có trong kịch bản đã duyệt. */
export function buildCaption(videoId: string): CaptionDraft {
  const db = getDb();
  const v = db.select().from(schema.videos).where(eq(schema.videos.id, videoId)).get();
  if (!v) return { text: "", source: "fallback", skill: null };
  const c = v.contentId ? db.select().from(schema.contentItems).where(eq(schema.contentItems.id, v.contentId)).get() : undefined;
  const skill = captionSkill();
  const key = (c?.draft ?? "").match(/^Thông điệp chính:\s*(.+)$/m)?.[1]?.trim();
  let beats: string[] = [];
  try {
    beats = (JSON.parse(c?.outline ?? "[]") as string[]).filter((b) => typeof b === "string" && b.trim()).slice(0, 3);
  } catch {
    beats = [];
  }
  const hook = c?.hook?.trim() || c?.title || v.title;
  const parts = [hook, key && key !== hook ? key : "", beats.length ? beats.map((b) => `→ ${b.trim()}`).join("\n") : "", CTA].filter(Boolean);
  return { text: parts.join("\n\n"), source: skill ? "skill-template" : "fallback", skill: skill ? { id: skill.id, title: skill.title, status: skill.status } : null };
}

// Bản nháp AI viết (đợi OWNER sửa / dùng) — lưu theo video
export function saveCaptionDraft(videoId: string, text: string): void {
  setSetting(`publishing.captionDraft.${videoId}`, text.slice(0, 5000));
}

export function clearCaptionDraft(videoId: string): void {
  for (const k of ["captionDraft", "postTitle", "postDraftSource"]) getDb().delete(schema.settings).where(eq(schema.settings.key, `publishing.${k}.${videoId}`)).run();
}

// Tiêu đề bài đăng (OWNER 25/10/2026: "gọi AI viết luôn nội dung cho video để đăng bài.. gồm tiêu đề và nội dung") — lưu cạnh bản nháp caption.
export const POST_TITLE_MAX = 100;

/** Tiêu đề theo luật (không AI): hook kịch bản đã duyệt → tên kịch bản → tên video, cắt gọn. */
export function buildPostTitle(videoId: string): string {
  const db = getDb();
  const v = db.select().from(schema.videos).where(eq(schema.videos.id, videoId)).get();
  if (!v) return "";
  const c = v.contentId ? db.select().from(schema.contentItems).where(eq(schema.contentItems.id, v.contentId)).get() : undefined;
  const t = (c?.hook?.trim() || c?.title?.trim() || v.title).replace(/\s+/g, " ");
  return [...t].length > POST_TITLE_MAX ? `${[...t].slice(0, POST_TITLE_MAX - 1).join("")}…` : t;
}

export function savePostTitle(videoId: string, title: string): void {
  setSetting(`publishing.postTitle.${videoId}`, [...title.trim()].slice(0, POST_TITLE_MAX).join(""));
}

export function postTitle(videoId: string): string | null {
  return getSetting(`publishing.postTitle.${videoId}`) ?? null;
}

/** Nguồn bản nháp bài đăng: "ai" (AI Viết bài đăng) hoặc "rule: <lý do>" (theo luật vì AI tắt / thiếu khoá / lỗi). */
export function setPostDraftSource(videoId: string, source: string): void {
  setSetting(`publishing.postDraftSource.${videoId}`, source.slice(0, 300));
}

export function postDraftSource(videoId: string): string | null {
  return getSetting(`publishing.postDraftSource.${videoId}`) ?? null;
}

export function captionDraft(videoId: string): string | null {
  return getSetting(`publishing.captionDraft.${videoId}`) ?? null;
}

/** Luật kiểm caption (không AI): luật ngôn từ theo nền tảng + luật skill "không biến trải nghiệm cá nhân thành fact thị trường". */
export function captionIssues(text: string, platforms: string[], scriptText = ""): string[] {
  const out = policyIssues(text, platforms.map((p) => (p.startsWith("facebook") ? "facebook" : p)));
  // So số đã chuẩn hoá (bỏ khoảng trắng trước %, phẩy thập phân → chấm) và theo ranh giới số (130% không che 30%)
  const norm = (t: string) => t.replace(/(\d)\s+%/g, "$1%").replace(/(\d),(\d)/g, "$1.$2");
  const script = norm(scriptText);
  for (const m of norm(text).matchAll(/(?<![\d.])\d+(?:\.\d+)?%/g)) {
    if (!new RegExp(`(?<![\\d.])${m[0].replace(".", "\\.")}`).test(script)) out.push(`số “${m[0]}” không có trong kịch bản đã duyệt (skill: không tự viết số liệu thị trường khi không có bằng chứng)`);
  }
  return [...new Set(out)];
}

/** Chữ kịch bản đã duyệt của video (để luật caption so số liệu). */
export function scriptTextFor(videoId: string): string {
  const db = getDb();
  const v = db.select().from(schema.videos).where(eq(schema.videos.id, videoId)).get();
  const c = v?.contentId ? db.select().from(schema.contentItems).where(eq(schema.contentItems.id, v.contentId)).get() : undefined;
  // Chỉ lời nói của kịch bản — không khối KINH NGHIỆM (câu trả lời thô của OWNER) để số / tên riêng trong đó không thành "có trong kịch bản"
  return [c?.title, c?.hook, spokenScriptText(c?.draft ?? ""), c?.outline].filter(Boolean).join("\n");
}
