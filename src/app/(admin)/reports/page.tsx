import { redirect } from "next/navigation";

// /reports cũ đã gộp vào Bước 7 · Đo lường › tab "Số liệu" (OWNER 26/10/2026). ?tab= cũ (tab con của báo cáo) đổi thành ?view=.
export default async function ReportsRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = new URLSearchParams({ tab: "so-lieu" });
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string") q.set(k === "tab" ? "view" : k, v);
  redirect(`/insights/learning?${q.toString()}`);
}
