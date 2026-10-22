// DỮ LIỆU MẪU đối thủ (Nghiên cứu & Insight › Đối thủ). Xóa bằng "Xóa dữ liệu mẫu" trong Cài đặt.
export const competitors = [
  {
    id: "cmp_sample_anspa",
    name: "An Spa Gò Vấp",
    brand: "Mộc Diệp Spa",
    positioning: "Spa gội dưỡng sinh giá rẻ, đông khách, nhiều chi nhánh.",
    channels: [{ platform: "facebook", url: "https://facebook.com/anspa.govap", followers: 28000 }, { platform: "tiktok", url: "https://tiktok.com/@anspa", followers: 41000 }],
    offers: [
      { name: "Gội đầu dưỡng sinh", price: 45000, unit: "lượt" },
      { name: "Massage cổ vai gáy 60 phút", price: 129000, unit: "lượt" },
      { name: "Thẻ 10 lượt gội", price: 390000, unit: "thẻ" },
    ],
    strengths: ["Video TikTok đều 1 ngày 1 clip", "Nhiều chi nhánh, đặt lịch qua Zalo nhanh"],
    weaknesses: ["Review than phòng ồn, đông", "Không có gói cho dân văn phòng"],
    note: "Khách của họ hay hỏi giá thẻ thành viên trong bình luận.",
    lastCheckedAt: "2026-09-05",
  },
  {
    id: "cmp_sample_herbal",
    name: "Herbal House",
    brand: "Mộc Diệp Spa",
    positioning: "Spa thảo dược cao cấp, không gian đẹp, giá cao.",
    channels: [{ platform: "facebook", url: "https://facebook.com/herbalhouse.vn", followers: 15000 }, { platform: "instagram", url: "https://instagram.com/herbalhouse.vn", followers: 9000 }],
    offers: [
      { name: "Gội dưỡng sinh thảo mộc", price: 89000, unit: "lượt" },
      { name: "Massage cổ vai gáy", price: 219000, unit: "lượt" },
    ],
    strengths: ["Ảnh đẹp, thương hiệu nhất quán", "Nhiều review 5 sao trên Google"],
    weaknesses: ["Ít video, tương tác thấp", "Giá cao so với khu vực"],
    note: "",
    lastCheckedAt: "2026-09-08",
  },
];
