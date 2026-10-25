// Hành trình marketing 8 bước theo sơ đồ Personal Brand System của OWNER (25/10/2026): mỗi bước một trang, thao tác bằng nút bấm.
export interface JourneyStep {
  n: number;
  label: string;
  short: string; // nhãn ngắn cho thanh hành trình
  href: string;
  action: string; // nút chính
  match: (pathname: string) => boolean;
}

export const JOURNEY: JourneyStep[] = [
  { n: 1, label: "Chủ đề", short: "Chủ đề", href: "/insights/research", action: "Thêm chủ đề", match: (p) => p === "/insights/research" },
  { n: 2, label: "Nghiên cứu insight", short: "Insight", href: "/insights/research", action: "Lấy insight", match: (p) => /^\/insights\/research\/[^/]+$/.test(p) },
  { n: 3, label: "Hook & kịch bản", short: "Hook", href: "/content/hooks", action: "Tạo 10 hook", match: (p) => p === "/content" || p.startsWith("/content/") },
  { n: 4, label: "Quay & edit video", short: "Video", href: "/video-studio", action: "Tải video", match: (p) => p.startsWith("/video-studio") },
  { n: 5, label: "Kho video", short: "Kho", href: "/video-library", action: "Mở kho", match: (p) => p.startsWith("/video-library") },
  { n: 6, label: "Đăng bài", short: "Đăng", href: "/publishing", action: "Lên lịch đăng", match: (p) => p.startsWith("/publishing") },
  { n: 7, label: "Quảng cáo", short: "Quảng cáo", href: "/ads", action: "Tạo quảng cáo", match: (p) => p === "/ads" || p.startsWith("/ads/") },
  { n: 8, label: "Đo lường & cải tiến", short: "Đo lường", href: "/insights/learning", action: "Xem đề xuất", match: (p) => p.startsWith("/insights/learning") },
];

export function journeyStepFor(pathname: string): JourneyStep | undefined {
  return JOURNEY.find((s) => s.match(pathname));
}
