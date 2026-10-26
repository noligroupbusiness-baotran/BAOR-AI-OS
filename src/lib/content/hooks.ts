// Bảng Hook & kịch bản video ngắn (Personal Brand System bước 3). Phần LOGIC ở đây (không gọi AI): ngữ cảnh căn cứ, luật ngôn từ theo
// nền tảng, lưu / chọn / bỏ hook, hook nhập tay. Phần gọi AI (10 hook mỗi lần) ở src/lib/ai.ts › generateHooks, qua Đội AI "AI Hook & Ý tưởng".
import { and, desc, eq, like, or } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { searchKnowledge } from "@/lib/knowledge";
import { usableStatus } from "@/lib/knowledge/types";

export const HOOK_COUNT = 10; // sơ đồ OWNER: "mỗi lần gọi trả về 10 kết quả"
export const MAX_SHORT_SEC = 180; // "nội dung dưới 3 phút"
export const HOOK_PLATFORMS = ["facebook", "instagram", "tiktok", "youtube"] as const;

export interface HookBasis {
  kind: "finding" | "knowledge" | "insight";
  id: string;
  label: string;
}

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

// ---------- Luật ngôn từ theo nền tảng (kiểm theo luật, không AI) ----------
// Luật nội bộ tóm từ tiêu chuẩn quảng cáo / cộng đồng CÔNG KHAI của Meta (Facebook, Instagram), TikTok, YouTube: khẳng định tuyệt đối,
// tuyên bố y tế / giảm cân, khẳng định thuộc tính cá nhân người xem (Meta), hứa thu nhập. Là CẢNH BÁO để người sửa — không thay
// cho việc đọc chính sách gốc; OWNER bổ sung / chốt danh sách trong Second Brain.
const W = (re: string) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${re})(?![\\p{L}\\p{N}])`, "iu");
interface PolicyRule {
  id: string;
  platforms: readonly string[] | "all";
  test: RegExp;
  message: string;
}
export const POLICY_RULES: PolicyRule[] = [
  { id: "absolute", platforms: "all", test: W("100\\s*%|chắc chắn|cam kết|đảm bảo|tuyệt đối|số 1|duy nhất"), message: "khẳng định tuyệt đối (100%, cam kết, đảm bảo, số 1…)" },
  { id: "medical", platforms: "all", test: W("chữa (?:khỏi|bệnh|dứt)|điều trị|trị (?:dứt|khỏi)|khỏi hẳn|thay thế thuốc"), message: "tuyên bố chữa / điều trị bệnh" },
  { id: "weight", platforms: "all", test: /(?:giảm|xuống)\s*\d+\s*(?:kg|ký|cân)|\d+\s*(?:kg|ký)\s*trong\s*\d+\s*(?:ngày|tuần)|trước\s*(?:và|-|\/)\s*sau/iu, message: "hứa kết quả giảm cân cụ thể / so sánh trước-sau" },
  { id: "personal", platforms: ["facebook", "instagram"], test: W("bạn (?:đang |có )?(?:béo|mập|thừa cân|nợ nần|nghèo|bị bệnh|trầm cảm|xấu|già)"), message: "khẳng định thuộc tính cá nhân người xem (Meta cấm: “bạn đang béo / nợ…”)" },
  { id: "income", platforms: "all", test: /(?:thu nhập|kiếm|lãi|doanh thu)[^.!?\n]{0,30}\d+\s*(?:triệu|tr\b|tỷ|tỉ|k\b|nghìn)|làm giàu nhanh|việc nhẹ lương cao/iu, message: "hứa thu nhập / doanh thu cụ thể (cần ghi “kết quả cá nhân, không cam kết” và nguồn)" },
];

export function policyIssues(text: string, platforms: readonly string[], durationSec?: number): string[] {
  const out: string[] = [];
  for (const r of POLICY_RULES) {
    const hit = r.platforms === "all" ? platforms : platforms.filter((p) => (r.platforms as readonly string[]).includes(p));
    if (hit.length && r.test.test(text)) out.push(`${r.message} — ${r.platforms === "all" ? "mọi nền tảng" : hit.join(", ")}`);
  }
  if (durationSec !== undefined && durationSec > MAX_SHORT_SEC) out.push(`dài ${durationSec} giây — vượt 3 phút của video ngắn`);
  return out;
}

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
  const basis: HookBasis[] = [
    ...findings.map((f) => ({ kind: "finding" as const, id: f.id, label: f.statement.slice(0, 120) })),
    ...knowledge.map((h) => ({ kind: "knowledge" as const, id: h.page.id, label: h.page.title })),
    ...insights.map((i) => ({ kind: "insight" as const, id: i.id, label: i.title })),
  ];
  const text = [
    `Phát hiện nghiên cứu đã kiểm (bước 2):\n${findings.map((f) => `- [finding:${f.id}] (${f.classification}) ${f.statement}${f.application ? ` — ứng dụng: ${f.application}` : ""}`).join("\n") || "(chưa có phát hiện khớp chủ đề)"}`,
    `Second Brain (ACTIVE / VERIFIED):\n${knowledge.map((h) => `- [knowledge:${h.page.id}] ${h.page.title}: ${h.page.body.slice(0, 600)}`).join("\n") || "(chưa có trang khớp)"}`,
    `Insight khách hàng đã duyệt:\n${insights.map((i) => `- [insight:${i.id}] ${i.title}: ${i.detail}`).join("\n") || "(chưa có)"}`,
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

export function listHooks(limit = 200): HookRow[] {
  return getDb().select().from(schema.hookIdeas).orderBy(desc(schema.hookIdeas.createdAt)).limit(limit).all().map(toRow);
}

/** Chọn hook → tạo nội dung kịch bản (đang viết) mang hook + dàn ý; đi tiếp luồng Kịch bản & nội dung hiện có. */
export function pickHook(id: string): { ok: true; contentId: string } | { ok: false; error: string } {
  const db = getDb();
  const h = db.select().from(schema.hookIdeas).where(eq(schema.hookIdeas.id, id)).get();
  if (!h) return { ok: false, error: "Không tìm thấy hook" };
  if (h.status === "rejected") return { ok: false, error: "Hook đã bỏ, không chọn được" };
  if (h.status === "picked" && h.contentId) return { ok: true, contentId: h.contentId };
  const r = toRow(h);
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
      outline: JSON.stringify(r.beats),
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
