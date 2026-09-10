export interface NavItem {
  href: string;
  label: string;
  emoji: string;
  badge?: number;
  badgeTone?: "green" | "red" | "gold";
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

// Cấu trúc điều hướng bám theo 8 bước pipeline của chủ fanpage.
export const navSections: NavSection[] = [
  {
    label: "Tổng quan",
    items: [
      { href: "/dashboard", label: "Trung tâm điều hành", emoji: "🎛️" },
      { href: "/approvals", label: "Hộp chờ duyệt", emoji: "✅", badge: 5, badgeTone: "gold" },
    ],
  },
  {
    label: "1 · Research nền tảng",
    items: [
      { href: "/research", label: "Nền tảng & xu hướng", emoji: "🔭" },
      { href: "/research?tab=competitors", label: "Đối thủ", emoji: "🥊" },
    ],
  },
  {
    label: "2 · Insight khách hàng",
    items: [
      { href: "/insights", label: "Bản đồ insight", emoji: "🧠" },
      { href: "/insights?tab=personas", label: "Chân dung khách hàng", emoji: "👥" },
    ],
  },
  {
    label: "3–4 · Nội dung",
    items: [
      { href: "/content", label: "Ý tưởng hôm nay", emoji: "💡", badge: 4, badgeTone: "green" },
      { href: "/content?tab=in_progress", label: "Bàn làm việc của bạn", emoji: "✍️", badge: 2 },
      { href: "/content?tab=all", label: "Kho nội dung", emoji: "🗂️" },
    ],
  },
  {
    label: "5 · Đăng bài",
    items: [
      { href: "/publishing", label: "Lịch đăng", emoji: "📅" },
      { href: "/publishing?tab=results", label: "Kết quả bài đăng", emoji: "📈" },
    ],
  },
  {
    label: "6 · Quảng cáo",
    items: [
      { href: "/ads", label: "Chiến dịch", emoji: "📣", badge: 1, badgeTone: "gold" },
      { href: "/ads?tab=budget", label: "Ngân sách & rào chắn", emoji: "🛡️" },
    ],
  },
  {
    label: "7 · Kết nối khách hàng",
    items: [
      { href: "/customers", label: "Hộp thư & bình luận", emoji: "💬", badge: 3, badgeTone: "red" },
      { href: "/customers?tab=leads", label: "Lead / CRM", emoji: "🎯" },
      { href: "/customers?tab=rules", label: "Quy tắc trả lời", emoji: "🤖" },
    ],
  },
  {
    label: "8 · Email marketing",
    items: [
      { href: "/email", label: "Chuỗi tự động", emoji: "✉️" },
      { href: "/email?tab=campaigns", label: "Chiến dịch email", emoji: "📨" },
    ],
  },
  {
    label: "Hệ thống",
    items: [
      { href: "/settings", label: "Kết nối & API", emoji: "🔌" },
      { href: "/settings?tab=automation", label: "Tự động hóa", emoji: "⚙️" },
      { href: "/settings?tab=account", label: "Tài khoản", emoji: "👤" },
    ],
  },
];
