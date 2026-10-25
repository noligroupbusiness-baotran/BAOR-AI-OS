// Lưu trữ quy tắc Automation, lịch sử chạy và kho câu trả lời chuẩn (FAQ).
import { asc, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Action, Condition, Params, Rule, RuleRun, RuleStatus, Trigger } from "./types";

const parse = <T>(s: string, fallback: T): T => {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};
const newId = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const nowIso = () => new Date().toISOString();

export const normalizeText = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();

type RuleRow = typeof schema.automationRules.$inferSelect;
const toRule = (r: RuleRow): Rule => ({
  ...r,
  trigger: r.trigger as Trigger,
  action: r.action as Action,
  status: r.status as RuleStatus,
  condition: parse<Condition>(r.condition, {}),
  params: parse<Params>(r.params, {}),
});

export function listRules(): Rule[] {
  return getDb().select().from(schema.automationRules).orderBy(asc(schema.automationRules.priority), asc(schema.automationRules.createdAt)).all().map(toRule);
}

export function activeRules(trigger?: Trigger): Rule[] {
  return listRules().filter((r) => r.enabled && r.status === "active" && (trigger ? r.trigger === trigger : true));
}

export function getRule(id: string): Rule | undefined {
  const r = getDb().select().from(schema.automationRules).where(eq(schema.automationRules.id, id)).get();
  return r ? toRule(r) : undefined;
}

export interface RuleInput {
  id?: string;
  name: string;
  description: string;
  trigger: Trigger;
  condition: Condition;
  action: Action;
  params: Params;
  priority: number;
  requiresApproval: boolean;
  campaignId: string | null;
}

export function saveRule(input: RuleInput): Rule {
  const id = input.id ?? newId("ar");
  const now = nowIso();
  const existing = input.id ? getRule(input.id) : undefined;
  const row = {
    id,
    name: input.name,
    description: input.description,
    trigger: input.trigger,
    condition: JSON.stringify(input.condition),
    action: input.action,
    params: JSON.stringify(input.params),
    priority: input.priority,
    requiresApproval: input.requiresApproval,
    campaignId: input.campaignId,
    enabled: existing?.enabled ?? false,
    status: existing?.status ?? "draft",
    runs: existing?.runs ?? 0,
    lastRunAt: existing?.lastRunAt ?? null,
    lastError: null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  getDb()
    .insert(schema.automationRules)
    .values(row)
    .onConflictDoUpdate({ target: schema.automationRules.id, set: { name: row.name, description: row.description, trigger: row.trigger, condition: row.condition, action: row.action, params: row.params, priority: row.priority, requiresApproval: row.requiresApproval, campaignId: row.campaignId, lastError: null, updatedAt: now } })
    .run();
  return getRule(id)!;
}

export function setRuleStatus(id: string, status: RuleStatus) {
  getDb().update(schema.automationRules).set({ status, enabled: status === "active", updatedAt: nowIso(), ...(status === "active" ? { lastError: null } : {}) }).where(eq(schema.automationRules.id, id)).run();
}

export function deleteRule(id: string) {
  const db = getDb();
  db.delete(schema.automationRuns).where(eq(schema.automationRuns.ruleId, id)).run();
  db.delete(schema.automationRules).where(eq(schema.automationRules.id, id)).run();
}

export function recordRun(ruleId: string, input: { entityType?: string; entityId?: string; ok: boolean; message: string; decisionId?: string }): RuleRun {
  const db = getDb();
  const row = { id: newId("run"), ruleId, at: nowIso(), entityType: input.entityType ?? null, entityId: input.entityId ?? null, ok: input.ok, message: input.message.slice(0, 500), decisionId: input.decisionId ?? null };
  db.insert(schema.automationRuns).values(row).run();
  const rule = getRule(ruleId);
  if (rule) {
    db.update(schema.automationRules)
      .set({ runs: rule.runs + 1, lastRunAt: row.at, ...(input.ok ? {} : { lastError: input.message.slice(0, 300), status: "error", enabled: false }) })
      .where(eq(schema.automationRules.id, ruleId))
      .run();
  }
  return row;
}

export function listRuns(limit = 40, ruleId?: string): (RuleRun & { ruleName: string })[] {
  const db = getDb();
  const q = db.select({ r: schema.automationRuns, ruleName: schema.automationRules.name }).from(schema.automationRuns).leftJoin(schema.automationRules, eq(schema.automationRules.id, schema.automationRuns.ruleId)).orderBy(desc(schema.automationRuns.at)).limit(limit);
  return q
    .all()
    .filter((x) => (ruleId ? x.r.ruleId === ruleId : true))
    .map(({ r, ruleName }) => ({ ...r, ruleName: ruleName ?? r.ruleId }));
}

// Tránh chạy lặp cùng quy tắc trên cùng thực thể trong một khoảng thời gian (giờ).
export function ranRecently(ruleId: string, entityType: string, entityId: string, hours: number): boolean {
  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
  return listRuns(200, ruleId).some((r) => r.entityType === entityType && r.entityId === entityId && r.at >= since && r.ok);
}

// ---------- Kho câu trả lời chuẩn ----------

export interface Faq {
  id: string;
  question: string;
  keywords: string[];
  answer: string;
  active: boolean;
  hits: number;
  updatedAt: string;
}

export function listFaqs(includeInactive = false): Faq[] {
  return getDb()
    .select()
    .from(schema.faqs)
    .orderBy(desc(schema.faqs.hits), asc(schema.faqs.question))
    .all()
    .map((f) => ({ ...f, keywords: parse<string[]>(f.keywords, []) }))
    .filter((f) => includeInactive || f.active);
}

export function saveFaq(input: { id?: string; question: string; keywords: string[]; answer: string }): Faq {
  const id = input.id ?? newId("faq");
  const keywords = input.keywords.map((k) => normalizeText(k.trim())).filter(Boolean);
  const row = { id, question: input.question, keywords: JSON.stringify(keywords), answer: input.answer, active: true, hits: 0, updatedAt: nowIso() };
  getDb()
    .insert(schema.faqs)
    .values(row)
    .onConflictDoUpdate({ target: schema.faqs.id, set: { question: row.question, keywords: row.keywords, answer: row.answer, updatedAt: row.updatedAt } })
    .run();
  return listFaqs(true).find((f) => f.id === id)!;
}

export function setFaqActive(id: string, active: boolean) {
  getDb().update(schema.faqs).set({ active, updatedAt: nowIso() }).where(eq(schema.faqs.id, id)).run();
}

// Tìm câu trả lời chuẩn khớp tin nhắn: mọi từ khóa của một FAQ đều xuất hiện (không dấu) trong tin.
export function matchFaq(text: string): Faq | undefined {
  const t = normalizeText(text);
  const hit = listFaqs().find((f) => f.keywords.length > 0 && f.keywords.every((k) => t.includes(k)));
  if (hit) getDb().update(schema.faqs).set({ hits: hit.hits + 1 }).where(eq(schema.faqs.id, hit.id)).run();
  return hit;
}
