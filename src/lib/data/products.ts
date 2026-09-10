import type { Product } from "@/lib/campaigns/types";

// DỮ LIỆU MẪU danh mục sản phẩm / dịch vụ. Nguồn chuẩn sau này là Cài đặt › Sản phẩm và bảng giá.
// AI không được tự nghĩ ra giá hay công dụng; mọi phân hệ đọc giá từ danh mục này.
export const products: Product[] = [
  { id: "pr_md_goi", name: "Gội dưỡng sinh", brand: "Mộc Diệp Spa", price: 39000, unit: "lượt", description: "Gội đầu dưỡng sinh 45 phút, sản phẩm đầu vào để khách trải nghiệm." },
  { id: "pr_md_vaigay", name: "Massage cổ vai gáy", brand: "Mộc Diệp Spa", price: 149000, unit: "lượt", description: "Liệu trình 60 phút cho dân văn phòng." },
  { id: "pr_md_the", name: "Thẻ thành viên 10 lượt gội", brand: "Mộc Diệp Spa", price: 350000, unit: "thẻ", description: "Gói bán thêm sau lượt trải nghiệm đầu tiên." },
  { id: "pr_noli_seller", name: "Chương trình tuyển dụng Seller", brand: "Noli Sales", price: 0, unit: "vị trí", description: "Vị trí Seller lộ trình Seller → Closer → Leader, văn phòng TP.HCM." },
  { id: "pr_noli_care", name: "Gói chăm sóc khách hàng cũ", brand: "Noli Sales", price: 0, unit: "gói", description: "Chương trình nhắc mua lại và ưu đãi thành viên cho khách đã mua." },
  { id: "pr_serum", name: "Serum vitamin C", brand: "BAOR Skincare", price: 390000, unit: "chai", description: "Sản phẩm chủ lực của fanpage." },
  { id: "pr_combo3", name: "Combo 3 bước", brand: "BAOR Skincare", price: 690000, unit: "bộ", description: "Sữa rửa mặt, serum, kem dưỡng." },
];

export function productName(id: string): string {
  return products.find((p) => p.id === id)?.name ?? id;
}
