import { redirect } from "next/navigation";

// /automation cũ đã gộp vào Cài đặt › Tự động (OWNER 26/10/2026). ?tab= cũ (tab con của quy tắc) đổi thành ?rules=.
export default async function AutomationRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = new URLSearchParams({ tab: "tu-dong" });
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string") q.set(k === "tab" ? "rules" : k, v);
  redirect(`/settings?${q.toString()}#rules`);
}
