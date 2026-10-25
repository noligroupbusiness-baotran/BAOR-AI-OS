// Dữ liệu cho vỏ ứng dụng (thanh trên, thanh bên): sức khỏe hệ thống và thông báo, tính từ dữ liệu thật.
import { desc, eq, gte } from "drizzle-orm";
import { envIssues } from "@/lib/env-check";
import { getDb, schema } from "@/db";
import { isIntegrationError, listIntegrationStatus, readIntegrationConfig } from "@/lib/connectors/config";
import { connectorFor } from "@/lib/connectors/registry";
import { schedulerState } from "@/lib/scheduler";
import { getAiBudget, listDecisions } from "@/lib/router";
import { campaignRepo } from "@/lib/campaigns/repository";
import { failedRuns, listErrors, overdueTask, postProblems, videosAwaitingOwner } from "@/lib/attention";
import { listContent, listPosts } from "@/lib/queries";
import { dateKey } from "@/lib/format";
import { hrefForActivityStep } from "@/config/menu";

import type { Health, NotificationItem } from "./shell-types";
export type { Health, NotificationGroup, NotificationItem } from "./shell-types";
export { notificationGroups } from "./shell-types";

/**
 * Kết nối dùng được thật — MỘT mẫu số cho thanh bên (sức khoẻ) và ô "Kết nối" ở Tổng quan (trang đích Cài đặt › Kết nối):
 * mọi kết nối có adapter thật (Fanpage, Meta Ads, Notion, khoá AI), bỏ nền tảng chưa có adapter (pending) và Fanpage phụ chưa dùng.
 */
export function connectionStats(integrations = listIntegrationStatus()) {
  const list = integrations.filter((i) => (!/^facebook_page_\d+$/.test(i.key) || i.connected || i.lastCheckedAt) && !connectorFor(i.key)?.pending);
  const connected = list.filter((i) => i.connected);
  return { list, connected, connectedCount: connected.length, total: list.length };
}

export function getHealth(): Health {
  const integrations = listIntegrationStatus();
  const conn = connectionStats(integrations);
  const s = schedulerState();
  const ai = getAiBudget();
  const aiPct = ai.dailyCapVnd ? Math.round((ai.spentTodayVnd / ai.dailyCapVnd) * 100) : 0;
  const failed = failedRuns();
  const issues: string[] = [];
  for (const i of integrations) if (isIntegrationError(i)) issues.push(`${i.name}: ${i.lastError}`);
  // Token sắp hết hạn (nhập tay ở Cài đặt › Kết nối).
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  for (const i of integrations) {
    if (!i.connected) continue;
    const exp = readIntegrationConfig(i.key).tokenExpiresAt;
    if (exp && /^\d{4}-\d{2}-\d{2}$/.test(exp)) {
      if (exp < today) issues.push(`${i.name}: token đã hết hạn ngày ${exp}. Vào Cài đặt › Kết nối để nhập token mới.`);
      else if (exp <= soon) issues.push(`${i.name}: token hết hạn ngày ${exp} (trong 7 ngày). Chuẩn bị token mới.`);
    }
  }
  if (!s.running) issues.push("Bộ chạy nền chưa khởi động trong tiến trình này.");
  for (const e of envIssues()) if (e.level === "error") issues.push(`Cấu hình: ${e.text}`);
  if (aiPct >= 80) issues.push(`Chi phí AI hôm nay đã dùng ${aiPct}% trần.`);
  // Bài lỗi thật → đỏ; bài nền tảng có thể đã nhận (cần kiểm trang) → MỘT mục cảnh báo mỗi bài, không đỏ mãi
  const posts = postProblems();
  for (const p of posts.failed) issues.push(`Đăng lỗi: “${p.title}”${p.error ? ` · ${p.error}` : ""}`);
  if (posts.overdue.length) issues.push(`${posts.overdue.length} bài quá hạn, cần xếp lại giờ đăng (không tự đăng).`);
  for (const p of posts.pageCheck) issues.push(`Cần kiểm trang: “${p.title}” (${p.platform}${p.externalId ? `, mã ${p.externalId}` : ""}) — nền tảng có thể đã nhận bài`);
  const level: Health["level"] = issues.some((x) => x.startsWith("Đăng lỗi") || x.startsWith("Cấu hình:") || x.includes("Bộ chạy nền")) ? "error" : issues.length ? "warn" : "ok";
  return {
    level,
    summary: `${conn.connectedCount}/${conn.total} kết nối · bộ chạy nền ${s.running ? "đang chạy" : "chưa chạy"} · AI ${aiPct}% trần ngày`,
    connectedCount: conn.connectedCount,
    realCount: conn.total,
    schedulerRunning: s.running,
    lastTickAt: s.lastTickAt,
    lastResult: s.lastResult,
    aiSpentPct: aiPct,
    failedRuns24h: failed.length,
    issues,
  };
}

// Thông báo tính từ dữ liệu thật; trạng thái đã đọc lưu ở trình duyệt theo id.
export function getNotifications(): NotificationItem[] {
  const out: NotificationItem[] = [];
  const db = getDb();
  const today = dateKey(new Date());

  for (const a of campaignRepo.pendingApprovals()) {
    if (a.type === "campaign_change") out.push({ id: `ap:${a.id}`, group: "approval", type: "Chiến dịch", text: `${a.title} · ${a.requestedBy}`, at: a.requestedAt, href: `/campaigns/${a.campaignId}` });
  }
  for (const c of listContent(["review"])) out.push({ id: `ct:${c.id}:review`, group: "approval", type: "Nội dung", text: `Bài “${c.title}” chờ duyệt.`, at: c.createdAt, href: `/content?tab=mine&open=${c.id}` });
  for (const v of videosAwaitingOwner()) out.push({ id: `vd:${v.id}:${v.version}`, group: "approval", type: "Video", text: `Video “${v.title}” (bản ${v.version}) ${v.status === "review" ? "chờ anh xem" : "chờ phê duyệt"}.`, at: v.updatedAt, href: `/video-studio?open=${encodeURIComponent(v.id)}` });
  for (const a of db.select().from(schema.adCampaigns).where(eq(schema.adCampaigns.status, "pending_approval")).all()) out.push({ id: `ad:${a.id}`, group: "approval", type: "Quảng cáo", text: `Đề xuất chạy “${a.name}”, ${a.dailyBudget.toLocaleString("vi-VN")} ₫/ngày.`, at: a.startedAt ?? new Date().toISOString().slice(0, 10), href: "/ads" });
  for (const d of listDecisions(20)) if (d.lane === "ai" && d.needsApproval) out.push({ id: `dc:${d.id}`, group: "approval", type: "AI đề xuất", text: `${d.subject}: ${d.outcome}.`, at: d.at, href: "/settings#syslog" });

  for (const p of listPosts()) {
    if (p.status === "scheduled" && dateKey(p.scheduledFor) === today) out.push({ id: `sp:${p.id}`, group: "due", type: "Lịch đăng", text: `“${p.title}” đăng lúc ${p.scheduledFor.slice(11, 16)} hôm nay (${p.platform}).`, at: p.scheduledFor, href: "/publishing" });
  }
  for (const c of campaignRepo.list()) {
    if (c.status === "active" && c.endDate === today) out.push({ id: `cpend:${c.id}`, group: "due", type: "Chiến dịch", text: `“${c.name}” kết thúc hôm nay. Cần chốt kết quả.`, at: `${today}T08:00:00+07:00`, href: `/campaigns/${c.id}?tab=results` });
    if (c.status === "approved" && c.startDate <= today) out.push({ id: `cpstart:${c.id}`, group: "due", type: "Chiến dịch", text: `“${c.name}” đã tới ngày bắt đầu nhưng chưa kích hoạt.`, at: `${c.startDate}T08:00:00+07:00`, href: `/campaigns/${c.id}` });
  }
  const od = overdueTask();
  if (od) out.push({ id: `overdue:${od.count}:${od.at}`, group: "due", type: "Lịch đăng", text: od.title, at: od.at, href: od.href });
  // Nhóm "Lỗi cần xử lý" = đúng danh sách lỗi của Tổng quan / Việc cần làm (src/lib/attention.ts)
  const errType = { run: "Hệ thống", post: "Đăng bài", page_check: "Kiểm trang", integration: "Kết nối" } as const;
  for (const e of listErrors()) out.push({ id: e.source === "integration" ? `${e.id}:${e.at}` : e.id, group: "error", type: errType[e.source], text: e.title, at: e.at, href: e.href });

  const newLeads = db.select().from(schema.leads).where(gte(schema.leads.lastMessageAt, `${today}`)).orderBy(desc(schema.leads.lastMessageAt)).all().filter((l) => l.stage === "new" || l.stage === "contacted");
  for (const l of newLeads.slice(0, 5)) out.push({ id: `lead:${l.id}`, group: "activity", type: "Lead", text: `${l.name}: ${l.lastMessage || "lead mới"}`, at: l.lastMessageAt, href: "/customers?tab=leads" });
  for (const a of db.select().from(schema.activity).orderBy(desc(schema.activity.at)).limit(5).all()) out.push({ id: `act:${a.id}`, group: "activity", type: a.actor === "ai" ? "AI" : a.actor === "system" ? "Hệ thống" : "Bạn", text: a.message, at: a.at, href: hrefForActivityStep(a.step) });

  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 40);
}
