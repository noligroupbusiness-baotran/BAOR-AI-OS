// Lớp dữ liệu cho màn Điều hành. Toàn bộ đọc từ CSDL và trạng thái hệ thống thật, không còn dữ liệu mẫu:
// việc chờ xử lý, lịch hôm nay, Agent (suy ra từ bộ chạy nền, AI, đồng bộ), tình trạng hệ thống.
import { listContent, listConversations, listLeads, listPosts, pendingCounts, listAds } from "@/lib/queries";
import { campaignRepo } from "@/lib/campaigns/repository";
import { listVideos } from "@/lib/videos/repository";
import { listRuns } from "@/lib/connectors/config";
import { listErrors, overdueTask, postProblems, videosAwaitingOwner, videosRendering } from "@/lib/attention";
import { schedulerState } from "@/lib/scheduler";
import { listAiCalls, listDecisions } from "@/lib/router";
import { dateKey, TIME_ZONE } from "@/lib/format";
import type { AgentInfo, ApprovalItem, PendingItem, SystemStatus, TimelineItem } from "./dashboard-types";
export * from "./dashboard-types";

export interface OverviewStats {
  pendingApproval: number;
  postsToday: number;
  leadsToday: number;
  alerts: number;
}

export function getOverview(): OverviewStats {
  const today = dateKey(new Date());
  const posts = listPosts();
  return {
    pendingApproval: getPending().filter((p) => p.kind !== "customer" && p.kind !== "workflow" && p.kind !== "schedule").length,
    postsToday: posts.filter((p) => dateKey(p.scheduledFor) === today).length,
    leadsToday: listLeads().filter((l) => (l.stage === "new" || l.stage === "contacted") && dateKey(l.lastMessageAt) === today).length,
    // Cùng danh sách với "Lỗi cần xử lý" (src/lib/attention.ts): mỗi lỗi đếm một lần
    alerts: listErrors().length,
  };
}

export function waitedLabel(sentAt: string, now = Date.now()): string {
  const mins = Math.max(0, Math.round((now - new Date(sentAt).getTime()) / 60000));
  if (mins < 60) return `đã chờ ${Math.max(1, mins)} phút`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `đã chờ ${hours} giờ`;
  return `đã chờ ${Math.round(hours / 24)} ngày`;
}

export function getPending(): PendingItem[] {
  const items: ApprovalItem[] = [];
  for (const c of listContent(["review", "proposed"])) {
    items.push({
      id: `ap-${c.id}`,
      title: c.status === "review" ? `Duyệt bài “${c.title}”` : `Ý tưởng “${c.title}” chờ nhận làm`,
      module: "Nội dung",
      moduleHref: c.status === "review" ? `/content?tab=mine&open=${c.id}` : "/content",
      actor: c.source === "ai" || c.assignee === "ai" ? "Agent viết nội dung" : "Tôi",
      actorType: c.source === "ai" || c.assignee === "ai" ? "agent" : "human",
      sentAt: c.createdAt,
      priority: c.status === "review" ? "medium" : (c.score ?? 0) >= 85 ? "medium" : "low",
      kind: "content",
    });
  }
  // Cùng định nghĩa với badge Video Studio và thẻ bước 4: video thật có tệp, Chờ kiểm tra / Chờ phê duyệt
  for (const v of videosAwaitingOwner()) {
    items.push({ id: `ap-${v.id}`, title: `${v.status === "review" ? "Xem video" : "Duyệt video"} “${v.title}” (bản dựng ${v.version})`, module: "Video Studio", moduleHref: `/video-studio?open=${encodeURIComponent(v.id)}`, actor: v.agent, actorType: "agent", sentAt: v.updatedAt, priority: "high", kind: "video" });
  }
  for (const a of campaignRepo.pendingApprovals()) {
    if (a.type === "campaign_change") items.push({ id: `ap-${a.id}`, title: a.title, module: "Chiến dịch", moduleHref: `/campaigns/${a.campaignId}`, actor: a.requestedBy, actorType: "human", sentAt: a.requestedAt, priority: "high", kind: "campaign" });
  }
  for (const ad of listAds()) {
    if (ad.status === "pending_approval") items.push({ id: `ap-${ad.id}`, title: `Duyệt chi ${ad.dailyBudget.toLocaleString("vi-VN")} ₫/ngày cho “${ad.name}”`, module: "Quảng cáo", moduleHref: "/ads", actor: "Agent quảng cáo", actorType: "agent", sentAt: ad.startedAt ?? `${dateKey(new Date())}T00:00:00+07:00`, priority: "high", kind: "ad" });
  }
  for (const c of listConversations()) {
    if (c.needsHuman) items.push({ id: `ap-${c.id}`, title: `Khách ${c.leadName} đang chờ trả lời`, module: "Lead", moduleHref: `/customers?conv=${c.id}`, actor: "Agent chăm sóc khách", actorType: "agent", sentAt: c.messages[c.messages.length - 1]?.at ?? new Date().toISOString(), priority: "high", kind: "customer" });
  }
  // Bài quá hạn (không tự đăng): một mục "xếp lại" — việc của OWNER, không phải lỗi
  const od = overdueTask();
  if (od) items.push({ id: "ap-overdue-posts", title: od.title, module: "Đăng bài", moduleHref: od.href, actor: "Agent đăng bài", actorType: "agent", sentAt: od.at, priority: "medium", kind: "schedule" });
  // Lỗi cần xử lý: đúng danh sách của ô "Lỗi cần xử lý" ở Tổng quan và nhóm lỗi trong chuông
  const moduleOf = (href: string) => (href.startsWith("/video-studio") ? "Video Studio" : href.startsWith("/publishing") ? "Đăng bài" : "Cài đặt");
  for (const e of listErrors()) {
    items.push({ id: `ap-${e.id}`, title: e.title, module: moduleOf(e.href), moduleHref: e.href, actor: "Hệ thống", actorType: "agent", sentAt: e.at, priority: e.severity === "error" ? "high" : "medium", kind: "workflow" });
  }
  const order = { high: 0, medium: 1, low: 2 };
  const now = Date.now();
  return items.sort((a, b) => order[a.priority] - order[b.priority] || b.sentAt.localeCompare(a.sentAt)).map((a) => ({ ...a, waited: waitedLabel(a.sentAt, now) }));
}

const hm = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

// Lịch hôm nay: bài đăng theo lịch, chiến dịch bắt đầu / kết thúc, video chờ duyệt hôm nay.
export function getTodaySchedule(limit = 5): TimelineItem[] {
  const now = new Date();
  const today = dateKey(now);
  const nowHm = hm(now.toISOString());
  const platformName: Record<string, string> = { facebook: "Facebook", tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube", zalo: "Zalo" };
  const items: TimelineItem[] = [];
  for (const p of listPosts()) {
    if (dateKey(p.scheduledFor) !== today) continue;
    items.push({ id: `post-${p.id}`, time: hm(p.scheduledFor), title: `${p.status === "failed" ? "Đăng lỗi" : "Đăng bài"} “${p.title}”`, kind: "post", platform: platformName[p.platform.toLowerCase()] ?? p.platform, status: p.status === "published" || p.status === "failed" ? "done" : p.error ? "needs_confirm" : "upcoming" });
  }
  for (const c of campaignRepo.list()) {
    if (c.startDate === today && (c.status === "approved" || c.status === "active")) items.push({ id: `cps-${c.id}`, time: "08:00", title: `Chiến dịch “${c.name}” bắt đầu`, kind: "campaign", platform: c.status === "approved" ? "Chưa kích hoạt" : "Chiến dịch", status: c.status === "approved" ? "needs_confirm" : "upcoming" });
    if (c.endDate === today && c.status === "active") items.push({ id: `cpe-${c.id}`, time: "18:00", title: `Chiến dịch “${c.name}” kết thúc, chốt kết quả`, kind: "campaign", platform: "Chiến dịch", status: "needs_confirm" });
  }
  for (const v of videosAwaitingOwner()) {
    if (dateKey(v.updatedAt) === today) items.push({ id: `vid-${v.id}`, time: hm(v.updatedAt), title: `${v.status === "review" ? "Xem" : "Phê duyệt"} video “${v.title}”`, kind: "video", platform: "Video Studio", status: "needs_confirm" });
  }
  const sorted = items.sort((a, b) => a.time.localeCompare(b.time));
  const upcoming = sorted.filter((t) => t.status !== "done" && t.time >= nowHm);
  const rest = sorted.filter((t) => !upcoming.includes(t)).reverse();
  return [...upcoming, ...rest].slice(0, limit).sort((a, b) => a.time.localeCompare(b.time));
}

// Trạng thái từng Agent suy ra từ dữ liệu thật của phân hệ nó phụ trách.
export function getAgents(): AgentInfo[] {
  const nowIso = new Date().toISOString();
  const counts = pendingCounts();
  const review = listContent(["review"]).length;
  const aiCalls = listAiCalls(5);
  const lastAi = aiCalls[0];
  const videos = listVideos();
  const vPending = videosAwaitingOwner(videos).length;
  const vEditing = videosRendering(videos).length;
  const posts = listPosts();
  const scheduled = posts.filter((p) => p.status === "scheduled").length;
  const problems = postProblems();
  const failedPosts = problems.failed.length;
  const s = schedulerState();
  const convs = listConversations();
  const needHuman = convs.filter((c) => c.needsHuman).length;
  const ads = listAds();
  const runs = listRuns(20);
  const lastMetrics = runs.find((r) => r.kind === "metrics");
  const decisions = listDecisions(10);

  return [
    { id: "content", name: "Agent viết nội dung", task: `${counts.ideas} ý tưởng chờ nhận · ${review} bài chờ duyệt${lastAi ? ` · lần gọi AI gần nhất ${lastAi.ok ? "thành công" : "lỗi"}` : " · chưa gọi AI"}`, status: lastAi && !lastAi.ok ? "error" : review > 0 ? "needs_approval" : counts.ideas > 0 ? "active" : "waiting", updatedAt: lastAi?.at ?? nowIso },
    { id: "video", name: "Agent Edit Video", task: `${vEditing} video đang dựng · ${vPending} chờ anh xem / duyệt`, status: vPending > 0 ? "needs_approval" : vEditing > 0 ? "active" : "waiting", updatedAt: videos[0]?.updatedAt ?? nowIso },
    { id: "publish", name: "Agent đăng bài", task: s.running ? `${scheduled} bài chờ đăng${problems.pageCheck.length ? ` · ${problems.pageCheck.length} bài cần kiểm trang` : ""} · ${s.lastResult || "chờ lần chạy đầu"}` : "Bộ chạy nền chưa khởi động", status: failedPosts > 0 ? "error" : !s.running ? "paused" : problems.pageCheck.length ? "needs_approval" : scheduled > 0 ? "active" : "waiting", updatedAt: s.lastTickAt ?? nowIso },
    { id: "customers", name: "Agent chăm sóc khách", task: `${convs.length} hội thoại · ${needHuman} cần người trả lời`, status: needHuman > 0 ? "needs_approval" : convs.length > 0 ? "active" : "waiting", updatedAt: convs[0]?.messages[convs[0].messages.length - 1]?.at ?? nowIso },
    { id: "ads", name: "Agent quảng cáo", task: `${ads.filter((a) => a.status === "active").length} đang chạy · ${ads.filter((a) => a.status === "pending_approval").length} chờ duyệt chi tiền`, status: ads.some((a) => a.status === "pending_approval") ? "needs_approval" : ads.some((a) => a.status === "active") ? "active" : "waiting", updatedAt: decisions.find((d) => d.domain === "ads")?.at ?? nowIso },
    { id: "sync", name: "Agent đồng bộ số liệu", task: lastMetrics ? `${lastMetrics.integrationKey}: ${lastMetrics.message}` : "Chưa có nền tảng nào kết nối để đồng bộ", status: lastMetrics ? (lastMetrics.ok ? "active" : "error") : "waiting", updatedAt: lastMetrics?.startedAt ?? nowIso },
  ];
}

// issues = ĐÚNG danh sách lỗi cần xử lý (listErrors) — ô "Lỗi cần xử lý" ở Tổng quan đếm số này, và cùng các mục đó nằm trong
// Việc cần làm (kind "workflow"). Trạng thái Agent (lỗi đăng bài, đồng bộ lỗi) suy ra từ chính các lỗi đó nên không cộng lần nữa.
export function getSystemStatus(pendingCount: number): SystemStatus {
  const agents = getAgents();
  const active = agents.filter((a) => a.status === "active" || a.status === "waiting" || a.status === "needs_approval").length;
  const errors = listErrors();
  const issues = errors.map((e) => e.title);
  const severe = errors.some((e) => e.severity === "error");
  const attention = issues.length > 0 || agents.some((a) => a.status === "error" || a.status === "paused");
  return {
    level: severe ? "error" : attention ? "warn" : "ok",
    summary: [`${active} Agent đang hoạt động`, `${pendingCount} việc chờ duyệt`, severe ? `${issues.length} lỗi cần xử lý` : issues.length ? `${issues.length} việc cần kiểm` : "Không có lỗi nghiêm trọng"].join(" · "),
    agents,
    issues,
  };
}
