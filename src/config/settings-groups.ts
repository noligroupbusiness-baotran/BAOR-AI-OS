import { Bot, Clapperboard, Palette, Plug, ShieldCheck, Zap, type LucideIcon } from "lucide-react";

// Cài đặt gọn theo nhóm (OWNER 25/10/2026: "giao diện quá lộn xộn… làm đơn giản lại"): 6 nút, mỗi lần chỉ hiện một nhóm.
// Liên kết cũ dạng /settings#<mục> (≈130 chỗ trong app, cả redirect của server action) vẫn đúng: mở nhóm chứa phần tử
// có id đó rồi cuộn tới (src/components/settings/settings-tabs.tsx). ?tab=<nhóm> chọn nhóm từ máy chủ (không nháy).
export const SETTINGS_GROUPS = [
  { id: "ket-noi", label: "Kết nối", hint: "Ô API của từng nền tảng", icon: Plug },
  { id: "thuong-hieu", label: "Thương hiệu", hint: "Nhận diện, logo, câu trả lời chuẩn", icon: Palette },
  { id: "video", label: "Video", hint: "Nơi dựng, nhạc, dựng tự động", icon: Clapperboard },
  { id: "ai", label: "Đội AI", hint: "Bật / tắt AI, trần chi phí", icon: Bot },
  { id: "tu-dong", label: "Tự động", hint: "Việc tự chạy, cảnh báo", icon: Zap },
  { id: "he-thong", label: "Hệ thống", hint: "Tài khoản, nhân sự, sao lưu", icon: ShieldCheck },
] as const satisfies readonly { id: string; label: string; hint: string; icon: LucideIcon }[];

export type SettingsGroupId = (typeof SETTINGS_GROUPS)[number]["id"];

export function isSettingsGroup(v: unknown): v is SettingsGroupId {
  return SETTINGS_GROUPS.some((g) => g.id === v);
}

/** Neo (#id của khối) → nhóm. Neo động của từng kết nối (#<khoá kết nối>) không có ở đây → nhóm mặc định "Kết nối". */
export const SETTINGS_ANCHORS: Record<string, SettingsGroupId> = {
  integrations: "ket-noi",
  brand: "thuong-hieu",
  "app-logo": "thuong-hieu",
  faq: "thuong-hieu",
  "render-worker": "video",
  "auto-edit": "video",
  music: "video",
  "music-library": "video",
  "ai-team": "ai",
  ai: "ai",
  automation: "tu-dong",
  alerts: "tu-dong",
  account: "he-thong",
  people: "he-thong",
  "second-brain": "he-thong",
  backup: "he-thong",
  syslog: "he-thong",
  sample: "he-thong",
};

/** Gắn ?tab=<nhóm> cho đường dẫn "/settings…#neo" chưa có tab (redirect của server action): máy chủ hiện đúng nhóm ngay. */
export function withSettingsTab(path: string): string {
  const i = path.indexOf("#");
  if (i < 0) return path;
  const base = path.slice(0, i);
  const anchor = path.slice(i + 1).split("?")[0];
  if (base.split("?")[0] !== "/settings" || /[?&]tab=/.test(base)) return path;
  const group = SETTINGS_ANCHORS[anchor];
  return group ? `${base}${base.includes("?") ? "&" : "?"}tab=${group}${path.slice(i)}` : path;
}
