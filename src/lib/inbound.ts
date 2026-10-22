// Tiếp nhận dữ liệu từ ngoài vào (webhook Messenger, form website): tạo lead, hội thoại, tin nhắn,
// gắn chiến dịch, và đưa qua bộ định tuyến để quyết định trả lời theo luật hay chuyển AI/người.
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { campaignRepo } from "@/lib/campaigns/repository";
import { recordDecision } from "@/lib/router";
import { logActivity } from "@/lib/activity";
import type { InboundMessage } from "@/lib/connectors/types";
import { evaluateLeadCreated, evaluateMessage } from "@/lib/automation/engine";

const newId = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const nowIso = () => new Date().toISOString();

const PHONE = /(?:\+?84|0)(?:\d[\s.]?){8,10}/;

// Tin nhắn đến đi qua quy tắc Automation (làn luật). Không quy tắc nào trả lời được → chuyển người
// và để AI gợi ý (làn AI, cần duyệt).
export function routeInbound(text: string, ctx: { leadId?: string; leadName?: string } = {}): { needsHuman: boolean; stage: "new" | "contacted" | "qualified" | "won" | "lost"; lane: "rule" | "ai"; reason: string; autoReply?: string; tags: string[] } {
  const r = evaluateMessage(text, ctx);
  const stage = r.stage ?? "new";
  if (r.matched.length === 0) return { needsHuman: true, stage, lane: "ai", reason: "Không quy tắc nào khớp: AI soạn gợi ý, người duyệt trước khi gửi.", tags: r.tags };
  return { needsHuman: r.needsHuman, stage, lane: r.fallbackAi ? "ai" : "rule", reason: r.matched.map((m) => `${m.rule.name}: ${m.reason}`).join(" "), autoReply: r.autoReply, tags: r.tags };
}

export function ingestInboundMessages(messages: InboundMessage[]): number {
  const db = getDb();
  let touched = 0;
  for (const m of messages) {
    const threadId = m.threadId ?? `${m.platform}:${m.externalUserId}`;
    const convId = `cv_${threadId.replace(/[^a-zA-Z0-9]/g, "_")}`;
    let conv = db.select().from(schema.conversations).where(eq(schema.conversations.id, convId)).get();
    const route = routeInbound(m.text, { leadId: conv?.leadId, leadName: conv?.leadName ?? m.name });
    if (!conv) {
      const leadId = newId("l");
      db.insert(schema.leads)
        .values({ id: leadId, name: m.name ?? `Khách ${m.externalUserId.slice(-4)}`, source: "inbox", platform: m.platform, stage: route.stage, lastMessage: m.text, lastMessageAt: m.at, phone: m.text.match(PHONE)?.[0] ?? null, email: null, tags: JSON.stringify(route.tags), autoReplied: !!route.autoReply })
        .run();
      db.insert(schema.conversations).values({ id: convId, leadId, leadName: m.name ?? `Khách ${m.externalUserId.slice(-4)}`, platform: m.platform, needsHuman: route.needsHuman }).run();
      conv = db.select().from(schema.conversations).where(eq(schema.conversations.id, convId)).get()!;
    } else {
      db.update(schema.conversations).set({ needsHuman: route.needsHuman || conv.needsHuman }).where(eq(schema.conversations.id, convId)).run();
      db.update(schema.leads).set({ lastMessage: m.text, lastMessageAt: m.at, ...(route.stage !== "new" ? { stage: route.stage } : {}), ...(m.text.match(PHONE) ? { phone: m.text.match(PHONE)![0] } : {}) }).where(eq(schema.leads.id, conv.leadId)).run();
    }
    db.insert(schema.messages).values({ conversationId: convId, from: "customer", text: m.text, at: m.at }).run();
    if (route.autoReply) db.insert(schema.messages).values({ conversationId: convId, from: "ai", text: route.autoReply, at: nowIso() }).run();
    if (route.lane === "ai") recordDecision({ lane: "ai", domain: "reply", subject: `Tin nhắn từ ${conv.leadName}`, outcome: "chuyển người, AI gợi ý câu trả lời", reason: route.reason, entityType: "lead", entityId: conv.leadId, needsApproval: true });
    campaignRepo.syncEntityStatus("lead", conv.leadId, route.stage);
    touched++;
  }
  if (touched) logActivity("system", `Nhận ${touched} tin nhắn mới từ webhook.`, "customers");
  return touched;
}

export function ingestLead(input: { name: string; phone?: string; email?: string; message: string; source: string; platform: string; campaignId?: string; channelGoalId?: string; tags: string[] }) {
  const db = getDb();
  const id = newId("l");
  const stage = input.phone ? "contacted" : "new";
  db.insert(schema.leads)
    .values({ id, name: input.name, source: ["comment", "inbox", "ads", "email", "manual"].includes(input.source) ? input.source : "manual", platform: input.platform, stage, lastMessage: input.message, lastMessageAt: nowIso(), phone: input.phone ?? null, email: input.email ?? null, tags: JSON.stringify(input.tags), autoReplied: false })
    .run();
  if (input.campaignId && campaignRepo.get(input.campaignId)) {
    const goal = input.channelGoalId ? campaignRepo.goal(input.channelGoalId) : undefined;
    campaignRepo.addLink({ campaignId: input.campaignId, channelGoalId: goal && goal.campaignId === input.campaignId ? goal.id : null, entityType: "lead", entityId: id, status: stage, ownerId: null, viaType: null, viaId: null });
  }
  recordDecision({ lane: "rule", domain: "reply", subject: `Lead mới từ ${input.source}: ${input.name}`, outcome: stage === "contacted" ? "có số điện thoại, người gọi lại" : "chờ chăm sóc", reason: "Lead đến từ webhook form.", entityType: "lead", entityId: id, campaignId: input.campaignId, needsApproval: false });
  const auto = evaluateLeadCreated({ id, name: input.name, stage, phone: input.phone ?? null });
  if (auto.tags.length) db.update(schema.leads).set({ tags: JSON.stringify([...new Set([...input.tags, ...auto.tags])]) }).where(eq(schema.leads.id, id)).run();
  logActivity("system", `Lead mới “${input.name}” từ ${input.source}.`, "customers");
  const exists = db.select().from(schema.leads).where(and(eq(schema.leads.id, id), eq(schema.leads.id, id))).get();
  return exists ?? { id, name: input.name };
}
