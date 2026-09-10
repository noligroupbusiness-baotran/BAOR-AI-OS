import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen">
      <Suspense fallback={null}>
        <Sidebar />
      </Suspense>
      <div className="md:pl-[var(--sidebar-w)]">
        <Topbar email={user.email} />
        <main className="mx-auto max-w-[1280px] px-5 py-5">{children}</main>
      </div>
    </div>
  );
}
