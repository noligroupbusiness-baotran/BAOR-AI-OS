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
  FlaskConical,
  Sparkles,
  Archive,
  Target,
} from "lucide-react";

// Thanh bên xếp theo dây chuyền thương hiệu cá nhân: tri thức → nghiên cứu → kịch bản → video → đăng → đo lường.
export type MenuGroup = "ops" | "brand" | "business" | "system";
export const menuGroupLabel: Record<MenuGroup, string> = { ops: "Bắt đầu", brand: "Hành trình marketing", business: "Khác", system: "Hệ thống" };
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
  /** Đường dẫn khác cũng thuộc mục này (vd /content thuộc bước 3). */
  also?: string[];
}

export const menu: MenuItem[] = [
  { key: "dashboard", href: "/dashboard", label: "Tổng quan", description: "Tình hình chung (chi tiêu AI, kết nối, dựng video, sao lưu, lỗi) và hành trình marketing 8 bước.", icon: LayoutDashboard, group: "ops", hotkey: "1" },
  { key: "research", href: "/insights/research", label: "1–2 · Chủ đề & insight", description: "Chủ đề → insight từ nhóm Facebook, YouTube, Facebook, social.", icon: FlaskConical, group: "brand", hotkey: "2" },
  { key: "content", href: "/content/hooks", label: "3 · Hook & kịch bản", description: "10 hook mỗi lần, kịch bản video ngắn.", icon: FileText, group: "brand", hotkey: "3", also: ["/content"] },
  { key: "video-studio", href: "/video-studio", label: "4 · Quay & edit video", description: "Tải video, AI edit theo skill.", icon: Clapperboard, group: "brand", hotkey: "4" },
  { key: "video-library", href: "/video-library", label: "5 · Kho video", description: "Chưa đăng, đã đăng, mục xoá.", icon: Archive, group: "brand", hotkey: "5" },
  { key: "publishing", href: "/publishing", label: "6 · Đăng bài", description: "Lên lịch đăng, fanpage, caption theo skill.", icon: CalendarClock, group: "brand", hotkey: "6" },
  { key: "ads", href: "/ads", label: "7 · Quảng cáo", description: "Quảng cáo từ video đã đăng, trong ủy quyền ngân sách.", icon: Megaphone, group: "brand", hotkey: "7" },
  { key: "learning", href: "/insights/learning", label: "8 · Đo lường", description: "Kiểm theo skill, AI đề xuất cải tiến.", icon: Sparkles, group: "brand", hotkey: "8" },
  { key: "campaigns", href: "/campaigns", label: "Chiến dịch", description: "Mục tiêu, ngân sách, thời gian và kết quả từng chiến dịch.", icon: Target, group: "business" },
  { key: "customers", href: "/customers", label: "Lead", description: "Lead từ quảng cáo / fanpage, chăm sóc, lịch sử tương tác.", icon: Users, group: "business", hotkey: "9" },
  { key: "insights", href: "/insights", label: "Insight khách hàng", description: "Chân dung khách hàng, nỗi đau, đối thủ, xu hướng.", icon: Lightbulb, group: "business" },
  { key: "reports", href: "/reports", label: "Báo cáo", description: "Số liệu nội dung, video, quảng cáo, lead, chi phí AI.", icon: BarChart3, group: "business" },
  { key: "automation", href: "/automation", label: "Automation", description: "Quy trình tự động, lịch sử chạy, lỗi cần xử lý.", icon: Workflow, group: "business" },
  { key: "settings", href: "/settings", label: "Cài đặt", description: "Kết nối API, Đội AI, thương hiệu, nhân sự, bảo mật.", icon: Settings, group: "system", hotkey: "0" },
];

/** Mục menu khớp đường dẫn dài nhất, để /insights/research không làm sáng cả mục /insights. */
export function activeMenuItem(pathname: string): MenuItem | undefined {
  return menu
    .filter((m) => [m.href, ...(m.also ?? [])].some((h) => pathname === h || pathname.startsWith(h + "/")))
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
  { key: "research", label: "1 · Chủ đề mới", icon: FlaskConical, moduleKey: "research", href: "/insights/research" },
  { key: "hooks", label: "3 · Tạo 10 hook", icon: FilePlus2, moduleKey: "content", href: "/content/hooks" },
  { key: "video", label: "4 · Tải video lên", icon: Upload, moduleKey: "video-studio", href: "/video-studio?upload=1" },
  { key: "schedule", label: "6 · Lên lịch đăng", icon: CalendarClock, moduleKey: "publishing", href: "/video-library" },
  { key: "customer", label: "Thêm lead", icon: UserPlus, moduleKey: "customers", href: "/customers?tab=leads&add=1" },
];
