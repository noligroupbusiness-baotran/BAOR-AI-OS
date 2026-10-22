"use server";

import { createOrder, setOrderStatus, type OrderStatus } from "@/lib/orders/repository";
import { catalogRepo } from "@/lib/catalog/repository";
import { currentActor, requirePermission } from "@/lib/permissions";
import { recordDecision } from "@/lib/router";
import { done, logActivity } from "./common";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string) => Number(String(fd.get(k) ?? "").replace(/[^\d]/g, "")) || 0;
const fail = (path: string, msg: string): never => done(`${path}${path.includes("?") ? "&" : "?"}tone=error`, msg);

export async function createOrderAction(fd: FormData) {
  const actor = await currentActor();
  const back = str(fd, "back") || "/customers?tab=orders";
  const productId = str(fd, "productId");
  const product = catalogRepo.getProduct(productId);
  if (!product || !product.active) return fail(`${back}&add=1`, "Cần chọn sản phẩm đang dùng trong danh mục");
  const quantity = num(fd, "quantity") || 1;
  // Giá luôn lấy từ danh mục; Quản lý trở lên mới được ghi giá khác (giảm giá, thỏa thuận).
  const customPrice = str(fd, "unitPrice") ? num(fd, "unitPrice") : undefined;
  let unitPrice = product.price;
  if (customPrice !== undefined && customPrice !== product.price) {
    if (actor.permission === "staff") return fail(`${back}&add=1`, "Nhân viên không được sửa giá; giá lấy theo danh mục.");
    unitPrice = customPrice;
    recordDecision({ lane: "human", domain: "campaign", subject: `Giá khác danh mục cho “${product.name}”`, outcome: `${product.price.toLocaleString("vi-VN")} → ${unitPrice.toLocaleString("vi-VN")} ₫`, reason: `Do ${actor.name} (${actor.permission}) quyết định.`, needsApproval: false });
  }
  const status = (["new", "paid"] as OrderStatus[]).includes(str(fd, "status") as OrderStatus) ? (str(fd, "status") as OrderStatus) : "new";
  const order = createOrder({
    leadId: str(fd, "leadId") || null,
    leadName: str(fd, "leadName") || undefined,
    productId,
    quantity,
    unitPrice,
    campaignId: str(fd, "campaignId") || null,
    channelGoalId: str(fd, "channelGoalId") || null,
    status,
    note: str(fd, "note"),
    createdBy: actor.email,
  });
  logActivity("human", `Tạo đơn ${order.productName} × ${order.quantity} cho ${order.leadName}: ${order.total.toLocaleString("vi-VN")} ₫${order.campaignName ? ` (chiến dịch ${order.campaignName})` : ""}.`, "customers");
  done(back, `Đã tạo đơn ${order.total.toLocaleString("vi-VN")} ₫${status === "paid" ? ", lead chuyển sang Đã mua" : ""}`);
}

export async function setOrderStatusAction(fd: FormData) {
  const back = str(fd, "back") || "/customers?tab=orders";
  const status = str(fd, "status") as OrderStatus;
  if (!["new", "paid", "cancelled"].includes(status)) return fail(back, "Trạng thái không hợp lệ");
  if (status === "cancelled") await requirePermission("manager", back);
  const o = setOrderStatus(str(fd, "id"), status);
  if (!o) return fail(back, "Không tìm thấy đơn");
  logActivity("human", `Đơn ${o.productName} của ${o.leadName}: ${status === "paid" ? "đã thanh toán" : status === "cancelled" ? "đã hủy" : "chuyển về mới"}.`, "customers");
  done(back, status === "paid" ? "Đã ghi nhận thanh toán, doanh thu cập nhật vào chiến dịch" : status === "cancelled" ? "Đã hủy đơn" : "Đã cập nhật");
}
