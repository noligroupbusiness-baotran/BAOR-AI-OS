// Đơn hàng và doanh thu. Giao diện và báo cáo chỉ đọc qua đây.
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { campaignRepo } from "@/lib/campaigns/repository";
import { catalogRepo } from "@/lib/catalog/repository";

export type OrderStatus = "new" | "paid" | "cancelled";

export interface OrderRecord {
  id: string;
  leadId: string | null;
  leadName: string;
  campaignId: string | null;
  campaignName: string | null;
  channelGoalId: string | null;
  productId: string | null;
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
  status: OrderStatus;
  note: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export const orderStatusLabel: Record<OrderStatus, { label: string; tone: "amber" | "jade" | "neutral" }> = {
  new: { label: "Mới", tone: "amber" },
  paid: { label: "Đã thanh toán", tone: "jade" },
  cancelled: { label: "Đã hủy", tone: "neutral" },
};

const newId = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const nowIso = () => new Date().toISOString();

export interface NewOrderInput {
  leadId: string | null;
  leadName?: string;
  productId: string;
  quantity: number;
  unitPrice?: number; // mặc định lấy từ danh mục; chỉ Quản lý mới được sửa giá
  campaignId?: string | null;
  channelGoalId?: string | null;
  status?: OrderStatus;
  note?: string;
  createdBy: string;
}

export function listOrders(filter: { campaignId?: string; leadId?: string; status?: OrderStatus } = {}): OrderRecord[] {
  const db = getDb();
  const rows = db.select({ o: schema.orders, campaignName: schema.campaigns.name }).from(schema.orders).leftJoin(schema.campaigns, eq(schema.campaigns.id, schema.orders.campaignId)).orderBy(desc(schema.orders.createdAt)).all();
  return rows
    .map(({ o, campaignName }) => ({ ...o, status: o.status as OrderStatus, campaignName: campaignName ?? null }))
    .filter((o) => (filter.campaignId ? o.campaignId === filter.campaignId : true))
    .filter((o) => (filter.leadId ? o.leadId === filter.leadId : true))
    .filter((o) => (filter.status ? o.status === filter.status : true));
}

export function getOrder(id: string): OrderRecord | undefined {
  return listOrders().find((o) => o.id === id);
}

export function createOrder(input: NewOrderInput): OrderRecord {
  const db = getDb();
  const product = catalogRepo.getProduct(input.productId);
  if (!product) throw new Error("Sản phẩm không có trong danh mục.");
  const lead = input.leadId ? db.select().from(schema.leads).where(eq(schema.leads.id, input.leadId)).get() : undefined;
  // Chiến dịch kế thừa từ lead nếu không chỉ định (truy ngược: đơn ← lead ← quảng cáo / bài đăng ← chiến dịch).
  let campaignId = input.campaignId ?? null;
  let channelGoalId = input.channelGoalId ?? null;
  if (!campaignId && lead) {
    const link = campaignRepo.linksForEntities("lead", [lead.id]).get(lead.id)?.[0];
    if (link) {
      campaignId = link.campaignId;
      channelGoalId = link.channelGoalId;
    }
  }
  const quantity = Math.max(1, Math.round(input.quantity));
  const unitPrice = input.unitPrice ?? product.price;
  const now = nowIso();
  const row = {
    id: newId("od"),
    leadId: lead?.id ?? null,
    leadName: lead?.name ?? input.leadName ?? "Khách lẻ",
    campaignId,
    channelGoalId,
    productId: product.id,
    productName: product.name,
    quantity,
    unitPrice,
    total: quantity * unitPrice,
    status: input.status ?? "new",
    note: input.note ?? "",
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(schema.orders).values(row).run();
  if (campaignId) {
    campaignRepo.addLink({ campaignId, channelGoalId, entityType: "order", entityId: row.id, status: row.status, ownerId: null, viaType: lead ? "lead" : null, viaId: lead?.id ?? null });
    if (row.status === "paid") campaignRepo.addLink({ campaignId, channelGoalId, entityType: "revenue", entityId: row.id, status: "paid", ownerId: null, viaType: "order", viaId: row.id });
  }
  if (lead && row.status === "paid") {
    db.update(schema.leads).set({ stage: "won" }).where(eq(schema.leads.id, lead.id)).run();
    campaignRepo.syncEntityStatus("lead", lead.id, "won");
  }
  return getOrder(row.id)!;
}

export function setOrderStatus(id: string, status: OrderStatus): OrderRecord | undefined {
  const db = getDb();
  const o = getOrder(id);
  if (!o) return undefined;
  db.update(schema.orders).set({ status, updatedAt: nowIso() }).where(eq(schema.orders.id, id)).run();
  campaignRepo.syncEntityStatus("order", id, status);
  if (o.campaignId) {
    if (status === "paid") campaignRepo.addLink({ campaignId: o.campaignId, channelGoalId: o.channelGoalId, entityType: "revenue", entityId: id, status: "paid", ownerId: null, viaType: "order", viaId: id });
    else campaignRepo.removeLink(o.campaignId, "revenue", id);
  }
  if (o.leadId) {
    if (status === "paid") {
      db.update(schema.leads).set({ stage: "won" }).where(eq(schema.leads.id, o.leadId)).run();
      campaignRepo.syncEntityStatus("lead", o.leadId, "won");
    } else if (status === "cancelled") {
      const others = listOrders({ leadId: o.leadId, status: "paid" }).filter((x) => x.id !== id);
      if (others.length === 0) {
        db.update(schema.leads).set({ stage: "qualified" }).where(eq(schema.leads.id, o.leadId)).run();
        campaignRepo.syncEntityStatus("lead", o.leadId, "qualified");
      }
    }
  }
  return getOrder(id);
}

// Tổng hợp doanh thu cho một chiến dịch (chỉ đơn đã thanh toán).
export function campaignRevenue(campaignId: string): { orders: number; revenue: number; pending: number } {
  const rows = getDb().select().from(schema.orders).where(and(eq(schema.orders.campaignId, campaignId), inArray(schema.orders.status, ["new", "paid"]))).all();
  const paid = rows.filter((r) => r.status === "paid");
  return { orders: paid.length, revenue: paid.reduce((n, r) => n + r.total, 0), pending: rows.length - paid.length };
}
