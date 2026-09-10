import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getBrand, listInsights, listPersonas } from "@/lib/queries";

// Bộ não AI của hệ thống. Khóa API lấy từ Cài đặt > Kết nối > Claude API, hoặc biến môi trường ANTHROPIC_API_KEY.
const MODEL = "claude-opus-5";

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

function getClient(): Anthropic | null {
  const row = getDb().select().from(schema.integrations).where(eq(schema.integrations.key, "claude")).get();
  const cfg = row ? (JSON.parse(row.config || "{}") as { apiKey?: string }) : {};
  const apiKey = cfg.apiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new Anthropic({ apiKey });
}

const NO_KEY = "Chưa có khóa Claude API. Vào Cài đặt > Kết nối > Claude API để nhập khóa.";

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
  const client = getClient();
  if (!client) return { ok: false, error: NO_KEY };
  try {
    const res = await client.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      system:
        "Bạn là giám đốc nội dung cho một fanpage Việt Nam. Đề xuất ý tưởng bám chặt vào insight khách hàng, viết tiếng Việt tự nhiên, hook ngắn, dàn ý 3-5 gạch đầu dòng. Điểm score phản ánh khả năng tạo tương tác và lead thật.",
      messages: [{ role: "user", content: `${brandContext()}\n\nHãy đề xuất ${n} ý tưởng nội dung mới, mỗi ý tưởng gắn với một insightId có thật ở trên.` }],
      output_config: { format: zodOutputFormat(IdeasSchema) },
    });
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
  const client = getClient();
  if (!client) return { ok: false, error: NO_KEY };
  const db = getDb();
  const item = db.select().from(schema.contentItems).where(eq(schema.contentItems.id, contentId)).get();
  if (!item) return { ok: false, error: "Không tìm thấy nội dung." };
  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system:
        "Bạn viết nội dung mạng xã hội tiếng Việt cho fanpage. Viết bản nháp hoàn chỉnh, đúng định dạng (reel = kịch bản có cảnh và lời thoại; carousel = từng slide; post = bài đăng có hook, thân, CTA). Không dùng emoji quá nhiều. Trả về chỉ nội dung nháp, không giải thích.",
      messages: [
        {
          role: "user",
          content: `${brandContext()}\n\nViết nháp cho:\nTiêu đề: ${item.title}\nĐịnh dạng: ${item.format}\nHook: ${item.hook}\nDàn ý: ${item.outline}`,
        },
      ],
    });
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
  const client = getClient();
  if (!client) return { ok: false, error: NO_KEY };
  const db = getDb();
  const conv = db.select().from(schema.conversations).where(eq(schema.conversations.id, conversationId)).get();
  if (!conv) return { ok: false, error: "Không tìm thấy hội thoại." };
  const msgs = db.select().from(schema.messages).where(eq(schema.messages.conversationId, conversationId)).orderBy(schema.messages.at).all();
  const b = getBrand();
  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      output_config: { effort: "low" },
      system: `Bạn là nhân viên tư vấn của fanpage ${b.name || ""}. Sản phẩm: ${b.products || "(chưa mô tả)"}. Giọng: ${b.voice}. Trả lời ngắn gọn 1-3 câu, tiếng Việt, hướng tới chốt đơn hoặc lấy số điện thoại. Chỉ trả về câu trả lời.`,
      messages: [
        {
          role: "user",
          content: `Khách: ${conv.leadName}. Lịch sử:\n${msgs.map((m) => `${m.from === "customer" ? "Khách" : m.from === "ai" ? "AI" : "Shop"}: ${m.text}`).join("\n")}\n\nSoạn câu trả lời tiếp theo.`,
        },
      ],
    });
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
