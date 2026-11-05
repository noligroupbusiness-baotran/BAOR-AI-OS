// Hành trình marketing theo sơ đồ Personal Brand System của OWNER: mỗi bước một trang, thao tác bằng nút bấm.
// OWNER 05/11/2026 (edit video trên máy, kéo vào thư mục là xong): rút còn 4 bước hiển thị — 1 Kịch bản (chủ đề → hook → kịch bản),
// 2 Video (Kho video; Studio dựng trong app ẩn sau nút phụ), 3 Đăng, 4 Kết quả (số liệu + quảng cáo + cải tiến).
// JOURNEY giữ 8 mục con (n = mã nội bộ, số liệu thẻ ở src/lib/brand/journey.ts khoá theo n); số hiện cho người dùng là `step` (1–4).
// Mục con đầu tiên của mỗi bước là trang mở khi bấm bước đó.
export interface JourneyStep {
  n: number;
  /** Số bước hiển thị (1–4). Nhiều mục con có thể cùng một bước. */
  step: number;
  label: string;
  short: string; // nhãn ngắn cho thanh hành trình
  href: string;
  action: string; // nút chính
  match: (pathname: string) => boolean;
}

export const JOURNEY: JourneyStep[] = [
  { n: 3, step: 1, label: "Hook & kịch bản", short: "Kịch bản", href: "/content/hooks", action: "Tạo 10 hook", match: (p) => p === "/content" || p.startsWith("/content/") },
  { n: 1, step: 1, label: "Chủ đề", short: "Chủ đề", href: "/insights/research", action: "Thêm chủ đề", match: (p) => p === "/insights/research" },
  { n: 2, step: 1, label: "Nghiên cứu insight", short: "Insight", href: "/insights/research", action: "Lấy insight", match: (p) => /^\/insights\/research\/[^/]+$/.test(p) },
  { n: 5, step: 2, label: "Kho video", short: "Video", href: "/video-library", action: "Mở kho", match: (p) => p.startsWith("/video-library") },
  { n: 4, step: 2, label: "Dựng trong app", short: "Studio", href: "/video-studio", action: "Studio", match: (p) => p.startsWith("/video-studio") },
  { n: 6, step: 3, label: "Đăng bài", short: "Đăng", href: "/publishing", action: "Lên lịch đăng", match: (p) => p.startsWith("/publishing") },
  { n: 8, step: 4, label: "Số liệu & cải tiến", short: "Kết quả", href: "/insights/learning", action: "Xem số liệu", match: (p) => p.startsWith("/insights/learning") },
  { n: 7, step: 4, label: "Quảng cáo", short: "Quảng cáo", href: "/insights/learning?tab=quang-cao", action: "Quảng cáo", match: (p) => p === "/ads" || p.startsWith("/ads/") },
];

/** 4 bước hiển thị (thanh hành trình, thẻ Tổng quan): mỗi bước một ô, gộp các mục con cùng bước. */
export interface JourneyDisplayStep {
  step: number;
  label: string;
  short: string;
  href: string;
  match: (pathname: string) => boolean;
}

const DISPLAY_LABEL: Record<number, { label: string; short: string }> = {
  1: { label: "Kịch bản", short: "Kịch bản" },
  2: { label: "Video", short: "Video" },
  3: { label: "Đăng", short: "Đăng" },
  4: { label: "Kết quả", short: "Kết quả" },
};

export const JOURNEY_STEPS: JourneyDisplayStep[] = [...new Set(JOURNEY.map((s) => s.step))].map((step) => {
  const parts = JOURNEY.filter((s) => s.step === step);
  return {
    step,
    label: DISPLAY_LABEL[step]?.label ?? parts[0].label,
    short: DISPLAY_LABEL[step]?.short ?? parts[0].short,
    href: parts[0].href,
    match: (p: string) => parts.some((s) => s.match(p)),
  };
});

export function journeyStepFor(pathname: string): JourneyStep | undefined {
  return JOURNEY.find((s) => s.match(pathname));
}

/** Bước hiển thị đang mở theo đường dẫn. */
export function journeyDisplayStepFor(pathname: string): JourneyDisplayStep | undefined {
  return JOURNEY_STEPS.find((s) => s.match(pathname));
}

/**
 * Đổi mã bước trong sơ đồ skill (vd "4.2", "6.1", "8.2" — dữ liệu ở src/lib/ai-roster.ts) sang số bước hiển thị 1–4.
 * Mã không thuộc hành trình ("—") giữ nguyên.
 */
export function displayStepOf(code: string): string {
  const n = Number.parseInt(code, 10);
  const s = JOURNEY.find((j) => j.n === n);
  return s ? String(s.step) : code;
}

/**
 * Chuẩn hoá chữ đã lưu từ trước (vd đề xuất cải tiến trong CSDL) khi HIỂN THỊ: "bước 8.1" / "bước 8.2" → "bước 4",
 * không cần đợi "Phân tích lại". Chỉ đổi mã bước đúng dạng (mỗi đoạn 1 chữ số: 8.1, 6.2.1) có trong hành trình. Không đổi
 * số có dấu chấm ngăn nghìn ("mỗi bước 3.500 lượt"), số thập phân ("bước 2,5") hay số kèm đơn vị ("bước 8.1 triệu").
 */
export function displayStepsIn(text: string): string {
  return text.replace(/\b(bước|Bước|BƯỚC)\s+(\d(?:\.\d)+)(?![.,]?\d)(?!\s*(?:%|triệu|nghìn|ngàn|tỷ|k\b))/gu, (all, word: string, code: string) => {
    const shown = displayStepOf(code);
    return shown === code ? all : `${word} ${shown}`;
  });
}
