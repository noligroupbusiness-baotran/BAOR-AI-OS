import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Sidebar, MobileNav } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { Toast } from "@/components/ui/toast";
import { pendingCounts } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const counts = pendingCounts();
  const badges = {
    "/dashboard": counts.ideas + counts.ads + counts.convs,
    "/content": counts.ideas,
    "/publishing": counts.ads,
    "/customers": counts.convs,
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar badges={badges} />
      <div className="min-w-0 flex-1">
        <MobileNav badges={badges} />
        <Topbar email={user.email} />
        <main className="w-full max-w-[1040px] px-4 pb-12 pt-3 md:px-7">{children}</main>
      </div>
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
    </div>
  );
}
