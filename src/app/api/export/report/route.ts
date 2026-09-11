import { getCurrentUser } from "@/lib/auth";
import { actorFor, can } from "@/lib/permissions";
import { REPORT_CSV_TABS, reportCsv, type ReportCsvTab } from "@/lib/reports/csv";
import { logActivity } from "@/lib/activity";

// Xuất báo cáo CSV theo tab và bộ lọc của trang Báo cáo. Cần Quản lý.
export const runtime = "nodejs";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Chưa đăng nhập", { status: 401 });
  const actor = actorFor(user.email);
  if (!can(actor, "manager")) return new Response("Cần quyền Quản lý để xuất báo cáo", { status: 403 });
  const sp = new URL(req.url).searchParams;
  const tab = (sp.get("tab") ?? "overview") as ReportCsvTab;
  if (!REPORT_CSV_TABS.includes(tab)) return new Response("Tab không hợp lệ", { status: 400 });
  const month = sp.get("month") ?? "";
  const { name, csv } = reportCsv(tab, { month: /^\d{4}-\d{2}$/.test(month) ? month : undefined, campaignId: sp.get("campaign") || undefined });
  logActivity("human", `${actor.name} xuất CSV báo cáo (${tab}${month ? `, tháng ${month}` : ""}).`, "reports");
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" } });
}
