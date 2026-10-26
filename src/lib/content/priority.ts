// Gom dữ liệu cho chấm điểm ưu tiên (src/lib/content/scoring.ts) và luồng chủ đề → insight → hook → kịch bản (src/lib/content/flow.ts).
// Chỉ đọc CSDL, không gọi AI. Hook nối về chủ đề bằng hook_ideas.research_id; lô hook cũ không có id thì khớp theo tên chủ đề chuẩn hoá.
import { desc, inArray, notInArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { listKnowledge } from "@/lib/knowledge";
import { usableStatus } from "@/lib/knowledge/types";
import { recoverStaleResearch } from "@/lib/research";
import { hookStubs, listHooks, type HookRow } from "./hooks";
import { keyBigrams, normalizeTopic, scoreHook, scoreInsight, scoreTopic, syllableSet, topicIndex, topPicks, type Scored } from "./scoring";
import { nextStep, type NextStepKey, type TopicCounts } from "./flow";

const json = <T>(s: string, d: T): T => {
  try {
    return JSON.parse(s) as T;
  } catch {
    return d;
  }
};

// ---------- Kiến thức thương hiệu (ACTIVE / VERIFIED): cặp từ khoá đặc trưng, nhớ đệm theo lần đồng bộ ----------
let kbMemo: { key: string; set: Set<string> } | null = null;

function knowledgeBigrams(): Set<string> {
  const k = getDb().select({ n: sql<number>`count(*)`, at: sql<string>`max(${schema.knowledgeIndex.syncedAt})` }).from(schema.knowledgeIndex).get();
  const key = `${k?.n ?? 0}|${k?.at ?? ""}`;
  if (kbMemo?.key === key) return kbMemo.set;
  const pages = listKnowledge().filter((p) => usableStatus(p.status));
  const df = new Map<string, number>();
  for (const p of pages) for (const b of keyBigrams(`${p.title}\n${p.body}`)) df.set(b, (df.get(b) ?? 0) + 1);
  // Cặp từ có ở quá nửa số trang là từ chung ("khách hàng"…), không nói lên độ khớp
  const cap = pages.length >= 4 ? pages.length * 0.5 : Infinity;
  const set = new Set([...df].filter(([, n]) => n <= cap).map(([b]) => b));
  kbMemo = { key, set };
  return set;
}

const kbHits = (text: string, kb: Set<string>) => {
  let n = 0;
  for (const b of keyBigrams(text)) if (kb.has(b)) n++;
  return n;
};

// ---------- Insight ----------
type FindingRow = typeof schema.researchFindings.$inferSelect;
type SourceRow = typeof schema.researchSources.$inferSelect;

function scoreFinding(f: FindingRow, sources: Map<string, SourceRow>, kb: Set<string>, now: Date): Scored {
  const ids = json<string[]>(f.sourceIds, []);
  const s = sources.get(ids[0] ?? "");
  return scoreInsight({
    statement: f.statement,
    application: f.application,
    sourceType: s?.sourceType,
    url: s?.url,
    grade: s?.grade,
    date: s?.publishedAt ?? s?.accessedAt ?? null,
    sourceCount: new Set(ids).size,
    confidence: f.confidence,
    verifyOk: f.verifyOk,
    linkedKnowledge: json<string[]>(f.knowledgeIds, []).length > 0 || f.statement.startsWith("[OWNER]"),
    knowledgeHits: kbHits(`${f.statement} ${f.application}`, kb),
    now,
  });
}

/** Điểm từng insight của các chủ đề (id phát hiện → điểm). */
export function insightScores(taskIds: string[], now = new Date()): Map<string, Scored & { taskId: string; usable: boolean; pending: boolean }> {
  const out = new Map<string, Scored & { taskId: string; usable: boolean; pending: boolean }>();
  if (!taskIds.length) return out;
  const db = getDb();
  const findings = db.select().from(schema.researchFindings).where(inArray(schema.researchFindings.taskId, taskIds)).all();
  const sources = new Map(db.select().from(schema.researchSources).where(inArray(schema.researchSources.taskId, taskIds)).all().map((s) => [s.id, s]));
  const kb = knowledgeBigrams();
  for (const f of findings) out.set(f.id, { ...scoreFinding(f, sources, kb, now), taskId: f.taskId, usable: f.verifyOk && f.reviewStatus === "approved", pending: f.reviewStatus === "pending" });
  return out;
}

// ---------- Hook ----------
export interface ScoredHook extends HookRow {
  score: number;
  reasons: string[];
  top: boolean;
  topicId: string | null; // chủ đề (research_tasks.id) của hook — id lưu kèm, không thì khớp theo tên
}

export type TopicLookup = (name: string) => string | null;

/** Tên chủ đề → id (chủ đề mới nhất khi trùng tên; giữ dấu, gõ không dấu thì so không dấu). */
export function topicIdsByName(): TopicLookup {
  const rows = getDb().select({ id: schema.researchTasks.id, name: schema.researchTasks.question }).from(schema.researchTasks).orderBy(desc(schema.researchTasks.createdAt)).all();
  return topicIndex(rows);
}

export function hookTopicId(h: Pick<HookRow, "researchId" | "topic">, byName: TopicLookup): string | null {
  return h.researchId ?? (h.topic ? byName(h.topic) : null);
}

/** Chấm điểm danh sách hook; "Nên làm" = tối đa 3 hook chờ chọn điểm cao nhất, không vướng luật. */
export function scoreHooks(rows: HookRow[], opts: { byName?: TopicLookup; now?: Date } = {}): ScoredHook[] {
  const byName = opts.byName ?? topicIdsByName();
  const db = getDb();
  const findingIds = [...new Set(rows.flatMap((h) => h.basis.filter((b) => b.kind === "finding").map((b) => b.id)))];
  const taskIds = findingIds.length ? [...new Set(db.select({ t: schema.researchFindings.taskId }).from(schema.researchFindings).where(inArray(schema.researchFindings.id, findingIds)).all().map((r) => r.t))] : [];
  const ins = insightScores(taskIds, opts.now);
  // Bài đã làm (500 bài mới nhất): tách âm tiết MỘT lần, không lặp lại cho từng hook
  const made = db
    .select({ id: schema.contentItems.id, title: schema.contentItems.title, hook: schema.contentItems.hook })
    .from(schema.contentItems)
    .where(notInArray(schema.contentItems.status, ["dismissed", "proposed"]))
    .orderBy(desc(schema.contentItems.createdAt))
    .limit(500)
    .all()
    .map((c) => ({ id: c.id, sets: [c.title, c.hook].filter(Boolean).map(syllableSet) }));
  const scored = rows.map((h) => {
    const fs = h.basis.filter((b) => b.kind === "finding").map((b) => ins.get(b.id)?.score).filter((n): n is number => n !== undefined);
    const existingSets = made.filter((c) => c.id !== h.contentId).flatMap((c) => c.sets);
    const ownerBasis = h.basis.some((b) => b.kind === "knowledge" || b.label.startsWith("[OWNER]"));
    const s = scoreHook({ hook: h.hook, angle: h.angle, durationSec: h.durationSec, policyIssues: h.policyIssues, basisInsightScore: fs.length ? Math.max(...fs) : null, hasBasis: h.basis.length > 0, existingSets, ownerBasis });
    return { ...h, score: s.score, reasons: s.reasons, top: false, topicId: hookTopicId(h, byName) };
  });
  const top = topPicks(scored.filter((h) => h.status === "new" && h.policyIssues.length === 0));
  return scored.map((h) => ({ ...h, top: top.has(h.id) })).sort((a, b) => b.score - a.score);
}

/** Hook (chưa bỏ, trừ khi `all`) của một chủ đề, đã chấm điểm, điểm cao trước. */
export function topicHooks(topicId: string, opts: { all?: boolean } = {}): ScoredHook[] {
  const byName = topicIdsByName();
  // Truy theo research_id (không giới hạn 500 hook mới nhất) + lô cũ chưa có id khớp theo tên
  const rows = listHooks(2000, { topic: topicId }).filter((h) => hookTopicId(h, byName) === topicId && (opts.all || h.status !== "rejected"));
  return scoreHooks(rows, { byName });
}

// ---------- Bảng chủ đề ----------
export interface TopicBoardRow {
  id: string;
  topic: string;
  createdAt: string;
  counts: TopicCounts;
  step: NextStepKey;
  score: number;
  reasons: string[];
  top: boolean;
  dup: boolean; // trùng tên chuẩn hoá với chủ đề khác
  sources: Record<string, number>;
}

type HookStub = { status: string; contentId: string | null; topicId: string | null };

export function topicCounts(taskId: string, ins: Map<string, { taskId: string; usable: boolean; pending: boolean }>, hooks: HookStub[]): TopicCounts {
  const mine = [...ins.values()].filter((i) => i.taskId === taskId);
  const h = hooks.filter((x) => x.topicId === taskId && x.status !== "rejected");
  return {
    insights: mine.length,
    usable: mine.filter((i) => i.usable).length,
    pending: mine.filter((i) => i.pending).length,
    hooks: h.length,
    hooksNew: h.filter((x) => x.status === "new").length,
    scripts: h.filter((x) => x.status === "picked" && x.contentId).length,
  };
}

export function topicBoard(now = new Date()): TopicBoardRow[] {
  recoverStaleResearch();
  const db = getDb();
  const tasks = db.select().from(schema.researchTasks).orderBy(desc(schema.researchTasks.createdAt)).all();
  if (!tasks.length) return [];
  const ids = tasks.map((t) => t.id);
  const ins = insightScores(ids, now);
  const byName = topicIdsByName();
  // Đếm: mọi hook (bản gọn, không giới hạn). Chấm điểm: chỉ hook chờ chọn (điểm hook tốt nhất của chủ đề)
  const stubs = hookStubs().map((h) => ({ ...h, topicId: hookTopicId(h, byName) }));
  const hooks = scoreHooks(listHooks(1000, { status: "new" }), { byName, now });
  const sourceRows = db.select({ id: schema.researchSources.id, taskId: schema.researchSources.taskId, publisher: schema.researchSources.publisher, sourceType: schema.researchSources.sourceType, accessedAt: schema.researchSources.accessedAt }).from(schema.researchSources).where(inArray(schema.researchSources.taskId, ids)).all();
  const srcById = new Map(sourceRows.map((s) => [s.id, s]));
  const findings = db.select({ id: schema.researchFindings.id, taskId: schema.researchFindings.taskId, sourceIds: schema.researchFindings.sourceIds }).from(schema.researchFindings).where(inArray(schema.researchFindings.taskId, ids)).all();
  const names = new Map<string, number>();
  for (const t of tasks) names.set(normalizeTopic(t.question), (names.get(normalizeTopic(t.question)) ?? 0) + 1);

  const rows = tasks.map((t) => {
    const counts = topicCounts(t.id, ins, stubs);
    const mineIns = [...ins.entries()].filter(([, v]) => v.taskId === t.id).map(([, v]) => v.score);
    const mineHooks = hooks.filter((h) => h.topicId === t.id && h.status === "new").map((h) => h.score);
    const last = [t.createdAt, ...sourceRows.filter((s) => s.taskId === t.id).map((s) => s.accessedAt)].sort().at(-1) ?? t.createdAt;
    const s = scoreTopic({ bestInsight: mineIns.length ? Math.max(...mineIns) : null, bestHook: mineHooks.length ? Math.max(...mineHooks) : null, usableInsights: counts.usable, pendingInsights: counts.pending, lastActivity: last, scripts: counts.scripts, hooksNew: counts.hooksNew, now });
    const by: Record<string, number> = {};
    for (const f of findings.filter((x) => x.taskId === t.id)) {
      const src = srcById.get(json<string[]>(f.sourceIds, [])[0] ?? "");
      const label = src ? (src.sourceType === "social" ? src.publisher : "Web") : "Khác";
      by[label] = (by[label] ?? 0) + 1;
    }
    return { id: t.id, topic: t.question.replace(/^Chủ đề: /, ""), createdAt: t.createdAt, counts, step: nextStep(counts), score: s.score, reasons: s.reasons, top: false, dup: (names.get(normalizeTopic(t.question)) ?? 0) > 1, sources: by };
  });
  const top = topPicks(rows.filter((r) => r.step !== "view"), 3, 50);
  return rows.map((r) => ({ ...r, top: top.has(r.id) })).sort((a, b) => b.score - a.score || b.createdAt.localeCompare(a.createdAt));
}

/** Kịch bản sinh từ hook → chủ đề gốc (để trang Kịch bản trỏ ngược về bước 1). */
export function hookOrigins(contentIds: string[]): Map<string, { topicId: string | null; topic: string }> {
  const out = new Map<string, { topicId: string | null; topic: string }>();
  if (!contentIds.length) return out;
  const byName = topicIdsByName();
  const rows = getDb().select({ contentId: schema.hookIdeas.contentId, researchId: schema.hookIdeas.researchId, topic: schema.hookIdeas.topic }).from(schema.hookIdeas).where(inArray(schema.hookIdeas.contentId, contentIds)).all();
  for (const r of rows) if (r.contentId) out.set(r.contentId, { topicId: hookTopicId(r, byName), topic: r.topic });
  return out;
}
