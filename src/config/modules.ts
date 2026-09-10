// Nhóm chức năng của từng phân hệ. "active" = đã có màn hình làm việc, "planned" = sắp triển khai.
export type GroupStatus = "active" | "planned";

export interface ModuleGroup {
  name: string;
  status: GroupStatus;
  href?: string; // liên kết tới màn hình đã có (nếu active)
}

export const moduleGroups: Record<string, ModuleGroup[]> = {
  campaigns: [
    { name: "Danh sách chiến dịch", status: "planned" },
    { name: "Mục tiêu", status: "planned" },
    { name: "Ngân sách", status: "planned" },
    { name: "Thời gian", status: "planned" },
    { name: "Trạng thái", status: "planned" },
    { name: "Kết quả tổng quan", status: "planned" },
  ],
  insights: [
    { name: "Chân dung khách hàng", status: "active", href: "/insights#personas" },
    { name: "Nỗi đau và mong muốn", status: "active", href: "/insights#personas" },
    { name: "Câu hỏi thường gặp", status: "planned" },
    { name: "Đối thủ", status: "planned" },
    { name: "Xu hướng", status: "active", href: "/insights#channels" },
    { name: "Ngân hàng Insight", status: "active", href: "/insights#insights" },
  ],
  content: [
    { name: "Ý tưởng", status: "active", href: "/content?tab=proposed" },
    { name: "Bài viết", status: "active", href: "/content?tab=mine" },
    { name: "Kịch bản video", status: "planned" },
    { name: "Caption", status: "planned" },
    { name: "Hình ảnh", status: "planned" },
    { name: "Nội dung chờ duyệt", status: "active", href: "/content?tab=mine" },
  ],
  "video-studio": [
    { name: "Video gốc", status: "planned" },
    { name: "Video đang được Agent dựng", status: "planned" },
    { name: "Video chờ kiểm tra", status: "planned" },
    { name: "Video cần chỉnh sửa", status: "planned" },
    { name: "Video chờ phê duyệt", status: "planned" },
    { name: "Video đã phê duyệt", status: "planned" },
    { name: "Phiên bản video theo từng nền tảng", status: "planned" },
  ],
  publishing: [
    { name: "Lịch nội dung", status: "active", href: "/publishing" },
    { name: "Hàng chờ đăng", status: "active", href: "/publishing" },
    { name: "Nội dung đã đăng", status: "active", href: "/publishing" },
    { name: "Tài khoản kết nối", status: "active", href: "/settings" },
    { name: "Quảng cáo", status: "active", href: "/publishing" },
    { name: "Lỗi đăng bài", status: "active", href: "/publishing" },
  ],
  customers: [
    { name: "Lead mới", status: "active", href: "/customers?tab=leads" },
    { name: "Khách hàng", status: "active", href: "/customers?tab=leads" },
    { name: "Phân Data", status: "planned" },
    { name: "Trạng thái chăm sóc", status: "active", href: "/customers?tab=inbox" },
    { name: "Lịch sử tương tác", status: "active", href: "/customers?tab=inbox" },
    { name: "Đơn hàng", status: "planned" },
  ],
  automation: [
    { name: "Quy trình đang hoạt động", status: "planned" },
    { name: "Bản nháp", status: "planned" },
    { name: "Quy trình tạm dừng", status: "planned" },
    { name: "Lịch sử chạy", status: "planned" },
    { name: "Lỗi cần xử lý", status: "planned" },
  ],
  reports: [
    { name: "Hiệu quả nội dung", status: "planned" },
    { name: "Hiệu quả video", status: "planned" },
    { name: "Hiệu quả quảng cáo", status: "planned" },
    { name: "Lead", status: "planned" },
    { name: "Chuyển đổi", status: "planned" },
    { name: "Doanh thu", status: "planned" },
  ],
  settings: [
    { name: "Sản phẩm và bảng giá", status: "planned" },
    { name: "Nhận diện thương hiệu", status: "active", href: "/settings#brand" },
    { name: "Logo, màu sắc và font chữ", status: "planned" },
    { name: "Kho nhạc", status: "planned" },
    { name: "Tài khoản nền tảng", status: "active", href: "/settings#integrations" },
    { name: "Nhân sự và phân quyền", status: "planned" },
    { name: "AI Agent", status: "active", href: "/settings#automation" },
    { name: "Nhật ký hệ thống", status: "planned" },
    { name: "Bảo mật", status: "active", href: "/settings#account" },
  ],
};
