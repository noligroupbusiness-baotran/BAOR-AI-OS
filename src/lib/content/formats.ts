// Định dạng nội dung: bài viết, kịch bản video, caption, hình ảnh. Mọi kiểm tra ở đây là theo luật
// (đếm ký tự, hashtag, khung kịch bản, tỷ lệ ảnh), không gọi AI; AI chỉ dùng khi người bấm "AI viết nháp".
import type { ContentFormat } from "@/lib/types";
import { PERSONAL_CLAIM } from "./scoring";

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

/** Khung kịch bản CŨ 5 cảnh (15–60 giây). Giữ cho kịch bản đã làm và kịch bản quay sinh từ brief (src/lib/content/shooting-script.ts). */
export const SCRIPT_SCENES: Scene[] = [
  { name: "Hook", seconds: "0–3s", goal: "Giữ người xem: câu hỏi, con số, hoặc cảnh gây tò mò." },
  { name: "Vấn đề", seconds: "3–10s", goal: "Nỗi đau khách đang gặp, nói bằng lời của khách." },
  { name: "Giải pháp", seconds: "10–30s", goal: "Sản phẩm / dịch vụ giải quyết thế nào, chỉ nêu công dụng có trong danh mục." },
  { name: "Bằng chứng", seconds: "30–45s", goal: "Khách thật, trước sau, con số, đánh giá." },
  { name: "Kêu gọi", seconds: "45–60s", goal: "Một hành động duy nhất: inbox, đặt lịch, comment." },
];

// Định dạng MẶC ĐỊNH cho nội dung mới (OWNER 26/10: "content viết ra nên là dạng vlog chia sẻ dưới 1 phút"): vlog ngôi thứ nhất,
// ≤ 60 giây (~130–160 từ lời thoại): hook 3 giây → câu chuyện / trải nghiệm thật → MỘT bài học cụ thể → kết nhẹ (CTA mềm).
export const VLOG_MAX_SEC = 60;
/** Tốc độ nói vlog chia sẻ bình thường: ~160 từ (âm tiết) / phút. */
export const VLOG_WORDS_PER_SEC = 2.7;
export const VLOG_SCENES: Scene[] = [
  { name: "Hook", seconds: "0–3s", goal: "Một câu nói thẳng vào camera, ≤ 12–15 chữ." },
  { name: "Câu chuyện", seconds: "3–25s", goal: "Chuyện / trải nghiệm thật, ngôi thứ nhất — không bịa." },
  { name: "Bài học", seconds: "25–50s", goal: "MỘT bài học cụ thể, làm được ngay." },
  { name: "Kết", seconds: "50–60s", goal: "Kết nhẹ, CTA mềm (hỏi ý kiến, lưu lại) — không chào bán." },
];

/** Khung vlog chia sẻ < 1 phút; điền sẵn hook và dàn ý (nếu có). Câu chuyện thật để OWNER kể — hệ thống không viết thay. */
export function vlogTemplate(input: { title?: string; hook?: string; beats?: string[] } = {}): string {
  const beats = (input.beats ?? []).map((b) => b.trim()).filter(Boolean);
  // Dàn ý ≥ 3 nhịp: nhịp cuối là kết, phần còn lại chia đôi cho câu chuyện / bài học (AI mới trả đúng 3 nhịp: chuyện · bài học · kết)
  const body = beats.length >= 3 ? beats.slice(0, -1) : beats;
  const story = body.slice(0, Math.max(1, Math.ceil(body.length / 2)));
  const lesson = body.slice(story.length);
  const end = beats.length >= 3 ? beats.at(-1) : "";
  const note = (xs: string[]) => (xs.length ? `Ý chính: ${xs.join(" · ")}\n` : "");
  const head = input.title ? `KỊCH BẢN VLOG: ${input.title}\n` : "";
  // Hook kể chuyện riêng ("mình từng mất…") mà hệ thống chưa kiểm được: giữ làm lời thoại nhưng ghi chú để OWNER xác nhận / sửa
  const claim = PERSONAL_CLAIM.test(input.hook ?? "");
  return (
    `${head}Dạng: vlog chia sẻ, nói ngôi thứ nhất · dưới ${VLOG_MAX_SEC} giây · ~130–160 từ lời thoại\n\n` +
    `1. HOOK (0–3s)\nHình ảnh: cận mặt, nói thẳng vào camera\nLời thoại: ${input.hook?.trim() ?? ""}\n${claim ? `${OWNER_CHECK}\n` : ""}Chữ trên màn hình: \n\n` +
    `2. CÂU CHUYỆN (3–25s)\nHình ảnh: \n${note(story)}Gợi ý OWNER: [OWNER KỂ: một lần mình gặp đúng chuyện này — ở đâu, chuyện gì, mình thấy thế nào]\nLời thoại: \nChữ trên màn hình: \n\n` +
    `3. BÀI HỌC (25–50s)\nHình ảnh: \n${note(lesson)}Lời thoại: \nChữ trên màn hình: \n\n` +
    `4. KẾT (50–60s)\nHình ảnh: \n${end ? `Ý chính: ${end}\n` : ""}Lời thoại: \nChữ trên màn hình: \n\n` +
    "Nhạc nền: (chọn trong Cài đặt › Kho nhạc)\nGhi chú dựng: "
  );
}

/** Ghi chú dưới hook có chuyện riêng — dấu [OWNER KỂ: …] nằm ở dòng Gợi ý OWNER, không lọt vào lời thoại. */
export const OWNER_CHECK = "Gợi ý OWNER: [OWNER KỂ: câu hook nói về trải nghiệm riêng — chỉ giữ nếu đúng chuyện thật của anh, không thì sửa câu hook]";

/** Khung kịch bản để chèn vào ô nháp — mặc định là vlog chia sẻ < 1 phút. */
export function scriptTemplate(title = ""): string {
  return vlogTemplate({ title });
}

/** Tên cảnh đứng ĐẦU DÒNG như tiêu đề cảnh ("2. VẤN ĐỀ (3–10s)", "BÀI HỌC") — chữ trong lời thoại / gợi ý OWNER không tính. */
function hasHeading(draft: string, name: string): boolean {
  const n = name.toLowerCase();
  return draft
    .normalize("NFC")
    .toLowerCase()
    .split("\n")
    .some((l) => {
      const t = l.trim().replace(/^\d+\s*[.)]\s*/u, "");
      return t.startsWith(n) && !/^[\p{L}]/u.test(t.slice(n.length));
    });
}

/** Kịch bản theo khung cũ 5 cảnh: có tiêu đề cảnh Vấn đề / Giải pháp / Bằng chứng / Kêu gọi và không có tiêu đề Câu chuyện / Bài học. */
export function isLegacyScript(draft: string): boolean {
  const vlogOnly = ["Câu chuyện", "Bài học"].some((n) => hasHeading(draft, n));
  return !vlogOnly && ["Vấn đề", "Giải pháp", "Bằng chứng", "Kêu gọi"].some((n) => hasHeading(draft, n));
}

/** Số từ (âm tiết) trong các dòng "Lời thoại:" và thời lượng nói ước tính ở tốc độ vlog bình thường. */
export function speechEstimate(draft: string): { words: number; seconds: number } {
  const lines = draft.normalize("NFC").split("\n").filter((l) => /^\s*lời thoại\s*:/iu.test(l));
  const words = lines.reduce((n, l) => n + l.replace(/^\s*lời thoại\s*:/iu, "").replace(/\[[^\]]*\]/g, " ").split(/[^\p{L}\p{N}]+/u).filter(Boolean).length, 0);
  return { words, seconds: Math.round(words / VLOG_WORDS_PER_SEC) };
}

/** Kiểm tra kịch bản có đủ các cảnh bắt buộc chưa (khớp theo tên cảnh, không phân biệt hoa thường). Tự nhận khung vlog (mặc định) hay khung cũ 5 cảnh. */
export function scriptCheck(draft: string, opts: { format?: "vlog" | "legacy" } = {}): { format: "vlog" | "legacy"; defs: Scene[]; scenes: { name: string; present: boolean }[]; missing: string[]; hasSpeech: boolean; words: number; seconds: number; tooLong: boolean } {
  const lower = draft.normalize("NFC").toLowerCase();
  // Kịch bản quay từ brief luôn là khung cũ 5 cảnh (luật kiểm CP02) — trang truyền format="legacy"
  const legacy = opts.format ? opts.format === "legacy" : isLegacyScript(draft);
  const defs = legacy ? SCRIPT_SCENES : VLOG_SCENES;
  // Khung vlog: tên cảnh phải đứng đầu dòng ("4. KẾT…") — "kết" giữa câu ("kết quả") không tính. Khung cũ giữ cách khớp cũ.
  const scenes = defs.map((s) => ({ name: s.name, present: legacy ? lower.includes(s.name.toLowerCase()) : hasHeading(draft, s.name) }));
  const hasSpeech = /lời thoại:[ \t]*\S/i.test(draft);
  const sp = speechEstimate(draft);
  return { format: legacy ? "legacy" : "vlog", defs, scenes, missing: scenes.filter((s) => !s.present).map((s) => s.name), hasSpeech, ...sp, tooLong: sp.seconds > VLOG_MAX_SEC };
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
