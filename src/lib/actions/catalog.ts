"use server";

import { catalogRepo, type Permission } from "@/lib/catalog/repository";
import { requirePermission } from "@/lib/permissions";
import { checkPassword } from "@/lib/password-policy";
import { logSecurityEvent, revokeAllSessions } from "@/lib/security";
import { done, logActivity } from "./common";

// Cài đặt › Sản phẩm và bảng giá, Nhân sự và phân quyền. Đây là nguồn dữ liệu chuẩn cho mọi phân hệ.
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string) => Number(String(fd.get(k) ?? "").replace(/[^\d]/g, "")) || 0;
const fail = (path: string, msg: string): never => done(`${path}${path.includes("?") ? "&" : "?"}tone=error`, msg);

export async function saveProduct(fd: FormData) {
  await requirePermission("manager", "/settings#products");
  const id = str(fd, "id") || undefined;
  const name = str(fd, "name");
  if (!name) return fail("/settings#products", "Cần nhập tên sản phẩm hoặc dịch vụ");
  const p = catalogRepo.saveProduct({ id, name, brand: str(fd, "brand"), price: num(fd, "price"), unit: str(fd, "unit") || "lượt", description: str(fd, "description") });
  logActivity("human", `${id ? "Cập nhật" : "Thêm"} sản phẩm “${p.name}” (${p.price.toLocaleString("vi-VN")} ₫).`, "settings");
  done("/settings#products", id ? "Đã cập nhật sản phẩm" : "Đã thêm sản phẩm");
}

export async function toggleProduct(fd: FormData) {
  await requirePermission("manager", "/settings#products");
  const id = str(fd, "id");
  const p = catalogRepo.getProduct(id);
  if (!p) return fail("/settings#products", "Không tìm thấy sản phẩm");
  catalogRepo.setProductActive(id, !p.active);
  logActivity("human", `${p.active ? "Ngừng dùng" : "Dùng lại"} sản phẩm “${p.name}”.`, "settings");
  done("/settings#products", p.active ? "Đã ngừng dùng. Chiến dịch cũ vẫn giữ tham chiếu." : "Đã dùng lại sản phẩm");
}

export async function savePerson(fd: FormData) {
  const actor = await requirePermission("admin", "/settings#people");
  const id = str(fd, "id") || undefined;
  const name = str(fd, "name");
  if (!name) return fail("/settings#people", "Cần nhập tên nhân sự");
  const permission = (["admin", "manager", "staff"] as Permission[]).includes(str(fd, "permission") as Permission) ? (str(fd, "permission") as Permission) : "staff";
  const password = str(fd, "password");
  const email = str(fd, "email").toLowerCase();
  if (password) {
    const policy = checkPassword(password, { email, name });
    if (!policy.ok) return fail("/settings#people", `Mật khẩu đăng nhập: ${policy.reason}`);
  }
  if (password && !email) return fail("/settings#people", "Cần email để cấp quyền đăng nhập");
  const before = id ? catalogRepo.getPerson(id) : undefined;
  const p = catalogRepo.savePerson({ id, name, role: str(fd, "role"), email, permission, password: password || undefined });
  // Đặt lại mật khẩu hoặc đổi quyền: ghi sự kiện bảo mật và đăng xuất mọi phiên của người đó.
  if (password && email) {
    revokeAllSessions(email);
    logSecurityEvent("password_set_by_admin", { email, detail: `bởi ${actor.email}` });
  }
  if (before && before.permission !== permission) {
    if (before.email) revokeAllSessions(before.email);
    logSecurityEvent("permission_changed", { email: before.email || email, detail: `${before.permission} → ${permission}, bởi ${actor.email}` });
  }
  logActivity("human", `${id ? "Cập nhật" : "Thêm"} nhân sự ${p.name} (${p.role || "chưa có vai trò"}).`, "settings");
  done("/settings#people", id ? "Đã cập nhật nhân sự" : "Đã thêm nhân sự");
}

export async function togglePerson(fd: FormData) {
  await requirePermission("admin", "/settings#people");
  const id = str(fd, "id");
  const p = catalogRepo.getPerson(id);
  if (!p) return fail("/settings#people", "Không tìm thấy nhân sự");
  catalogRepo.setPersonActive(id, !p.active);
  // Ngừng hoạt động: thu hồi mọi phiên đang mở của người đó ngay lập tức.
  if (p.active && p.email) {
    revokeAllSessions(p.email);
    logSecurityEvent("sessions_revoked", { email: p.email, detail: "ngừng hoạt động nhân sự" });
  }
  logActivity("human", `${p.active ? "Ngừng hoạt động" : "Kích hoạt lại"} nhân sự ${p.name}.`, "settings");
  done("/settings#people", p.active ? "Đã ngừng hoạt động. Việc đang phụ trách vẫn giữ tên." : "Đã kích hoạt lại");
}
