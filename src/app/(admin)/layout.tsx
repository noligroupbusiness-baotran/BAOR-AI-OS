import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Sidebar, MobileNav } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="min-w-0 flex-1">
        <MobileNav />
        <Topbar email={user.email} />
        <main className="w-full max-w-[1040px] px-4 pb-12 pt-3 md:px-7">{children}</main>
      </div>
    </div>
  );
}
