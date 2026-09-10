// Động cơ Automation: đánh giá quy tắc theo sự kiện (tin nhắn, lead mới) và theo lịch (mỗi giờ).
// Mỗi lần khớp: ghi quyết định ở làn "rule", ghi lịch sử chạy, thực hiện hành động. Hành động tiêu tiền
// hoặc xuất bản chỉ tạo đề xuất chờ người duyệt.
import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { campaignRepo } from "@/lib/campaigns/repository";
import { catalogRepo } from "@/lib/catalog/repository";
import { getAdGuardrails } from "@/lib/queries";
import { recordDecision } from "@/lib/router";
import { logActivity } from "@/lib/activity";
import { goalProgress } from "@/lib/campaigns/results";
import { activeRules, listRules, matchFaq, normalizeText, ranRecently, recordRun } from "./repository";
import type { Condition, Rule } from "./types";

const PHONE = /(?:\+?84|0)(?:\d[\s.]?){8,10}/;
const COMPLAINT = /(khiếu nại|tệ|lừa|hoàn tiền|bực|tố cáo|báo công an)/i;
const PRICE = /(giá|bao nhiêu|nhiêu tiền|bảng giá)/i;

export interface MessageOutcome {
  /** Câu trả lời tự động (nếu có), từ FAQ hoặc bảng giá. */
  autoReply?: string;
  needsHuman: boolean;
  stage?: "new" | "contacted" | "qualified" | "won" | "lost";
  tags: string[];
  /** Quy tắc đã khớp (theo thứ tự ưu tiên). */
  matched: { rule: Rule; reason: string }[];
  /** Không quy tắc nào khớp → AI gợi ý, người duyệt. */
  fallbackAi: boolean;
}

function matchesMessage(c: Condition, text: string): { ok: boolean; reason: string; faqAnswer?: string } {
  switch (c.match) {
    case "complaint":
      return COMPLAINT.test(text) ? { ok: true, reason: "Tin nhắn có dấu hiệu khiếu nại." } : { ok: false, reason: "" };
    case "phone":
      return PHONE.test(text) ? { ok: true, reason: "Tin nhắn có số điện thoại." } : { ok: false, reason: "" };
    case "price":
      return PRICE.test(text) ? { ok: true, reason: "Khách hỏi giá." } : { ok: false, reason: "" };
    case "faq": {
      const f = matchFaq(text);
      return f ? { ok: true, reason: `Khớp câu chuẩn “${f.question}”.`, faqAnswer: f.answer } : { ok: false, reason: "" };
    }
    case "keyword": {
      const k = normalizeText(c.keyword ?? "");
      return k && normalizeText(text).includes(k) ? { ok: true, reason: `Có từ khóa “${c.keyword}”.` } : { ok: false, reason: "" };
    }
    case "any":
      return { ok: true, reason: "Áp dụng cho mọi tin nhắn còn lại." };
    default:
      return { ok: false, reason: "" };
  }
}

function priceReply(): string | undefined {
  const products = catalogRepo.listProducts().filter((p) => p.price > 0);
  if (!products.length) return undefined;
  const list = products.slice(0, 5).map((p) => `${p.name}: ${p.price.toLocaleString("vi-VN")} ₫/${p.unit}`).join("; ");
  return `Dạ bảng giá hiện tại: ${list}. Anh/chị cho em xin số điện thoại để tư vấn kỹ hơn ạ.`;
}

// Chạy quy tắc "khi khách nhắn tin". Dry-run = chỉ tính, không ghi (dùng cho nút "Thử với tin nhắn").
export function evaluateMessage(text: string, ctx: { leadId?: string; leadName?: string; dryRun?: boolean } = {}): MessageOutcome {
  const out: MessageOutcome = { needsHuman: false, tags: [], matched: [], fallbackAi: false };
  const rules = activeRules("message_received");
  let stop = false;
  for (const rule of rules) {
    if (stop) break;
    const m = matchesMessage(rule.condition, text);
    if (!m.ok) continue;
    let message = m.reason;
    switch (rule.action) {
      case "reply_faq":
        if (m.faqAnswer) out.autoReply = out.autoReply ?? m.faqAnswer;
        else {
          const f = matchFaq(text);
          if (!f) continue;
          out.autoReply = out.autoReply ?? f.answer;
        }
        message += " Trả lời bằng câu chuẩn.";
        stop = true;
        break;
      case "reply_price": {
        const r = priceReply();
        if (!r) continue;
        out.autoReply = out.autoReply ?? r;
        message += " Trả lời bảng giá.";
        stop = true;
        break;
      }
      case "mark_needs_human":
        out.needsHuman = true;
        message += " Chuyển người xử lý.";
        stop = true;
        break;
      case "set_stage":
        if (rule.params.stage) out.stage = rule.params.stage;
        if (rule.condition.match === "phone") out.needsHuman = true;
        message += ` Đổi giai đoạn → ${rule.params.stage ?? "?"}.`;
        break;
      case "tag_lead":
        if (rule.params.tag) out.tags.push(rule.params.tag);
        message += ` Gắn nhãn “${rule.params.tag ?? ""}”.`;
        break;
      case "notify":
        out.needsHuman = true;
        message += " Thông báo người quản lý.";
        break;
      default:
        continue;
    }
    out.matched.push({ rule, reason: message });
    if (!ctx.dryRun) {
      const d = recordDecision({ lane: "rule", domain: "reply", subject: `${rule.name}${ctx.leadName ? ` · ${ctx.leadName}` : ""}`, outcome: message, reason: `Quy tắc Automation “${rule.name}”.`, entityType: ctx.leadId ? "lead" : undefined, entityId: ctx.leadId, needsApproval: false });
      recordRun(rule.id, { entityType: "lead", entityId: ctx.leadId, ok: true, message, decisionId: d.id });
    }
  }
  if (!out.autoReply && !out.matched.some((m) => m.rule.action === "mark_needs_human")) {
    out.fallbackAi = out.matched.length === 0 || !out.matched.some((m) => m.rule.action === "notify");
    if (out.fallbackAi) out.needsHuman = true;
  }
  return out;
}

// Sự kiện lead mới (từ form / nhập tay).
export function evaluateLeadCreated(lead: { id: string; name: string; stage: string; phone: string | null }): { tags: string[]; notify: boolean } {
  const out = { tags: [] as string[], notify: false };
  for (const rule of activeRules("lead_created")) {
    const stages = rule.condition.stages ?? [];
    if (stages.length && !stages.includes(lead.stage)) continue;
    let message = "Lead mới.";
    if (rule.action === "tag_lead" && rule.params.tag) {
      out.tags.push(rule.params.tag);
      message += ` Gắn nhãn “${rule.params.tag}”.`;
    } else if (rule.action === "notify") {
      out.notify = true;
      message += ` ${rule.params.message ?? "Thông báo người quản lý."}`;
      logActivity("system", `${rule.name}: lead “${lead.name}”${rule.params.message ? ` · ${rule.params.message}` : ""}.`, "automation");
    } else continue;
    const d = recordDecision({ lane: "rule", domain: "reply", subject: `${rule.name} · ${lead.name}`, outcome: message, reason: `Quy tắc Automation “${rule.name}”.`, entityType: "lead", entityId: lead.id, needsApproval: false });
    recordRun(rule.id, { entityType: "lead", entityId: lead.id, ok: true, message, decisionId: d.id });
  }
  return out;
}

// Quy tắc theo lịch: chạy mỗi giờ từ bộ chạy nền.
export function runScheduledRules(): { fired: number; errors: number } {
  const db = getDb();
  let fired = 0;
  let errors = 0;
  const today = new Date().toISOString().slice(0, 10);

  for (const rule of listRules().filter((r) => r.enabled && r.status === "active")) {
    try {
      if (rule.trigger === "lead_stale") {
        const hours = rule.condition.hours ?? 24;
        const stages = rule.condition.stages?.length ? rule.condition.stages : ["new", "contacted"];
        const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
        const stale = db.select().from(schema.leads).where(inArray(schema.leads.stage, stages)).all().filter((l) => l.lastMessageAt < since);
        for (const l of stale) {
          if (ranRecently(rule.id, "lead", l.id, hours)) continue;
          const message = `Lead “${l.name}” không có tương tác ${hours} giờ.`;
          if (rule.action === "tag_lead" && rule.params.tag) {
            const tags = JSON.parse(l.tags || "[]") as string[];
            if (!tags.includes(rule.params.tag)) db.update(schema.leads).set({ tags: JSON.stringify([...tags, rule.params.tag]) }).where(eq(schema.leads.id, l.id)).run();
          } else if (rule.action === "notify") {
            logActivity("system", `${rule.name}: ${message} ${rule.params.message ?? ""}`.trim(), "automation");
          } else continue;
          const d = recordDecision({ lane: "rule", domain: "reply", subject: rule.name, outcome: message, reason: `Quy tắc “${rule.name}”.`, entityType: "lead", entityId: l.id, needsApproval: false });
          recordRun(rule.id, { entityType: "lead", entityId: l.id, ok: true, message, decisionId: d.id });
          fired++;
        }
      }

      if (rule.trigger === "post_engagement_high") {
        const minRate = rule.condition.engagementRate ?? 3;
        for (const p of db.select().from(schema.scheduledPosts).where(eq(schema.scheduledPosts.status, "published")).all()) {
          if (!p.reach || !p.engagement) continue;
          const rate = (p.engagement / p.reach) * 100;
          if (rate < minRate || ranRecently(rule.id, "publication", p.id, 24 * 30)) continue;
          const message = `Bài “${p.title}” đạt ${rate.toFixed(1)}% tương tác (ngưỡng ${minRate}%).`;
          if (rule.action === "propose_ad") {
            const g = getAdGuardrails();
            const budget = Math.min(rule.params.dailyBudget ?? 150000, g.dailyCap);
            const adId = `ad_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
            db.insert(schema.adCampaigns).values({ id: adId, name: `Đẩy bài: ${p.title}`, objective: "engagement", status: "pending_approval", dailyBudget: budget, spent: 0, impressions: 0, clicks: 0, leads: 0, audience: "Tương tự người đã tương tác với bài", contentId: p.contentId, startedAt: null, aiNote: `${message} Đề xuất bởi quy tắc “${rule.name}”. Chỉ chạy khi được duyệt.` }).run();
            campaignRepo.inheritLinks("publication", p.id, "ad", adId, "pending_approval");
            for (const l of campaignRepo.linksForEntities("ad", [adId]).get(adId) ?? []) {
              campaignRepo.addApproval({ campaignId: l.campaignId, channelGoalId: l.channelGoalId, type: "budget", title: `Đề xuất chạy ads “${p.title}” ${budget.toLocaleString("vi-VN")} ₫/ngày`, entityType: "ad", entityId: adId, requestedBy: `Automation: ${rule.name}`, note: message });
            }
            logActivity("system", `${rule.name}: ${message} Đã tạo đề xuất quảng cáo chờ duyệt.`, "automation");
          } else if (rule.action === "notify") {
            logActivity("system", `${rule.name}: ${message}`, "automation");
          } else continue;
          const d = recordDecision({ lane: "rule", domain: "ads", subject: rule.name, outcome: message, reason: `Quy tắc “${rule.name}”; chi tiền vẫn cần người duyệt.`, entityType: "publication", entityId: p.id, needsApproval: rule.action === "propose_ad" });
          recordRun(rule.id, { entityType: "publication", entityId: p.id, ok: true, message, decisionId: d.id });
          fired++;
        }
      }

      if (rule.trigger === "campaign_behind") {
        const behind = rule.condition.behindPct ?? 20;
        for (const c of campaignRepo.list().filter((x) => x.status === "active" && (!rule.campaignId || x.id === rule.campaignId))) {
          const total = Math.max(1, (new Date(c.endDate).getTime() - new Date(c.startDate).getTime()) / 86400000);
          const elapsed = Math.min(total, Math.max(0, (new Date(today).getTime() - new Date(c.startDate).getTime()) / 86400000));
          const expected = Math.round((elapsed / total) * 100);
          for (const g of campaignRepo.goals(c.id).filter((x) => x.status === "active")) {
            const p = goalProgress(g);
            if (expected - p < behind || ranRecently(rule.id, "goal", g.id, 24)) continue;
            const message = `“${c.name}” · ${g.channel}: hoàn thành ${p}% trong khi thời gian đã trôi ${expected}%.`;
            if (rule.action === "notify") logActivity("system", `${rule.name}: ${message}`, "automation");
            else if (rule.action === "request_approval") campaignRepo.addApproval({ campaignId: c.id, channelGoalId: g.id, type: "campaign_change", title: `Điều chỉnh mục tiêu kênh ${g.channel}: chậm tiến độ`, entityType: null, entityId: null, requestedBy: `Automation: ${rule.name}`, note: message });
            else continue;
            const d = recordDecision({ lane: "rule", domain: "campaign", subject: rule.name, outcome: message, reason: `Quy tắc “${rule.name}”.`, campaignId: c.id, needsApproval: rule.action === "request_approval" });
            recordRun(rule.id, { entityType: "goal", entityId: g.id, ok: true, message, decisionId: d.id });
            fired++;
          }
        }
      }

      if (rule.trigger === "ad_cpl_high") {
        const g = getAdGuardrails();
        const threshold = rule.condition.cplAbove ?? g.autoPauseCplAbove;
        for (const ad of db.select().from(schema.adCampaigns).where(eq(schema.adCampaigns.status, "active")).all()) {
          if (ad.leads < 10) continue;
          const cpl = Math.round(ad.spent / ad.leads);
          if (cpl <= threshold || ranRecently(rule.id, "ad", ad.id, 24)) continue;
          const message = `“${ad.name}”: CPL ${cpl.toLocaleString("vi-VN")} ₫ vượt ${threshold.toLocaleString("vi-VN")} ₫.`;
          if (rule.action === "pause_ad") {
            db.update(schema.adCampaigns).set({ status: "paused", aiNote: `Tự tạm dừng bởi quy tắc “${rule.name}”: ${message}` }).where(eq(schema.adCampaigns.id, ad.id)).run();
            campaignRepo.syncEntityStatus("ad", ad.id, "paused");
            logActivity("system", `${rule.name}: tạm dừng ${message}`, "automation");
          } else if (rule.action === "notify") logActivity("system", `${rule.name}: ${message}`, "automation");
          else continue;
          const d = recordDecision({ lane: "rule", domain: "ads", subject: rule.name, outcome: message, reason: `Quy tắc “${rule.name}”.`, entityType: "ad", entityId: ad.id, needsApproval: false });
          recordRun(rule.id, { entityType: "ad", entityId: ad.id, ok: true, message, decisionId: d.id });
          fired++;
        }
      }
    } catch (e) {
      errors++;
      recordRun(rule.id, { ok: false, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return { fired, errors };
}
