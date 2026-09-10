// DỮ LIỆU MẪU nạp lần đầu vào bảng people (Cài đặt › Nhân sự và phân quyền).
// Sau khi nạp, nguồn chuẩn là CSDL; sửa ở Cài đặt, không sửa tệp này.
export interface PersonSeed {
  id: string;
  name: string;
  role: string;
  email: string;
  permission: "admin" | "manager" | "staff";
}

export const people: PersonSeed[] = [
  { id: "u_thu", name: "Anh Thư", role: "Quản lý Marketing", email: "thu@example.com", permission: "manager" },
  { id: "u_khoa", name: "Minh Khoa", role: "Nội dung", email: "khoa@example.com", permission: "staff" },
  { id: "u_han", name: "Ngọc Hân", role: "Quảng cáo", email: "han@example.com", permission: "staff" },
  { id: "u_vy", name: "Thảo Vy", role: "Chăm sóc khách hàng", email: "vy@example.com", permission: "staff" },
  { id: "u_dung", name: "Quốc Dũng", role: "Video", email: "dung@example.com", permission: "staff" },
  { id: "u_lam", name: "Hoàng Lâm", role: "Tuyển dụng Noli Sales", email: "lam@example.com", permission: "manager" },
];
