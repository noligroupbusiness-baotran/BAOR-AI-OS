// Cấu hình menu tập trung cho toàn dashboard. Icon lấy từ lucide-react (không dùng emoji).
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Megaphone,
  FileText,
  Clapperboard,
  CalendarClock,
  Users,
  Settings,
  FilePlus2,
  Upload,
  UserPlus,
  FlaskConical,
  Sparkles,
  Archive,
  Target,
  Search,
  UserRound,
  Images,
} from "lucide-react";

// Thanh bên xếp theo dây chuyền thương hiệu cá nhân: tri thức → nghiên cứu → kịch bản → video → đăng → đo lường.
export type MenuGroup = "ops" | "brand" | "business" | "system";
export const menuGroupLabel: Record<MenuGroup, string> = { ops: "Bắt đầu", brand: "Hành trình marketing", business: "Khác", system: "Hệ thống" };
export const menuGroupOrder: MenuGroup[] = ["ops", "brand", "business", "system"];

/** Bảng màu nhóm chức năng (icon chip). Mã màu sáng / tối khai báo một nơi: --tone-* trong src/app/globals.css. */
export type GroupTone = "blue" | "cyan" | "violet" | "pink" | "orange" | "emerald" | "yellow" | "indigo" | "red" | "slate";

export interface MenuItem {
  key: string;
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Màu nhóm chức năng của icon (tổng quan xanh dương, nghiên cứu xanh lơ, nội dung / tự động tím, video hồng, phân phối cam, kinh doanh ngọc lục bảo, đo lường vàng, hệ thống xám; đỏ dành cho lỗi). */
  tone: GroupTone;
  /** Nhóm trên thanh bên. */
  group: MenuGroup;
  /** Phím tắt Alt + số để nhảy tới phân hệ. */
  hotkey?: string;
  /** Phân hệ còn là trang khung: hiện nhãn "đang xây" trên menu. */
  building?: boolean;
  /** Đường dẫn khác cũng thuộc mục này (vd /content thuộc bước 2 · Hook & kịch bản). */
  also?: string[];
}

export const menu: MenuItem[] = [
  { key: "dashboard", tone: "blue", href: "/dashboard", label: "Tổng quan", description: "Tình hình chung (chi tiêu AI, kết nối, dựng video, sao lưu, lỗi) và hành trình marketing 7 bước.", icon: LayoutDashboard, group: "ops", hotkey: "1" },
  { key: "research", tone: "cyan", href: "/insights/research", label: "1 · Chủ đề & insight", description: "Chủ đề → insight từ nhóm Facebook, YouTube, Facebook, social.", icon: FlaskConical, group: "brand", hotkey: "2" },
  { key: "content", tone: "violet", href: "/content/hooks", label: "2 · Hook & kịch bản", description: "10 hook mỗi lần, kịch bản video ngắn.", icon: FileText, group: "brand", hotkey: "3", also: ["/content"] },
  { key: "video-studio", tone: "pink", href: "/video-studio", label: "3 · Quay & edit video", description: "Tải video, AI edit theo skill.", icon: Clapperboard, group: "brand", hotkey: "4" },
  { key: "video-library", tone: "pink", href: "/video-library", label: "4 · Kho video", description: "Chưa đăng, đã đăng, mục xoá.", icon: Archive, group: "brand", hotkey: "5" },
  { key: "publishing", tone: "orange", href: "/publishing", label: "5 · Đăng bài", description: "Lên lịch đăng, fanpage, caption theo skill.", icon: CalendarClock, group: "brand", hotkey: "6" },
  { key: "ads", tone: "orange", href: "/ads", label: "6 · Quảng cáo", description: "Quảng cáo từ video đã đăng, trong ủy quyền ngân sách.", icon: Megaphone, group: "brand", hotkey: "7" },
  { key: "learning", tone: "yellow", href: "/insights/learning", label: "7 · Đo lường", description: "Kiểm theo skill, AI đề xuất cải tiến.", icon: Sparkles, group: "brand", hotkey: "8" },
  { key: "campaigns", tone: "emerald", href: "/campaigns", label: "Chiến dịch", description: "Mục tiêu, ngân sách, thời gian và kết quả từng chiến dịch.", icon: Target, group: "business" },
  { key: "customers", tone: "emerald", href: "/customers", label: "Lead", description: "Lead từ quảng cáo / fanpage, hộp thư, chăm sóc.", icon: Users, group: "business", hotkey: "9" },
  { key: "assets", tone: "indigo", href: "/assets", label: "Tư liệu", description: "Logo, thư viện nhạc nền, nhạc tải lên, ảnh / B-roll, thư mục thả tư liệu.", icon: Images, group: "business" },
  { key: "settings", tone: "slate", href: "/settings", label: "Cài đặt", description: "Kết nối API, Đội AI, thương hiệu, nhân sự, bảo mật.", icon: Settings, group: "system", hotkey: "0" },
];

/** Mục menu khớp đường dẫn dài nhất, để /insights/research không làm sáng cả mục /insights. */
export function activeMenuItem(pathname: string): MenuItem | undefined {
  return menu
    .filter((m) => [m.href, ...(m.also ?? [])].some((h) => pathname === h || pathname.startsWith(h + "/")))
    .sort((a, b) => b.href.length - a.href.length)[0];
}

export function findMenuByPath(pathname: string): MenuItem | undefined {
  if (pathname.startsWith("/search")) return { key: "search", tone: "slate", href: "/search", label: "Tìm kiếm", description: "", icon: Search, group: "ops" };
  if (pathname.startsWith("/account")) return { key: "account", tone: "slate", href: "/account", label: "Tài khoản của tôi", description: "", icon: UserRound, group: "system" };
  return activeMenuItem(pathname);
}

/**
 * Nhật ký hoạt động (activity.step = phân hệ ghi, xem logActivity) → trang của mục menu tương ứng, để mục trong chuông mở đúng nơi.
 * Phân hệ cũ đã gộp trỏ về mục menu đang giữ nó (automation / alerts / security → Cài đặt, reports → Đo lường, insights → Chủ đề & insight).
 * Không rõ phân hệ → Tổng quan.
 */
const ACTIVITY_STEP_MENU: Record<string, string> = {
  research: "research",
  insights: "research",
  content: "content",
  creator: "content",
  hooks: "content",
  video: "video-studio",
  "video-studio": "video-studio",
  "video-library": "video-library",
  publishing: "publishing",
  ads: "ads",
  learning: "learning",
  reports: "learning",
  campaigns: "campaigns",
  customers: "customers",
  email: "customers",
  assets: "assets",
  settings: "settings",
  automation: "settings",
  alerts: "settings",
  security: "settings",
};

export function hrefForActivityStep(step: string | null | undefined): string {
  const key = ACTIVITY_STEP_MENU[step ?? ""];
  return menu.find((m) => m.key === key)?.href ?? "/dashboard";
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
  { key: "hooks", label: "2 · Tạo 10 hook", icon: FilePlus2, moduleKey: "content", href: "/content/hooks" },
  { key: "video", label: "3 · Tải video lên", icon: Upload, moduleKey: "video-studio", href: "/video-studio?upload=1" },
  { key: "schedule", label: "5 · Lên lịch đăng", icon: CalendarClock, moduleKey: "publishing", href: "/video-library" },
  { key: "customer", label: "Thêm lead", icon: UserPlus, moduleKey: "customers", href: "/customers?tab=leads&add=1" },
];
