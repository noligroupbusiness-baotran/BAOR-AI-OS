"use server";

import { catalogRepo, type Permission } from "@/lib/catalog/repository";
import { done, logActivity } from "./common";

// Cài đặt › Sản phẩm và bảng giá, Nhân sự và phân quyền. Đây là nguồn dữ liệu chuẩn cho mọi phân hệ.
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string) => Number(String(fd.get(k) ?? "").replace(/[^\d]/g, "")) || 0;
const fail = (path: string, msg: string): never => done(`${path}${path.includes("?") ? "&" : "?"}tone=error`, msg);

export async function saveProduct(fd: FormData) {
  const id = str(fd, "id") || undefined;
  const name = str(fd, "name");
  if (!name) return fail("/settings#products", "Cần nhập tên sản phẩm hoặc dịch vụ");
  const p = catalogRepo.saveProduct({ id, name, brand: str(fd, "brand"), price: num(fd, "price"), unit: str(fd, "unit") || "lượt", description: str(fd, "description") });
  logActivity("human", `${id ? "Cập nhật" : "Thêm"} sản phẩm “${p.name}” (${p.price.toLocaleString("vi-VN")} ₫).`, "settings");
  done("/settings#products", id ? "Đã cập nhật sản phẩm" : "Đã thêm sản phẩm");
}

export async function toggleProduct(fd: FormData) {
  const id = str(fd, "id");
  const p = catalogRepo.getProduct(id);
  if (!p) return fail("/settings#products", "Không tìm thấy sản phẩm");
  catalogRepo.setProductActive(id, !p.active);
  logActivity("human", `${p.active ? "Ngừng dùng" : "Dùng lại"} sản phẩm “${p.name}”.`, "settings");
  done("/settings#products", p.active ? "Đã ngừng dùng. Chiến dịch cũ vẫn giữ tham chiếu." : "Đã dùng lại sản phẩm");
}

export async function savePerson(fd: FormData) {
  const id = str(fd, "id") || undefined;
  const name = str(fd, "name");
  if (!name) return fail("/settings#people", "Cần nhập tên nhân sự");
  const permission = (["admin", "manager", "staff"] as Permission[]).includes(str(fd, "permission") as Permission) ? (str(fd, "permission") as Permission) : "staff";
  const p = catalogRepo.savePerson({ id, name, role: str(fd, "role"), email: str(fd, "email").toLowerCase(), permission });
  logActivity("human", `${id ? "Cập nhật" : "Thêm"} nhân sự ${p.name} (${p.role || "chưa có vai trò"}).`, "settings");
  done("/settings#people", id ? "Đã cập nhật nhân sự" : "Đã thêm nhân sự");
}

export async function togglePerson(fd: FormData) {
  const id = str(fd, "id");
  const p = catalogRepo.getPerson(id);
  if (!p) return fail("/settings#people", "Không tìm thấy nhân sự");
  catalogRepo.setPersonActive(id, !p.active);
  logActivity("human", `${p.active ? "Ngừng hoạt động" : "Kích hoạt lại"} nhân sự ${p.name}.`, "settings");
  done("/settings#people", p.active ? "Đã ngừng hoạt động. Việc đang phụ trách vẫn giữ tên." : "Đã kích hoạt lại");
}
