// Luật nút "Tải lên" ở trang Tư liệu (OWNER 26/10/2026: "nút up trực tiếp … không cần mò vào từng thư mục"). Thuần (không node:*),
// dùng chung trình duyệt (chọn ngăn mặc định, báo trước tệp quá lớn) và máy chủ (route /api/video-assets/upload kiểm lại toàn bộ).
// Tệp tải lên đi vào ĐÚNG đường ống thư mục thả (drop-import.ts) nên luật giấy phép / nhạc chờ duyệt giữ nguyên.
import { DROP_KINDS, type DropKind } from "./drop-kinds";

export type UploadMedia = "audio" | "image" | "video";

export const UPLOAD_TARGETS: { key: DropKind; label: string }[] = [
  { key: "nhac", label: "Nhạc" },
  { key: "hieu-ung-am-thanh", label: "Hiệu ứng" },
  { key: "anh-broll", label: "Ảnh·clip" },
];

const MB = 1024 * 1024;
/** Cùng mức các luồng tải sẵn có: nhạc 25 MB (src/lib/uploads.ts), ảnh 8 MB (uploads.ts), clip 1 GB (api/video-assets/broll). */
export const UPLOAD_MAX_BYTES: Record<UploadMedia, number> = { audio: 25 * MB, image: 8 * MB, video: 1024 * MB };
export const UPLOAD_LIMIT_TEXT = "Âm thanh ≤ 25 MB · ảnh ≤ 8 MB · clip ≤ 1 GB";
export const UPLOAD_ACCEPT = [...new Set(Object.values(DROP_KINDS).flatMap((k) => k.exts))].join(",");

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const VIDEO_EXT = new Set([".mp4", ".mov", ".m4v"]);
const AUDIO_EXT = new Set<string>([...DROP_KINDS.nhac.exts, ...DROP_KINDS["hieu-ung-am-thanh"].exts]);

export const extOf = (name: string) => {
  const m = /\.[^./\\]+$/.exec(name);
  return m ? m[0].toLowerCase() : "";
};

export function mediaOfExt(ext: string): UploadMedia | null {
  if (AUDIO_EXT.has(ext)) return "audio";
  if (IMAGE_EXT.has(ext)) return "image";
  if (VIDEO_EXT.has(ext)) return "video";
  return null;
}

/** Ngăn mặc định theo đuôi: âm thanh → Nhạc (anh đổi sang Hiệu ứng nếu cần), ảnh / clip → Ảnh·clip; đuôi lạ → null. */
export function defaultTarget(name: string): DropKind | null {
  const m = mediaOfExt(extOf(name));
  return m === "audio" ? "nhac" : m ? "anh-broll" : null;
}

/** Ngăn nhận được đuôi này (để tắt lựa chọn sai trong giao diện). */
export const targetAccepts = (target: DropKind, ext: string) => (DROP_KINDS[target].exts as readonly string[]).includes(ext);

/** Tên tệp tối đa theo BYTE UTF-8 (ổ đĩa giới hạn 255 byte; chữ Việt có dấu 2–3 byte / ký tự) — chừa chỗ cho hậu tố. */
export const NAME_MAX_BYTES = 200;
const utf8Len = (s: string) => new TextEncoder().encode(s).length;
/** Cắt theo ký tự (không cắt giữa ký tự nhiều byte) cho tới khi ≤ max byte UTF-8. */
function capBytes(s: string, max: number): string {
  let out = "";
  let n = 0;
  for (const ch of s) {
    const b = utf8Len(ch);
    if (n + b > max) break;
    out += ch;
    n += b;
  }
  return out;
}

/**
 * Tên tệp an toàn để đặt trong thư mục thả: chỉ lấy phần sau dấu / hoặc \ cuối, bỏ NUL / ký tự điều khiển / ký tự cấm trên ổ đĩa,
 * bỏ dấu chấm / khoảng trắng đầu (không thành tệp ẩn, không ".."), giữ chữ có dấu (tên nhạc thành tên bài). null = không dùng được.
 */
export function sanitizeUploadName(raw: string): string | null {
  if (!raw || raw.includes("\0")) return null;
  const last = raw.split(/[\\/]/).pop() ?? "";
  const safeChars = Array.from(last.normalize("NFC"), (c) => (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 || ':*?"<>|'.includes(c) ? "-" : c)).join("");
  const cleaned = safeChars.replace(/\s+/g, " ").replace(/^[.\s-]+/, "").trim();
  const ext = extOf(cleaned);
  if (!ext || !mediaOfExt(ext)) return null;
  const stem = capBytes(cleaned.slice(0, cleaned.length - ext.length), NAME_MAX_BYTES - utf8Len(ext) - 8).replace(/[.\s]+$/, ""); // chừa "-NN" khi trùng
  if (!stem || stem === "." || stem === "..") return null;
  return `${stem}${ext}`;
}

/** Một dòng chữ an toàn cho tệp .txt kèm theo (không xuống dòng → không chèn được dòng "Giấy phép:" / "Từ khoá:" giả). */
export const oneLine = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max); // \s gồm cả \r \n \t và U+2028 / U+2029

/** Mô tả ảnh / clip B-roll tối đa (ký tự). */
export const DESC_MAX = 200;
/**
 * Mô tả ảnh / clip an toàn (đi thẳng vào lời nhắc của bộ dựng — scripts/video/ai_plan.py › asset_text): MỘT dòng như oneLine, bỏ ký tự
 * điều khiển, bỏ ngoặc [] {} <> ` (không giả được nhãn "[CÓ SẢN PHẨM …]" của bộ dựng), tối đa `max`. Rỗng = không có mô tả.
 */
export function cleanDesc(raw: unknown, max = DESC_MAX): string {
  if (typeof raw !== "string") return "";
  return oneLine(raw.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/[[\]{}<>`]/g, ""), max).trim();
}

export interface UploadRequest {
  name: string;
  target: string;
  license: string;
  keywords?: string;
  /** Mô tả ngắn nội dung ảnh / clip (tuỳ chọn, chỉ ngăn Ảnh·clip) — ghi dòng "Mô tả:" của tệp .txt kèm theo. */
  desc?: string;
  /** Kích thước khai báo (Content-Length) — 0 nếu không rõ; giới hạn thật còn được đếm khi ghi luồng. */
  size?: number;
}

export type UploadCheck =
  | { ok: true; name: string; target: DropKind; ext: string; media: UploadMedia; maxBytes: number; license: string; keywords: string[]; desc: string }
  | { ok: false; status: number; error: string };

/** Kiểm một tệp trước khi nhận (máy chủ gọi lại đủ, không tin trình duyệt). Không đọc nội dung — xem sniffMedia. */
export function checkUpload(r: UploadRequest): UploadCheck {
  const name = sanitizeUploadName(r.name);
  if (!name) return { ok: false, status: 415, error: "Tên / loại tệp không hợp lệ" };
  if (!(r.target in DROP_KINDS)) return { ok: false, status: 400, error: "Chưa chọn Nhạc / Hiệu ứng / Ảnh·clip" };
  const target = r.target as DropKind;
  const ext = extOf(name);
  if (!targetAccepts(target, ext)) return { ok: false, status: 415, error: `${DROP_KINDS[target].label} không nhận tệp ${ext}` };
  const media = mediaOfExt(ext)!;
  const maxBytes = UPLOAD_MAX_BYTES[media];
  if (r.size && r.size > maxBytes) return { ok: false, status: 413, error: `Tệp vượt ${Math.round(maxBytes / MB)} MB` };
  const license = oneLine(r.license ?? "", 300);
  if (!license) return { ok: false, status: 400, error: "Cần ghi nguồn / giấy phép" };
  const keywords = target === "anh-broll" ? oneLine(r.keywords ?? "", 300).split(/[,;]/).map((k) => k.trim()).filter(Boolean).slice(0, 20) : [];
  const desc = target === "anh-broll" ? cleanDesc(r.desc ?? "") : "";
  return { ok: true, name, target, ext, media, maxBytes, license, keywords, desc };
}

const at = (b: Uint8Array, off: number, s: string) => s.split("").every((c, i) => b[off + i] === c.charCodeAt(0));

/**
 * Loại nội dung theo vài byte đầu (không tin MIME trình duyệt gửi): MP3 (ID3 / khung MPEG), WAV, FLAC, OGG, AAC (ADTS), MP4 / MOV /
 * M4A (ftyp / moov / mdat / wide / free), JPEG, PNG, WebP. Họ MP4 dùng chung cho âm thanh và clip → trả "mp4" để bên gọi tự so.
 */
export function sniffMedia(head: Uint8Array): UploadMedia | "mp4" | null {
  if (head.length < 12) return null;
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image";
  if (head[0] === 0x89 && at(head, 1, "PNG")) return "image";
  if (at(head, 0, "RIFF") && at(head, 8, "WEBP")) return "image";
  if (at(head, 0, "RIFF") && at(head, 8, "WAVE")) return "audio";
  if (at(head, 0, "ID3") || at(head, 0, "fLaC") || at(head, 0, "OggS")) return "audio";
  if (head[0] === 0xff && (head[1] & 0xe0) === 0xe0) return "audio"; // khung MPEG (MP3) / ADTS (AAC)
  if (["ftyp", "moov", "mdat", "wide", "free", "skip"].some((t) => at(head, 4, t))) return "mp4";
  return null;
}

/** Nội dung có khớp đuôi tệp không (mp4 / mov / m4v / m4a / aac-trong-mp4 đều là họ MP4). */
export function contentMatches(media: UploadMedia, ext: string, sniffed: ReturnType<typeof sniffMedia>): boolean {
  if (sniffed === "mp4") return media === "video" || ext === ".m4a" || ext === ".aac";
  return sniffed === media;
}
