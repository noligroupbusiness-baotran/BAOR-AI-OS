import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getBrand, listInsights, listPersonas } from "@/lib/queries";
import { readIntegrationConfig } from "@/lib/connectors/config";
import { aiBudgetAllows, recordAiCall, recordDecision } from "@/lib/router";
import { roleAllows, roleForPurpose } from "@/lib/ai-roster";
import { sendAlert } from "@/lib/alerts";
import { HOOK_COUNT, HOOK_PLATFORMS, hookContext, saveHooks } from "@/lib/content/hooks";
import { buildCaption, captionSkill, saveCaptionDraft } from "@/lib/publishing/caption";

// Bộ não AI của hệ thống. Khóa API lấy từ Cài đặt > Kết nối > Claude API, hoặc biến môi trường ANTHROPIC_API_KEY.
// Mô hình theo từng vị trí: src/lib/ai-roster.ts (Cài đặt › Đội AI).

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

export function aiConfigured(): boolean {
  return Boolean(readIntegrationConfig("claude").apiKey || process.env.ANTHROPIC_API_KEY);
}

function getClient(): Anthropic | null {
  const apiKey = readIntegrationConfig("claude").apiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new Anthropic({ apiKey });
}

const NO_KEY = "Chưa có khóa Claude API. Vào Cài đặt > Kết nối > Claude API để nhập khóa.";

// Cổng AI: mọi lần gọi mô hình đi qua đây để (1) kiểm tra công tắc "Cho phép gọi AI" + trần riêng của vị trí (Đội AI),
// (2) kiểm tra trần ngân sách chung, (3) ghi sổ chi phí theo vị trí, (4) ghi quyết định vào bộ định tuyến với nhãn
// "AI đề xuất, cần người duyệt". Mô hình do vị trí quyết định (Cài đặt › Đội AI), truyền vào call.
export async function gate<T extends { usage?: { input_tokens: number; output_tokens: number } }>(purpose: string, subject: string, call: (client: Anthropic, model: string) => Promise<T>): Promise<Result<{ res: T }>> {
  const role = roleForPurpose(purpose);
  const allowed = roleAllows(role);
  if (!allowed.ok) {
    recordDecision({ lane: "rule", domain: purpose === "reply" ? "reply" : purpose === "research" ? "research" : "content", subject, outcome: "không gọi AI", reason: allowed.reason, needsApproval: false });
    return { ok: false, error: allowed.reason };
  }
  const model = allowed.value?.model ?? role.defaultModel;
  const client = getClient();
  if (!client) return { ok: false, error: NO_KEY };
  const budget = aiBudgetAllows();
  if (!budget.ok) {
    recordDecision({ lane: "rule", domain: "content", subject, outcome: "chặn gọi AI", reason: budget.reason, needsApproval: false });
    void sendAlert({ level: "warn", title: "AI chạm trần chi phí", text: budget.reason, href: "/settings#ai" });
    return { ok: false, error: `${budget.reason} Nâng trần ở Cài đặt › AI Agent nếu cần.` };
  }
  try {
    const res = await call(client, model);
    const aiCallId = recordAiCall({ purpose, role: role.id, model, inputTokens: res.usage?.input_tokens ?? 0, outputTokens: res.usage?.output_tokens ?? 0, ok: true });
    recordDecision({ lane: "ai", domain: purpose === "reply" ? "reply" : purpose === "research" ? "research" : "content", subject, outcome: "AI đã tạo đề xuất", reason: "Thiếu dữ liệu nguồn có sẵn, dùng AI; người duyệt trước khi dùng.", sources: ["Dữ liệu trong hệ thống (Cài đặt, insight, hội thoại)", `${role.name} · ${model}`], confidence: 70, needsApproval: true, aiCallId });
    return { ok: true, res };
  } catch (e) {
    recordAiCall({ purpose, role: role.id, model, inputTokens: 0, outputTokens: 0, ok: false, error: describeError(e) });
    return { ok: false, error: describeError(e) };
  }
}


function describeError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "Khóa Claude API không hợp lệ.";
  if (e instanceof Anthropic.RateLimitError) return "Claude API đang quá tải, thử lại sau ít phút.";
  if (e instanceof Anthropic.APIError) return `Lỗi Claude API (${e.status}): ${e.message}`;
  return "Không gọi được Claude API.";
}

function brandContext() {
  const b = getBrand();
  const personas = listPersonas();
  const insights = listInsights().filter((i) => i.status === "approved");
  return [
    `Thương hiệu: ${b.name || "(chưa đặt tên)"}. Sản phẩm/dịch vụ: ${b.products || "(chưa mô tả)"}.`,
    `Giọng văn: ${b.voice || "gần gũi, chân thật"}.`,
    `Nhóm khách hàng:\n${personas.map((p) => `- ${p.name}: nỗi đau ${p.painPoints.join("; ")}; mong muốn ${p.goals.join("; ")}`).join("\n")}`,
    `Insight đã có:\n${insights.map((i) => `- [${i.id}] ${i.title} (tin cậy ${i.confidence}%): ${i.detail}`).join("\n")}`,
  ].join("\n\n");
}

const IdeasSchema = z.object({
  ideas: z.array(
    z.object({
      title: z.string(),
      format: z.enum(["post", "reel", "carousel", "story", "article"]),
      pillar: z.string(),
      hook: z.string(),
      outline: z.array(z.string()),
      insightId: z.string(),
      score: z.number().int().min(0).max(100),
    }),
  ),
});

// Bảng Hook (Personal Brand System bước 3): 10 hook / lần (schema KHÔNG ép min/max — mô hình trả 9 / 11 thì parse vẫn đạt, sổ chi phí
// ghi đúng token; cắt còn 10, thiếu thì báo; nền tảng lạ do saveHooks lọc), video ngắn < 3 phút, bám căn cứ đưa vào (phát hiện nghiên cứu đã kiểm,
// Second Brain, insight đã duyệt) — ref căn cứ ngoài danh sách bị bỏ; luật ngôn từ theo nền tảng kiểm lại bằng luật khi lưu.
const HooksSchema = z.object({
  hooks: z
    .array(
      z.object({
        hook: z.string().describe("câu mở đầu 3 giây đầu, nói thành lời"),
        angle: z.string().describe("góc tiếp cận / vì sao người xem dừng lại"),
        beats: z.array(z.string()).describe("dàn ý kịch bản 3-6 nhịp"),
        durationSec: z.number().int().describe("độ dài dự kiến, giây, tối đa 180"),
        platforms: z.array(z.string()).describe(`trong: ${HOOK_PLATFORMS.join(", ")}`),
        basisRefs: z.array(z.string()).describe("ref căn cứ dạng finding:<id> / knowledge:<id> / insight:<id>, chỉ lấy từ ngữ cảnh"),
      }),
    )
    .describe(`đúng ${HOOK_COUNT} phần tử`),
});

export async function generateHooks(topic: string, by: string, researchId?: string): Promise<Result<{ batchId: string; count: number; dropped: number; short: number }>> {
  const ctx = hookContext(topic, researchId);
  const gated = await gate("ideas", `AI Hook: 10 hook “${topic.slice(0, 60)}”`, (client, model) =>
    client.messages.parse({
      model,
      max_tokens: 16000,
      system:
        "Bạn là biên tập viên video ngắn cho thương hiệu cá nhân Việt Nam. Viết hook nói thành lời, tự nhiên, cụ thể; mỗi hook một góc khác nhau. " +
        "Chỉ dựa trên căn cứ được đưa (phát hiện nghiên cứu, Second Brain, insight); không bịa số liệu, giá, công dụng. " +
        "Tuân chính sách nền tảng: không khẳng định tuyệt đối (100%, cam kết, đảm bảo), không tuyên bố chữa bệnh / giảm cân cụ thể, " +
        "không khẳng định thuộc tính cá nhân người xem (\"bạn đang béo / nợ…\"), không hứa thu nhập. Video dưới 3 phút.",
      messages: [{ role: "user", content: `${brandContext()}\n\n${ctx.text}\n\nChủ đề OWNER đề xuất: ${topic}\n\nViết đúng ${HOOK_COUNT} hook kèm dàn ý kịch bản ngắn.` }],
      output_config: { format: zodOutputFormat(HooksSchema) },
    }),
  );
  if (!gated.ok) return gated;
  const hooks = (gated.res.parsed_output?.hooks ?? []).slice(0, HOOK_COUNT);
  if (!hooks.length) return { ok: false, error: "AI không trả về hook nào." };
  const saved = saveHooks(topic, hooks, { source: "ai", by, allowed: ctx.basis, researchId });
  const dropped = hooks.reduce((n, h) => n + h.basisRefs.filter((r) => !ctx.basis.some((b) => `${b.kind}:${b.id}` === r)).length, 0);
  return { ok: true, batchId: saved.batchId, count: saved.ids.length, dropped, short: Math.max(0, HOOK_COUNT - saved.ids.length) };
}

// Bài đăng theo skill (Personal Brand System 6.1): AI Viết bài đăng viết caption cho video theo skill viết content trong Second Brain,
// chỉ từ kịch bản đã duyệt; luật caption kiểm lại khi hiển thị. Bản nháp lưu theo video, OWNER sửa rồi mới lên lịch.
export async function generateCaption(videoId: string): Promise<Result<{ text: string; skill: string }>> {
  const db = getDb();
  const v = db.select().from(schema.videos).where(eq(schema.videos.id, videoId)).get();
  if (!v) return { ok: false, error: "Không tìm thấy video." };
  const c = v.contentId ? db.select().from(schema.contentItems).where(eq(schema.contentItems.id, v.contentId)).get() : undefined;
  const skill = captionSkill();
  const base = buildCaption(videoId);
  const gated = await gate("caption", `AI viết caption “${v.title.slice(0, 60)}”`, (client, model) =>
    client.messages.create({
      model,
      max_tokens: 4000,
      system:
        "Bạn viết caption bài đăng video ngắn cho thương hiệu cá nhân Việt Nam, theo đúng skill được đưa. Chỉ dùng thông tin có trong kịch bản; " +
        "không bịa số liệu, giá, công dụng; không khẳng định tuyệt đối, không tuyên bố chữa bệnh / giảm cân, không khẳng định thuộc tính cá nhân người xem, " +
        "không hứa thu nhập. Trả về đúng phần caption (không giải thích), dưới 1.200 ký tự, tối đa 3 hashtag.",
      messages: [
        {
          role: "user",
          content: `${skill ? `SKILL (${skill.title} · ${skill.status}):\n${skill.body.slice(0, 4000)}` : "(Second Brain chưa có skill viết content — dùng cấu trúc Hook → tình huống → bài học → CTA)"}\n\n` +
            `Video: ${v.title}\nHook: ${c?.hook ?? ""}\nKịch bản đã duyệt:\n${(c?.draft ?? "").slice(0, 6000) || "(không có)"}\n\nCaption nháp theo luật (để tham khảo):\n${base.text}`,
        },
      ],
    }),
  );
  if (!gated.ok) return gated;
  const text = gated.res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
  if (!text) return { ok: false, error: "AI không trả về caption." };
  saveCaptionDraft(videoId, text);
  return { ok: true, text, skill: skill ? `${skill.title} (${skill.status})` : "chưa có skill" };
}

export async function generateIdeas(n = 5): Promise<Result<{ count: number }>> {
  const gated = await gate("ideas", `AI đề xuất ${n} ý tưởng nội dung`, (client, model) =>
    client.messages.parse({
      model,
      max_tokens: 16000,
      system:
        "Bạn là giám đốc nội dung cho một fanpage Việt Nam. Đề xuất ý tưởng bám chặt vào insight khách hàng, viết tiếng Việt tự nhiên, hook ngắn, dàn ý 3-5 gạch đầu dòng. Điểm score phản ánh khả năng tạo tương tác và lead thật. Hệ thống chỉ làm marketing (không chào bán, không nêu giá); không bịa công dụng.",
      messages: [{ role: "user", content: `${brandContext()}\n\nHãy đề xuất ${n} ý tưởng nội dung mới, mỗi ý tưởng gắn với một insightId có thật ở trên.` }],
      output_config: { format: zodOutputFormat(IdeasSchema) },
    }),
  );
  if (!gated.ok) return gated;
  const res = gated.res;
  try {
    const ideas = res.parsed_output?.ideas ?? [];
    if (ideas.length === 0) return { ok: false, error: "AI không trả về ý tưởng nào." };
    const db = getDb();
    db.insert(schema.contentItems)
      .values(
        ideas.map((i) => ({
          id: `ct_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
          title: i.title,
          format: i.format,
          status: "proposed",
          insightId: i.insightId,
          pillar: i.pillar,
          hook: i.hook,
          outline: JSON.stringify(i.outline),
          assignee: "ai",
          createdAt: new Date().toISOString(),
          score: i.score,
          source: "ai",
        })),
      )
      .run();
    return { ok: true, count: ideas.length };
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}

export function draftPurpose(format: string): "draft" | "caption" {
  return format === "reel" || format === "story" || format === "script" ? "draft" : "caption";
}

/** `briefRules`: khi nội dung sinh từ brief nghiên cứu, AI chỉ được viết lại kịch bản quay hiện có theo các luật này. */
export async function writeDraft(contentId: string, briefRules?: string, validate?: (draft: string) => string[]): Promise<Result<{ draft: string }>> {
  const db = getDb();
  const item = db.select().from(schema.contentItems).where(eq(schema.contentItems.id, contentId)).get();
  if (!item) return { ok: false, error: "Không tìm thấy nội dung." };
  // Đội AI: kịch bản video (reel / story / script) → AI Kịch bản; bài đăng / caption / bài viết / carousel / ảnh → AI Viết bài đăng
  const gated = await gate(draftPurpose(item.format), `AI viết nháp “${item.title}”`, (client, model) =>
    client.messages.create({
      model,
      max_tokens: 16000,
      system:
        "Bạn viết nội dung mạng xã hội tiếng Việt cho fanpage. Viết bản nháp hoàn chỉnh, đúng định dạng: post = bài đăng có hook, thân, CTA; article = bài dài có tiêu đề phụ; carousel = từng slide đánh số; reel / story / script = kịch bản video 15–60 giây theo 5 cảnh Hook (0–3s), Vấn đề, Giải pháp, Bằng chứng, Kêu gọi, mỗi cảnh có ba dòng Hình ảnh / Lời thoại / Chữ trên màn hình; caption = caption ngắn dưới 125 ký tự ở câu đầu, có CTA, tối đa 5 hashtag; image = bản mô tả ảnh cho thiết kế (thông điệp trên ảnh tối đa 8 từ, chủ thể, bố cục, màu, phong cách, điều cấm). Không dùng emoji quá nhiều. Hệ thống chỉ làm marketing (không chào bán, không nêu giá); không bịa công dụng. Trả về chỉ nội dung nháp, không giải thích.",
      messages: [
        {
          role: "user",
          content: briefRules
            ? `${briefRules}\n\nKịch bản quay hiện có (giữ nguyên cấu trúc cảnh, các dòng Căn cứ và mục NGUỒN):\n${item.draft ?? ""}`
            : `${brandContext()}\n\nViết nháp cho:\nTiêu đề: ${item.title}\nĐịnh dạng: ${item.format}\nHook: ${item.hook}\nDàn ý: ${item.outline}`,
        },
      ],
    }),
  );
  if (!gated.ok) return gated;
  const res = gated.res;
  try {
    if (res.stop_reason === "refusal") return { ok: false, error: "AI từ chối yêu cầu này." };
    const draft = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    const violations = validate ? validate(draft) : [];
    if (violations.length) return { ok: false, error: `Không nhận bản AI viết lại, giữ bản cũ: ${violations.join("; ")}` };
    // Trong lúc AI viết, nội dung có thể đã được duyệt: chỉ ghi khi vẫn đang viết / chờ duyệt.
    const now = db.select({ status: schema.contentItems.status }).from(schema.contentItems).where(eq(schema.contentItems.id, contentId)).get();
    if (now?.status !== "in_progress" && now?.status !== "review") return { ok: false, error: "Nội dung đã đổi trạng thái trong lúc AI viết; không ghi đè." };
    db.update(schema.contentItems).set({ draft }).where(eq(schema.contentItems.id, contentId)).run();
    return { ok: true, draft };
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}

export async function suggestReply(conversationId: string): Promise<Result<{ text: string }>> {
  const db = getDb();
  const conv = db.select().from(schema.conversations).where(eq(schema.conversations.id, conversationId)).get();
  if (!conv) return { ok: false, error: "Không tìm thấy hội thoại." };
  const msgs = db.select().from(schema.messages).where(eq(schema.messages.conversationId, conversationId)).orderBy(schema.messages.at).all();
  const b = getBrand();
  const gated = await gate("reply", `AI gợi ý trả lời ${conv.leadName}`, (client, model) =>
    client.messages.create({
      model,
      max_tokens: 2000,
      output_config: { effort: "low" },
      system: `Bạn là nhân viên chăm sóc fanpage ${b.name || ""}. Giọng: ${b.voice}. Trả lời ngắn gọn 1-3 câu, tiếng Việt, thân thiện, hướng tới để lại số điện thoại để được tư vấn (lead). Không chào bán, không nêu giá, không hứa điều không chắc. Chỉ trả về câu trả lời.`,
      messages: [
        {
          role: "user",
          content: `Khách: ${conv.leadName}. Lịch sử:\n${msgs.map((m) => `${m.from === "customer" ? "Khách" : m.from === "ai" ? "AI" : "Shop"}: ${m.text}`).join("\n")}\n\nSoạn câu trả lời tiếp theo.`,
        },
      ],
    }),
  );
  if (!gated.ok) return gated;
  const res = gated.res;
  try {
    if (res.stop_reason === "refusal") return { ok: false, error: "AI từ chối yêu cầu này." };
    const text = res.content
      .filter((blk): blk is Anthropic.TextBlock => blk.type === "text")
      .map((blk) => blk.text)
      .join(" ")
      .trim();
    return { ok: true, text };
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}


// ---------- Trợ lý: câu hỏi tự do trên ảnh chụp dữ liệu hệ thống ----------
export async function askAi(question: string, snapshot: string, history: string): Promise<Result<{ text: string }>> {
  const gated = await gate("assistant", `Trợ lý: “${question.slice(0, 80)}”`, (client, model) =>
    client.messages.create({
      model,
      max_tokens: 1500,
      output_config: { effort: "low" },
      system:
        "Bạn là trợ lý vận hành marketing trong hệ thống BAOR AI OS. Chỉ trả lời dựa trên DỮ LIỆU HỆ THỐNG được cung cấp; không bịa số. Nếu dữ liệu không đủ, nói rõ thiếu gì và gợi ý mở phân hệ nào. Trả lời tiếng Việt, ngắn gọn, có gạch đầu dòng khi liệt kê. Không đưa ra quyết định chi tiền hay xuất bản; chỉ đề xuất để người duyệt.",
      messages: [{ role: "user", content: `DỮ LIỆU HỆ THỐNG:\n${snapshot}\n\nHỘI THOẠI TRƯỚC:\n${history || "(chưa có)"}\n\nCÂU HỎI: ${question}` }],
    }),
  );
  if (!gated.ok) return gated;
  const res = gated.res;
  if (res.stop_reason === "refusal") return { ok: false, error: "AI từ chối yêu cầu này." };
  const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
  return { ok: true, text };
}

// ---------- Rút insight từ dữ liệu thật, kèm bằng chứng, chờ người duyệt ----------
const InsightsSchema = z.object({
  insights: z.array(
    z.object({
      title: z.string(),
      detail: z.string(),
      confidence: z.number().int().min(0).max(100),
      source: z.string(),
      evidence: z.array(z.string()).min(1),
      personaId: z.string().nullable(),
    }),
  ),
});

export async function extractInsights(): Promise<Result<{ count: number }>> {
  const db = getDb();
  const msgs = db.select().from(schema.messages).orderBy(desc(schema.messages.at)).limit(120).all().filter((m) => m.from === "customer");
  const leads = db.select().from(schema.leads).orderBy(desc(schema.leads.lastMessageAt)).limit(60).all();
  const posts = db.select().from(schema.scheduledPosts).all().filter((p) => p.status === "published" && p.reach);
  const personas = listPersonas();
  if (msgs.length + leads.length + posts.length < 5) return { ok: false, error: "Chưa đủ dữ liệu (inbox, lead, bài đăng) để rút insight. Kết nối nền tảng hoặc nhập lead trước." };
  const data = [
    `Tin nhắn khách (${msgs.length}):\n${msgs.map((m) => `- [msg ${m.id}] ${m.text}`).join("\n")}`,
    `Lead (${leads.length}):\n${leads.map((l) => `- [lead ${l.id}] ${l.name} · ${l.source}/${l.platform} · ${l.stage} · "${l.lastMessage}" · nhãn ${l.tags}`).join("\n")}`,
    `Bài đã đăng:\n${posts.map((p) => `- [post ${p.id}] "${p.title}" ${p.platform}: reach ${p.reach}, tương tác ${p.engagement}`).join("\n")}`,
    `Nhóm khách hàng có sẵn: ${personas.map((p) => `${p.id}=${p.name}`).join("; ") || "(chưa có)"}`,
  ].join("\n\n");
  const gated = await gate("research", "AI rút insight từ inbox, lead, bài đăng", (client, model) =>
    client.messages.parse({
      model,
      max_tokens: 6000,
      system:
        "Bạn là chuyên viên nghiên cứu khách hàng. Từ dữ liệu thô, rút ra 2–5 insight cụ thể, có thể hành động, tiếng Việt. Mỗi insight PHẢI kèm evidence là trích dẫn / mã bản ghi có trong dữ liệu (dạng [msg id], [lead id], [post id]); không suy đoán ngoài dữ liệu. confidence phản ánh số bằng chứng. personaId chỉ dùng id có trong danh sách, không có thì null. source ghi rõ loại dữ liệu và số lượng (VD: '18 tin nhắn inbox tuần này').",
      messages: [{ role: "user", content: data }],
      output_config: { format: zodOutputFormat(InsightsSchema) },
    }),
  );
  if (!gated.ok) return gated;
  const list = gated.res.parsed_output?.insights ?? [];
  const validPersona = new Set(personas.map((p) => p.id));
  const now = new Date().toISOString();
  for (const i of list) {
    db.insert(schema.insights)
      .values({ id: `i_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, title: i.title, detail: i.detail, confidence: i.confidence, source: i.source, personaId: i.personaId && validPersona.has(i.personaId) ? i.personaId : null, createdAt: now, usedInContent: 0, status: "proposed", origin: "ai", evidence: JSON.stringify(i.evidence) })
      .run();
  }
  return { ok: true, count: list.length };
}
