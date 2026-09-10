import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getBrand, listInsights, listPersonas } from "@/lib/queries";
import { readIntegrationConfig } from "@/lib/connectors/config";
import { aiBudgetAllows, recordAiCall, recordDecision } from "@/lib/router";
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
  const insights = listInsights();
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
        "Bạn viết nội dung mạng xã hội tiếng Việt cho fanpage. Viết bản nháp hoàn chỉnh, đúng định dạng (reel = kịch bản có cảnh và lời thoại; carousel = từng slide; post = bài đăng có hook, thân, CTA). Không dùng emoji quá nhiều. Chỉ dùng giá và công dụng có trong danh mục sản phẩm. Trả về chỉ nội dung nháp, không giải thích.",
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
