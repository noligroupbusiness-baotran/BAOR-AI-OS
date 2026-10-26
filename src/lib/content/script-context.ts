// Ngữ cảnh của MỘT kịch bản vlog (chỉ đọc CSDL, không AI): hook gốc ở bước 2 (căn cứ, chủ đề, điểm), mục tiêu nội dung (chiến dịch /
// mục tiêu kênh đã gắn → chặng khách 5A) và chữ căn cứ đưa cho AI Nội dung. Dùng chung cho trang Kịch bản và writeDraft (vlog).
import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { campaignRepo } from "@/lib/campaigns/repository";
import { getKnowledgePages } from "@/lib/knowledge";
import { scoreHooks, topicIdsByName, hookTopicId } from "./priority";
import { hooksByContent, type HookBasis } from "./hooks";
import { cleanBeats, stageFromGoal, type PathStage } from "./vlog-script";

const json = <T>(s: string | null | undefined, d: T): T => {
  try {
    return s ? (JSON.parse(s) as T) : d;
  } catch {
    return d;
  }
};

export interface BasisLink extends HookBasis {
  href: string | null;
}

export interface ScriptContext {
  basis: BasisLink[];
  /** Dàn ý đã bỏ ghi chú nội bộ. */
  beats: string[];
  topicId: string | null;
  goalText: string;
  stage: PathStage;
  /** Chữ căn cứ đầy đủ cho AI (phát hiện + ứng dụng, trang Second Brain, insight). */
  basisText: string;
}

/** Mục tiêu nội dung từ chiến dịch đã gắn: mục tiêu kênh (kiểu thực thi, mục tiêu, chỉ số) hoặc mục tiêu chiến dịch. */
export function contentGoalText(contentId: string): string {
  const links = campaignRepo.linksForEntities("content", [contentId]).get(contentId) ?? [];
  for (const l of links) {
    const g = l.channelGoalId ? campaignRepo.goal(l.channelGoalId) : undefined;
    if (g) return `${g.executionType} ${g.objective} ${g.primaryMetric}`;
    const c = campaignRepo.get(l.campaignId);
    if (c) return `${c.objective} ${c.targetMetric ?? ""}`;
  }
  return "";
}

export function scriptContext(contentId: string): ScriptContext {
  const db = getDb();
  const item = db.select().from(schema.contentItems).where(eq(schema.contentItems.id, contentId)).get();
  const hookRow = db.select().from(schema.hookIdeas).where(eq(schema.hookIdeas.contentId, contentId)).get();
  const basis = json<HookBasis[]>(hookRow?.basis, []);
  if (item?.insightId && !basis.some((b) => b.kind === "insight" && b.id === item.insightId)) {
    const ins = db.select().from(schema.insights).where(eq(schema.insights.id, item.insightId)).get();
    if (ins) basis.push({ kind: "insight", id: ins.id, label: ins.title });
  }
  const topicId = hookRow ? hookTopicId({ researchId: hookRow.researchId, topic: hookRow.topic }, topicIdsByName()) : null;
  const href = (b: HookBasis) => (b.kind === "finding" && topicId ? `/insights/research/${topicId}#insights` : b.kind === "insight" ? "/insights/research?tab=insight" : b.kind === "knowledge" ? "/insights/knowledge" : null);

  const fIds = basis.filter((b) => b.kind === "finding").map((b) => b.id);
  const iIds = basis.filter((b) => b.kind === "insight").map((b) => b.id);
  const findings = fIds.length ? db.select().from(schema.researchFindings).where(inArray(schema.researchFindings.id, fIds)).all() : [];
  const insights = iIds.length ? db.select().from(schema.insights).where(inArray(schema.insights.id, iIds)).all() : [];
  const pages = getKnowledgePages(basis.filter((b) => b.kind === "knowledge").map((b) => b.id));
  const basisText = [
    ...findings.map((f) => `- [phát hiện nghiên cứu · ${f.classification}] ${f.statement}${f.application ? ` — ứng dụng: ${f.application}` : ""}`),
    ...pages.map((p) => `- [Second Brain${p.title.startsWith("[OWNER]") ? " · OWNER" : ""}] ${p.title}: ${p.body.slice(0, 800)}`),
    ...insights.map((i) => `- [insight khách] ${i.title}: ${i.detail}`),
  ].join("\n");

  const goalText = contentGoalText(contentId);
  return {
    basis: basis.map((b) => ({ ...b, href: href(b) })),
    beats: cleanBeats(json<string[]>(item?.outline, [])).beats,
    topicId,
    goalText,
    stage: stageFromGoal(goalText),
    basisText,
  };
}

/** Điểm hook (src/lib/content/scoring.ts) của kịch bản sinh từ hook — thay "★ 0" vô nghĩa ở danh sách. */
export function contentHookScores(contentIds: string[]): Map<string, { score: number; reasons: string[] }> {
  const out = new Map<string, { score: number; reasons: string[] }>();
  if (!contentIds.length) return out;
  const rows = hooksByContent(contentIds);
  if (!rows.length) return out;
  for (const h of scoreHooks(rows)) if (h.contentId) out.set(h.contentId, { score: h.score, reasons: h.reasons });
  return out;
}
