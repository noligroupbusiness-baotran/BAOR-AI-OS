// Trợ lý AI của thanh trên. Làn luật trước: các câu hỏi vận hành quen thuộc được trả lời thẳng từ dữ liệu
// (không tốn AI). Câu hỏi khác → Claude qua cổng chung, với ảnh chụp dữ liệu hệ thống làm ngữ cảnh.
import { getPending, getOverview, getTodaySchedule, getSystemStatus } from "@/lib/dashboard-data";
import { campaignRepo } from "@/lib/campaigns/repository";
import { campaignProgress, goalProgress } from "@/lib/campaigns/results";
import { campaignStatusLabel } from "@/lib/campaigns/labels";
import { channelLabel } from "@/config/channels";
import { getHealth } from "@/lib/shell-data";
import { listDecisions, recordDecision } from "@/lib/router";
import { listOrders } from "@/lib/orders/repository";
import { listLeads } from "@/lib/queries";
import { formatCurrency, formatNumber, dateKey } from "@/lib/format";

const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").toLowerCase();

export interface AssistantAnswer {
  text: string;
  lane: "rule" | "ai";
  sources: string[];
}

// Ảnh chụp dữ liệu hệ thống (ngắn gọn, có cấu trúc) dùng làm ngữ cảnh cho AI.
export function systemSnapshot(): string {
  const o = getOverview();
  const pending = getPending().slice(0, 12);
  const camps = campaignRepo.list().filter((c) => c.status !== "draft").map((c) => {
    const goals = campaignRepo.goals(c.id);
    const r = campaignRepo.result(c.id);
    return `- ${c.name} [${campaignStatusLabel[c.status].label}] ${c.startDate}→${c.endDate}, ngân sách ${formatCurrency(c.totalBudget)}, tiến độ ${campaignProgress(c, goals, r ?? null)}%; kênh: ${goals.map((g) => `${channelLabel(g.channel)} ${goalProgress(g)}% (${formatNumber(g.currentValue)}/${formatNumber(g.targetValue)})`).join(", ") || "chưa có"}; lead ${r?.leads ?? 0}, đơn ${r?.orders ?? 0}, doanh thu ${formatCurrency(r?.revenue ?? 0)}, chi ${formatCurrency(r?.spent ?? 0)}`;
  });
  const h = getHealth();
  const sched = getTodaySchedule(6);
  return [
    `Hôm nay ${dateKey(new Date())}.`,
    `Tổng quan: ${o.pendingApproval} việc chờ duyệt, ${o.postsToday} bài đăng hôm nay, ${o.leadsToday} lead mới hôm nay, ${o.alerts} cảnh báo.`,
    `Việc chờ xử lý:\n${pending.map((p) => `- [${p.module}] ${p.title} (${p.waited}, ưu tiên ${p.priority})`).join("\n") || "- không có"}`,
    `Chiến dịch:\n${camps.join("\n") || "- chưa có"}`,
    `Lịch hôm nay:\n${sched.map((t) => `- ${t.time} ${t.title} (${t.platform}, ${t.status})`).join("\n") || "- trống"}`,
    `Hệ thống: ${h.summary}. ${h.issues.length ? `Vấn đề: ${h.issues.join("; ")}` : ""}`,
  ].join("\n\n");
}

// Làn luật: nhận diện ý định quen thuộc, trả lời từ dữ liệu, không gọi AI.
export function answerByRule(question: string): AssistantAnswer | null {
  const q = normalize(question);
  const has = (...ks: string[]) => ks.some((k) => q.includes(normalize(k)));

  if (has("cần duyệt", "chờ duyệt", "phê duyệt", "việc cần xử lý", "hôm nay có gì")) {
    const items = getPending();
    if (items.length === 0) return { text: "Hiện không có việc nào chờ anh xử lý.", lane: "rule", sources: ["Điều hành › Chờ tôi xử lý"] };
    const top = items.slice(0, 8).map((p, i) => `${i + 1}. ${p.title} · ${p.module} · ${p.waited}`).join("\n");
    return { text: `Có ${items.length} việc đang chờ. Ưu tiên cao trước:\n${top}${items.length > 8 ? `\n… và ${items.length - 8} việc nữa ở Điều hành.` : ""}`, lane: "rule", sources: ["Điều hành › Chờ tôi xử lý"] };
  }

  if (has("chậm", "trễ tiến độ", "không đạt", "kém")) {
    const today = dateKey(new Date());
    const behind: string[] = [];
    for (const c of campaignRepo.list().filter((x) => x.status === "active")) {
      const total = Math.max(1, (new Date(c.endDate).getTime() - new Date(c.startDate).getTime()) / 86400000);
      const elapsed = Math.min(total, Math.max(0, (new Date(today).getTime() - new Date(c.startDate).getTime()) / 86400000));
      const expected = Math.round((elapsed / total) * 100);
      for (const g of campaignRepo.goals(c.id).filter((x) => x.status === "active")) {
        const p = goalProgress(g);
        if (expected - p >= 10) behind.push(`${c.name} · ${channelLabel(g.channel)}: ${p}% trong khi thời gian đã trôi ${expected}% (${formatNumber(g.currentValue)}/${formatNumber(g.targetValue)})`);
      }
      if (expected === 0) behind.push(`${c.name}: chưa tới ngày bắt đầu (${c.startDate}), chưa đánh giá được.`);
    }
    return { text: behind.length ? `Các mục tiêu kênh chậm hơn tiến độ thời gian:\n${behind.map((b) => `- ${b}`).join("\n")}` : "Không mục tiêu kênh nào chậm hơn tiến độ thời gian từ 10 điểm trở lên.", lane: "rule", sources: ["Chiến dịch › Mục tiêu theo kênh"] };
  }

  if (has("lỗi", "sự cố", "hỏng", "kết nối")) {
    const h = getHealth();
    const st = getSystemStatus(getOverview().pendingApproval);
    const issues = [...new Set([...h.issues, ...st.issues])];
    return { text: issues.length ? `Tình trạng: ${h.summary}.\nĐang có ${issues.length} vấn đề:\n${issues.map((x) => `- ${x}`).join("\n")}` : `Không có lỗi. ${h.summary}.`, lane: "rule", sources: ["Cài đặt › Nhật ký hệ thống", "Điều hành › Tình trạng hệ thống"] };
  }

  if (has("lead mới", "khách mới", "bao nhiêu lead")) {
    const today = dateKey(new Date());
    const leads = listLeads();
    const todayLeads = leads.filter((l) => dateKey(l.lastMessageAt) === today);
    const need = leads.filter((l) => l.stage === "new" || l.stage === "contacted").length;
    return { text: `Hôm nay có ${todayLeads.length} lead mới${todayLeads.length ? `: ${todayLeads.slice(0, 5).map((l) => `${l.name}${l.phone ? ` (${l.phone})` : ""}`).join(", ")}` : ""}. Tổng ${leads.length} lead, ${need} đang cần chăm sóc, ${leads.filter((l) => l.stage === "won").length} đã mua.`, lane: "rule", sources: ["Khách hàng › Lead"] };
  }

  if (has("doanh thu", "bán được", "đơn hàng", "roas")) {
    const orders = listOrders();
    const paid = orders.filter((o) => o.status === "paid");
    const rev = paid.reduce((n, o) => n + o.total, 0);
    const byC = new Map<string, number>();
    for (const o of paid) byC.set(o.campaignName ?? "Chưa gắn chiến dịch", (byC.get(o.campaignName ?? "Chưa gắn chiến dịch") ?? 0) + o.total);
    return { text: `Doanh thu đã thanh toán: ${formatCurrency(rev)} từ ${paid.length} đơn (${orders.filter((o) => o.status === "new").length} đơn chờ thanh toán).\n${[...byC.entries()].map(([k, v]) => `- ${k}: ${formatCurrency(v)}`).join("\n")}`, lane: "rule", sources: ["Khách hàng › Đơn hàng", "Báo cáo › Đơn hàng và doanh thu"] };
  }

  if (has("chiến dịch nào", "đang chạy", "tình hình chiến dịch", "tổng quan chiến dịch")) {
    const rows = campaignRepo.list().filter((c) => c.status !== "draft").map((c) => {
      const goals = campaignRepo.goals(c.id);
      const r = campaignRepo.result(c.id);
      return `- ${c.name}: ${campaignStatusLabel[c.status].label}, tiến độ ${campaignProgress(c, goals, r ?? null)}%, ${r?.leads ?? 0} lead, ${formatCurrency(r?.revenue ?? 0)} doanh thu`;
    });
    return { text: rows.length ? `Các chiến dịch:\n${rows.join("\n")}` : "Chưa có chiến dịch nào ngoài bản nháp.", lane: "rule", sources: ["Chiến dịch"] };
  }

  if (has("ai đã quyết", "quyết định", "log", "nhật ký")) {
    const d = listDecisions(6);
    return { text: d.length ? `Quyết định gần nhất:\n${d.map((x) => `- [${x.lane === "ai" ? "AI" : "luật"}] ${x.subject}: ${x.outcome}`).join("\n")}` : "Chưa có quyết định nào được ghi.", lane: "rule", sources: ["Cài đặt › Nhật ký hệ thống"] };
  }
  return null;
}

export function recordAssistantRule(question: string, a: AssistantAnswer) {
  recordDecision({ lane: "rule", domain: "campaign", subject: `Trợ lý: “${question.slice(0, 80)}”`, outcome: "trả lời từ dữ liệu, không gọi AI", reason: a.sources.join(", "), needsApproval: false });
}
