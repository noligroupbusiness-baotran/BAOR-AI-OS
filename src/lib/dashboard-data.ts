// Lớp dữ liệu cho màn Điều hành. Gom số liệu thật từ CSDL (nội dung, khách hàng, lịch đăng, lead)
// với DỮ LIỆU MẪU (video, Agent, lịch hôm nay). Khi có API thật, chỉ thay ở đây.
import { listContent, listConversations, listLeads, listPosts, pendingCounts } from "@/lib/queries";
import { mockAgents, mockApprovals, mockTimeline, type AgentInfo, type ApprovalItem, type TimelineItem } from "@/lib/mock/dashboard";
import { listVideos } from "@/lib/videos/repository";
import { dateKey, TIME_ZONE } from "@/lib/format";
import { campaignRepo } from "@/lib/campaigns/repository";

export interface OverviewStats {
  pendingApproval: number; // nội dung + video chờ duyệt
  postsToday: number;
  leadsToday: number;
  alerts: number;
}

export function getOverview(): OverviewStats {
  const counts = pendingCounts();
  const today = dateKey(new Date());
  const posts = listPosts();
  const failed = posts.filter((p) => p.status === "failed").length;
  const workflowErrors = mockApprovals.filter((a) => a.kind === "workflow").length;
  return {
    pendingApproval: listContent(["review"]).length + counts.ideas + listVideos("pending_approval").length + campaignRepo.pendingApprovals().filter((a) => a.type === "campaign_change").length,
    postsToday: posts.filter((p) => dateKey(p.scheduledFor) === today).length,
    leadsToday: listLeads().filter((l) => l.stage === "new" && dateKey(l.lastMessageAt) === today).length,
    alerts: failed + workflowErrors,
  };
}

// Việc chờ xử lý kèm nhãn "đã chờ …", tính ở máy chủ để không lệch giờ khi hydrate.
export type PendingItem = ApprovalItem & { waited: string };

export function waitedLabel(sentAt: string, now = Date.now()): string {
  const mins = Math.max(0, Math.round((now - new Date(sentAt).getTime()) / 60000));
  if (mins < 60) return `đã chờ ${Math.max(1, mins)} phút`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `đã chờ ${hours} giờ`;
  return `đã chờ ${Math.round(hours / 24)} ngày`;
}

export function getPending(): PendingItem[] {
  const fromDb: ApprovalItem[] = listContent(["review", "proposed"]).map((c) => ({
    id: `ap-${c.id}`,
    title: c.status === "review" ? `Duyệt bài “${c.title}”` : `Ý tưởng “${c.title}” chờ nhận làm`,
    module: "Nội dung",
    moduleHref: c.status === "review" ? "/content?tab=mine" : "/content",
    actor: c.source === "ai" || c.assignee === "ai" ? "Agent viết nội dung" : "Tôi",
    actorType: c.source === "ai" || c.assignee === "ai" ? "agent" : "human",
    sentAt: c.createdAt,
    priority: (c.score ?? 0) >= 85 ? "high" : (c.score ?? 0) >= 70 ? "medium" : "low",
    kind: "content",
  }));
  const convs: ApprovalItem[] = listConversations()
    .filter((c) => c.needsHuman)
    .map((c) => ({
      id: `ap-${c.id}`,
      title: `Khách ${c.leadName} đang chờ trả lời`,
      module: "Khách hàng",
      moduleHref: `/customers?conv=${c.id}`,
      actor: "Agent chăm sóc khách",
      actorType: "agent",
      sentAt: c.messages[c.messages.length - 1]?.at ?? new Date().toISOString(),
      priority: "high",
      kind: "customer",
    }));
  // Chiến dịch gửi phê duyệt: đọc từ phân hệ Chiến dịch (dữ liệu dùng chung, không phải mẫu riêng).
  const campaigns: ApprovalItem[] = campaignRepo
    .pendingApprovals()
    .filter((a) => a.type === "campaign_change")
    .map((a) => ({
      id: `ap-${a.id}`,
      title: a.title,
      module: "Chiến dịch",
      moduleHref: `/campaigns/${a.campaignId}`,
      actor: a.requestedBy,
      actorType: "human",
      sentAt: a.requestedAt,
      priority: "high",
      kind: "campaign",
    }));
  // Video chờ phê duyệt: đọc từ Video Studio.
  const videos: ApprovalItem[] = listVideos("pending_approval").map((v) => ({
    id: `ap-${v.id}`,
    title: `Video “${v.title}” (bản dựng ${v.version})`,
    module: "Video Studio",
    moduleHref: "/video-studio?tab=pending_approval",
    actor: v.agent,
    actorType: "agent",
    sentAt: v.updatedAt,
    priority: "high",
    kind: "video",
  }));
  const order = { high: 0, medium: 1, low: 2 };
  const now = Date.now();
  return [...mockApprovals.filter((a) => a.kind !== "video"), ...videos, ...campaigns, ...convs, ...fromDb]
    .sort((a, b) => order[a.priority] - order[b.priority] || b.sentAt.localeCompare(a.sentAt))
    .map((a) => ({ ...a, waited: waitedLabel(a.sentAt, now) }));
}

// Tối đa N lịch của hôm nay: lịch đăng thật trong CSDL + DỮ LIỆU MẪU (video, chiến dịch, việc của tôi).
// Ưu tiên việc chưa xong tính từ giờ hiện tại, thiếu thì bù việc đã xong.
export function getTodaySchedule(limit = 5): TimelineItem[] {
  const now = new Date();
  const today = dateKey(now);
  const nowHm = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
  const platformName: Record<string, string> = { facebook: "Facebook", tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube", zalo: "Zalo" };
  const fromDb: TimelineItem[] = listPosts()
    .filter((p) => dateKey(p.scheduledFor) === today)
    .map((p) => ({
      id: `post-${p.id}`,
      time: new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(p.scheduledFor)),
      title: `${p.status === "failed" ? "Đăng lỗi" : "Đăng bài"} “${p.title}”`,
      kind: "post",
      platform: platformName[p.platform.toLowerCase()] ?? p.platform,
      status: p.status === "published" || p.status === "failed" ? "done" : "upcoming",
    }));
  const mock = mockTimeline.filter((t) => t.kind !== "post"); // bài đăng mẫu nhường chỗ cho bài đăng thật
  const sorted = [...fromDb, ...mock].sort((a, b) => a.time.localeCompare(b.time));
  const upcoming = sorted.filter((t) => t.status !== "done" && t.time >= nowHm);
  const rest = sorted.filter((t) => !upcoming.includes(t)).reverse();
  return [...upcoming, ...rest].slice(0, limit).sort((a, b) => a.time.localeCompare(b.time));
}

export function getAgents(): AgentInfo[] {
  return mockAgents;
}

export interface SystemStatus {
  level: "ok" | "warn" | "error";
  summary: string; // một dòng: "3 Agent đang hoạt động · 2 việc chờ duyệt · Không có lỗi nghiêm trọng"
  agents: AgentInfo[];
  issues: string[]; // lỗi đang có, hiển thị trong bảng chi tiết
}

export function getSystemStatus(pendingCount: number): SystemStatus {
  const agents = getAgents();
  const active = agents.filter((a) => a.status === "active" || a.status === "waiting" || a.status === "needs_approval").length;
  const issues: string[] = [];
  for (const a of agents) if (a.status === "error") issues.push(`${a.name}: ${a.task}`);
  for (const p of listPosts()) if (p.status === "failed") issues.push(`Đăng bài thất bại: “${p.title}”`);
  for (const a of mockApprovals) if (a.kind === "workflow") issues.push(a.title);
  const severe = agents.some((a) => a.status === "error") || listPosts().some((p) => p.status === "failed");
  return {
    level: severe ? "error" : issues.length ? "warn" : "ok",
    summary: [
      `${active} Agent đang hoạt động`,
      `${pendingCount} việc chờ duyệt`,
      severe ? `${issues.length} lỗi nghiêm trọng` : issues.length ? `${issues.length} lỗi nhẹ` : "Không có lỗi nghiêm trọng",
    ].join(" · "),
    agents,
    issues,
  };
}
