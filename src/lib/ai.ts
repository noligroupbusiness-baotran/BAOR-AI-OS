import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getBrand, listInsights, listPersonas } from "@/lib/queries";
import { readIntegrationConfig } from "@/lib/connectors/config";
import { aiBudgetAllows, recordAiCall, recordDecision } from "@/lib/router";
import { sendAlert } from "@/lib/alerts";
import { catalogRepo } from "@/lib/catalog/repository";

// Bộ não AI của hệ thống. Khóa API lấy từ Cài đặt > Kết nối > Claude API, hoặc biến môi trường ANTHROPIC_API_KEY.
const MODEL = "claude-opus-5";

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

function getClient(): Anthropic | null {
  const apiKey = readIntegrationConfig("claude").apiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new Anthropic({ apiKey });
}

const NO_KEY = "Chưa có khóa Claude API. Vào Cài đặt > Kết nối > Claude API để nhập khóa.";

// Cổng AI: mọi lần gọi mô hình đi qua đây để (1) kiểm tra trần ngân sách, (2) ghi sổ chi phí,
// (3) ghi quyết định vào bộ định tuyến với nhãn "AI đề xuất, cần người duyệt".
async function gate<T extends { usage?: { input_tokens: number; output_tokens: number } }>(purpose: string, subject: string, call: (client: Anthropic) => Promise<T>): Promise<Result<{ res: T }>> {
  const client = getClient();
  if (!client) return { ok: false, error: NO_KEY };
  const budget = aiBudgetAllows();
  if (!budget.ok) {
    recordDecision({ lane: "rule", domain: "content", subject, outcome: "chặn gọi AI", reason: budget.reason, needsApproval: false });
    void sendAlert({ level: "warn", title: "AI chạm trần chi phí", text: budget.reason, href: "/settings#ai" });
    return { ok: false, error: `${budget.reason} Nâng trần ở Cài đặt › AI Agent nếu cần.` };
  }
  try {
    const res = await call(client);
    const aiCallId = recordAiCall({ purpose, model: MODEL, inputTokens: res.usage?.input_tokens ?? 0, outputTokens: res.usage?.output_tokens ?? 0, ok: true });
    recordDecision({ lane: "ai", domain: purpose === "reply" ? "reply" : purpose === "research" ? "research" : "content", subject, outcome: "AI đã tạo đề xuất", reason: "Thiếu dữ liệu nguồn có sẵn, dùng AI; người duyệt trước khi dùng.", sources: ["Dữ liệu trong hệ thống (Cài đặt, insight, hội thoại)", `Claude ${MODEL}`], confidence: 70, needsApproval: true, aiCallId });
    return { ok: true, res };
  } catch (e) {
    recordAiCall({ purpose, model: MODEL, inputTokens: 0, outputTokens: 0, ok: false, error: describeError(e) });
    return { ok: false, error: describeError(e) };
  }
}

// Dữ liệu chuẩn từ Cài đặt: giá và mô tả sản phẩm. AI chỉ được dùng thông tin này, không tự đặt giá.
function catalogContext(): string {
  const items = catalogRepo.listProducts();
  if (items.length === 0) return "Danh mục sản phẩm: (chưa có trong Cài đặt; KHÔNG được tự nghĩ ra giá hay công dụng).";
  return `Danh mục sản phẩm (nguồn chuẩn, KHÔNG tự đặt giá hay công dụng khác):\n${items.map((p) => `- ${p.name} (${p.brand}): ${p.price > 0 ? `${p.price.toLocaleString("vi-VN")} ₫/${p.unit}` : "không tính giá"}. ${p.description}`).join("\n")}`;
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
    catalogContext(),
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

export async function generateIdeas(n = 5): Promise<Result<{ count: number }>> {
  const gated = await gate("ideas", `AI đề xuất ${n} ý tưởng nội dung`, (client) =>
    client.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      system:
        "Bạn là giám đốc nội dung cho một fanpage Việt Nam. Đề xuất ý tưởng bám chặt vào insight khách hàng, viết tiếng Việt tự nhiên, hook ngắn, dàn ý 3-5 gạch đầu dòng. Điểm score phản ánh khả năng tạo tương tác và lead thật. Chỉ dùng giá và công dụng có trong danh mục sản phẩm.",
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

export async function writeDraft(contentId: string): Promise<Result<{ draft: string }>> {
  const db = getDb();
  const item = db.select().from(schema.contentItems).where(eq(schema.contentItems.id, contentId)).get();
  if (!item) return { ok: false, error: "Không tìm thấy nội dung." };
  const gated = await gate("draft", `AI viết nháp “${item.title}”`, (client) =>
    client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system:
        "Bạn viết nội dung mạng xã hội tiếng Việt cho fanpage. Viết bản nháp hoàn chỉnh, đúng định dạng: post = bài đăng có hook, thân, CTA; article = bài dài có tiêu đề phụ; carousel = từng slide đánh số; reel / story / script = kịch bản video 15–60 giây theo 5 cảnh Hook (0–3s), Vấn đề, Giải pháp, Bằng chứng, Kêu gọi, mỗi cảnh có ba dòng Hình ảnh / Lời thoại / Chữ trên màn hình; caption = caption ngắn dưới 125 ký tự ở câu đầu, có CTA, tối đa 5 hashtag; image = bản mô tả ảnh cho thiết kế (thông điệp trên ảnh tối đa 8 từ, chủ thể, bố cục, màu, phong cách, điều cấm). Không dùng emoji quá nhiều. Chỉ dùng giá và công dụng có trong danh mục sản phẩm. Trả về chỉ nội dung nháp, không giải thích.",
      messages: [
        {
          role: "user",
          content: `${brandContext()}\n\nViết nháp cho:\nTiêu đề: ${item.title}\nĐịnh dạng: ${item.format}\nHook: ${item.hook}\nDàn ý: ${item.outline}`,
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
  const gated = await gate("reply", `AI gợi ý trả lời ${conv.leadName}`, (client) =>
    client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      output_config: { effort: "low" },
      system: `Bạn là nhân viên tư vấn của fanpage ${b.name || ""}. ${catalogContext()} Giọng: ${b.voice}. Trả lời ngắn gọn 1-3 câu, tiếng Việt, hướng tới chốt đơn hoặc lấy số điện thoại. Không hứa điều không có trong danh mục. Chỉ trả về câu trả lời.`,
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
  const gated = await gate("assistant", `Trợ lý: “${question.slice(0, 80)}”`, (client) =>
    client.messages.create({
      model: MODEL,
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
  const gated = await gate("research", "AI rút insight từ inbox, lead, bài đăng", (client) =>
    client.messages.parse({
      model: MODEL,
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
