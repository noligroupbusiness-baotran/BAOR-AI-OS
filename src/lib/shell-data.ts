// Dữ liệu cho vỏ ứng dụng (thanh trên, thanh bên): sức khỏe hệ thống và thông báo, tính từ dữ liệu thật.
import { desc, eq, gte } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { listIntegrationStatus, listRuns } from "@/lib/connectors/config";
import { connectorCapabilities } from "@/lib/connectors/sync";
import { schedulerState } from "@/lib/scheduler";
import { getAiBudget, listDecisions } from "@/lib/router";
import { campaignRepo } from "@/lib/campaigns/repository";
import { listVideos } from "@/lib/videos/repository";
import { listContent, listPosts } from "@/lib/queries";
import { dateKey } from "@/lib/format";

import type { Health, NotificationItem } from "./shell-types";
export type { Health, NotificationGroup, NotificationItem } from "./shell-types";
export { notificationGroups } from "./shell-types";

export function getHealth(): Health {
  const integrations = listIntegrationStatus();
  const caps = connectorCapabilities();
  const real = integrations.filter((i) => caps[i.key]?.check);
  const connected = real.filter((i) => i.connected);
  const s = schedulerState();
  const ai = getAiBudget();
  const aiPct = ai.dailyCapVnd ? Math.round((ai.spentTodayVnd / ai.dailyCapVnd) * 100) : 0;
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const failed = listRuns(50).filter((r) => r.startedAt >= since && r.finishedAt && !r.ok);
  const issues: string[] = [];
  for (const i of integrations) if (i.lastCheckOk === false && i.lastError) issues.push(`${i.name}: ${i.lastError}`);
  if (!s.running) issues.push("Bộ chạy nền chưa khởi động trong tiến trình này.");
  if (aiPct >= 80) issues.push(`Chi phí AI hôm nay đã dùng ${aiPct}% trần.`);
  for (const p of listPosts()) if (p.status === "failed") issues.push(`Đăng lỗi: “${p.title}”${p.error ? ` · ${p.error}` : ""}`);
  const level: Health["level"] = issues.some((x) => x.startsWith("Đăng lỗi") || x.includes("Bộ chạy nền")) ? "error" : issues.length ? "warn" : "ok";
  return {
    level,
    summary: `${connected.length}/${real.length} nền tảng đã kết nối · bộ chạy nền ${s.running ? "đang chạy" : "chưa chạy"} · AI ${aiPct}% trần ngày`,
    connectedCount: connected.length,
    realCount: real.length,
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
  for (const v of listVideos("pending_approval")) out.push({ id: `vd:${v.id}:${v.version}`, group: "approval", type: "Video", text: `Video “${v.title}” (bản ${v.version}) chờ phê duyệt.`, at: v.updatedAt, href: "/video-studio?tab=pending_approval" });
  for (const a of db.select().from(schema.adCampaigns).where(eq(schema.adCampaigns.status, "pending_approval")).all()) out.push({ id: `ad:${a.id}`, group: "approval", type: "Quảng cáo", text: `Đề xuất chạy “${a.name}”, ${a.dailyBudget.toLocaleString("vi-VN")} ₫/ngày.`, at: a.startedAt ?? new Date().toISOString().slice(0, 10), href: "/publishing" });
  for (const d of listDecisions(20)) if (d.lane === "ai" && d.needsApproval) out.push({ id: `dc:${d.id}`, group: "approval", type: "AI đề xuất", text: `${d.subject}: ${d.outcome}.`, at: d.at, href: "/settings#syslog" });

  for (const p of listPosts()) {
    if (p.status === "scheduled" && dateKey(p.scheduledFor) === today) out.push({ id: `sp:${p.id}`, group: "due", type: "Lịch đăng", text: `“${p.title}” đăng lúc ${p.scheduledFor.slice(11, 16)} hôm nay (${p.platform}).`, at: p.scheduledFor, href: "/publishing" });
    if (p.status === "failed") out.push({ id: `spf:${p.id}`, group: "error", type: "Đăng bài", text: `Đăng lỗi “${p.title}”${p.error ? `: ${p.error}` : ""}`, at: p.scheduledFor, href: "/publishing" });
  }
  for (const c of campaignRepo.list()) {
    if (c.status === "active" && c.endDate === today) out.push({ id: `cpend:${c.id}`, group: "due", type: "Chiến dịch", text: `“${c.name}” kết thúc hôm nay. Cần chốt kết quả.`, at: `${today}T08:00:00+07:00`, href: `/campaigns/${c.id}?tab=results` });
    if (c.status === "approved" && c.startDate <= today) out.push({ id: `cpstart:${c.id}`, group: "due", type: "Chiến dịch", text: `“${c.name}” đã tới ngày bắt đầu nhưng chưa kích hoạt.`, at: `${c.startDate}T08:00:00+07:00`, href: `/campaigns/${c.id}` });
  }
  for (const i of listIntegrationStatus()) if (i.lastCheckOk === false && i.lastError) out.push({ id: `int:${i.key}:${i.lastCheckedAt}`, group: "error", type: "Kết nối", text: `${i.name}: ${i.lastError}`, at: i.lastCheckedAt ?? new Date().toISOString(), href: `/settings#${i.key}` });
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  for (const r of listRuns(30)) if (r.startedAt >= since && r.finishedAt && !r.ok && r.kind !== "check") out.push({ id: `run:${r.id}`, group: "error", type: "Đồng bộ", text: `${r.integrationKey} · ${r.kind}: ${r.message}`, at: r.startedAt, href: "/settings#syslog" });

  const newLeads = db.select().from(schema.leads).where(gte(schema.leads.lastMessageAt, `${today}`)).orderBy(desc(schema.leads.lastMessageAt)).all().filter((l) => l.stage === "new" || l.stage === "contacted");
  for (const l of newLeads.slice(0, 5)) out.push({ id: `lead:${l.id}`, group: "activity", type: "Lead", text: `${l.name}: ${l.lastMessage || "lead mới"}`, at: l.lastMessageAt, href: "/customers?tab=leads" });
  for (const a of db.select().from(schema.activity).orderBy(desc(schema.activity.at)).limit(5).all()) out.push({ id: `act:${a.id}`, group: "activity", type: a.actor === "ai" ? "AI" : a.actor === "system" ? "Hệ thống" : "Bạn", text: a.message, at: a.at, href: "/dashboard" });

  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 40);
}
