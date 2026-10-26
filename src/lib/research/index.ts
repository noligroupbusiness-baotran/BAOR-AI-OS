// Nghiên cứu nguồn ngoài + Knowledge Fusion → Content Brief (chỉ thị mục IV, V).
// Một nhiệm vụ nghiên cứu luôn gắn mục tiêu sử dụng. Kết quả (nguồn, phát hiện, brief) đi qua luật kiểm ở src/lib/knowledge/types.ts
// dù đến từ AI trong hệ thống hay được nhập từ phiên Claude bên ngoài. Nguồn ngoài không bao giờ trở thành quan điểm OWNER.
import { desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getDb, schema } from "@/db";
import { aiConfigured, gate } from "@/lib/ai";
import { getSetting, setSetting } from "@/lib/admin";
import { recordAiCall, WEB_SEARCH_MODEL_PREFIX } from "@/lib/router";
import { getKnowledgePages, searchKnowledge } from "@/lib/knowledge";
import { recordContentVersion } from "@/lib/content/versions";
import { buildShootingScript, maxSecondsFromGoal, scriptQa, type ScriptQa } from "@/lib/content/shooting-script";
import { CLASSIFICATIONS, PURPOSE_KINDS, SOURCE_TYPES, verifyBrief, verifyFinding, type BriefPoint, type BriefQa, type Classification, type KnowledgePage, type PurposeKind } from "@/lib/knowledge/types";

const newId = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const nowIso = () => new Date().toISOString();
const arr = (s: string): string[] => {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
};

// ---------------------------------------------------------------- định dạng kết quả (AI và nhập ngoài dùng chung)

const SourceSchema = z.object({
  url: z.string(),
  title: z.string(),
  author: z.string().describe("Tác giả hoặc tổ chức; để trống nếu trang không ghi"),
  publisher: z.string(),
  publishedAt: z.string().nullable().describe("Ngày công bố YYYY-MM-DD nếu trang ghi rõ; null nếu không ghi. Không đoán."),
  sourceType: z.enum(SOURCE_TYPES),
  grade: z.enum(["A", "B", "C", "D"]).describe("A chính thức/có thẩm quyền, B đáng tin đã đối chiếu, C tham khảo, D chưa kiểm chứng"),
  excerpt: z.string().describe("Tóm ý ngắn, tối đa 300 ký tự, không chép nguyên văn dài"),
  limits: z.string().describe("Giới hạn của nguồn: mẫu nhỏ, bối cảnh khác, quảng cáo, cũ…"),
});

const FindingSchema = z.object({
  statement: z.string(),
  classification: z.enum(CLASSIFICATIONS),
  sourceUrls: z.array(z.string()),
  knowledgeIds: z.array(z.string()).describe("id trang Second Brain đã được cung cấp; không bịa id"),
  counterView: z.string(),
  limits: z.string(),
  application: z.string().describe("Góc ứng dụng cho content của OWNER"),
  contentTopics: z.array(z.string()),
  confidence: z.enum(["high", "medium", "low"]),
});

const BriefSchema = z.object({
  topic: z.string(),
  goal: z.string(),
  audience: z.string(),
  keyMessage: z.string(),
  angle: z.string(),
  points: z.array(
    z.object({
      text: z.string(),
      classification: z.enum(CLASSIFICATIONS),
      findingRefs: z.array(z.number().int()).describe("Chỉ số (bắt đầu từ 0) của phát hiện hỗ trợ"),
      knowledgeIds: z.array(z.string()),
      sourceUrls: z.array(z.string()),
    }),
  ),
  gaps: z.array(z.string()).describe("Thông tin còn thiếu, cần OWNER bổ sung hoặc nghiên cứu thêm"),
});

export const ResearchResultSchema = z.object({
  summary: z.string(),
  sources: z.array(SourceSchema),
  findings: z.array(FindingSchema),
  brief: BriefSchema.optional(),
});
export type ResearchResult = z.infer<typeof ResearchResultSchema>;

// ---------------------------------------------------------------- nhiệm vụ

export function createResearchTask(input: { question: string; purposeKind: PurposeKind; purpose: string; contentId?: string | null; campaignId?: string | null; by: string }): string {
  const q = input.question.trim();
  if (q.length < 8) throw new Error("Câu hỏi nghiên cứu quá ngắn");
  if (!PURPOSE_KINDS.includes(input.purposeKind)) throw new Error("Mục tiêu sử dụng không hợp lệ");
  if (!input.purpose.trim()) throw new Error("Cần ghi mục tiêu sử dụng: nghiên cứu này phục vụ việc gì");
  const id = newId("rs");
  getDb()
    .insert(schema.researchTasks)
    .values({ id, question: q.slice(0, 500), purposeKind: input.purposeKind, purpose: input.purpose.trim().slice(0, 500), contentId: input.contentId ?? null, campaignId: input.campaignId ?? null, status: "draft", runner: "ai", createdBy: input.by, createdAt: nowIso() })
    .run();
  return id;
}

// ---------------------------------------------------------------- nhiệm vụ đang chạy: mốc bắt đầu + thu hồi khi kẹt

/** Quá thời gian này mà vẫn "running" (máy chủ khởi động lại / tiến trình chết giữa chừng) → coi là lỗi, cho chạy lại. */
export const RESEARCH_STALE_MS = Number(process.env.BAOR_RESEARCH_STALE_MIN ?? 20) * 60_000;
/** Phí công cụ web_search (≈ 10 USD / 1.000 lượt) — ghi vào sổ ai_calls để tính trần ngày / tháng / vị trí. */
export const VND_PER_SEARCH = 260;
const startedKey = (id: string) => `research.startedAt.${id}`;
// Nhiệm vụ đang chạy TRONG tiến trình này (không bao giờ bị coi là kẹt khi còn ở đây)
const inFlight = ((globalThis as unknown as { __baorResearchRunning?: Set<string> }).__baorResearchRunning ??= new Set());
export const STALE_RESEARCH_ERROR = "Lần chạy trước bị gián đoạn (máy chủ khởi động lại hoặc quá thời gian) — bấm chạy lại.";

/** "running" mà không còn chạy trong tiến trình này và không có mốc bắt đầu (bản ghi cũ) / mốc quá RESEARCH_STALE_MS. */
function isStaleRunning(t: { id: string; status: string }, now = Date.now()): boolean {
  if (t.status !== "running" || inFlight.has(t.id)) return false;
  const at = Date.parse(getSetting(startedKey(t.id)) ?? "");
  return !Number.isFinite(at) || now - at > RESEARCH_STALE_MS;
}

/** Đánh dấu lỗi các nhiệm vụ kẹt "running" (gọi khi đọc danh sách / mở nhiệm vụ / trước khi chạy). Trả số nhiệm vụ đã thu hồi. */
export function recoverStaleResearch(now = Date.now()): number {
  const db = getDb();
  let n = 0;
  for (const t of db.select({ id: schema.researchTasks.id, status: schema.researchTasks.status }).from(schema.researchTasks).where(eq(schema.researchTasks.status, "running")).all()) {
    if (!isStaleRunning(t, now)) continue;
    db.update(schema.researchTasks).set({ status: "error", error: STALE_RESEARCH_ERROR }).where(eq(schema.researchTasks.id, t.id)).run();
    setSetting(startedKey(t.id), "");
    n++;
  }
  return n;
}

export function listResearchTasks() {
  recoverStaleResearch();
  const db = getDb();
  const tasks = db.select().from(schema.researchTasks).orderBy(desc(schema.researchTasks.createdAt)).all();
  const ids = tasks.map((t) => t.id);
  const count = (rows: { taskId: string | null }[]) => rows.reduce<Record<string, number>>((m, r) => ((m[r.taskId ?? ""] = (m[r.taskId ?? ""] ?? 0) + 1), m), {});
  const srcN = ids.length ? count(db.select({ taskId: schema.researchSources.taskId }).from(schema.researchSources).where(inArray(schema.researchSources.taskId, ids)).all()) : {};
  const fN = ids.length ? count(db.select({ taskId: schema.researchFindings.taskId }).from(schema.researchFindings).where(inArray(schema.researchFindings.taskId, ids)).all()) : {};
  const briefs = ids.length ? db.select({ id: schema.contentBriefs.id, taskId: schema.contentBriefs.taskId }).from(schema.contentBriefs).where(inArray(schema.contentBriefs.taskId, ids)).all() : [];
  return tasks.map((t) => ({ ...t, sourceCount: srcN[t.id] ?? 0, findingCount: fN[t.id] ?? 0, briefId: briefs.find((b) => b.taskId === t.id)?.id ?? null }));
}

export function getResearchTask(id: string) {
  recoverStaleResearch();
  const db = getDb();
  const task = db.select().from(schema.researchTasks).where(eq(schema.researchTasks.id, id)).get();
  if (!task) return null;
  const sources = db.select().from(schema.researchSources).where(eq(schema.researchSources.taskId, id)).all();
  const findings = db
    .select()
    .from(schema.researchFindings)
    .where(eq(schema.researchFindings.taskId, id))
    .all()
    .map((f) => ({ ...f, sourceIds: arr(f.sourceIds), knowledgeIds: arr(f.knowledgeIds), contentTopics: arr(f.contentTopics), verifyNotes: arr(f.verifyNotes), classification: f.classification as Classification }));
  const pages = getKnowledgePages(findings.flatMap((f) => f.knowledgeIds));
  const brief = db.select().from(schema.contentBriefs).where(eq(schema.contentBriefs.taskId, id)).get();
  return { task, sources, findings, pages, brief: brief ? parseBrief(brief) : null };
}

function parseBrief(b: typeof schema.contentBriefs.$inferSelect) {
  let points: BriefPoint[] = [];
  let qa: BriefQa = { ok: false, issues: [] };
  try {
    points = JSON.parse(b.points) as BriefPoint[];
  } catch {}
  try {
    qa = JSON.parse(b.qa) as BriefQa;
  } catch {}
  return { ...b, points, gaps: arr(b.gaps), qa };
}

export function getBrief(id: string) {
  const b = getDb().select().from(schema.contentBriefs).where(eq(schema.contentBriefs.id, id)).get();
  return b ? parseBrief(b) : null;
}

// ---------------------------------------------------------------- lưu kết quả (dùng chung)

const isHttp = (u: string) => /^https?:\/\/[^\s]+$/i.test(u);

/**
 * Lưu nguồn, phát hiện (đã kiểm luật) và brief (nếu có) cho một nhiệm vụ. Ghi đè kết quả cũ của nhiệm vụ.
 * `allowedUrls`: khi chạy bằng AI, chỉ nhận URL thật sự xuất hiện trong kết quả tìm kiếm (chặn URL bịa).
 */
/** `append`: cộng dồn vào chủ đề (nhiều nguồn 2.1–2.4 cho cùng một chủ đề) — không xoá nguồn / phát hiện cũ, dùng lại nguồn cùng URL. */
export function saveResearchResult(taskId: string, data: ResearchResult, opts: { runner: "ai" | "import"; allowedUrls?: Set<string>; model?: string; searchCount?: number; costVnd?: number; by: string; append?: boolean }) {
  const parsed = ResearchResultSchema.parse(data);
  const db = getDb();
  const task = db.select().from(schema.researchTasks).where(eq(schema.researchTasks.id, taskId)).get();
  if (!task) throw new Error("Không tìm thấy nhiệm vụ nghiên cứu");
  const dropped: string[] = [];
  const now = nowIso();

  // Nguồn (cộng dồn: nguồn cùng URL VÀ cùng loại nguồn đã có trong chủ đề thì dùng lại — khác loại thì tạo nguồn mới để nhãn đúng)
  const urlToId = new Map<string, string>();
  const existing = opts.append ? db.select().from(schema.researchSources).where(eq(schema.researchSources.taskId, taskId)).all() : [];
  const reuse = new Map(existing.map((e) => [`${e.url}|${e.publisher}`, e.id]));
  for (const s of parsed.sources) {
    const hit = reuse.get(`${s.url.trim()}|${s.publisher.slice(0, 200)}`);
    if (hit) urlToId.set(s.url.trim(), hit);
  }
  const sourceRows: (typeof schema.researchSources.$inferInsert & { id: string; grade: string })[] = [];
  for (const s of parsed.sources) {
    const url = s.url.trim();
    if (!isHttp(url)) {
      dropped.push(`URL không hợp lệ: ${url.slice(0, 80)}`);
      continue;
    }
    if (opts.allowedUrls && !opts.allowedUrls.has(url)) {
      dropped.push(`URL không có trong kết quả tìm kiếm: ${url.slice(0, 80)}`);
      continue;
    }
    if (urlToId.has(url)) continue;
    const id = newId("src");
    urlToId.set(url, id);
    sourceRows.push({ id, taskId, url, title: s.title.slice(0, 300), author: s.author.slice(0, 200), publisher: s.publisher.slice(0, 200), publishedAt: s.publishedAt && /^\d{4}(-\d{2}(-\d{2})?)?$/.test(s.publishedAt) ? s.publishedAt : null, sourceType: s.sourceType, grade: s.grade, excerpt: s.excerpt.slice(0, 300), limits: s.limits.slice(0, 500), accessedAt: now });
  }
  const sourceRefs = [...existing.map((s) => ({ id: s.id, grade: s.grade })), ...sourceRows.map((s) => ({ id: s.id, grade: s.grade }))];

  // Phát hiện
  const allKnowledgeIds = [...parsed.findings.flatMap((f) => f.knowledgeIds), ...(parsed.brief?.points.flatMap((p) => p.knowledgeIds) ?? [])];
  const pages = getKnowledgePages(allKnowledgeIds);
  const pageIds = new Set(pages.map((p) => p.id));
  const normK = (ids: string[]) => ids.map((k) => k.replace(/-/g, "").toLowerCase()).filter((k) => pageIds.has(k));
  // Cộng dồn: phát hiện trùng câu chữ đã có trong chủ đề thì bỏ (dán lại cùng bình luận không nhân đôi insight)
  const had = new Set(opts.append ? db.select({ statement: schema.researchFindings.statement }).from(schema.researchFindings).where(eq(schema.researchFindings.taskId, taskId)).all().map((f) => f.statement) : []);
  const findingRows = parsed.findings.filter((f) => !had.has(f.statement.slice(0, 1000))).map((f) => {
    const sourceIds = f.sourceUrls.map((u) => urlToId.get(u.trim())).filter((x): x is string => !!x);
    const knowledgeIds = normK(f.knowledgeIds);
    const v = verifyFinding({ statement: f.statement, classification: f.classification, sourceIds, knowledgeIds }, sourceRefs, pages);
    const lost = f.sourceUrls.length - sourceIds.length + (f.knowledgeIds.length - knowledgeIds.length);
    return {
      id: newId("fd"),
      taskId,
      statement: f.statement.slice(0, 1000),
      classification: f.classification,
      sourceIds: JSON.stringify(sourceIds),
      knowledgeIds: JSON.stringify(knowledgeIds),
      counterView: f.counterView.slice(0, 1000),
      limits: f.limits.slice(0, 1000),
      application: f.application.slice(0, 1000),
      contentTopics: JSON.stringify(f.contentTopics.slice(0, 8)),
      confidence: f.confidence,
      verifyOk: v.ok,
      verifyNotes: JSON.stringify(lost > 0 ? [...v.notes, `Bỏ ${lost} tham chiếu không xác minh được`] : v.notes),
    };
  });

  db.transaction((tx) => {
    if (!opts.append) {
      tx.delete(schema.researchSources).where(eq(schema.researchSources.taskId, taskId)).run();
      tx.delete(schema.researchFindings).where(eq(schema.researchFindings.taskId, taskId)).run();
    }
    if (sourceRows.length) tx.insert(schema.researchSources).values(sourceRows).run();
    if (findingRows.length) tx.insert(schema.researchFindings).values(findingRows).run();
    const prev = opts.append ? task : null;
    tx.update(schema.researchTasks)
      .set({
        status: "done",
        runner: opts.runner,
        model: opts.model ?? prev?.model ?? null,
        searchCount: (opts.searchCount ?? 0) + (prev?.searchCount ?? 0),
        costVnd: (opts.costVnd ?? 0) + (prev?.costVnd ?? 0),
        summary: (prev?.summary ? `${prev.summary}\n\n${parsed.summary}` : parsed.summary).slice(-4000),
        error: dropped.length ? `Đã bỏ: ${dropped.slice(0, 5).join("; ")}` : null,
        finishedAt: now,
      })
      .where(eq(schema.researchTasks.id, taskId))
      .run();
  });

  let briefId: string | null = null;
  if (parsed.brief) {
    const b = parsed.brief;
    const points: BriefPoint[] = b.points.map((p) => ({
      text: p.text,
      classification: p.classification,
      findingIds: p.findingRefs.map((i) => findingRows[i]?.id).filter((x): x is string => !!x),
      knowledgeIds: normK(p.knowledgeIds),
      sourceIds: p.sourceUrls.map((u) => urlToId.get(u.trim())).filter((x): x is string => !!x),
    }));
    briefId = saveBrief({ taskId, topic: b.topic, goal: b.goal, audience: b.audience, keyMessage: b.keyMessage, angle: b.angle, points, gaps: b.gaps, by: opts.by }, sourceRefs, pages);
  }
  return { sources: sourceRows.length, findings: findingRows.length, verified: findingRows.filter((f) => f.verifyOk).length, dropped, briefId };
}

export function saveBrief(b: { taskId: string | null; topic: string; goal: string; audience: string; keyMessage: string; angle: string; points: BriefPoint[]; gaps: string[]; by: string }, sources: { id: string; grade: string }[], pages: KnowledgePage[]): string {
  const qa = verifyBrief(b.points, sources, pages, b.keyMessage);
  const db = getDb();
  const existing = b.taskId ? db.select({ id: schema.contentBriefs.id }).from(schema.contentBriefs).where(eq(schema.contentBriefs.taskId, b.taskId)).get() : undefined;
  const row = { topic: b.topic.slice(0, 300), goal: b.goal.slice(0, 500), audience: b.audience.slice(0, 500), keyMessage: b.keyMessage.slice(0, 1000), angle: b.angle.slice(0, 1000), points: JSON.stringify(b.points), gaps: JSON.stringify(b.gaps), qa: JSON.stringify(qa), status: qa.ok ? "ready" : "draft", updatedAt: nowIso() };
  if (existing) {
    db.update(schema.contentBriefs).set(row).where(eq(schema.contentBriefs.id, existing.id)).run();
    return existing.id;
  }
  const id = newId("br");
  db.insert(schema.contentBriefs).values({ id, taskId: b.taskId, contentId: null, createdBy: b.by, createdAt: nowIso(), ...row }).run();
  return id;
}

/** Brief không dùng AI: gom phát hiện đã đạt kiểm theo thứ tự quy trình/quyết định → sự thật → quan điểm OWNER → quan sát. */
export function buildBriefDeterministic(taskId: string, meta: { topic: string; goal: string; audience: string }, by: string): string {
  const r = getResearchTask(taskId);
  if (!r) throw new Error("Không tìm thấy nhiệm vụ nghiên cứu");
  const order: Classification[] = ["BUSINESS_DECISION", "PROCEDURE", "FACT", "OWNER_VIEW", "OBSERVATION", "HYPOTHESIS"];
  const ok = r.findings.filter((f) => f.verifyOk).sort((a, b) => order.indexOf(a.classification) - order.indexOf(b.classification));
  const points: BriefPoint[] = ok.map((f) => ({ text: f.statement, classification: f.classification, findingIds: [f.id], knowledgeIds: f.knowledgeIds, sourceIds: f.sourceIds }));
  const gaps = r.findings.filter((f) => !f.verifyOk).map((f) => `Chưa đạt kiểm: ${f.statement.slice(0, 120)} — ${f.verifyNotes.join("; ")}`);
  return saveBrief({ taskId, ...meta, keyMessage: "", angle: "", points, gaps, by }, r.sources.map((s) => ({ id: s.id, grade: s.grade })), r.pages);
}

// ---------------------------------------------------------------- chạy bằng AI (Claude + web search)

const RESEARCH_SYSTEM = `Bạn là nhà nghiên cứu cho thương hiệu cá nhân Trần Thanh Bảo (đào tạo, bán hàng, tư duy kinh doanh, edit video).
Nhiệm vụ: trả lời câu hỏi nghiên cứu bằng nguồn bên ngoài đáng tin, đối chiếu với tri thức nội bộ (Second Brain) được cung cấp.
Quy tắc:
- Ưu tiên nguồn gốc: tổ chức chính thức, nghiên cứu, sách/giáo trình, chuyên gia có tên. Ghi rõ khi nguồn là blog hay quảng cáo.
- Ghi ngày công bố chỉ khi trang ghi rõ. Không đoán tác giả, ngày, số liệu.
- Không chép nguyên văn dài; tóm ý bằng lời của bạn.
- Tách rõ sự thật có bằng chứng, giả thuyết, quan sát. Nêu quan điểm trái chiều và giới hạn của bằng chứng.
- Không bao giờ gán kiến thức bên ngoài thành kinh nghiệm hay quan điểm của Trần Thanh Bảo. Quan điểm OWNER chỉ đến từ trang Second Brain có nhãn [OWNER].
- Tương quan không phải nhân quả.`;

function knowledgeContext(question: string) {
  const hits = searchKnowledge(question, { limit: 8 });
  const text = hits.length
    ? hits.map((h) => `[id ${h.page.id}] ${h.page.title} — ${h.page.section} · ${h.page.area} · ${h.page.status} · nhãn ${h.page.labels.join(" ") || "(không)"}\n${h.page.body.slice(0, 1500)}`).join("\n\n")
    : "(Second Brain chưa có trang liên quan)";
  return { hits, text };
}

type RunOut = { usage: { input_tokens: number; output_tokens: number }; text: string; urls: Map<string, { title: string; pageAge: string | null }>; searches: number };

export async function runResearchWithAi(taskId: string, by: string, opts: { append?: boolean } = {}): Promise<{ ok: true; summary: string } | { ok: false; error: string }> {
  if (!aiConfigured()) return { ok: false, error: "Chưa có khóa Claude API. Vào Cài đặt › Kết nối › Claude API để nhập khóa." };
  const db = getDb();
  recoverStaleResearch();
  const task = db.select().from(schema.researchTasks).where(eq(schema.researchTasks.id, taskId)).get();
  if (!task) return { ok: false, error: "Không tìm thấy nhiệm vụ" };
  if (task.status === "running") return { ok: false, error: "Nhiệm vụ đang chạy" };
  db.update(schema.researchTasks).set({ status: "running", error: null }).where(eq(schema.researchTasks.id, taskId)).run();
  setSetting(startedKey(taskId), nowIso());
  inFlight.add(taskId);
  // try/finally: lỗi bất ngờ (ném ra ngoài cổng AI, lưu kết quả lỗi…) không để nhiệm vụ kẹt "running"
  try {
    return await runResearchSteps(taskId, task, by, opts);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    db.update(schema.researchTasks).set({ status: "error", error: msg.slice(0, 500) }).where(eq(schema.researchTasks.id, taskId)).run();
    return { ok: false, error: msg };
  } finally {
    inFlight.delete(taskId);
    setSetting(startedKey(taskId), "");
    // Đường nào cũng phải rời "running": thành công → saveResearchResult đặt "done"; các nhánh lỗi đặt "error"
    const now = db.select({ status: schema.researchTasks.status }).from(schema.researchTasks).where(eq(schema.researchTasks.id, taskId)).get();
    if (now?.status === "running") db.update(schema.researchTasks).set({ status: "error", error: "Lần chạy kết thúc mà không lưu được kết quả — bấm chạy lại." }).where(eq(schema.researchTasks.id, taskId)).run();
  }
}

async function runResearchSteps(taskId: string, task: typeof schema.researchTasks.$inferSelect, by: string, opts: { append?: boolean }): Promise<{ ok: true; summary: string } | { ok: false; error: string }> {
  const db = getDb();
  const kc = knowledgeContext(task.question);
  const maxSearches = 8;

  // Bước 1: tìm và đọc nguồn ngoài (công cụ web_search chạy phía Anthropic — ghim Claude dù vị trí chọn hãng khác)
  const step1 = await gate<RunOut>("research", `Nghiên cứu: ${task.question.slice(0, 80)}`, async (client, model) => {
    const messages: Anthropic.Beta.BetaMessageParam[] = [
      { role: "user", content: `Câu hỏi nghiên cứu: ${task.question}\nMục tiêu sử dụng: ${task.purpose}\n\nTri thức nội bộ liên quan (Second Brain):\n${kc.text}\n\nHãy tìm nguồn ngoài, rồi viết báo cáo: kết luận, các quan điểm khác nhau, giới hạn bằng chứng, độ tin cậy, góc ứng dụng và chủ đề content đề xuất. Mỗi ý dẫn nguồn.` },
    ];
    const usage = { input_tokens: 0, output_tokens: 0 };
    const urls = new Map<string, { title: string; pageAge: string | null }>();
    let text = "";
    let searches = 0;
    for (let turn = 0; turn < 4; turn++) {
      const res = await client.beta.messages.create({
        model,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: RESEARCH_SYSTEM,
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: maxSearches }],
        messages,
      });
      usage.input_tokens += res.usage.input_tokens;
      usage.output_tokens += res.usage.output_tokens;
      searches += res.usage.server_tool_use?.web_search_requests ?? 0;
      for (const b of res.content) {
        if (b.type === "web_search_tool_result" && Array.isArray(b.content)) for (const r of b.content) urls.set(r.url, { title: r.title, pageAge: r.page_age ?? null });
        if (b.type === "text") text += b.text + "\n";
      }
      if (res.stop_reason === "refusal") throw new Error("Mô hình từ chối nhiệm vụ nghiên cứu này.");
      if (res.stop_reason !== "pause_turn") break;
      messages.push({ role: "assistant", content: res.content });
    }
    return { usage, text, urls, searches };
  }, { provider: "anthropic" }); // web_search chỉ có ở Claude: vị trí chọn ChatGPT / Grok thì bước này vẫn chạy Claude
  if (!step1.ok) {
    db.update(schema.researchTasks).set({ status: "error", error: step1.error }).where(eq(schema.researchTasks.id, taskId)).run();
    return step1;
  }
  const r1 = step1.res;
  // Phí web_search đã phát sinh ở bước 1 (kể cả khi bước sau lỗi) → ghi sổ ai_calls để tính vào trần ngày / tháng / vị trí
  const searchCostVnd = r1.searches * VND_PER_SEARCH;
  if (r1.searches > 0) recordAiCall({ purpose: "research", role: "research", model: `${WEB_SEARCH_MODEL_PREFIX} × ${r1.searches}`, inputTokens: 0, outputTokens: 0, ok: true, costVnd: searchCostVnd });
  if (r1.urls.size === 0) {
    db.update(schema.researchTasks).set({ status: "error", error: "Không tìm được nguồn ngoài nào." }).where(eq(schema.researchTasks.id, taskId)).run();
    return { ok: false, error: "Không tìm được nguồn ngoài nào." };
  }

  // Bước 2: chuyển báo cáo thành hồ sơ có cấu trúc (không tìm thêm, chỉ dùng URL đã tìm được)
  const urlList = [...r1.urls.entries()].map(([u, v]) => `- ${u} | ${v.title}${v.pageAge ? ` | ${v.pageAge}` : ""}`).join("\n");
  const step2 = await gate("research", `Lập hồ sơ nguồn: ${task.question.slice(0, 80)}`, (client, model) =>
    client.messages.parse({
      model,
      max_tokens: 16000,
      system: `${RESEARCH_SYSTEM}\nChỉ dùng URL trong danh sách được cung cấp. knowledgeIds chỉ lấy từ id trang Second Brain đã cho. Không thêm brief nếu không đủ căn cứ.`,
      messages: [
        { role: "user", content: `Câu hỏi: ${task.question}\nMục tiêu: ${task.purpose}\n\nURL đã tìm được:\n${urlList}\n\nTrang Second Brain:\n${kc.hits.map((h) => `- id ${h.page.id}: ${h.page.title} (${h.page.status}, ${h.page.labels.join(" ")})`).join("\n") || "(không có)"}\n\nBáo cáo nghiên cứu:\n${r1.text.slice(0, 60000)}\n\nHãy lập hồ sơ: summary, sources (chỉ nguồn thật sự dùng), findings (mỗi phát hiện một phân loại), và brief cho một kịch bản video ngắn nếu đủ căn cứ.` },
      ],
      output_config: { format: zodOutputFormat(ResearchResultSchema) },
    }),
  );
  if (!step2.ok) {
    db.update(schema.researchTasks).set({ status: "error", error: step2.error }).where(eq(schema.researchTasks.id, taskId)).run();
    return step2;
  }
  const out = step2.res.parsed_output;
  if (!out) {
    db.update(schema.researchTasks).set({ status: "error", error: "AI không trả về hồ sơ hợp lệ." }).where(eq(schema.researchTasks.id, taskId)).run();
    return { ok: false, error: "AI không trả về hồ sơ hợp lệ." };
  }
  // Chi phí = đúng số đã ghi sổ ai_calls: hai bước qua cổng AI (giá theo mô hình hãng THỰC SỰ chạy — bước 1 bật fallbacks "default"
  // nên có thể khác mô hình yêu cầu) + phí web_search ghi riêng ở trên.
  const cost = step1.costVnd + step2.costVnd + searchCostVnd;
  saveResearchResult(taskId, out, { runner: "ai", allowedUrls: new Set(r1.urls.keys()), model: step1.servedModel === step2.servedModel ? step2.servedModel : `${step1.servedModel} + ${step2.servedModel}`, searchCount: r1.searches, costVnd: cost, by, append: opts.append });
  return { ok: true, summary: out.summary };
}

// ---------------------------------------------------------------- brief → nội dung

/** Nguồn và trang Second Brain mà brief dẫn tới, dùng để dựng và kiểm kịch bản quay. */
function briefMaterial(b: { taskId: string | null; points: BriefPoint[] }) {
  const sources = b.taskId ? getDb().select().from(schema.researchSources).where(eq(schema.researchSources.taskId, b.taskId)).all() : [];
  const pages = getKnowledgePages([...new Set(b.points.flatMap((p) => p.knowledgeIds))]);
  return { sources, pages };
}

/** CP02: brief đạt kiểm → nội dung định dạng kịch bản, bản nháp là kịch bản quay theo cảnh có căn cứ. */
export function createContentFromBrief(briefId: string, by: string): string {
  const b = getBrief(briefId);
  if (!b) throw new Error("Không tìm thấy brief");
  if (b.contentId) return b.contentId;
  if (!b.qa.ok) throw new Error(`Brief chưa đạt kiểm: ${b.qa.issues.join("; ") || "chưa kiểm"}`);
  const { sources, pages } = briefMaterial(b);
  const draft = buildShootingScript(b, sources, pages);
  const id = newId("ct");
  const db = getDb();
  db.transaction((tx) => {
    tx.insert(schema.contentItems)
      .values({ id, title: b.topic.slice(0, 200), format: "script", status: "in_progress", insightId: null, pillar: "Giáo dục", hook: b.keyMessage.slice(0, 300), outline: JSON.stringify(b.points.map((p) => p.text.slice(0, 200))), draft, assignee: "human", createdAt: nowIso(), score: null, source: "manual" })
      .run();
    tx.update(schema.contentBriefs).set({ contentId: id, status: "used", updatedAt: nowIso() }).where(eq(schema.contentBriefs.id, briefId)).run();
    if (b.taskId) tx.update(schema.researchTasks).set({ contentId: id }).where(eq(schema.researchTasks.id, b.taskId)).run();
  });
  recordContentVersion(id, { hook: b.keyMessage.slice(0, 300), draft, reason: "brief", by });
  return id;
}

/** Kiểm kịch bản quay của nội dung sinh từ brief. Nội dung không có brief: null (giữ luồng cũ). */
export function briefScriptQa(contentId: string, draft: string): ScriptQa | null {
  const b = briefForContent(contentId);
  if (!b) return null;
  const { sources, pages } = briefMaterial(b);
  return scriptQa(draft, { sourceExcerpts: sources.map((s) => s.excerpt), maxSeconds: maxSecondsFromGoal(b.goal), knownSources: sources.map((s) => s.url), knownPages: pages.map((p) => p.title) });
}

export function briefForContent(contentId: string) {
  const b = getDb().select().from(schema.contentBriefs).where(eq(schema.contentBriefs.contentId, contentId)).get();
  return b ? parseBrief(b) : null;
}

// ---------------------------------------------------------------- đề xuất chủ đề (CP02)

export interface TopicSuggestion {
  topic: string;
  why: string;
  from: "second_brain" | "finding";
  status?: string;
  refId: string;
}

/**
 * Chủ đề nên làm tiếp, theo luật (không AI): trang kiến thức/skill trong Second Brain chưa được nghiên cứu cho nội dung nào
 * (ưu tiên ACTIVE/VERIFIED), và chủ đề nội dung mà phát hiện đạt kiểm đã gợi ý nhưng chưa thành brief.
 */
export function suggestTopics(limit = 8): TopicSuggestion[] {
  const db = getDb();
  const findings = db.select({ id: schema.researchFindings.id, knowledgeIds: schema.researchFindings.knowledgeIds, topics: schema.researchFindings.contentTopics, ok: schema.researchFindings.verifyOk }).from(schema.researchFindings).all();
  const usedPages = new Set(findings.flatMap((f) => arr(f.knowledgeIds)));
  const taken = new Set(
    [...db.select({ t: schema.contentBriefs.topic }).from(schema.contentBriefs).all().map((r) => r.t), ...db.select({ t: schema.contentItems.title }).from(schema.contentItems).all().map((r) => r.t)].map((t) => t.toLowerCase()),
  );
  const out: TopicSuggestion[] = [];
  for (const f of findings.filter((x) => x.ok)) {
    for (const t of arr(f.topics)) {
      if (!taken.has(t.toLowerCase()) && !out.some((o) => o.topic.toLowerCase() === t.toLowerCase())) out.push({ topic: t, why: "Phát hiện đạt kiểm gợi ý chủ đề này, chưa có brief", from: "finding", refId: f.id });
    }
  }
  const skipKinds = new Set(["Quy tắc kho", "Giữ chỗ", "Nguồn"]);
  const pages = db
    .select({ id: schema.knowledgeIndex.id, title: schema.knowledgeIndex.title, section: schema.knowledgeIndex.section, kind: schema.knowledgeIndex.kind, status: schema.knowledgeIndex.status })
    .from(schema.knowledgeIndex)
    .all()
    .filter((p) => (p.section.startsWith("01") || p.section.startsWith("02")) && p.status !== "ARCHIVED" && !skipKinds.has(p.kind) && !usedPages.has(p.id))
    .sort((a, b) => (a.status === "DRAFT" ? 1 : 0) - (b.status === "DRAFT" ? 1 : 0) || a.title.localeCompare(b.title, "vi"));
  for (const p of pages) {
    const topic = p.title.replace(/^\[[^\]]*\]\s*/, "").trim() || p.title;
    if (taken.has(topic.toLowerCase())) continue;
    out.push({ topic, why: `Kiến thức (${p.kind || p.section}) chưa có nội dung nào dùng`, from: "second_brain", status: p.status, refId: p.id });
  }
  const findingsFirst = out.filter((o) => o.from === "finding").slice(0, Math.ceil(limit / 2));
  return [...findingsFirst, ...out.filter((o) => o.from === "second_brain")].slice(0, limit);
}

/** Dựng lại kịch bản quay từ brief (khi brief hoặc nguồn đã cập nhật). Bản cũ vẫn nằm trong lịch sử phiên bản. */
export function rebuildScriptFromBrief(contentId: string, by: string): number {
  const b = briefForContent(contentId);
  if (!b) throw new Error("Nội dung này không sinh từ brief");
  if (!b.qa.ok) throw new Error("Brief chưa đạt kiểm");
  const db = getDb();
  const item = db.select().from(schema.contentItems).where(eq(schema.contentItems.id, contentId)).get();
  if (!item || (item.status !== "in_progress" && item.status !== "review")) throw new Error("Chỉ dựng lại được khi nội dung đang viết hoặc chờ duyệt");
  const { sources, pages } = briefMaterial(b);
  const draft = buildShootingScript(b, sources, pages);
  recordContentVersion(contentId, { hook: item.hook, draft: item.draft ?? "", reason: "save", by });
  db.update(schema.contentItems).set({ draft, status: "in_progress" }).where(eq(schema.contentItems.id, contentId)).run();
  return recordContentVersion(contentId, { hook: item.hook, draft, reason: "brief", by });
}
