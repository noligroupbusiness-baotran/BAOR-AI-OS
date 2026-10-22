// Bộ định tuyến luật / AI.
// Làn "rule": có dữ liệu nguồn trong hệ thống và có công thức → xử lý ngay, không gọi AI.
// Làn "ai": thiếu dữ liệu nguồn → gọi AI qua cổng chung, bắt buộc ghi nguồn tra cứu, độ tin cậy,
// chi phí; kết quả mặc định cần người phê duyệt. Mọi quyết định ghi vào marketing_decisions.
import { desc, gte, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getSetting } from "@/lib/admin";

export type Lane = "rule" | "ai" | "human";
export type Domain = "ads" | "reply" | "content" | "research" | "publish" | "sync" | "campaign";

export interface DecisionInput {
  lane: Lane;
  domain: Domain;
  subject: string;
  outcome: string;
  reason?: string;
  entityType?: string;
  entityId?: string;
  campaignId?: string;
  confidence?: number;
  sources?: string[];
  needsApproval?: boolean;
  aiCallId?: string;
}

export interface Decision extends DecisionInput {
  id: string;
  at: string;
}

const newId = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const nowIso = () => new Date().toISOString();

export function recordDecision(input: DecisionInput): Decision {
  const row = {
    id: newId("dc"),
    at: nowIso(),
    lane: input.lane,
    domain: input.domain,
    subject: input.subject,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    campaignId: input.campaignId ?? null,
    outcome: input.outcome,
    reason: input.reason ?? "",
    confidence: input.confidence ?? null,
    sources: JSON.stringify(input.sources ?? []),
    needsApproval: input.needsApproval ?? input.lane === "ai",
    aiCallId: input.aiCallId ?? null,
  };
  getDb().insert(schema.marketingDecisions).values(row).run();
  return { ...input, id: row.id, at: row.at };
}

export function listDecisions(limit = 30): Decision[] {
  return getDb()
    .select()
    .from(schema.marketingDecisions)
    .orderBy(desc(schema.marketingDecisions.at))
    .limit(limit)
    .all()
    .map((r) => ({
      ...r,
      lane: r.lane as Lane,
      domain: r.domain as Domain,
      reason: r.reason,
      entityType: r.entityType ?? undefined,
      entityId: r.entityId ?? undefined,
      campaignId: r.campaignId ?? undefined,
      confidence: r.confidence ?? undefined,
      sources: JSON.parse(r.sources || "[]") as string[],
      aiCallId: r.aiCallId ?? undefined,
    }));
}

// ---------- Làn luật ----------

export interface RuleResult<T> {
  ok: boolean;
  value?: T;
  reason: string;
}

// Chạy một luật có công thức rõ và ghi lại quyết định. `check` trả về lý do khi chặn.
export function applyRule<T>(meta: Omit<DecisionInput, "lane" | "outcome" | "reason">, check: () => RuleResult<T>): RuleResult<T> {
  const r = check();
  recordDecision({ ...meta, lane: "rule", outcome: r.ok ? "cho phép" : "chặn", reason: r.reason, needsApproval: false });
  return r;
}

// ---------- Làn AI: trần ngân sách và sổ chi phí ----------

export interface AiBudget {
  dailyCapVnd: number;
  monthlyCapVnd: number;
  spentTodayVnd: number;
  spentMonthVnd: number;
  callsToday: number;
}

// Giá tham khảo để quy đổi token → VND (đặt trong Cài đặt nếu muốn đổi).
const DEFAULT_VND_PER_1K_INPUT = 400;
const DEFAULT_VND_PER_1K_OUTPUT = 2000;

export function estimateCostVnd(inputTokens: number, outputTokens: number): number {
  const inRate = Number(getSetting("ai.vndPer1kInput") ?? DEFAULT_VND_PER_1K_INPUT);
  const outRate = Number(getSetting("ai.vndPer1kOutput") ?? DEFAULT_VND_PER_1K_OUTPUT);
  return Math.round((inputTokens / 1000) * inRate + (outputTokens / 1000) * outRate);
}

export function getAiBudget(): AiBudget {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const [d] = db.select({ n: sql<number>`count(*)`, c: sql<number>`coalesce(sum(cost_vnd),0)` }).from(schema.aiCalls).where(gte(schema.aiCalls.at, today)).all();
  const [m] = db.select({ c: sql<number>`coalesce(sum(cost_vnd),0)` }).from(schema.aiCalls).where(gte(schema.aiCalls.at, `${month}-01`)).all();
  return {
    dailyCapVnd: Number(getSetting("ai.dailyCapVnd") ?? 200000),
    monthlyCapVnd: Number(getSetting("ai.monthlyCapVnd") ?? 3000000),
    spentTodayVnd: d.c,
    spentMonthVnd: m.c,
    callsToday: d.n,
  };
}

// Kiểm tra trần trước khi gọi AI (làn luật lồng trong làn AI).
export function aiBudgetAllows(): RuleResult<AiBudget> {
  const b = getAiBudget();
  if (b.spentTodayVnd >= b.dailyCapVnd) return { ok: false, value: b, reason: `Đã chạm trần AI hôm nay (${b.dailyCapVnd.toLocaleString("vi-VN")} ₫).` };
  if (b.spentMonthVnd >= b.monthlyCapVnd) return { ok: false, value: b, reason: `Đã chạm trần AI tháng này (${b.monthlyCapVnd.toLocaleString("vi-VN")} ₫).` };
  return { ok: true, value: b, reason: "Trong hạn mức." };
}

export function recordAiCall(input: { purpose: string; model: string; inputTokens: number; outputTokens: number; ok: boolean; error?: string }): string {
  const id = newId("ai");
  getDb()
    .insert(schema.aiCalls)
    .values({ id, at: nowIso(), purpose: input.purpose, model: input.model, inputTokens: input.inputTokens, outputTokens: input.outputTokens, costVnd: input.ok ? estimateCostVnd(input.inputTokens, input.outputTokens) : 0, ok: input.ok, error: input.error ?? null })
    .run();
  return id;
}

export function listAiCalls(limit = 20) {
  return getDb().select().from(schema.aiCalls).orderBy(desc(schema.aiCalls.at)).limit(limit).all();
}

export const laneLabel: Record<Lane, string> = { rule: "Theo luật", ai: "AI đề xuất", human: "Người quyết" };
export const domainLabel: Record<Domain, string> = { ads: "Quảng cáo", reply: "Trả lời khách", content: "Nội dung", research: "Nghiên cứu", publish: "Đăng bài", sync: "Đồng bộ", campaign: "Chiến dịch" };
