// Nhóm chức năng của từng phân hệ. "active" = đã có màn hình làm việc, "planned" = sắp triển khai.
export type GroupStatus = "active" | "planned";

export interface ModuleGroup {
  name: string;
  status: GroupStatus;
  href?: string; // liên kết tới màn hình đã có (nếu active)
}

export const moduleGroups: Record<string, ModuleGroup[]> = {
  campaigns: [
    { name: "Danh sách chiến dịch", status: "active", href: "/campaigns" },
    { name: "Mục tiêu", status: "active", href: "/campaigns" },
    { name: "Ngân sách", status: "active", href: "/campaigns" },
    { name: "Thời gian", status: "active", href: "/campaigns" },
    { name: "Trạng thái", status: "active", href: "/campaigns" },
    { name: "Kết quả tổng quan", status: "active", href: "/campaigns" },
  ],
  insights: [
    { name: "Chân dung khách hàng", status: "active", href: "/insights#personas" },
    { name: "Nỗi đau và mong muốn", status: "active", href: "/insights#personas" },
    { name: "Câu hỏi thường gặp", status: "active", href: "/settings#faq" },
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
    { name: "Video gốc", status: "active", href: "/video-studio?upload=1" },
    { name: "Video đang được Agent dựng", status: "active", href: "/video-studio?tab=editing" },
    { name: "Video chờ kiểm tra", status: "active", href: "/video-studio?tab=review" },
    { name: "Video cần chỉnh sửa", status: "active", href: "/video-studio?tab=needs_changes" },
    { name: "Video chờ phê duyệt", status: "active", href: "/video-studio?tab=pending_approval" },
    { name: "Video đã phê duyệt", status: "active", href: "/video-studio?tab=approved" },
    { name: "Phiên bản video theo từng nền tảng", status: "active", href: "/video-studio" },
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
    { name: "Đơn hàng", status: "active", href: "/customers?tab=orders" },
  ],
  automation: [
    { name: "Quy trình đang hoạt động", status: "active", href: "/automation?tab=active" },
    { name: "Bản nháp", status: "active", href: "/automation?tab=draft" },
    { name: "Quy trình tạm dừng", status: "active", href: "/automation?tab=paused" },
    { name: "Lịch sử chạy", status: "active", href: "/automation?tab=runs" },
    { name: "Lỗi cần xử lý", status: "active", href: "/automation?tab=error" },
  ],
  reports: [
    { name: "Hiệu quả nội dung", status: "active", href: "/reports?tab=content" },
    { name: "Hiệu quả video", status: "active", href: "/reports?tab=content" },
    { name: "Hiệu quả quảng cáo", status: "active", href: "/reports?tab=costs" },
    { name: "Lead", status: "active", href: "/reports?tab=leads" },
    { name: "Chuyển đổi", status: "active", href: "/reports?tab=overview" },
    { name: "Doanh thu", status: "active", href: "/reports?tab=orders" },
  ],
  settings: [
    { name: "Sản phẩm và bảng giá", status: "active", href: "/settings#products" },
    { name: "Nhận diện thương hiệu", status: "active", href: "/settings#brand" },
    { name: "Màu sắc, font chữ, khẩu hiệu", status: "active", href: "/settings#brand" },
    { name: "Logo giao diện quản trị", status: "active", href: "/settings#app-logo" },
    { name: "Kho nhạc", status: "active", href: "/settings#music" },
    { name: "Tài khoản nền tảng", status: "active", href: "/settings#integrations" },
    { name: "Nhân sự và phân quyền", status: "active", href: "/settings#people" },
    { name: "AI Agent", status: "active", href: "/settings#automation" },
    { name: "Nhật ký hệ thống", status: "active", href: "/settings#syslog" },
    { name: "Bảo mật", status: "active", href: "/settings#account" },
  ],
};
