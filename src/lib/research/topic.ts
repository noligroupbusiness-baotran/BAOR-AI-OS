// Nghiên cứu theo sơ đồ Personal Brand System (bước 1 → 2 → 3), bản ĐƠN GIẢN (OWNER 25/10/2026):
// 1. OWNER đề xuất chủ đề → 2. lấy insight từ nền tảng (2.1 nhóm Facebook, 2.2 bình luận YouTube, 2.3 bình luận Facebook, 2.4 kiến
// thức trên social) — theo luật trước, AI Nghiên cứu (Đội AI, "Cho phép gọi AI") phân tích thêm khi được bật → 3. Bảng Hook dùng insight.
// Mỗi chủ đề là một research_task; mọi nguồn CỘNG DỒN vào chủ đề (saveResearchResult append).
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { gate } from "@/lib/ai";
import { createResearchTask, saveResearchResult } from "./index";
import { SOCIAL_KINDS, parseSocialPaste, socialToResearch, type SocialKind } from "./social";

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
  byAi: boolean;
  ok: boolean; // đạt luật kiểm (có nguồn khi có số liệu…)
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
        byAi: f.limits.startsWith("AI Nghiên cứu"),
        ok: f.verifyOk,
      };
    });
}

export function deleteInsight(taskId: string, findingId: string): void {
  const db = getDb();
  const f = db.select().from(schema.researchFindings).where(eq(schema.researchFindings.id, findingId)).get();
  if (f?.taskId === taskId) db.delete(schema.researchFindings).where(eq(schema.researchFindings.id, findingId)).run();
}

// ---------- 2.1–2.4: dán bình luận / kiến thức → luật trước, AI sau (khi được phép) ----------
const AiInsights = z.object({
  insights: z.array(z.object({ statement: z.string().describe("insight ngắn, dựa trên bình luận đã cho"), application: z.string().describe("cách dùng cho hook / video"), count: z.number().int().describe("số bình luận ủng hộ insight này") })),
});

export async function addSourceToTopic(input: { taskId: string; kind: SocialKind; url: string; paste: string; topic: string; useAi: boolean; by: string }): Promise<{ ok: true; comments: number; ruleInsights: number; aiInsights: number; aiError?: string } | { ok: false; error: string }> {
  let comments: string[];
  try {
    comments = parseSocialPaste(input.paste);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Không đọc được dữ liệu dán" };
  }
  if (comments.length < 3) return { ok: false, error: "Cần ít nhất 3 bình luận / dòng (mỗi dòng một bình luận, hoặc CSV / JSON có cột nội dung)" };
  const rule = saveResearchResult(input.taskId, socialToResearch(input.kind, input.url, comments, input.topic), { runner: "import", by: input.by, append: true });
  if (!input.useAi) return { ok: true, comments: comments.length, ruleInsights: rule.findings, aiInsights: 0 };
  // AI Nghiên cứu: chỉ nhận bình luận ĐÃ làm sạch (bỏ tên, số điện thoại, email, @nhắc tên, link), tối đa 300 dòng
  const label = SOCIAL_KINDS[input.kind];
  const sample = comments.slice(0, 300).map((c) => `- ${c.slice(0, 300)}`).join("\n");
  const gated = await gate("research", `AI Nghiên cứu: ${comments.length} bình luận (${label})`, (client, model) =>
    client.messages.parse({
      model,
      max_tokens: 6000,
      system:
        "Bạn là AI Nghiên cứu cho thương hiệu cá nhân. Đọc bình luận thật của khán giả, rút tối đa 6 insight (nỗi lo, mong muốn, câu hỏi lặp lại, ngôn từ họ dùng). " +
        "Chỉ dựa trên bình luận được đưa; không bịa số liệu; count là số bình luận ủng hộ. Không nêu tên người. Mục tiêu là marketing (không chào bán).",
      messages: [{ role: "user", content: `Chủ đề: ${input.topic}\nNguồn: ${label} (${comments.length} bình luận)\n\n${sample}` }],
      output_config: { format: zodOutputFormat(AiInsights) },
    }),
  );
  if (!gated.ok) return { ok: true, comments: comments.length, ruleInsights: rule.findings, aiInsights: 0, aiError: gated.error };
  const list = (gated.res.parsed_output?.insights ?? []).slice(0, 6).filter((i) => i.statement.trim());
  const ai = saveResearchResult(
    input.taskId,
    {
      summary: `AI Nghiên cứu: ${list.length} insight từ ${comments.length} bình luận (${label}).`,
      sources: [{ url: input.url, title: label, author: "", publisher: label, publishedAt: null, sourceType: "social", grade: "D", excerpt: `${comments.length} bình luận đã làm sạch`, limits: "" }],
      findings: list.map((i) => ({
        statement: `${i.statement.trim()}${i.count > 0 ? ` (${Math.min(i.count, comments.length)}/${comments.length} bình luận)` : ""}`,
        classification: "OBSERVATION" as const,
        sourceUrls: [input.url],
        knowledgeIds: [],
        counterView: "",
        limits: `AI Nghiên cứu đọc ${comments.length} bình luận (${label}); ý kiến người dùng, không đại diện thị trường.`,
        application: i.application.trim(),
        contentTopics: input.topic ? [input.topic] : [],
        confidence: "low" as const,
      })),
    },
    { runner: "ai", by: input.by, append: true },
  );
  return { ok: true, comments: comments.length, ruleInsights: rule.findings, aiInsights: ai.findings };
}
