import { redirect } from "next/navigation";

// /insights cũ đã gộp vào Bước 1 · Chủ đề & insight › tab "Insight" (OWNER 26/10/2026). Giữ tham số khác (campaign, add, competitor…).
export default async function InsightsRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (k !== "tab" && typeof v === "string") q.set(k, v);
  redirect(`/insights/research?tab=insight${q.size ? `&${q.toString()}` : ""}`);
}
