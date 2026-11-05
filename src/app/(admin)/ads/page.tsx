import { redirect } from "next/navigation";

// Quảng cáo nằm trong bước 4 · Kết quả (OWNER 05/11/2026: 4 bước). Đường dẫn cũ /ads mở đúng tab, giữ tham số.
export default async function AdsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const u = new URLSearchParams({ tab: "quang-cao" });
  for (const [k, v] of Object.entries(sp)) if (v && k !== "tab") u.set(k, v);
  redirect(`/insights/learning?${u.toString()}`);
}
