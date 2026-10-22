import { Pill } from "@/components/ui/pill";
import { approvalStatusLabel, campaignStatusLabel, goalStatusLabel } from "@/lib/campaigns/labels";
import type { ApprovalStatus, CampaignStatus, ChannelGoalStatus } from "@/lib/campaigns/types";

export function CampaignStatusPill({ status }: { status: CampaignStatus }) {
  const s = campaignStatusLabel[status];
  return (
    <Pill tone={s.tone}>
      {status === "active" && <span className="live" style={{ width: 6, height: 6 }} aria-hidden />}
      {s.label}
    </Pill>
  );
}

export function GoalStatusPill({ status }: { status: ChannelGoalStatus }) {
  const s = goalStatusLabel[status];
  return <Pill tone={s.tone}>{s.label}</Pill>;
}

export function ApprovalStatusPill({ status }: { status: ApprovalStatus }) {
  const s = approvalStatusLabel[status];
  return <Pill tone={s.tone}>{s.label}</Pill>;
}

// Tài khoản nền tảng: đã kết nối hay chưa (đọc từ Cài đặt › Kết nối).
export function AccountPill({ connected, name }: { connected: boolean; name: string }) {
  return connected ? <Pill tone="jade">{name}</Pill> : <Pill tone="amber">{name} · chưa kết nối</Pill>;
}
