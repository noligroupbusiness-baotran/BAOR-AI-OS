// Nghiên cứu theo sơ đồ Personal Brand System (bước 1 → 2 → 3), bản ĐƠN GIẢN (OWNER 25/10/2026):
// 1. OWNER đề xuất chủ đề → 2. lấy insight từ nền tảng (2.1 nhóm Facebook, 2.2 bình luận YouTube, 2.3 bình luận Facebook, 2.4 kiến
// thức trên social) — theo luật trước, AI Nghiên cứu (Đội AI, "Cho phép gọi AI") phân tích thêm khi được bật → 3. Bảng Hook dùng insight.
// Mỗi chủ đề là một research_task; mọi nguồn CỘNG DỒN vào chủ đề (saveResearchResult append).
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { aiReadiness, gate, webSearchProvider } from "@/lib/ai";
import { roleAllows, roleById } from "@/lib/ai-roster";
import { finishRun, startRun } from "@/lib/connectors/config";
import { getSetting } from "@/lib/admin";
import { YouTubeError } from "@/lib/connectors/youtube";
import { createResearchTask, recoverStaleResearch, runResearchWithAi, saveResearchResult } from "./index";
import { SOCIAL_KINDS, cleanComment, commentsToResearch, detectPlatform, parseSocialPaste, platformLabel, type SocialKind } from "./social";
import { commentsFromVideo, fallbackQueries, mineYouTube, parseYouTubeVideoId, youtubeApiKey, youtubeReadiness, type MinedComments } from "./youtube";
import { fanpageComments } from "./facebook";
import { readPageComments } from "./page-read";

export const TOPIC_PURPOSE = "Insight cho hook & kịch bản video ngắn (Personal Brand System bước 2)";

export function createTopic(topic: string, by: string): string {
  const t = topic.trim();
  if (t.length < 4) throw new Error("Chủ đề quá ngắn (ít nhất 4 ký tự)");
  // createResearchTask cần câu hỏi ≥ 8 ký tự: chủ đề ngắn được ghép tiền tố
  return createResearchTask({ question: t.length >= 8 ? t : `Chủ đề: ${t}`, purposeKind: "content", purpose: TOPIC_PURPOSE, by });
}

export interface TopicInsight {
  id: string;
  statement: string;
  application: string;
  source: string; // nhãn nguồn (Nhóm Facebook / Bình luận YouTube / … / Web)
  platform: string; // huy hiệu nền tảng đoán từ link nguồn: YouTube / Facebook / TikTok / Instagram / Threads / Diễn đàn / Web
  url: string; // link nguồn đầu tiên (video / bài / bình luận)
  byAi: boolean;
  ok: boolean; // đạt luật kiểm (có nguồn khi có số liệu…)
  pending: boolean; // AI tự nghiên cứu đề xuất, chờ OWNER duyệt
}

export interface TopicRow {
  id: string;
  topic: string;
  createdAt: string;
  insights: number;
  sources: Record<string, number>;
}

const json = <T>(s: string, d: T): T => {
  try {
    return JSON.parse(s) as T;
  } catch {
    return d;
  }
};

export function listTopics(): TopicRow[] {
  // Nhiệm vụ "đang chạy" bị bỏ dở (máy chủ dừng giữa chừng) → báo lỗi thay vì quay mãi
  recoverStaleResearch();
  const db = getDb();
  const tasks = db.select().from(schema.researchTasks).orderBy(desc(schema.researchTasks.createdAt)).all();
  if (!tasks.length) return [];
  const ids = tasks.map((t) => t.id);
  const findings = db.select({ taskId: schema.researchFindings.taskId, sourceIds: schema.researchFindings.sourceIds }).from(schema.researchFindings).where(inArray(schema.researchFindings.taskId, ids)).all();
  const sources = new Map(db.select({ id: schema.researchSources.id, publisher: schema.researchSources.publisher, sourceType: schema.researchSources.sourceType }).from(schema.researchSources).where(inArray(schema.researchSources.taskId, ids)).all().map((s) => [s.id, s]));
  return tasks.map((t) => {
    const mine = findings.filter((f) => f.taskId === t.id);
    const by: Record<string, number> = {};
    for (const f of mine) {
      const s = sources.get(json<string[]>(f.sourceIds, [])[0] ?? "");
      const label = s ? (s.sourceType === "social" ? s.publisher : "Web") : "Khác";
      by[label] = (by[label] ?? 0) + 1;
    }
    return { id: t.id, topic: t.question.replace(/^Chủ đề: /, ""), createdAt: t.createdAt, insights: mine.length, sources: by };
  });
}

export function topicInsights(taskId: string): TopicInsight[] {
  const db = getDb();
  const sources = new Map(db.select().from(schema.researchSources).where(eq(schema.researchSources.taskId, taskId)).all().map((s) => [s.id, s]));
  return db
    .select()
    .from(schema.researchFindings)
    .where(eq(schema.researchFindings.taskId, taskId))
    .all()
    .map((f) => {
      const s = sources.get(json<string[]>(f.sourceIds, [])[0] ?? "");
      return {
        id: f.id,
        statement: f.statement,
        application: f.application,
        source: s ? (s.sourceType === "social" ? s.publisher : "Web") : "Khác",
        platform: s ? platformLabel(s.url) : "Khác",
        url: s?.url ?? "",
        byAi: f.limits.startsWith("AI Nghiên cứu") || (!!s && s.sourceType !== "social"),
        ok: f.verifyOk,
        pending: f.reviewStatus === "pending",
      };
    });
}

/** OWNER duyệt insight AI đề xuất → dùng được cho hook. */
export function approveInsight(taskId: string, findingId: string): boolean {
  const db = getDb();
  const f = db.select().from(schema.researchFindings).where(eq(schema.researchFindings.id, findingId)).get();
  if (f?.taskId !== taskId) return false;
  db.update(schema.researchFindings).set({ reviewStatus: "approved" }).where(eq(schema.researchFindings.id, findingId)).run();
  return true;
}

export function deleteInsight(taskId: string, findingId: string): void {
  const db = getDb();
  const f = db.select().from(schema.researchFindings).where(eq(schema.researchFindings.id, findingId)).get();
  if (f?.taskId === taskId) db.delete(schema.researchFindings).where(eq(schema.researchFindings.id, findingId)).run();
}

// ---------- 2.1–2.4: bình luận (dán tay / tự đọc từ link / AI tự tìm) → luật trước, AI sau (khi được phép) ----------
const AiInsights = z.object({
  insights: z.array(z.object({ statement: z.string().describe("insight ngắn, dựa trên bình luận đã cho"), application: z.string().describe("cách dùng cho hook / video"), count: z.number().int().describe("số bình luận ủng hộ insight này") })),
});

export type IngestResult = { ok: true; comments: number; ruleInsights: number; aiInsights: number; aiError?: string };

/**
 * Đường phân tích CHUNG cho mọi nguồn bình luận: theo luật (luôn chạy) + AI Nghiên cứu (khi `useAi` và vị trí được phép — công tắc,
 * trần riêng, trần chung đều do gate() kiểm). AI chỉ nhận bình luận ĐÃ làm sạch, tối đa 300 dòng. `pending`: kết quả chờ OWNER duyệt.
 */
export async function ingestComments(input: { taskId: string; kind: SocialKind; items: { text: string; url?: string }[]; origins: { url: string; title: string }[]; topic: string; useAi: boolean; by: string; pending?: boolean }): Promise<IngestResult> {
  const comments = input.items.map((i) => i.text);
  const save = { by: input.by, append: true, pending: input.pending, dedupe: input.pending };
  const rule = saveResearchResult(input.taskId, commentsToResearch(input.kind, input.items, input.origins, input.topic), { runner: "import", ...save });
  if (!input.useAi) return { ok: true, comments: comments.length, ruleInsights: rule.findings, aiInsights: 0 };
  const label = SOCIAL_KINDS[input.kind];
  const sample = comments.slice(0, 300).map((c) => `- ${c.slice(0, 300)}`).join("\n");
  const gated = await gate("research", `AI Nghiên cứu: ${comments.length} bình luận (${label})`, (client, model) =>
    client.messages.parse({
      model,
      max_tokens: 6000,
      system:
        "Bạn là AI Nghiên cứu cho thương hiệu cá nhân, thị trường Việt Nam. Đọc bình luận thật của khán giả, rút tối đa 6 insight (nỗi đau, mong muốn, phản đối, câu hỏi lặp lại, ngôn từ họ dùng — giữ đúng chữ họ dùng). " +
        "Chỉ dựa trên bình luận được đưa; không bịa số liệu; count là số bình luận ủng hộ. Không nêu tên người. Mục tiêu là marketing (không chào bán).",
      messages: [{ role: "user", content: `Chủ đề: ${input.topic}\nNguồn: ${label} (${comments.length} bình luận)\n\n${sample}` }],
      output_config: { format: zodOutputFormat(AiInsights) },
    }),
  );
  if (!gated.ok) return { ok: true, comments: comments.length, ruleInsights: rule.findings, aiInsights: 0, aiError: gated.error };
  const list = (gated.res.parsed_output?.insights ?? []).slice(0, 6).filter((i) => i.statement.trim());
  const originUrls = input.origins.map((o) => o.url);
  const ai = saveResearchResult(
    input.taskId,
    {
      summary: `AI Nghiên cứu: ${list.length} insight từ ${comments.length} bình luận (${label}).`,
      sources: input.origins.map((o) => ({ url: o.url, title: o.title || label, author: "", publisher: label, publishedAt: null, sourceType: "social" as const, grade: "D" as const, excerpt: `${comments.length} bình luận đã làm sạch`, limits: "" })),
      findings: list.map((i) => ({
        statement: `${i.statement.trim()}${i.count > 0 ? ` (${Math.min(i.count, comments.length)}/${comments.length} bình luận)` : ""}`,
        classification: "OBSERVATION" as const,
        sourceUrls: originUrls,
        knowledgeIds: [],
        counterView: "",
        limits: `AI Nghiên cứu đọc ${comments.length} bình luận (${label}); ý kiến người dùng, không đại diện thị trường.`,
        application: i.application.trim(),
        contentTopics: input.topic ? [input.topic] : [],
        confidence: "low" as const,
      })),
    },
    { runner: "ai", ...save },
  );
  return { ok: true, comments: comments.length, ruleInsights: rule.findings, aiInsights: ai.findings };
}

/** Link vừa dán mà không đọc tự động được (để ô dán tay mở ra với đúng link — không đưa link vào URL trang). */
export const lastLinkKey = (id: string) => `research.lastLink.${id}`;
export function lastLink(id: string): { url: string; kind: SocialKind } | null {
  try {
    const v = JSON.parse(getSetting(lastLinkKey(id)) || "null") as { url?: string; kind?: string } | null;
    return v?.url ? { url: v.url, kind: (v.kind && v.kind in SOCIAL_KINDS ? v.kind : detectPlatform(v.url)) as SocialKind } : null;
  } catch {
    return null;
  }
}

/** AI phân tích thêm theo công tắc AI Nghiên cứu (Đội AI) — không còn ô chọn riêng trên trang (OWNER 26/10: bớt rườm rà). */
export const researchAiOn = () => roleAllows(roleById("research")!).ok;

/** Dán tay (nhóm Facebook, TikTok, trang không đọc tự động được…). Nền tảng: chọn hoặc tự nhận từ link. */
export async function addSourceToTopic(input: { taskId: string; kind?: SocialKind; url: string; paste: string; topic: string; useAi: boolean; by: string }): Promise<IngestResult | { ok: false; error: string }> {
  let comments: string[];
  try {
    comments = parseSocialPaste(input.paste);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Không đọc được dữ liệu dán" };
  }
  if (comments.length < 3) return { ok: false, error: "Cần ít nhất 3 bình luận / dòng (mỗi dòng một bình luận, hoặc CSV / JSON có cột nội dung)" };
  const kind = input.kind ?? detectPlatform(input.url);
  return ingestComments({ taskId: input.taskId, kind, items: comments.map((text) => ({ text })), origins: [{ url: input.url, title: "" }], topic: input.topic, useAi: input.useAi, by: input.by });
}

export type LinkResult = (IngestResult & { kind: SocialKind }) | { ok: false; error: string; needPaste: boolean; kind: SocialKind };

const PASTE_ONLY: Partial<Record<SocialKind, string>> = {
  fb_group: "Nhóm Facebook: Meta không cho đọc tự động — dán bình luận vào ô bên dưới.",
  tiktok: "TikTok chưa cho đọc bình luận qua API công khai — dán bình luận vào ô bên dưới.",
  instagram: "Instagram chỉ cho đọc bình luận tài khoản của bạn (chưa kết nối) — dán bình luận vào ô bên dưới.",
  threads: "Threads chưa kết nối — dán bình luận vào ô bên dưới.",
  zalo: "Zalo không cho đọc tự động — dán bình luận vào ô bên dưới.",
};

/**
 * OWNER chỉ dán link (+ chọn / tự nhận nền tảng) → hệ thống TỰ đọc bình luận nếu nền tảng cho phép đúng điều khoản:
 * YouTube (Data API, API key) · Facebook (bài trên Fanpage đã kết nối, Page token) · trang công khai (công cụ đọc trang của hãng AI).
 * Nhóm Facebook / TikTok / Instagram / Zalo / bài người khác → needPaste (hiện ô dán). Không cào trang, không đăng nhập.
 */
export async function analyzeLink(input: { taskId: string; url: string; kind?: SocialKind; topic: string; by: string; fetch?: typeof fetch }): Promise<LinkResult> {
  const url = input.url.trim();
  const kind = input.kind ?? detectPlatform(url);
  const fail = (error: string, needPaste = true): LinkResult => ({ ok: false, error, needPaste, kind });
  if (!/^https?:\/\/\S+$/i.test(url)) return fail("Cần link bài / video (https://…)", false);
  const paste = PASTE_ONLY[kind];
  if (paste) return fail(paste);
  const useAi = researchAiOn();
  const done = async (k: SocialKind, items: { text: string; url?: string }[], origins: { url: string; title: string }[]): Promise<LinkResult> => {
    if (items.length < 3) return fail("Bài / video có dưới 3 bình luận đọc được — dán thêm bình luận vào ô bên dưới.");
    return { ...(await ingestComments({ taskId: input.taskId, kind: k, items, origins, topic: input.topic, useAi, by: input.by })), kind: k };
  };
  if (kind === "youtube") {
    const id = parseYouTubeVideoId(url);
    if (!id) return fail("Không nhận ra link video YouTube (watch?v=… / youtu.be/… / shorts/…).", false);
    const key = youtubeApiKey();
    if (!key) return fail("Chưa có API key YouTube (Cài đặt › Kết nối › YouTube) — hoặc dán bình luận vào ô bên dưới.");
    const run = startRun("youtube", "research");
    try {
      const m = await commentsFromVideo(id, key, input.fetch);
      finishRun(run, true, `Đọc ${m.comments.length} bình luận (${m.units} đơn vị hạn mức)`, m.comments.length);
      return done("youtube", m.comments, m.videos.map((v) => ({ url: v.url, title: v.title })));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      finishRun(run, false, msg);
      return fail(e instanceof YouTubeError && e.reason === "commentsDisabled" ? "Video đã tắt bình luận." : msg, !(e instanceof YouTubeError && e.reason === "commentsDisabled"));
    }
  }
  if (kind === "facebook") {
    const r = await fanpageComments(url, { fetch: input.fetch });
    if (!r.ok) return fail(r.reason);
    return done("facebook", dedupeClean(r.comments).map((text) => ({ text })), [{ url, title: "" }]);
  }
  // Diễn đàn / blog / báo / khác: công cụ đọc trang phía hãng AI (cần AI Nghiên cứu được phép)
  const ready = aiReadiness("research", { alsoProvider: webSearchProvider("research") });
  if (!ready.ok) return fail(`${ready.label}: AI cần được bật để đọc trang này — hoặc dán bình luận vào ô bên dưới.`);
  const r = await readPageComments(url, input.topic);
  if (!r.ok) return fail(r.error, r.needPaste);
  return done(kind, r.comments.map((text) => ({ text })), [{ url, title: "" }]);
}

function dedupeClean(xs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of xs) {
    const c = cleanComment(x);
    if (c.length < 3 || seen.has(c.toLowerCase())) continue;
    seen.add(c.toLowerCase());
    out.push(c);
  }
  return out;
}

// ---------- "AI tìm nỗi đau khách": YouTube + web Việt Nam, một nút (và tự chạy theo lịch — src/lib/research/auto.ts) ----------

const Queries = z.object({ queries: z.array(z.string()).describe("3–5 câu tìm YouTube tiếng Việt, đúng chữ khách hàng tự gõ") });

/** Câu tìm YouTube: AI Nghiên cứu đề xuất (qua gate) khi được phép; không thì theo luật từ tên chủ đề. */
export async function youtubeQueries(topic: string): Promise<{ queries: string[]; byAi: boolean }> {
  if (aiReadiness("research").ok) {
    const r = await gate("research", `Câu tìm YouTube: ${topic.slice(0, 60)}`, (client, model) =>
      client.messages.parse({
        model,
        max_tokens: 600,
        system: "Bạn đề xuất câu tìm kiếm YouTube để tìm video mà KHÁCH HÀNG VIỆT NAM hay bình luận than phiền, hỏi han về chủ đề. Câu ngắn (2–7 chữ), tiếng Việt, đúng cách người thường gõ, không dấu ngoặc, không hashtag.",
        messages: [{ role: "user", content: `Chủ đề: ${topic}\nĐưa 3–5 câu tìm.` }],
        output_config: { format: zodOutputFormat(Queries) },
      }),
    );
    const qs = r.ok ? (r.res.parsed_output?.queries ?? []).map((q) => q.replace(/[#"“”]/g, "").trim()).filter((q) => q.length >= 2 && q.length <= 80).slice(0, 5) : [];
    if (qs.length) return { queries: qs, byAi: true };
  }
  return { queries: fallbackQueries(topic), byAi: false };
}

export interface PainRun {
  ok: boolean;
  notes: string[]; // mỗi nguồn một ghi chú ngắn: "YouTube: 240 bình luận", "Web: thiếu khoá ChatGPT"…
  insights: number;
  ran: string[]; // nguồn đã chạy thật
}

/**
 * Một nút "AI tìm nỗi đau khách" (và tự nghiên cứu theo lịch): chạy các nguồn Việt Nam cùng lúc, nguồn nào thiếu khoá thì bỏ qua kèm ghi
 * chú ngắn — (1) bình luận YouTube (Data API, miễn phí, có hạn mức) → phân tích chung; (2) tìm web Việt Nam (bài công khai mạng xã hội,
 * diễn đàn, số liệu VN) qua runResearchWithAi. `pending`: kết quả là đề xuất chờ OWNER duyệt (tự chạy theo lịch).
 */
export async function runPainResearch(taskId: string, by: string, opts: { pending?: boolean; fetch?: typeof fetch; now?: Date } = {}): Promise<PainRun> {
  const db = getDb();
  const task = db.select().from(schema.researchTasks).where(eq(schema.researchTasks.id, taskId)).get();
  if (!task) return { ok: false, notes: ["Không tìm thấy chủ đề"], insights: 0, ran: [] };
  const topic = task.question.replace(/^Chủ đề: /, "");
  const before = db.select({ id: schema.researchFindings.id }).from(schema.researchFindings).where(eq(schema.researchFindings.taskId, taskId)).all().length;
  const notes: string[] = [];
  const ran: string[] = [];
  // (1) YouTube
  const yt = youtubeReadiness(opts.now);
  if (!yt.ok) notes.push(`YouTube: ${yt.label.toLowerCase()}`);
  else {
    const run = startRun("youtube", "research");
    try {
      const q = await youtubeQueries(topic);
      const m: MinedComments = await mineYouTube({ queries: q.queries, apiKey: youtubeApiKey(), fetch: opts.fetch, now: opts.now });
      finishRun(run, true, `${q.queries.length} câu tìm${q.byAi ? " (AI)" : ""} → ${m.videos.length} video, ${m.comments.length} bình luận (${m.units} đơn vị)`, m.comments.length);
      if (m.comments.length >= 3) {
        await ingestComments({ taskId, kind: "youtube", items: m.comments, origins: m.videos.map((v) => ({ url: v.url, title: v.title })), topic, useAi: researchAiOn(), by, pending: opts.pending });
        ran.push("YouTube");
        notes.push(`YouTube: ${m.comments.length} bình luận / ${m.videos.length} video`, ...m.notes);
      } else notes.push(...(m.notes.length ? m.notes : ["YouTube: chưa thấy bình luận phù hợp"]));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      finishRun(run, false, msg);
      notes.push(`YouTube: ${msg.slice(0, 120)}`);
    }
  }
  // (2) Web Việt Nam (mạng xã hội công khai, diễn đàn, số liệu VN)
  const web = aiReadiness("research", { alsoProvider: webSearchProvider("research") });
  if (!web.ok) notes.push(`Web: ${web.label.toLowerCase()}`);
  else {
    const r = await runResearchWithAi(taskId, by, { append: true, pending: opts.pending });
    if (r.ok) {
      ran.push("Web");
      notes.push("Web Việt Nam: xong");
    } else notes.push(`Web: ${r.error.slice(0, 120)}`);
  }
  const after = db.select({ id: schema.researchFindings.id }).from(schema.researchFindings).where(eq(schema.researchFindings.taskId, taskId)).all().length;
  return { ok: ran.length > 0, notes, insights: after - before, ran };
}
