// Personal Brand System 8.2: "Có thể gọi AI để kiểm tra" — SAU bước 8.1 (luật). AI Đo lường (Đội AI, gate("measure")) đọc số liệu bài
// đã đăng THẬT + kết quả kiểm theo skill + skill viết content, đề xuất tối đa 5 cải tiến. Mỗi đề xuất phải dẫn bài có thật trong dữ liệu
// đưa vào (bịa → bỏ). Lưu là đề xuất (giả thuyết, tin cậy thấp) chờ OWNER quyết, cùng hộp với đề xuất theo luật.
import { createHash } from "node:crypto";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { gate } from "@/lib/ai";
import { captionSkill } from "@/lib/publishing/caption";
import { MEASURE_STEP, skillChecksForPost, topicPerformance } from "./analyze";
import { analyzeAll, gatherPosts, gatherPublished } from "./index";

const ReviewSchema = z.object({
  proposals: z.array(
    z.object({
      title: z.string(),
      detail: z.string().describe("giả thuyết + cách kiểm ở 2–3 bài tiếp theo"),
      target: z.string().describe("content | second_brain | video_skill | ads"),
      postIds: z.array(z.string()).describe("id bài làm căn cứ, chỉ lấy từ dữ liệu"),
    }),
  ),
});

const TARGETS = new Set(["content", "second_brain", "video_skill", "ads"]);
const MAX = 5;

export async function aiReviewResults(by: string): Promise<{ ok: true; saved: number; dropped: number } | { ok: false; error: string }> {
  const published = gatherPublished();
  // Logic trước: chưa có bài đăng thật thì không gọi AI (không tốn tiền cho việc không có dữ liệu)
  if (!published.length) return { ok: false, error: "Chưa có bài đã đăng thật (đã xác minh) để AI Đo lường đánh giá." };
  const ids = new Set(published.map((p) => p.id));
  const skill = captionSkill();
  const rules = analyzeAll().proposals.map((p) => `- ${p.title}`).join("\n") || "(không có)";
  const data = published
    .slice(0, 40)
    .map((p) => `[${p.id}] ${p.platform} · “${p.title.slice(0, 80)}” · xem ${p.views ?? "?"} · reach ${p.reach ?? "?"} · tương tác ${p.engagement ?? "?"} · lệch skill: ${skillChecksForPost(p).join("; ") || "không"}`)
    .join("\n");
  const topics = topicPerformance(gatherPosts()).map((t) => `${t.topic}: ${t.posts} bài, xem TB ${t.avgViews}${t.enough ? "" : " (chưa đủ mẫu)"}`).join("\n");
  const gated = await gate("measure", `AI Đo lường: đánh giá ${published.length} bài đã đăng`, (client, model) =>
    client.messages.parse({
      model,
      max_tokens: 8000,
      system:
        "Bạn là AI Đo lường cho thương hiệu cá nhân. Đề xuất cải tiến nội dung từ số liệu THẬT được đưa; mỗi đề xuất là giả thuyết, nêu cách kiểm. " +
        `Không bịa số; chỉ dẫn id bài có trong dữ liệu; mẫu nhỏ thì nói rõ là mẫu nhỏ. Tối đa ${MAX} đề xuất, không lặp lại đề xuất theo luật đã có.`,
      messages: [
        {
          role: "user",
          content: `${skill ? `SKILL (${skill.title} · ${skill.status}):\n${skill.body.slice(0, 3000)}` : "(chưa có skill viết content)"}\n\nĐề xuất theo luật đã có (bước 8.1):\n${rules}\n\nHiệu quả theo chủ đề:\n${topics || "(chưa có)"}\n\nBài đã đăng:\n${data}`,
        },
      ],
      output_config: { format: zodOutputFormat(ReviewSchema) },
    }),
  );
  if (!gated.ok) return gated;
  const props = (gated.res.parsed_output?.proposals ?? []).slice(0, MAX);
  const db = getDb();
  const now = new Date().toISOString();
  let saved = 0;
  let dropped = 0;
  for (const p of props) {
    const valid = p.postIds.filter((id) => ids.has(id));
    if (!valid.length || !p.title.trim()) {
      dropped++;
      continue;
    }
    const key = `ai:${createHash("sha256").update(p.title.trim().toLowerCase()).digest("hex").slice(0, 16)}`;
    const row = {
      target: TARGETS.has(p.target) ? p.target : "content",
      title: `AI đề xuất: ${p.title.trim().slice(0, 180)}`,
      detail: `${p.detail.trim().slice(0, 1500)} (AI Đo lường — bước ${MEASURE_STEP}, giả thuyết; ${by})`,
      evidence: JSON.stringify(valid.map((id) => {
        const x = published.find((q) => q.id === id)!;
        return `${x.platform}: “${x.title.slice(0, 80)}” · xem ${x.views ?? "?"}`;
      })),
      sampleSize: published.length,
      confidence: "low",
      updatedAt: now,
    };
    const old = db.select().from(schema.improvementProposals).where(eq(schema.improvementProposals.key, key)).get();
    if (old) db.update(schema.improvementProposals).set(row).where(eq(schema.improvementProposals.id, old.id)).run();
    else db.insert(schema.improvementProposals).values({ id: `ip_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`, key, ...row, status: "proposed", createdAt: now }).run();
    saved++;
  }
  return { ok: true, saved, dropped };
}
