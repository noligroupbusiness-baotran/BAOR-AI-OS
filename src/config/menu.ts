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
  BrainCircuit,
  FlaskConical,
  Sparkles,
  Archive,
} from "lucide-react";

// Thanh bên xếp theo dây chuyền thương hiệu cá nhân: tri thức → nghiên cứu → kịch bản → video → đăng → đo lường.
export type MenuGroup = "ops" | "brand" | "business" | "system";
export const menuGroupLabel: Record<MenuGroup, string> = { ops: "Điều hành", brand: "Dây chuyền thương hiệu", business: "Khách hàng & vận hành", system: "Hệ thống" };
export const menuGroupOrder: MenuGroup[] = ["ops", "brand", "business", "system"];

export interface MenuItem {
  key: string;
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Nhóm trên thanh bên. */
  group: MenuGroup;
  /** Phím tắt Alt + số để nhảy tới phân hệ. */
  hotkey?: string;
  /** Phân hệ còn là trang khung: hiện nhãn "đang xây" trên menu. */
  building?: boolean;
}

export const menu: MenuItem[] = [
  { key: "dashboard", href: "/dashboard", label: "Điều hành", description: "Dây chuyền thương hiệu, việc anh cần làm, lịch hôm nay, kết quả tháng.", icon: LayoutDashboard, group: "ops", hotkey: "1" },
  { key: "campaigns", href: "/campaigns", label: "Chiến dịch", description: "Mục tiêu, ngân sách, thời gian và kết quả từng chiến dịch.", icon: Megaphone, group: "ops", hotkey: "8" },
  { key: "knowledge", href: "/insights/knowledge", label: "Second Brain", description: "Chỉ mục kho tri thức Notion (chỉ đọc), trạng thái trang, tìm kiếm.", icon: BrainCircuit, group: "brand", hotkey: "2" },
  { key: "research", href: "/insights/research", label: "Nghiên cứu", description: "Nhiệm vụ nghiên cứu, nguồn đã chấm hạng, phát hiện đã kiểm, brief nội dung.", icon: FlaskConical, group: "brand", hotkey: "3" },
  { key: "content", href: "/content", label: "Kịch bản & nội dung", description: "Kịch bản từ brief, bài viết, caption, hình ảnh, duyệt nội dung.", icon: FileText, group: "brand", hotkey: "4" },
  { key: "video-studio", href: "/video-studio", label: "Video Studio", description: "Video gốc, Agent dựng, kiểm tra, phê duyệt, phiên bản theo nền tảng.", icon: Clapperboard, group: "brand", hotkey: "5" },
  { key: "video-library", href: "/video-library", label: "Kho video ngắn", description: "Tổng kho video sẵn sàng đăng (AI edit đã duyệt + tự edit): chưa đăng, đã đăng, mục xoá.", icon: Archive, group: "brand" },
  { key: "publishing", href: "/publishing", label: "Đăng bài & Quảng cáo", description: "Lịch nội dung, hàng chờ, đã đăng, tài khoản kết nối, quảng cáo.", icon: CalendarClock, group: "brand", hotkey: "6" },
  { key: "reports", href: "/reports", label: "Đo lường", description: "Hiệu quả nội dung, video, quảng cáo, lead, chuyển đổi, doanh thu.", icon: BarChart3, group: "brand", hotkey: "7" },
  { key: "learning", href: "/insights/learning", label: "Học & cải tiến", description: "Phân tích kết quả thật, đề xuất cải tiến nội dung, Second Brain, Skill dựng video, quảng cáo.", icon: Sparkles, group: "brand" },
  { key: "customers", href: "/customers", label: "Khách hàng", description: "Lead, khách hàng, phân data, chăm sóc, lịch sử tương tác, đơn hàng.", icon: Users, group: "business", hotkey: "9" },
  { key: "insights", href: "/insights", label: "Insight khách hàng", description: "Chân dung khách hàng, nỗi đau, đối thủ, xu hướng, ngân hàng insight.", icon: Lightbulb, group: "business" },
  { key: "automation", href: "/automation", label: "Automation", description: "Quy trình tự động, bản nháp, lịch sử chạy, lỗi cần xử lý.", icon: Workflow, group: "business" },
  { key: "settings", href: "/settings", label: "Cài đặt hệ thống", description: "Sản phẩm, thương hiệu, tài khoản nền tảng, nhân sự, AI Agent, bảo mật.", icon: Settings, group: "system", hotkey: "0" },
];

/** Mục menu khớp đường dẫn dài nhất, để /insights/research không làm sáng cả mục /insights. */
export function activeMenuItem(pathname: string): MenuItem | undefined {
  return menu
    .filter((m) => pathname === m.href || pathname.startsWith(m.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0];
}

export function findMenuByPath(pathname: string): MenuItem | undefined {
  if (pathname.startsWith("/search")) return { key: "search", href: "/search", label: "Tìm kiếm", description: "", icon: LayoutDashboard, group: "ops" };
  if (pathname.startsWith("/account")) return { key: "account", href: "/account", label: "Tài khoản của tôi", description: "", icon: LayoutDashboard, group: "system" };
  return activeMenuItem(pathname);
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
  { key: "research", label: "Tạo nhiệm vụ nghiên cứu", icon: FlaskConical, moduleKey: "research", href: "/insights/research#tao-nhiem-vu" },
  { key: "campaign", label: "Tạo chiến dịch", icon: Megaphone, moduleKey: "campaigns", href: "/campaigns/new" },
  { key: "content", label: "Tạo nội dung", icon: FilePlus2, moduleKey: "content", href: "/content?tab=mine&open=new" },
  { key: "video", label: "Tải video lên", icon: Upload, moduleKey: "video-studio", href: "/video-studio?upload=1" },
  { key: "schedule", label: "Lên lịch đăng", icon: CalendarClock, moduleKey: "publishing", href: "/content?tab=done" },
  { key: "customer", label: "Thêm khách hàng", icon: UserPlus, moduleKey: "customers", href: "/customers?tab=leads&add=1" },
  { key: "automation", label: "Tạo quy tắc Automation", icon: Workflow, moduleKey: "automation", href: "/automation?add=1" },
];
