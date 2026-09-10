import type { Person } from "@/lib/campaigns/types";

// DỮ LIỆU MẪU nhân sự phụ trách. Nguồn chuẩn sau này là Cài đặt › Nhân sự và phân quyền.
export const people: Person[] = [
  { id: "u_thu", name: "Anh Thư", role: "Quản lý Marketing" },
  { id: "u_khoa", name: "Minh Khoa", role: "Nội dung" },
  { id: "u_han", name: "Ngọc Hân", role: "Quảng cáo" },
  { id: "u_vy", name: "Thảo Vy", role: "Chăm sóc khách hàng" },
  { id: "u_dung", name: "Quốc Dũng", role: "Video" },
  { id: "u_lam", name: "Hoàng Lâm", role: "Tuyển dụng Noli Sales" },
];

export function personName(id: string | null | undefined): string {
  return people.find((p) => p.id === id)?.name ?? "Chưa phân công";
}
