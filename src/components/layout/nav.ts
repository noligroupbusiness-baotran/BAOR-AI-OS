export interface NavItem {
  href: string;
  label: string;
  mark: string; // số bước hoặc ký hiệu, hiển thị trong ô vuông
  badge?: number;
}

// Sidebar thu gọn: 5 mục theo pipeline + Cài đặt.
export const navItems: NavItem[] = [
  { href: "/dashboard", label: "Điều hành", mark: "◎" },
  { href: "/research", label: "Nghiên cứu & insight", mark: "1" },
  { href: "/content", label: "Nội dung", mark: "2" },
  { href: "/publishing", label: "Đăng bài & quảng cáo", mark: "3" },
  { href: "/customers", label: "Khách hàng & email", mark: "4" },
];

export const settingsItem: NavItem = { href: "/settings", label: "Cài đặt", mark: "⚙" };
