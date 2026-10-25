import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AppShell } from "@/components/shell/app-shell";
import { pendingCounts } from "@/lib/queries";
import { campaignRepo } from "@/lib/campaigns/repository";
import { hooksAwaiting, leadsAwaiting, videosAwaitingOwner } from "@/lib/attention";
import { getPending } from "@/lib/dashboard-data";
import { getHealth, getNotifications } from "@/lib/shell-data";
import { actorFor } from "@/lib/permissions";
import { getBrandLogos } from "@/lib/brand-logos";
import { isSample } from "@/lib/sample";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const actor = actorFor(user.email);
  const counts = pendingCounts();
  // Chỉ yêu cầu duyệt của chiến dịch THẬT (chiến dịch mẫu không tạo việc cho OWNER — cùng quy tắc với /campaigns)
  const campaignsPending = campaignRepo.pendingApprovals().filter((a) => a.type === "campaign_change" && !isSample("campaign", a.campaignId)).length;
  // Badge Tổng quan = đúng số việc trong "Việc cần làm" để hai nơi nhất quán. Badge Video Studio / Hook = cùng nguồn với trang đích
  // và thẻ Hành trình (src/lib/attention.ts): video thật có tệp Chờ kiểm tra + Chờ phê duyệt; hook chờ chọn ở /content/hooks.
  // Badge Lead = lead thật giai đoạn "new" (chưa liên hệ), khớp tab Lead mà menu mở — không đếm hội thoại.
  const badges = {
    "/dashboard": getPending().length,
    "/campaigns": campaignsPending,
    "/content/hooks": hooksAwaiting(),
    "/video-studio": videosAwaitingOwner().length,
    "/ads": counts.ads,
    "/customers": leadsAwaiting(),
  };
  return (
    <AppShell user={{ email: actor.email, name: actor.name, role: actor.role, permission: actor.permission }} badges={badges} health={getHealth()} notifications={getNotifications()} logos={getBrandLogos()}>
      {children}
    </AppShell>
  );
}
