import fs from "node:fs";
import path from "node:path";
import { dataDir } from "./jobs";
import { libraryFile } from "./safe-path";
import { approveMusicIn, isBannedMusic, readMusicManifest, unapproveMusicIn } from "./music-rules";
import { OWNER_STATUS } from "./drop-import";

// Thư viện nhạc nền + SFX của bộ dựng: DATA_DIR/video-assets/{music,sfx}/manifest.json.
// Nạp từ kho tư liệu bằng scripts/video/library_sync.py (chỉ bài kho ghi ĐỦ-HỒ-SƠ, đúng sha256). "ĐỦ-HỒ-SƠ" là kiểm hồ sơ
// giấy phép, KHÔNG phải OWNER duyệt → giấy phép mang "chờ OWNER nghe duyệt"; bộ dựng (esv_render.pick_music) chỉ TỰ chọn
// bài đã bỏ dấu đó, và bảng kiểm P chặn đăng nếu bài chưa duyệt vẫn được dùng. Chỉ OWNER (quyền quản trị) duyệt / bỏ duyệt.

// Luật duyệt + đọc / ghi manifest nằm ở music-rules.ts (dùng chung với máy dựng của OWNER — scripts/video/render-worker.mts).
export { BANNED_IDS, MUSIC_PENDING } from "./music-rules";
const isBanned = isBannedMusic;

export interface MusicTrack {
  file: string;
  title: string;
  author: string;
  genre: string;
  mood: string[];
  durationSec: number | null;
  license: string;
  credit: string;
  source: string;
  approved: boolean;
  /** Bài có quyết định riêng trước đây (vd Pixabay 552792 CEO duyệt), không qua nút duyệt → không cho bỏ duyệt ở đây. */
  approvedBy: string;
  isDefault: boolean;
}

export function musicDir(): string {
  return path.join(dataDir(), "video-assets", "music");
}

const readManifest = readMusicManifest;

/** Bài dùng được trong bộ dựng (có giấy phép, có tệp, không bị loại), bài mặc định lên đầu rồi theo loại. */
export function musicLibrary(): MusicTrack[] {
  const dir = musicDir();
  return readManifest(dir)
    .filter((x) => typeof x.file === "string" && String(x.license ?? "").trim() && !x.exclude && !isBanned(x) && fs.existsSync(path.join(dir, String(x.file))))
    .map((x) => {
      const license = String(x.license);
      const owner = x.ownerApproved as { by?: string } | undefined;
      return {
        file: String(x.file),
        title: String(x.title ?? x.file),
        author: String(x.author ?? ""),
        genre: String(x.genre ?? ""),
        mood: Array.isArray(x.mood) ? x.mood.map(String) : [],
        durationSec: typeof x.durationSec === "number" ? x.durationSec : null,
        license,
        credit: String(x.credit ?? ""),
        source: String(x.source ?? ""),
        approved: !license.includes("chờ OWNER"),
        approvedBy: owner?.by ? String(owner.by) : "",
        isDefault: !!x.default,
      };
    })
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.genre.localeCompare(b.genre) || a.file.localeCompare(b.file));
}

export function sfxDir(): string {
  return path.join(dataDir(), "video-assets", "sfx");
}

export interface SfxItem {
  file: string;
  title: string;
  /** Vai trò trong bộ dựng: whoosh, swoosh, pop, click, riser-impact… */
  kind: string;
  durationSec: number | null;
  license: string;
}

/** Hiệu ứng âm thanh có giấy phép đã nạp (chỉ đọc, để nghe thử ở trang Tư liệu). */
export function sfxLibrary(): SfxItem[] {
  const dir = sfxDir();
  return readManifest(dir)
    .filter((x) => typeof x.file === "string" && String(x.license ?? "").trim() && fs.existsSync(path.join(dir, String(x.file))))
    .map((x) => ({
      file: String(x.file),
      title: String(x.title ?? x.file),
      kind: String(x.kind ?? ""),
      durationSec: typeof x.durationSec === "number" ? x.durationSec : null,
      license: String(x.license),
    }));
}

/** Hiệu ứng âm thanh OWNER thả vào / tải lên (drop-import.ts → video-assets/sfx-owner/moi): vào kho, CHƯA gán vai trò trong bộ dựng
 *  (vai trò nằm ở sfx-owner/manifest.json, OWNER gán tay). Ở đây chỉ để nghe thử / xoá ở trang Tư liệu. */
export function sfxNewDir(): string {
  return path.join(dataDir(), "video-assets", "sfx-owner", "moi");
}

export function sfxNewLibrary(): SfxItem[] {
  const dir = sfxNewDir();
  return readManifest(dir)
    .filter((x) => typeof x.file === "string" && String(x.license ?? "").trim() && fs.existsSync(path.join(dir, String(x.file))))
    .map((x) => ({ file: String(x.file), title: String(x.title ?? String(x.file).replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ")), kind: "", durationSec: typeof x.durationSec === "number" ? x.durationSec : null, license: String(x.license) }));
}

/** Tệp hiệu ứng mới để nghe thử — chỉ tệp có trong manifest của sfx-owner/moi, nằm trong đúng thư mục đó. */
export function sfxNewFilePath(file: string): string | null {
  const dir = sfxNewDir();
  if (!readManifest(dir).some((x) => x.file === file)) return null;
  return libraryFile(dir, file);
}

export function sfxCount(): number {
  return sfxLibrary().length;
}

/** Đường dẫn tệp hiệu ứng âm thanh để nghe thử — chỉ tệp có trong manifest, nằm trong thư mục SFX. */
export function sfxFilePath(file: string): string | null {
  const dir = sfxDir();
  if (!readManifest(dir).some((x) => x.file === file)) return null;
  return libraryFile(dir, file);
}

/** Nhãn nguồn ngắn của giấy phép cho giao diện ("Mixkit" / "Pixabay" / "OWNER" / "Khác"); câu đầy đủ nằm trong (i). */
export function licenseSource(license: string): string {
  if (/^\s*mixkit/i.test(license)) return "Mixkit";
  if (/^\s*pixabay/i.test(license)) return "Pixabay";
  if (/owner|tự quay|tự khai/i.test(license)) return "OWNER";
  return "Khác";
}

/** Nhãn nguồn của NHẠC chỉ theo câu giấy phép gốc (bỏ đuôi trạng thái "— chờ OWNER nghe duyệt" / "— OWNER nghe duyệt …" mà app tự
 *  gắn, không thì bài nào cũng thành "OWNER"). Bài OWNER tự thả vào / tải lên (OWNER-CUNG-CAP) mà giấy phép không thuộc kho quen
 *  (Mixkit / Pixabay / OWNER) → "Anh tải lên". */
export function musicSourceLabel(license: string, catalogStatus?: unknown): string {
  const own = license.replace(/\s*—\s*(chờ OWNER nghe duyệt|OWNER nghe duyệt\b.*)$/u, "").trim();
  const s = licenseSource(own);
  return s === "Khác" && catalogStatus === OWNER_STATUS ? "Anh tải lên" : s;
}

/** Đường dẫn tệp nhạc để nghe thử — chỉ tệp có trong manifest, không bị cấm, nằm trong thư mục thư viện. */
export function musicFilePath(file: string): string | null {
  const dir = musicDir();
  const it = readManifest(dir).find((x) => x.file === file);
  // Bài trong danh sách cấm (BANNED_IDS, music-rules.ts) không phát kể cả nghe thử — cùng luật bộ dựng dùng
  if (!it || isBanned(it)) return null;
  return libraryFile(dir, file);
}

/** OWNER nghe và duyệt dùng một bài (chỉ bài đang "chờ OWNER nghe duyệt"). Giữ nguyên văn giấy phép kho để bỏ duyệt được.
 *  Luật ở music-rules.ts › musicApprovalError (máy dựng của OWNER áp quyết định từ web bằng cùng hàm approveMusicIn). */
export function approveMusic(file: string, by: string, now = new Date()): { ok: true } | { ok: false; error: string } {
  return approveMusicIn(musicDir(), file, by, now);
}

/** Bỏ duyệt: trả lại đúng giấy phép kho (lại "chờ OWNER nghe duyệt") → bộ dựng không tự chọn bài này nữa. */
export function unapproveMusic(file: string): { ok: true } | { ok: false; error: string } {
  return unapproveMusicIn(musicDir(), file);
}
