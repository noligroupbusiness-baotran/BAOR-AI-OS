import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AppShell } from "@/components/shell/app-shell";
import { pendingCounts } from "@/lib/queries";
import { campaignRepo } from "@/lib/campaigns/repository";
import { listVideos } from "@/lib/videos/repository";
import { getPending } from "@/lib/dashboard-data";
import { getHealth, getNotifications } from "@/lib/shell-data";
import { actorFor } from "@/lib/permissions";
import { getBrandLogos } from "@/lib/brand-logos";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const actor = actorFor(user.email);
  const counts = pendingCounts();
  const campaignsPending = campaignRepo.pendingApprovals().filter((a) => a.type === "campaign_change").length;
  const videoPending = listVideos("pending_approval").length;
  // Badge Điều hành = đúng số việc trong "Chờ tôi xử lý" để hai nơi nhất quán.
  const badges = {
    "/dashboard": getPending().length,
    "/campaigns": campaignsPending,
    "/content": counts.ideas + counts.mine,
    "/video-studio": videoPending,
    "/publishing": counts.ads,
    "/customers": counts.convs,
  };
  return (
    <AppShell user={{ email: actor.email, name: actor.name, role: actor.role, permission: actor.permission }} badges={badges} health={getHealth()} notifications={getNotifications()} logos={getBrandLogos()}>
      {children}
    </AppShell>
  );
}
