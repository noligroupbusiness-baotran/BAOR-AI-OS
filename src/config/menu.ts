// Cấu hình menu tập trung cho toàn dashboard. Icon lấy từ lucide-react (không dùng emoji).
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Megaphone,
  Lightbulb,
  FileText,
  Clapperboard,
  CalendarClock,
  Users,
  Workflow,
  BarChart3,
  Settings,
  FilePlus2,
  Upload,
  UserPlus,
} from "lucide-react";

export interface MenuItem {
  key: string;
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Phân hệ còn là trang khung: hiện nhãn "đang xây" trên menu. */
  building?: boolean;
}

export const menu: MenuItem[] = [
  { key: "dashboard", href: "/dashboard", label: "Điều hành", description: "Việc cần xử lý, lịch hôm nay, trạng thái Agent.", icon: LayoutDashboard },
  { key: "campaigns", href: "/campaigns", label: "Chiến dịch", description: "Mục tiêu, ngân sách, thời gian và kết quả từng chiến dịch.", icon: Megaphone },
  { key: "insights", href: "/insights", label: "Nghiên cứu & Insight", description: "Chân dung khách hàng, nỗi đau, đối thủ, xu hướng, ngân hàng insight.", icon: Lightbulb },
  { key: "content", href: "/content", label: "Nội dung", description: "Ý tưởng, bài viết, kịch bản video, caption, hình ảnh, duyệt nội dung.", icon: FileText },
  { key: "video-studio", href: "/video-studio", label: "Video Studio", description: "Video gốc, Agent dựng, kiểm tra, phê duyệt, phiên bản theo nền tảng.", icon: Clapperboard },
  { key: "publishing", href: "/publishing", label: "Đăng bài & Quảng cáo", description: "Lịch nội dung, hàng chờ, đã đăng, tài khoản kết nối, quảng cáo.", icon: CalendarClock },
  { key: "customers", href: "/customers", label: "Khách hàng", description: "Lead, khách hàng, phân data, chăm sóc, lịch sử tương tác, đơn hàng.", icon: Users },
  { key: "automation", href: "/automation", label: "Automation", description: "Quy trình tự động, bản nháp, lịch sử chạy, lỗi cần xử lý.", icon: Workflow },
  { key: "reports", href: "/reports", label: "Báo cáo", description: "Hiệu quả nội dung, video, quảng cáo, lead, chuyển đổi, doanh thu.", icon: BarChart3 },
  { key: "settings", href: "/settings", label: "Cài đặt hệ thống", description: "Sản phẩm, thương hiệu, tài khoản nền tảng, nhân sự, AI Agent, bảo mật.", icon: Settings },
];

export function findMenuByPath(pathname: string): MenuItem | undefined {
  if (pathname.startsWith("/search")) return { key: "search", href: "/search", label: "Tìm kiếm", description: "", icon: LayoutDashboard };
  return menu.find((m) => pathname === m.href || pathname.startsWith(m.href + "/"));
}

// Menu "Tạo mới" ở thanh trên cùng. Mỗi mục trỏ tới phân hệ sẽ phát triển chức năng đó.
export interface CreateAction {
  key: string;
  label: string;
  icon: LucideIcon;
  moduleKey: string;
  href: string;
  /** Ghi chú ngắn khi chức năng chưa đầy đủ. */
  note?: string;
}

export const createActions: CreateAction[] = [
  { key: "campaign", label: "Tạo chiến dịch", icon: Megaphone, moduleKey: "campaigns", href: "/campaigns/new" },
  { key: "content", label: "Tạo nội dung", icon: FilePlus2, moduleKey: "content", href: "/content?tab=mine&open=new" },
  { key: "video", label: "Tải video lên", icon: Upload, moduleKey: "video-studio", href: "/video-studio", note: "chờ Agent" },
  { key: "schedule", label: "Lên lịch đăng", icon: CalendarClock, moduleKey: "publishing", href: "/content?tab=done" },
  { key: "customer", label: "Thêm khách hàng", icon: UserPlus, moduleKey: "customers", href: "/customers?tab=leads&add=1" },
  { key: "automation", label: "Tạo quy tắc Automation", icon: Workflow, moduleKey: "automation", href: "/automation?add=1" },
];
