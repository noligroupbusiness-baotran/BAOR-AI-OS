import { getCurrentUser } from "@/lib/auth";
import { actorFor, can } from "@/lib/permissions";
import { listLeads } from "@/lib/queries";
import { findSegment, leadsToCsv } from "@/lib/customers/segments";
import { logActivity } from "@/lib/activity";
import { RATE_RULES, limitOr429 } from "@/lib/rate-limit";

// Xuất CSV danh sách khách theo nhóm (Phân Data). Chỉ Quản lý trở lên vì đây là dữ liệu cá nhân của khách.
export const runtime = "nodejs";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Chưa đăng nhập", { status: 401 });
  const actor = actorFor(user.email);
  if (!can(actor, "manager")) return new Response("Cần quyền Quản lý để xuất dữ liệu khách hàng", { status: 403 });
  const limited = limitOr429(`export:${actor.email}`, RATE_RULES.export);
  if (limited) return limited;
  const key = new URL(req.url).searchParams.get("segment") ?? "";
  const leads = listLeads();
  const seg = key ? findSegment(key, leads) : { key: "all", label: "Tất cả lead", leads };
  if (!seg) return new Response("Không tìm thấy nhóm", { status: 404 });
  const csv = leadsToCsv(seg.leads);
  logActivity("human", `${actor.name} xuất CSV ${seg.leads.length} khách, nhóm “${seg.label}”.`, "customers");
  const name = `khach-hang-${seg.key.replace(/[^a-z0-9_-]+/gi, "-")}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
  });
}
