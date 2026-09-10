import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AppShell } from "@/components/shell/app-shell";
import { pendingCounts } from "@/lib/queries";
import { listVideos } from "@/lib/videos/repository";
import { campaignRepo } from "@/lib/campaigns/repository";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const counts = pendingCounts();
  const campaignsPending = campaignRepo.pendingApprovals().filter((a) => a.type === "campaign_change").length;
  const mockVideoPending = listVideos("pending_approval").length;
  const badges = {
    "/dashboard": counts.ideas + counts.ads + counts.convs + mockVideoPending + campaignsPending,
    "/campaigns": campaignsPending,
    "/content": counts.ideas,
    "/video-studio": mockVideoPending,
    "/publishing": counts.ads,
    "/customers": counts.convs,
  };
  return (
    <AppShell email={user.email} badges={badges}>
      {children}
    </AppShell>
  );
}
