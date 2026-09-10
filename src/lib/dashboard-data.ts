// Lớp dữ liệu cho màn Điều hành. Gom số liệu thật từ CSDL (nội dung, khách hàng, lịch đăng)
// với DỮ LIỆU MẪU (video, Agent, lịch hoạt động). Khi có API thật, chỉ thay ở đây.
import { listActivity, listContent, listConversations, listPosts, pendingCounts } from "@/lib/queries";
import { mockAgents, mockApprovals, mockTimeline, mockVideoPending, type ApprovalItem } from "@/lib/mock/dashboard";
import { dateKey } from "@/lib/format";

export interface OverviewStats {
  inProgress: number;
  contentPending: number;
  videoPending: number;
  postsToday: number;
  alerts: number;
}

export function getOverview(): OverviewStats {
  const counts = pendingCounts();
  const today = dateKey(new Date());
  const postsToday = listPosts().filter((p) => dateKey(p.scheduledFor) === today).length;
  const failed = listPosts().filter((p) => p.status === "failed").length;
  const workflowErrors = mockApprovals.filter((a) => a.kind === "workflow").length;
  return {
    inProgress: listContent(["in_progress"]).length,
    contentPending: listContent(["review"]).length + counts.ideas,
    videoPending: mockVideoPending,
    postsToday,
    alerts: failed + workflowErrors + counts.convs,
  };
}

export function getApprovals(): ApprovalItem[] {
  const fromDb: ApprovalItem[] = listContent(["review", "proposed"]).map((c) => ({
    id: `ap-${c.id}`,
    title: c.status === "review" ? `Duyệt bài “${c.title}”` : `Ý tưởng “${c.title}” chờ anh nhận làm`,
    module: "Nội dung",
    moduleHref: c.status === "review" ? "/content?tab=mine" : "/content",
    actor: c.source === "ai" || c.assignee === "ai" ? "Agent viết nội dung" : "Anh",
    actorType: c.source === "ai" || c.assignee === "ai" ? "agent" : "human",
    sentAt: c.createdAt,
    priority: (c.score ?? 0) >= 85 ? "high" : (c.score ?? 0) >= 70 ? "medium" : "low",
    kind: "content",
  }));
  const convs: ApprovalItem[] = listConversations()
    .filter((c) => c.needsHuman)
    .map((c) => ({
      id: `ap-${c.id}`,
      title: `Khách ${c.leadName} đang chờ anh trả lời`,
      module: "Khách hàng",
      moduleHref: `/customers?conv=${c.id}`,
      actor: "Agent chăm sóc khách",
      actorType: "agent",
      sentAt: c.messages[c.messages.length - 1]?.at ?? new Date().toISOString(),
      priority: "high",
      kind: "workflow",
    }));
  const order = { high: 0, medium: 1, low: 2 };
  return [...mockApprovals, ...convs, ...fromDb].sort((a, b) => order[a.priority] - order[b.priority] || b.sentAt.localeCompare(a.sentAt)).slice(0, 8);
}

export function getTimeline() {
  return mockTimeline;
}

export function getAgents() {
  return mockAgents;
}

export function getRecentActivity() {
  return listActivity(8);
}
