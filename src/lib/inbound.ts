// Tiếp nhận dữ liệu từ ngoài vào (webhook Messenger, form website): tạo lead, hội thoại, tin nhắn,
// gắn chiến dịch, và đưa qua bộ định tuyến để quyết định trả lời theo luật hay chuyển AI/người.
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { campaignRepo } from "@/lib/campaigns/repository";
import { recordDecision } from "@/lib/router";
import { logActivity } from "@/lib/activity";
import type { InboundMessage } from "@/lib/connectors/types";

const newId = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const nowIso = () => new Date().toISOString();

const PHONE = /(?:\+?84|0)(?:\d[\s.]?){8,10}/;
const COMPLAINT = /(khiếu nại|tệ|lừa|hoàn tiền|bực|tố cáo|báo công an)/i;
const PRICE = /(giá|bao nhiêu|nhiêu tiền|bảng giá)/i;

// Làn luật cho tin nhắn đến: có số điện thoại → lead "đã liên hệ" + chuyển người gọi lại;
// khiếu nại → chuyển người ngay; hỏi giá → trả lời từ bảng giá; còn lại → AI gợi ý, người duyệt.
export function routeInbound(text: string): { needsHuman: boolean; stage: "new" | "contacted" | "qualified"; lane: "rule" | "ai"; reason: string; autoReply?: string } {
  if (COMPLAINT.test(text)) return { needsHuman: true, stage: "new", lane: "rule", reason: "Khiếu nại: không trả lời tự động, chuyển người xử lý ngay." };
  if (PHONE.test(text)) return { needsHuman: true, stage: "contacted", lane: "rule", reason: "Khách để lại số điện thoại: tạo lead “Đã liên hệ”, người gọi lại trong 30 phút." };
  if (PRICE.test(text)) {
    const db = getDb();
    const products = db.select().from(schema.products).where(eq(schema.products.active, true)).all().filter((p) => p.price > 0);
    if (products.length) {
      const list = products.slice(0, 5).map((p) => `${p.name}: ${p.price.toLocaleString("vi-VN")} ₫/${p.unit}`).join("; ");
      return { needsHuman: false, stage: "new", lane: "rule", reason: "Hỏi giá: trả lời từ bảng giá trong Cài đặt.", autoReply: `Dạ bảng giá hiện tại: ${list}. Anh/chị cho em xin số điện thoại để tư vấn kỹ hơn ạ.` };
    }
  }
  return { needsHuman: true, stage: "new", lane: "ai", reason: "Không có câu trả lời chuẩn trong hệ thống: AI soạn gợi ý, người duyệt trước khi gửi." };
}

export function ingestInboundMessages(messages: InboundMessage[]): number {
  const db = getDb();
  let touched = 0;
  for (const m of messages) {
    const threadId = m.threadId ?? `${m.platform}:${m.externalUserId}`;
    const convId = `cv_${threadId.replace(/[^a-zA-Z0-9]/g, "_")}`;
    let conv = db.select().from(schema.conversations).where(eq(schema.conversations.id, convId)).get();
    const route = routeInbound(m.text);
    if (!conv) {
      const leadId = newId("l");
      db.insert(schema.leads)
        .values({ id: leadId, name: m.name ?? `Khách ${m.externalUserId.slice(-4)}`, source: "inbox", platform: m.platform, stage: route.stage, lastMessage: m.text, lastMessageAt: m.at, phone: m.text.match(PHONE)?.[0] ?? null, email: null, tags: "[]", autoReplied: !!route.autoReply })
        .run();
      db.insert(schema.conversations).values({ id: convId, leadId, leadName: m.name ?? `Khách ${m.externalUserId.slice(-4)}`, platform: m.platform, needsHuman: route.needsHuman }).run();
      conv = db.select().from(schema.conversations).where(eq(schema.conversations.id, convId)).get()!;
    } else {
      db.update(schema.conversations).set({ needsHuman: route.needsHuman || conv.needsHuman }).where(eq(schema.conversations.id, convId)).run();
      db.update(schema.leads).set({ lastMessage: m.text, lastMessageAt: m.at, ...(route.stage !== "new" ? { stage: route.stage } : {}), ...(m.text.match(PHONE) ? { phone: m.text.match(PHONE)![0] } : {}) }).where(eq(schema.leads.id, conv.leadId)).run();
    }
    db.insert(schema.messages).values({ conversationId: convId, from: "customer", text: m.text, at: m.at }).run();
    if (route.autoReply) db.insert(schema.messages).values({ conversationId: convId, from: "ai", text: route.autoReply, at: nowIso() }).run();
    recordDecision({ lane: route.lane, domain: "reply", subject: `Tin nhắn từ ${conv.leadName}`, outcome: route.autoReply ? "trả lời tự động" : route.needsHuman ? "chuyển người" : "chờ", reason: route.reason, entityType: "lead", entityId: conv.leadId, needsApproval: route.lane === "ai" });
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
  logActivity("system", `Lead mới “${input.name}” từ ${input.source}.`, "customers");
  const exists = db.select().from(schema.leads).where(and(eq(schema.leads.id, id), eq(schema.leads.id, id))).get();
  return exists ?? { id, name: input.name };
}
