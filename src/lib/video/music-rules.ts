// Luật duyệt nhạc nền + đọc / ghi manifest thư viện nhạc — MỘT nguồn cho cả máy chủ (music-library.ts › approveMusic) và máy dựng
// của OWNER (scripts/video/render-worker.mts áp quyết định duyệt từ web vào manifest trên máy OWNER). Chỉ dùng node:fs / node:path
// (không alias @/, không CSDL) để máy dựng gọi thẳng được, giống drop-import.ts.
import fs from "node:fs";
import path from "node:path";
import { OWNER_STATUS } from "./drop-import";

export const MUSIC_PENDING = "chờ OWNER nghe duyệt";
/** Không dùng theo Phần chung A5.2 / CK-11 (QĐ-CEO 1010): 552792, 241274 (LOẠI), 136824 (chưa tra bên thứ ba đăng lại) — cùng danh
 *  sách với music_pick.BANNED_IDS. Mixkit: OWNER 25/10/2026 mở lại bài OWNER đã nghe duyệt → app liệt kê bài Mixkit để OWNER duyệt /
 *  bỏ duyệt; bộ dựng (music_pick.banned) chỉ dùng bài Mixkit đã duyệt. */
export const BANNED_IDS = ["552792", "241274", "136824"];

export type RawMusic = Record<string, unknown>;

export const isBannedMusic = (x: RawMusic) => {
  const hay = `${String(x.file ?? "")} ${String(x.source ?? "")} ${String(x.license ?? "")}`.toLowerCase();
  return BANNED_IDS.some((id) => hay.includes(id));
};

export function readMusicManifest(dir: string): RawMusic[] {
  try {
    const v = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8")) as unknown;
    return Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as RawMusic[]) : [];
  } catch {
    return [];
  }
}

export function writeMusicManifest(dir: string, items: RawMusic[]) {
  const mf = path.join(dir, "manifest.json");
  // Tệp tạm riêng từng lần ghi: máy dựng (thư mục thả) và nút duyệt ghi cùng lúc không giẫm tệp tạm của nhau
  const tmp = `${mf}.${process.pid}.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(items, null, 1));
  fs.renameSync(tmp, mf);
}

/** Lý do KHÔNG duyệt được một mục manifest (null = duyệt được). Máy chủ dùng cùng hàm để kiểm mục máy OWNER báo lên. */
export function musicApprovalError(it: RawMusic | undefined): string | null {
  if (!it || it.exclude || isBannedMusic(it)) return "Không có bài này trong thư viện nhạc (hoặc bài đã bị loại)";
  if (!String(it.license ?? "").includes(MUSIC_PENDING)) return "Bài này không ở trạng thái chờ nghe duyệt";
  // Bài kho tư liệu đã kiểm hồ sơ (ĐỦ-HỒ-SƠ) hoặc bài OWNER tự khai giấy phép qua thư mục thả (src/lib/video/drop-import.ts)
  if (it.catalogStatus !== "ĐỦ-HỒ-SƠ" && it.catalogStatus !== OWNER_STATUS) return "Chỉ duyệt được bài kho tư liệu ghi ĐỦ-HỒ-SƠ hoặc bài anh tự khai giấy phép";
  return null;
}

/** Lý do KHÔNG bỏ duyệt được (null = bỏ được): chỉ bài đã duyệt bằng nút duyệt trong app (còn giữ giấy phép kho để trả lại). */
export function musicUnapprovalError(it: RawMusic | undefined): string | null {
  if (!it || !it.ownerApproved || typeof it.catalogLicense !== "string") return "Bài này không được duyệt bằng nút duyệt trong app";
  return null;
}

const vnDate = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

/** Duyệt một bài trong manifest ở thư mục `dir` (chỉ bài đang "chờ OWNER nghe duyệt"). Giữ nguyên văn giấy phép kho để bỏ duyệt được. */
export function approveMusicIn(dir: string, file: string, by: string, now = new Date()): { ok: true } | { ok: false; error: string } {
  const items = readMusicManifest(dir);
  const it = items.find((x) => x.file === file);
  const err = musicApprovalError(it);
  if (err || !it) return { ok: false, error: err ?? "Không có bài này" };
  const lic = String(it.license ?? "");
  it.catalogLicense = lic;
  it.license = lic.replace(MUSIC_PENDING, `OWNER nghe duyệt ${vnDate(now)} (${by})`);
  it.ownerApproved = { at: now.toISOString(), by };
  writeMusicManifest(dir, items);
  return { ok: true };
}

/** Bỏ duyệt: trả lại đúng giấy phép kho (lại "chờ OWNER nghe duyệt") → bộ dựng không tự chọn bài này nữa. */
export function unapproveMusicIn(dir: string, file: string): { ok: true } | { ok: false; error: string } {
  const items = readMusicManifest(dir);
  const it = items.find((x) => x.file === file);
  const err = musicUnapprovalError(it);
  if (err || !it) return { ok: false, error: err ?? "Không có bài này" };
  it.license = it.catalogLicense as string;
  delete it.ownerApproved;
  delete it.catalogLicense;
  writeMusicManifest(dir, items);
  return { ok: true };
}
