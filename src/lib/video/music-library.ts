import fs from "node:fs";
import path from "node:path";
import { dataDir } from "./jobs";
import { OWNER_STATUS } from "./drop-import";

// Thư viện nhạc nền + SFX của bộ dựng: DATA_DIR/video-assets/{music,sfx}/manifest.json.
// Nạp từ kho tư liệu bằng scripts/video/library_sync.py (chỉ bài kho ghi ĐỦ-HỒ-SƠ, đúng sha256). "ĐỦ-HỒ-SƠ" là kiểm hồ sơ
// giấy phép, KHÔNG phải OWNER duyệt → giấy phép mang "chờ OWNER nghe duyệt"; bộ dựng (esv_render.pick_music) chỉ TỰ chọn
// bài đã bỏ dấu đó, và bảng kiểm P chặn đăng nếu bài chưa duyệt vẫn được dùng. Chỉ OWNER (quyền quản trị) duyệt / bỏ duyệt.

export const MUSIC_PENDING = "chờ OWNER nghe duyệt";
/** Không dùng theo Phần chung A5.2 / CK-11 (QĐ-CEO 1010): 552792, 241274 (LOẠI), 136824 (chưa tra bên thứ ba đăng lại) — cùng danh
 *  sách với music_pick.BANNED_IDS. Mixkit: OWNER 25/10/2026 mở lại bài OWNER đã nghe duyệt → app liệt kê bài Mixkit để OWNER duyệt /
 *  bỏ duyệt; bộ dựng (music_pick.banned) chỉ dùng bài Mixkit đã duyệt. */
export const BANNED_IDS = ["552792", "241274", "136824"];
const isBanned = (x: Raw) => {
  const hay = `${String(x.file ?? "")} ${String(x.source ?? "")} ${String(x.license ?? "")}`.toLowerCase();
  return BANNED_IDS.some((id) => hay.includes(id));
};

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

type Raw = Record<string, unknown>;

export function musicDir(): string {
  return path.join(dataDir(), "video-assets", "music");
}

function readManifest(dir: string): Raw[] {
  try {
    const v = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8")) as unknown;
    return Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Raw[]) : [];
  } catch {
    return [];
  }
}

function writeManifest(dir: string, items: Raw[]) {
  const mf = path.join(dir, "manifest.json");
  // Tệp tạm riêng từng lần ghi: máy dựng (thư mục thả) và nút duyệt ghi cùng lúc không giẫm tệp tạm của nhau
  const tmp = `${mf}.${process.pid}.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(items, null, 1));
  fs.renameSync(tmp, mf);
}

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

export function sfxCount(): number {
  const dir = path.join(dataDir(), "video-assets", "sfx");
  return readManifest(dir).filter((x) => typeof x.file === "string" && String(x.license ?? "").trim() && fs.existsSync(path.join(dir, String(x.file)))).length;
}

/** Đường dẫn tệp nhạc để nghe thử — chỉ tệp có trong manifest, nằm trong thư mục thư viện. */
export function musicFilePath(file: string): string | null {
  const dir = path.resolve(musicDir());
  if (!readManifest(dir).some((x) => x.file === file)) return null;
  const full = path.resolve(dir, file);
  return full.startsWith(dir + path.sep) && fs.existsSync(full) ? full : null;
}

const vnDate = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

/** OWNER nghe và duyệt dùng một bài (chỉ bài đang "chờ OWNER nghe duyệt"). Giữ nguyên văn giấy phép kho để bỏ duyệt được. */
export function approveMusic(file: string, by: string, now = new Date()): { ok: true } | { ok: false; error: string } {
  const dir = musicDir();
  const items = readManifest(dir);
  const it = items.find((x) => x.file === file);
  if (!it || it.exclude || isBanned(it)) return { ok: false, error: "Không có bài này trong thư viện nhạc (hoặc bài đã bị loại)" };
  const lic = String(it.license ?? "");
  if (!lic.includes(MUSIC_PENDING)) return { ok: false, error: "Bài này không ở trạng thái chờ nghe duyệt" };
  // Bài kho tư liệu đã kiểm hồ sơ (ĐỦ-HỒ-SƠ) hoặc bài OWNER tự khai giấy phép qua thư mục thả (src/lib/video/drop-import.ts)
  if (it.catalogStatus !== "ĐỦ-HỒ-SƠ" && it.catalogStatus !== OWNER_STATUS) return { ok: false, error: "Chỉ duyệt được bài kho tư liệu ghi ĐỦ-HỒ-SƠ hoặc bài anh tự khai giấy phép" };
  it.catalogLicense = lic;
  it.license = lic.replace(MUSIC_PENDING, `OWNER nghe duyệt ${vnDate(now)} (${by})`);
  it.ownerApproved = { at: now.toISOString(), by };
  writeManifest(dir, items);
  return { ok: true };
}

/** Bỏ duyệt: trả lại đúng giấy phép kho (lại "chờ OWNER nghe duyệt") → bộ dựng không tự chọn bài này nữa. */
export function unapproveMusic(file: string): { ok: true } | { ok: false; error: string } {
  const dir = musicDir();
  const items = readManifest(dir);
  const it = items.find((x) => x.file === file);
  if (!it || !it.ownerApproved || typeof it.catalogLicense !== "string") return { ok: false, error: "Bài này không được duyệt bằng nút duyệt trong app" };
  it.license = it.catalogLicense;
  delete it.ownerApproved;
  delete it.catalogLicense;
  writeManifest(dir, items);
  return { ok: true };
}
