// Hợp đồng đồng bộ danh mục tư liệu MÁY CỦA OWNER → máy chủ (máy dựng scripts/video/render-worker.mts ↔ API
// /api/render-worker/{catalog,preview}). Chỉ hằng số + kiểu + hàm thuần (không fs / CSDL / alias @/) để cả hai phía dùng chung.

export const CATALOG_KINDS = ["music", "sfx", "broll", "drop"] as const;
export type CatalogKind = (typeof CATALOG_KINDS)[number];
/** Tiền tố đường dẫn (tương đối trong DATA_DIR/video-assets của máy OWNER) hợp lệ cho từng loại. */
export const KIND_PREFIX: Record<CatalogKind, string[]> = { music: ["music/"], sfx: ["sfx/", "sfx-owner/"], broll: ["broll/"], drop: ["tha-vao/"] };

export type PreviewType = "jpg" | "mp3";
/** Tệp xem trước máy chủ nhận: ảnh thu nhỏ JPEG (mục tiêu ≤ 480 px, ~60 KB) và đoạn nghe thử MP3 (≤ 30 s, 64 kbps ≈ 240 KB). */
export const PREVIEW_TYPES: Record<PreviewType, { mime: string; maxBytes: number }> = {
  jpg: { mime: "image/jpeg", maxBytes: 160 * 1024 },
  mp3: { mime: "audio/mpeg", maxBytes: 400 * 1024 },
};
/** Chỉ đúng hai loại — KHÔNG dùng `type in PREVIEW_TYPES` (khoá nguyên mẫu "constructor" / "__proto__" lọt qua, phản biện P1). */
export const isPreviewType = (t: unknown): t is PreviewType => t === "jpg" || t === "mp3";
export const PREVIEW_TARGET = { thumbPx: 480, thumbBytes: 60 * 1024, audioSec: 30, audioKbps: 64 } as const;

export const CATALOG_LIMITS = {
  /** Số mục tối đa một lần đồng bộ. */
  maxItems: 5000,
  /** Thân yêu cầu POST catalog (JSON). Kho thật ~0,7 KB / mục (5000 mục ≈ 3,6 MB); máy dựng tự rút gọn chữ dài khi vượt
   *  (scripts/video/owner-catalog.mts › fitCatalogBody). */
  maxBodyBytes: 8 * 1024 * 1024,
  /** Trần số dòng remote_assets (kể cả mục đã gỡ còn giữ). */
  maxRows: 20_000,
  /** Mục đã gỡ khỏi máy OWNER giữ bao lâu rồi xoá hẳn. */
  removedKeepDays: 7,
  /** Tổng dung lượng tệp xem trước lưu ở máy chủ (DATA_DIR/remote-assets/previews). */
  maxTotalPreviewBytes: 512 * 1024 * 1024,
} as const;

export type CatalogMedia = "audio" | "image" | "video" | "other";

/** Một mục máy OWNER báo lên: CHỈ metadata đã lọc (không ID Drive, không đường dẫn tuyệt đối) + sha256 tệp gốc + mã băm tệp xem trước. */
export interface CatalogItemIn {
  /** Đường dẫn tương đối trong video-assets, vd "music/a.mp3", "broll/anh/x.jpg", "tha-vao/nhac/b.mp3". */
  path: string;
  kind: CatalogKind;
  media: CatalogMedia;
  title: string;
  author?: string;
  durationSec?: number | null;
  genre?: string;
  tags?: string[];
  source?: string;
  license?: string;
  /** Trạng thái kiểm hồ sơ của kho (ĐỦ-HỒ-SƠ / OWNER-CUNG-CAP / NGHI-AI …). */
  catalogStatus?: string;
  exclude?: boolean;
  excludeReason?: string;
  desc?: string;
  /** Nhạc: đã duyệt bằng nút duyệt trong app (manifest có ownerApproved). */
  approvedBy?: string;
  approvedAt?: string;
  /** Nhạc: manifest còn giữ giấy phép kho (catalogLicense) → bỏ duyệt được. */
  hasCatalogLicense?: boolean;
  isDefault?: boolean;
  /** Tư liệu thả vào chưa nhận: lý do. */
  reason?: string;
  /** sha256 tệp gốc trên máy OWNER ("" chỉ cho tư liệu thả vào đang chờ). */
  sha256: string;
  size?: number;
  preview?: { sha256: string; type: PreviewType; bytes: number } | null;
}

/** Máy dựng xác nhận đã áp (hoặc không áp được) một quyết định duyệt. */
export interface CatalogAck {
  id: string;
  ok: boolean;
  error?: string;
}

export interface CatalogSyncRequest {
  /** sha256 của danh mục (máy dựng tự tính) — chỉ để hiển thị / so lần gửi. */
  hash: string;
  items: CatalogItemIn[];
  acks?: CatalogAck[];
}

export interface DecisionOut {
  id: string;
  /** Tên tệp trong music/manifest.json của máy OWNER. */
  file: string;
  sha256: string;
  action: "approve" | "unapprove";
  by: string;
  at: string;
}

export interface CatalogSyncResponse {
  ok: true;
  added: number;
  changed: number;
  removed: number;
  unchanged: number;
  missingPreviews: { sha256: string; type: PreviewType }[];
  decisions: DecisionOut[];
}

export const isSha256 = (s: unknown): s is string => typeof s === "string" && /^[a-f0-9]{64}$/.test(s);

/** Đường dẫn danh mục an toàn: tương đối, không "..", không thành phần ẩn, không ký tự điều khiển / "\", đúng tiền tố loại. */
export function safeCatalogPath(p: unknown, kind: CatalogKind): p is string {
  if (typeof p !== "string" || !p || p.length > 300 || p.startsWith("/") || p.includes("\\")) return false;
  if (/[\u0000-\u001f\u007f]/.test(p)) return false;
  if (!KIND_PREFIX[kind].some((x) => p.startsWith(x))) return false;
  return p.split("/").every((seg) => seg.length > 0 && seg.length <= 160 && !seg.startsWith(".") && seg !== "..");
}

/** Xoá đường dẫn tuyệt đối (/Users/…, C:\…, ~/…) khỏi câu lỗi / lý do — chỉ giữ tên tệp. Không đụng URL (https://…) và đường dẫn
 *  tương đối ("HINH-ANH/ẢNH VĂN PHÒNG"). Dùng ở máy dựng trước khi gửi và ở máy chủ khi nhận. */
export function stripAbsPaths(s: string): string {
  const base = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? "";
  return s
    .replace(/(['"`])((?:[A-Za-z]:\\|\/|~\/)[^'"`]*)\1/g, (_m, q: string, p: string) => `${q}${base(p)}${q}`)
    .replace(/(?<![\w:/.~\\-])(?:[A-Za-z]:\\|~\/|\/)(?:[^\s'"`<>|\\/]+[\\/])+([^\s'"`<>|\\/]*)/g, (_m, b: string) => b || "…");
}

/** Kiểm "magic bytes": JPEG (FF D8 FF) / MP3 (thẻ ID3 hoặc khung MPEG audio FF Ex/Fx). */
export function previewMagicOk(type: PreviewType, b: Uint8Array): boolean {
  if (b.length < 4) return false;
  if (type === "jpg") return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) return true; // "ID3"
  return b[0] === 0xff && (b[1] & 0xe0) === 0xe0;
}
