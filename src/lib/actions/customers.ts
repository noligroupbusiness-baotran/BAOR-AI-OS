"use server";

import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { done, logActivity, nowIso } from "./common";
import { suggestReply } from "@/lib/ai";
import { campaignRepo } from "@/lib/campaigns/repository";
import { ingestLead } from "@/lib/inbound";
import { CHANNELS } from "@/config/channels";
import { findSegment } from "@/lib/customers/segments";
import { listLeads } from "@/lib/queries";
import { listOrders } from "@/lib/orders/repository";
import { requirePermission } from "@/lib/permissions";
import type { LeadStage } from "@/lib/types";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function sendReply(fd: FormData) {
  const conv = str(fd, "conv");
  const text = str(fd, "text");
  if (!text) return done(`/customers?conv=${conv}`, "Chưa nhập tin nhắn");
  const db = getDb();
  const c = db.select().from(schema.conversations).where(eq(schema.conversations.id, conv)).get();
  if (!c) return done("/customers", "Không tìm thấy hội thoại");
  db.insert(schema.messages).values({ conversationId: conv, from: "human", text, at: nowIso() }).run();
  db.update(schema.conversations).set({ needsHuman: false }).where(eq(schema.conversations.id, conv)).run();
  db.update(schema.leads)
    .set({ lastMessage: text, lastMessageAt: nowIso(), stage: "contacted" })
    .where(eq(schema.leads.id, c.leadId))
    .run();
  campaignRepo.syncEntityStatus("lead", c.leadId, "contacted");
  logActivity("human", `Bạn đã trả lời ${c.leadName}.`, "customers");
  done(`/customers?conv=${conv}`, "Đã gửi (khi nối Facebook, tin sẽ đi thật)");
}

// Thêm lead thủ công (từ menu Tạo mới › Thêm khách hàng hoặc nút trong tab Lead).
export async function createLead(fd: FormData) {
  const name = str(fd, "name");
  if (!name) return done("/customers?tab=leads&add=1&tone=error", "Cần nhập tên khách");
  const platformRaw = str(fd, "platform") || "facebook";
  const platform = ["facebook", "instagram", "tiktok", "threads", "youtube", "zalo"].includes(platformRaw) ? platformRaw : "facebook";
  void CHANNELS;
  const lead = ingestLead({
    name,
    phone: str(fd, "phone") || undefined,
    email: str(fd, "email") || undefined,
    message: str(fd, "message"),
    source: str(fd, "source") || "manual",
    platform,
    campaignId: str(fd, "campaignId") || undefined,
    channelGoalId: str(fd, "channelGoalId") || undefined,
    tags: str(fd, "tags").split(",").map((t) => t.trim()).filter(Boolean),
  });
  logActivity("human", `Thêm lead thủ công “${lead.name}”.`, "customers");
  done("/customers?tab=leads", `Đã thêm lead ${lead.name}`);
}

export async function handBackToAi(fd: FormData) {
  const conv = str(fd, "conv");
  getDb().update(schema.conversations).set({ needsHuman: false }).where(eq(schema.conversations.id, conv)).run();
  done(`/customers?conv=${conv}`, "Đã giao lại cho AI");
}

export async function aiSuggest(fd: FormData) {
  const conv = str(fd, "conv");
  const r = await suggestReply(conv);
  if (!r.ok) return done(`/customers?conv=${conv}`, r.error);
  done(`/customers?conv=${conv}&suggest=${encodeURIComponent(r.text)}`, "AI đã soạn gợi ý");
}

export async function setLeadStage(fd: FormData) {
  const id = str(fd, "id");
  const stage = str(fd, "stage");
  getDb().update(schema.leads).set({ stage }).where(eq(schema.leads.id, id)).run();
  campaignRepo.syncEntityStatus("lead", id, stage);
  done("/customers?tab=leads", "Đã cập nhật giai đoạn");
}

export async function toggleRule(fd: FormData) {
  const id = str(fd, "id");
  const db = getDb();
  const r = db.select().from(schema.autoReplyRules).where(eq(schema.autoReplyRules.id, id)).get();
  if (!r) return done("/customers?tab=rules", "Không tìm thấy quy tắc");
  db.update(schema.autoReplyRules).set({ enabled: !r.enabled }).where(eq(schema.autoReplyRules.id, id)).run();
  done("/customers?tab=rules", r.enabled ? "Đã tắt quy tắc" : "Đã bật quy tắc");
}

export async function toggleSequence(fd: FormData) {
  const id = str(fd, "id");
  const db = getDb();
  const s = db.select().from(schema.emailSequences).where(eq(schema.emailSequences.id, id)).get();
  if (!s) return done("/customers?tab=email", "Không tìm thấy chuỗi");
  db.update(schema.emailSequences).set({ active: !s.active }).where(eq(schema.emailSequences.id, id)).run();
  done("/customers?tab=email", s.active ? "Đã tắt chuỗi email" : "Đã bật chuỗi email");
}

// ---------- Phân Data: thao tác cả nhóm ----------

const STAGES: LeadStage[] = ["new", "contacted", "qualified", "won", "lost"];

/** Gắn một thẻ cho mọi khách trong nhóm (bỏ qua khách đã có thẻ). */
export async function tagSegment(fd: FormData) {
  const actor = await requirePermission("manager", "/customers?tab=segments");
  const key = str(fd, "segment");
  const tag = str(fd, "tag").replace(/^#/, "").replace(/\s+/g, "-").toLowerCase();
  const back = `/customers?tab=segments&segment=${encodeURIComponent(key)}`;
  if (!tag) return done(`${back}&tone=error`, "Cần nhập tên thẻ.");
  const seg = findSegment(key, listLeads(), listOrders());
  if (!seg) return done(`/customers?tab=segments&tone=error`, "Không tìm thấy nhóm.");
  let changed = 0;
  const db = getDb();
  for (const l of seg.leads) {
    if (l.tags.includes(tag)) continue;
    db.update(schema.leads).set({ tags: JSON.stringify([...l.tags, tag]) }).where(eq(schema.leads.id, l.id)).run();
    changed++;
  }
  logActivity("human", `${actor.name} gắn thẻ #${tag} cho ${changed} khách trong nhóm “${seg.label}”.`, "customers");
  done(back, `Đã gắn thẻ #${tag} cho ${changed} khách${changed < seg.leads.length ? ` (${seg.leads.length - changed} khách đã có thẻ)` : ""}.`);
}

/** Đổi giai đoạn cho cả nhóm, ví dụ chuyển nhóm nguội sang “Mất”. */
export async function setSegmentStage(fd: FormData) {
  const actor = await requirePermission("manager", "/customers?tab=segments");
  const key = str(fd, "segment");
  const stage = str(fd, "stage") as LeadStage;
  const back = `/customers?tab=segments&segment=${encodeURIComponent(key)}`;
  if (!STAGES.includes(stage)) return done(`${back}&tone=error`, "Giai đoạn không hợp lệ.");
  const seg = findSegment(key, listLeads(), listOrders());
  if (!seg) return done(`/customers?tab=segments&tone=error`, "Không tìm thấy nhóm.");
  let changed = 0;
  for (const l of seg.leads) {
    if (l.stage === stage) continue;
    getDb().update(schema.leads).set({ stage }).where(eq(schema.leads.id, l.id)).run();
    campaignRepo.syncEntityStatus("lead", l.id, stage);
    changed++;
  }
  logActivity("human", `${actor.name} chuyển ${changed} khách trong nhóm “${seg.label}” sang giai đoạn ${stage}.`, "customers");
  done("/customers?tab=segments", `Đã chuyển ${changed} khách sang giai đoạn mới.`);
}
