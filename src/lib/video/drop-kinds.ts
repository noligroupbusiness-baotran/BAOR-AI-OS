// Ba ngăn của thư mục thả tư liệu và đuôi tệp mỗi ngăn nhận — MỘT nguồn cho bộ nhận (drop-import.ts, chạy trên máy chủ và máy dựng)
// và nút "Tải lên" ở trang Tư liệu (asset-upload-rules.ts, dùng cả trong trình duyệt). Không import node:* để trình duyệt dùng được.
export const DROP_KINDS = {
  "anh-broll": { label: "Ảnh & B-roll", exts: [".jpg", ".jpeg", ".png", ".webp", ".mp4", ".mov", ".m4v"] },
  nhac: { label: "Nhạc nền", exts: [".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg"] },
  "hieu-ung-am-thanh": { label: "Hiệu ứng âm thanh", exts: [".mp3", ".wav", ".m4a", ".aac", ".ogg"] },
} as const;
export type DropKind = keyof typeof DROP_KINDS;
