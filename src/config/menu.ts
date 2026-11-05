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
  /** Phím tắt Alt + phím này để nhảy tới phân hệ: "1"…"3" = bước 1…3, "8" = Tổng quan, "9" = Lead, "0" = Cài đặt. */
  hotkey?: string;
  /** Không hiện trên thanh bên (trang phụ vẫn mở được qua đường dẫn / nút trong bước); `parent` = mục thanh bên sáng lên khi ở trang này. */
  hidden?: boolean;
  parent?: string;
  /** Phân hệ còn là trang khung: hiện nhãn "đang xây" trên menu. */
  building?: boolean;
  /** Đường dẫn khác cũng thuộc mục này (vd /content thuộc bước 2 · Hook & kịch bản). */
  also?: string[];
}

export const menu: MenuItem[] = [
  { key: "dashboard", tone: "blue", href: "/dashboard", label: "Tổng quan", description: "Tình hình chung (chi tiêu AI, kết nối, máy dựng, sao lưu, lỗi) và hành trình marketing 3 bước.", icon: LayoutDashboard, group: "ops", hotkey: "8" },
  // 3 bước (OWNER 05/11/2026 "chỉ cần Video, Đăng và Kết quả"): Video → Đăng → Kết quả. Trang phụ (kịch bản, chủ đề & insight,
  // Studio dựng trong app, Quảng cáo) vẫn mở được qua nút / menu Tạo mới, không chiếm chỗ trên thanh bên.
  { key: "video-library", tone: "pink", href: "/video-library", label: "1 · Video", description: "Kho video gắn với thư mục VIDEO-DA-DUYET trên máy: kéo video vào là lên Kho, máy tự viết bài.", icon: Archive, group: "brand", hotkey: "1" },
  { key: "video-studio", tone: "pink", href: "/video-studio", label: "Dựng trong app", description: "Tải video gốc, AI edit theo skill (ít dùng khi đã edit trên máy).", icon: Clapperboard, group: "brand", hidden: true, parent: "video-library" },
  { key: "content", tone: "violet", href: "/content/hooks", label: "Kịch bản", description: "Gõ chủ đề → 10 hook → kịch bản vlog dưới 1 phút (trang phụ, khi cần ý tưởng).", icon: FileText, group: "brand", hidden: true, parent: "video-library", also: ["/content"] },
  { key: "research", tone: "cyan", href: "/insights/research", label: "Chủ đề & insight", description: "Chủ đề → insight từ nhóm Facebook, YouTube, social.", icon: FlaskConical, group: "brand", hidden: true, parent: "video-library" },
  { key: "publishing", tone: "orange", href: "/publishing", label: "2 · Đăng", description: "Bài đã viết sẵn, chọn kênh, đăng ngay hoặc lên lịch.", icon: CalendarClock, group: "brand", hotkey: "2" },
  { key: "learning", tone: "yellow", href: "/insights/learning", label: "3 · Kết quả", description: "Số liệu, quảng cáo, đề xuất cải tiến.", icon: Sparkles, group: "brand", hotkey: "3" },
  { key: "ads", tone: "orange", href: "/ads", label: "Quảng cáo", description: "Quảng cáo từ video đã đăng, trong ủy quyền ngân sách.", icon: Megaphone, group: "brand", hidden: true, parent: "learning" },
  { key: "campaigns", tone: "emerald", href: "/campaigns", label: "Chiến dịch", description: "Mục tiêu, ngân sách, thời gian và kết quả từng chiến dịch.", icon: Target, group: "business" },
  { key: "customers", tone: "emerald", href: "/customers", label: "Lead", description: "Lead từ quảng cáo / fanpage, hộp thư, chăm sóc.", icon: Users, group: "business", hotkey: "9" },
  { key: "assets", tone: "indigo", href: "/assets", label: "Tư liệu", description: "Logo, thư viện nhạc nền, nhạc tải lên, ảnh / B-roll, thư mục thả tư liệu.", icon: Images, group: "business" },
  { key: "settings", tone: "slate", href: "/settings", label: "Cài đặt", description: "Kết nối API, Đội AI, thương hiệu, nhân sự, bảo mật.", icon: Settings, group: "system", hotkey: "0" },
];

/**
 * Phím tắt của một lần bấm Alt+số (trả "0"…"9"; không phải phím tắt thì null). Chỉ dãy số: cùng vị trí trên QWERTY / AZERTY / ISO,
 * không đụng phím hệ thống (Alt+` bị GNOME bắt, nhãn lệch trên AZERTY). Đọc e.code (vị trí phím vật lý), không đọc e.key:
 * trên Mac Option+1 cho e.key = "¡".
 * Không nhận khi đang gõ (ô nhập, contenteditable, IME đang soạn) hoặc có Shift: bố cục Mac Đức / Pháp gõ [ ] { } | bằng
 * Option(+Shift)+số, nhận phím tắt lúc đó sẽ chuyển trang và mất chữ đang gõ.
 */
export function hotkeyOf(e: { altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey?: boolean; isComposing?: boolean; code: string; target?: unknown }): string | null {
  if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.isComposing || isTypingTarget(e.target)) return null;
  const digit = /^(?:Digit|Numpad)([0-9])$/.exec(e.code);
  return digit ? digit[1] : null;
}

/** Đích phím là chỗ gõ chữ (input / textarea / select / contenteditable). */
export function isTypingTarget(target: unknown): boolean {
  const el = target as { tagName?: string; isContentEditable?: boolean } | null | undefined;
  if (!el) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable === true;
}

/** Mục menu khớp đường dẫn dài nhất, để /insights/research không làm sáng cả mục /insights. */
export function activeMenuItem(pathname: string): MenuItem | undefined {
  return menu
    .filter((m) => [m.href, ...(m.also ?? [])].some((h) => pathname === h || pathname.startsWith(h + "/")))
    .sort((a, b) => b.href.length - a.href.length)[0];
}

/** Badge thanh bên: số của mục + số của các mục ẩn thuộc nó (video chờ duyệt ở Studio → hiện trên Video; quảng cáo chờ → Kết quả). */
export function menuBadge(m: MenuItem, badges: Record<string, number | undefined>): number {
  const own = badges[m.href] ?? 0;
  const kids = menu.filter((x) => x.hidden && x.parent === m.key).reduce((n, x) => n + (badges[x.href] ?? 0), 0);
  return own + kids;
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
  { key: "video", label: "Tải video đã edit", icon: Upload, moduleKey: "video-library", href: "/video-studio?upload=1", note: "hoặc kéo vào thư mục VIDEO-DA-DUYET" },
  { key: "schedule", label: "Lên lịch đăng", icon: CalendarClock, moduleKey: "publishing", href: "/video-library" },
  { key: "customer", label: "Thêm lead", icon: UserPlus, moduleKey: "customers", href: "/customers?tab=leads&add=1" },
  { key: "hooks", label: "Kịch bản mới", icon: FilePlus2, moduleKey: "content", href: "/content/hooks", note: "khi cần ý tưởng" },
  { key: "research", label: "Chủ đề mới", icon: FlaskConical, moduleKey: "research", href: "/insights/research" },
];
