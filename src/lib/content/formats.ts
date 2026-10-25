// Định dạng nội dung: bài viết, kịch bản video, caption, hình ảnh. Mọi kiểm tra ở đây là theo luật
// (đếm ký tự, hashtag, khung kịch bản, tỷ lệ ảnh), không gọi AI; AI chỉ dùng khi người bấm "AI viết nháp".
import type { ContentFormat } from "@/lib/types";

export type ContentKind = "text" | "script" | "caption" | "image";

export const kindLabel: Record<ContentKind, string> = { text: "Bài viết", script: "Kịch bản video", caption: "Caption", image: "Hình ảnh" };

export const formatKind: Record<ContentFormat, ContentKind> = {
  post: "text",
  article: "text",
  carousel: "text",
  story: "script",
  reel: "script",
  script: "script",
  caption: "caption",
  image: "image",
};

export function kindOf(format: string): ContentKind {
  return formatKind[format as ContentFormat] ?? "text";
}

export function formatsOfKind(kind: ContentKind): ContentFormat[] {
  return (Object.keys(formatKind) as ContentFormat[]).filter((f) => formatKind[f] === kind);
}

// ---------- Kịch bản video ----------

export interface Scene {
  name: string;
  seconds: string;
  goal: string;
}

/** Khung kịch bản ngắn (15–60 giây) cho Reel / TikTok / Story. */
export const SCRIPT_SCENES: Scene[] = [
  { name: "Hook", seconds: "0–3s", goal: "Giữ người xem: câu hỏi, con số, hoặc cảnh gây tò mò." },
  { name: "Vấn đề", seconds: "3–10s", goal: "Nỗi đau khách đang gặp, nói bằng lời của khách." },
  { name: "Giải pháp", seconds: "10–30s", goal: "Sản phẩm / dịch vụ giải quyết thế nào, chỉ nêu công dụng có trong danh mục." },
  { name: "Bằng chứng", seconds: "30–45s", goal: "Khách thật, trước sau, con số, đánh giá." },
  { name: "Kêu gọi", seconds: "45–60s", goal: "Một hành động duy nhất: inbox, đặt lịch, comment." },
];

/** Văn bản khung kịch bản để chèn vào ô nháp; người viết điền ba dòng mỗi cảnh. */
export function scriptTemplate(title = ""): string {
  const head = title ? `KỊCH BẢN: ${title}\n\n` : "";
  return (
    head +
    SCRIPT_SCENES.map((s, i) => `${i + 1}. ${s.name.toUpperCase()} (${s.seconds})\nHình ảnh: \nLời thoại: \nChữ trên màn hình: \n`).join("\n") +
    "\nNhạc nền: (chọn trong Cài đặt › Kho nhạc)\nGhi chú dựng: "
  );
}

/** Kiểm tra kịch bản có đủ các cảnh bắt buộc chưa (khớp theo tên cảnh, không phân biệt hoa thường). */
export function scriptCheck(draft: string): { scenes: { name: string; present: boolean }[]; missing: string[]; hasSpeech: boolean } {
  const lower = draft.toLowerCase();
  const scenes = SCRIPT_SCENES.map((s) => ({ name: s.name, present: lower.includes(s.name.toLowerCase()) }));
  const hasSpeech = /lời thoại:[ \t]*\S/i.test(draft);
  return { scenes, missing: scenes.filter((s) => !s.present).map((s) => s.name), hasSpeech };
}

// ---------- Caption ----------

export interface CaptionLimit {
  platform: string;
  label: string;
  maxChars: number;
  /** Số ký tự hiện trước khi bị cắt "Xem thêm". */
  visibleChars: number;
  maxHashtags: number;
}

export const CAPTION_LIMITS: CaptionLimit[] = [
  { platform: "facebook", label: "Facebook", maxChars: 63_206, visibleChars: 125, maxHashtags: 5 },
  { platform: "instagram", label: "Instagram", maxChars: 2_200, visibleChars: 125, maxHashtags: 30 },
  { platform: "tiktok", label: "TikTok", maxChars: 2_200, visibleChars: 100, maxHashtags: 8 },
  { platform: "youtube", label: "YouTube Shorts", maxChars: 100, visibleChars: 100, maxHashtags: 3 },
  { platform: "zalo", label: "Zalo OA", maxChars: 2_000, visibleChars: 150, maxHashtags: 3 },
];

export interface CaptionCheck {
  chars: number;
  words: number;
  hashtags: string[];
  hasCta: boolean;
  firstLine: string;
  /** Cảnh báo theo từng nền tảng (chỉ nền tảng vi phạm). */
  warnings: string[];
}

const CTA = /(inbox|nhắn|đặt lịch|gọi|đăng ký|comment|bình luận|để lại|link|mua ngay|xem thêm|ghé)/i;

export function captionCheck(text: string, platforms: string[] = CAPTION_LIMITS.map((l) => l.platform)): CaptionCheck {
  const t = text.trim();
  const hashtags = [...new Set((t.match(/#[\p{L}\p{N}_]+/gu) ?? []).map((h) => h.toLowerCase()))];
  const words = t ? t.split(/\s+/).length : 0;
  const firstLine = t.split(/\r?\n/)[0] ?? "";
  const warnings: string[] = [];
  for (const l of CAPTION_LIMITS.filter((l) => platforms.includes(l.platform))) {
    if (t.length > l.maxChars) warnings.push(`${l.label}: vượt ${t.length - l.maxChars} ký tự (tối đa ${l.maxChars.toLocaleString("vi-VN")}).`);
    if (hashtags.length > l.maxHashtags) warnings.push(`${l.label}: ${hashtags.length} hashtag, nên tối đa ${l.maxHashtags}.`);
    if (t.length > l.visibleChars && firstLine.length > l.visibleChars) warnings.push(`${l.label}: ${l.visibleChars} ký tự đầu bị cắt "Xem thêm", câu đầu nên ngắn hơn.`);
  }
  if (t && !CTA.test(t)) warnings.push("Chưa có lời kêu gọi hành động (inbox, đặt lịch, bình luận…).");
  if ((t.match(/\p{Extended_Pictographic}/gu) ?? []).length > 6) warnings.push("Quá nhiều biểu tượng cảm xúc, nên dưới 6.");
  return { chars: t.length, words, hashtags, hasCta: CTA.test(t), firstLine, warnings };
}

// ---------- Hình ảnh ----------

export interface ImageSpec {
  platform: string;
  label: string;
  ratio: string;
  size: string;
  note: string;
}

export const IMAGE_SPECS: ImageSpec[] = [
  { platform: "facebook", label: "Facebook bài đăng", ratio: "4:5", size: "1080×1350", note: "Chiếm nhiều màn hình điện thoại nhất; 1:1 cũng ổn." },
  { platform: "instagram", label: "Instagram bài đăng", ratio: "4:5", size: "1080×1350", note: "Carousel giữ cùng một tỷ lệ cho mọi ảnh." },
  { platform: "story", label: "Story / Reel bìa", ratio: "9:16", size: "1080×1920", note: "Chừa 250px trên và dưới cho giao diện ứng dụng." },
  { platform: "tiktok", label: "TikTok bìa", ratio: "9:16", size: "1080×1920", note: "Chữ tiêu đề ở 1/3 giữa khung." },
  { platform: "youtube", label: "YouTube thumbnail", ratio: "16:9", size: "1280×720", note: "Chữ to, tối đa 4 từ, mặt người nếu có." },
  { platform: "zalo", label: "Zalo OA", ratio: "1:1", size: "1080×1080", note: "Ảnh vuông hiện đủ trong danh sách bài." },
];

/** Bản mô tả ảnh (brief) để giao thiết kế hoặc đưa vào công cụ tạo ảnh; điền từ thương hiệu và bài viết. */
export function imageBriefTemplate(input: { title: string; hook?: string; primaryColor?: string; secondaryColor?: string; font?: string; tagline?: string }): string {
  return [
    `MÔ TẢ ẢNH: ${input.title}`,
    "",
    `Thông điệp chính (chữ trên ảnh, tối đa 8 từ): ${input.hook ?? ""}`,
    "Chủ thể: (người / sản phẩm / bối cảnh)",
    "Bố cục: (chủ thể ở đâu, chữ ở đâu, chừa chỗ cho logo góc nào)",
    `Màu chủ đạo: ${input.primaryColor ?? "#1e7a4b"} · màu phụ: ${input.secondaryColor ?? "#b7791f"}`,
    `Font chữ: ${input.font || "Be Vietnam Pro"}`,
    `Câu khẩu hiệu (nếu dùng): ${input.tagline ?? ""}`,
    "Phong cách: (ảnh thật / minh họa / tối giản / sang trọng)",
    "Không được có: chữ chiếm quá 20% ảnh, giá không có trong danh mục, hình ảnh gây hiểu nhầm về công dụng",
    "",
    "Kích thước cần xuất:",
    ...IMAGE_SPECS.map((s) => `- ${s.label}: ${s.ratio} (${s.size})`),
  ].join("\n");
}

export const IMAGE_MIMES = ["image/png", "image/jpeg", "image/webp"];
