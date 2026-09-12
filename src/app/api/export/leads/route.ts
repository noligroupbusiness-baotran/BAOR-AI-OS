import { getCurrentUser } from "@/lib/auth";
import { actorFor, can } from "@/lib/permissions";
import { listLeads } from "@/lib/queries";
import { listOrders } from "@/lib/orders/repository";
import { findSegment, leadsToCsv, spendByLead } from "@/lib/customers/segments";
import { logActivity } from "@/lib/activity";

// Xuất CSV danh sách khách theo nhóm (Phân Data). Chỉ Quản lý trở lên vì đây là dữ liệu cá nhân của khách.
export const runtime = "nodejs";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Chưa đăng nhập", { status: 401 });
  const actor = actorFor(user.email);
  if (!can(actor, "manager")) return new Response("Cần quyền Quản lý để xuất dữ liệu khách hàng", { status: 403 });
  const key = new URL(req.url).searchParams.get("segment") ?? "";
  const leads = listLeads();
  const orders = listOrders();
  const seg = key ? findSegment(key, leads, orders) : { key: "all", label: "Tất cả khách hàng", leads };
  if (!seg) return new Response("Không tìm thấy nhóm", { status: 404 });
  const csv = leadsToCsv(seg.leads, spendByLead(orders));
  logActivity("human", `${actor.name} xuất CSV ${seg.leads.length} khách, nhóm “${seg.label}”.`, "customers");
  const name = `khach-hang-${seg.key.replace(/[^a-z0-9_-]+/gi, "-")}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
  });
}
