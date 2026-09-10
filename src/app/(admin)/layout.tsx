import { getAdminEmail } from "@/lib/admin";
import { AppShell } from "@/components/shell/app-shell";
import { pendingCounts } from "@/lib/queries";
import { mockVideoPending } from "@/lib/mock/dashboard";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const email = getAdminEmail();
  const counts = pendingCounts();
  const badges = {
    "/dashboard": counts.ideas + counts.ads + counts.convs + mockVideoPending,
    "/content": counts.ideas,
    "/video-studio": mockVideoPending,
    "/publishing": counts.ads,
    "/customers": counts.convs,
  };
  return (
    <AppShell email={email} badges={badges}>
      {children}
    </AppShell>
  );
}
