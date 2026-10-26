// Xoá tư liệu KHÔNG mất hẳn (OWNER 26/10/2026: "cho phép xoá những tư liệu không cần thiết"): tệp nhạc nền / hiệu ứng âm thanh /
// ảnh·clip B-roll trên MÁY CHỦ được CHUYỂN vào DATA_DIR/video-assets/da-xoa/<loại>/<thời điểm>-<tên> và gỡ khỏi danh mục
// (manifest.json) → bộ dựng không còn dùng. Mục danh mục (giấy phép, từ khoá, duyệt…) cất nguyên văn trong da-xoa/index.json để
// "Khôi phục" trả lại đúng như cũ. Tệp trong thùng quá 30 ngày được dọn hẳn bởi lượt dọn hằng ngày (retention.ts › pruneOldData).
// Không nhận đường dẫn tuỳ ý: tệp phải nằm trong thư mục thư viện (safe-path.ts › libraryFile) VÀ có trong danh mục.
// Tư liệu "Máy của anh" không xoá từ đây (tệp nằm trên Mac của OWNER). library_sync.py đọc index.json + removed.json (bia mộ
// vĩnh viễn, còn sau khi thùng dọn hẳn) để không tải lại bài kho OWNER đã xoá.
// Chỉ node:fs / node:path + import tương đối (máy dựng / kiểm thử gọi thẳng được).
import fs from "node:fs";
import path from "node:path";
import { libraryFile } from "./safe-path";

/** sfx-new = hiệu ứng OWNER thả vào / tải lên, chưa gán vai trò (video-assets/sfx-owner/moi). */
export type TrashKind = "music" | "sfx" | "sfx-new" | "broll";
export const TRASH_KINDS: TrashKind[] = ["music", "sfx", "sfx-new", "broll"];
/** Thư mục thư viện (trong video-assets) của từng loại — cố định, không ghép từ dữ liệu người dùng. */
export const TRASH_LIB_DIR: Record<TrashKind, string> = { music: "music", sfx: "sfx", "sfx-new": "sfx-owner/moi", broll: "broll" };
export const TRASH_DAYS = 30;

export interface TrashEntry {
  id: string;
  kind: TrashKind;
  /** Đường dẫn cũ trong thư mục thư viện (vd "anh/a.jpg"). */
  file: string;
  /** Đường dẫn trong da-xoa (vd "broll/20261026T041500-a.jpg"). */
  trashed: string;
  title: string;
  /** Mục danh mục nguyên văn — để khôi phục. */
  entry: Record<string, unknown>;
  at: string;
  by: string;
}

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

export const trashDir = (dataDir: string) => path.join(dataDir, "video-assets", "da-xoa");
const libDir = (dataDir: string, kind: TrashKind) => path.join(dataDir, "video-assets", TRASH_LIB_DIR[kind]);
const indexFile = (dataDir: string) => path.join(trashDir(dataDir), "index.json");
/** Bia mộ VĨNH VIỄN của tư liệu OWNER đã xoá (còn sau khi thùng dọn hẳn 30 ngày): library_sync.py đọc để không tải lại bài kho
 *  OWNER đã xoá. Khôi phục thì gỡ bia mộ của đúng tệp đó. */
export const removedFile = (dataDir: string) => path.join(trashDir(dataDir), "removed.json");
export interface Tombstone {
  kind: TrashKind;
  file: string;
  at: string;
}

function readJsonList<T>(f: string): T[] {
  if (!fs.existsSync(f)) return [];
  const v = JSON.parse(fs.readFileSync(f, "utf8")) as unknown;
  if (!Array.isArray(v)) throw new Error(`${path.basename(path.dirname(f))}/${path.basename(f)} không đúng dạng`);
  return v as T[];
}

const stampOf = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "");

/**
 * Đọc danh sách để GHI LẠI: tệp hỏng / sai dạng thì KHÔNG ghi đè — đổi tên thành <tên>.corrupt-<thời điểm>.json (giữ để xem lại)
 * rồi bắt đầu danh sách mới (phản biện P3: không để một tệp hỏng làm mất dấu tư liệu đã xoá).
 */
function readListForWrite<T>(f: string): T[] {
  try {
    return readJsonList<T>(f);
  } catch {
    const bak = f.replace(/\.json$/, `.corrupt-${stampOf(new Date())}-${Math.random().toString(36).slice(2, 6)}.json`);
    fs.renameSync(f, bak);
    return [];
  }
}

/** Ghi danh sách: tệp tạm riêng + rename (máy dựng / nút duyệt ghi cùng lúc không giẫm nhau). */
function writeJsonList(f: string, items: unknown[]) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = `${f}.${process.pid}.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(items, null, 1));
  fs.renameSync(tmp, f);
}

function moveFile(from: string, to: string) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  try {
    fs.renameSync(from, to);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EXDEV") throw e;
    fs.copyFileSync(from, to);
    fs.unlinkSync(from);
  }
}

/** Đường dẫn trong `root` cho tên tương đối `rel` (chưa cần tồn tại) — null nếu thoát ra ngoài. */
function inside(root: string, rel: string): string | null {
  if (!rel || rel.includes("\0") || path.isAbsolute(rel)) return null;
  const r = path.resolve(root);
  const full = path.resolve(r, rel);
  return full.startsWith(r + path.sep) ? full : null;
}


/** Chỉ đọc (giao diện): tệp hỏng → [] (không sửa gì); các thao tác ghi dùng readListForWrite. */
export function listTrash(dataDir: string): TrashEntry[] {
  try {
    return readJsonList<TrashEntry>(indexFile(dataDir)).filter((e) => e && typeof e.id === "string");
  } catch {
    return [];
  }
}

/** Chuyển một tệp thư viện (máy chủ) vào thùng "Đã xoá" và gỡ khỏi danh mục. */
export function trashAsset(dataDir: string, kind: TrashKind, file: string, by: string, now = new Date()): Result<{ entry: TrashEntry }> {
  if (!TRASH_KINDS.includes(kind)) return { ok: false, error: "Loại tư liệu không xoá được" };
  const dir = libDir(dataDir, kind);
  const full = libraryFile(dir, file);
  if (!full) return { ok: false, error: "Không tìm thấy tệp trong thư viện" };
  const mf = path.join(dir, "manifest.json");
  let items: Record<string, unknown>[];
  try {
    items = readJsonList<Record<string, unknown>>(mf);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const entry = items.find((x) => x && x.file === file);
  if (!entry) return { ok: false, error: "Tệp không có trong danh mục" };
  const index = readListForWrite<TrashEntry>(indexFile(dataDir));
  let trashed = `${kind}/${stampOf(now)}-${path.basename(file)}`;
  for (let i = 2; fs.existsSync(path.join(trashDir(dataDir), trashed)) || index.some((x) => x.trashed === trashed); i++) trashed = `${kind}/${stampOf(now)}-${i}-${path.basename(file)}`;
  const dest = path.join(trashDir(dataDir), trashed);
  moveFile(full, dest);
  try {
    // Đọc lại danh mục MỚI NHẤT ngay trước khi ghi (không đè lượt duyệt / thả vào vừa ghi chen)
    writeJsonList(mf, readJsonList<Record<string, unknown>>(mf).filter((x) => !(x && x.file === file)));
  } catch (e) {
    moveFile(dest, full);
    return { ok: false, error: `Không gỡ được khỏi danh mục: ${(e as Error).message}` };
  }
  // id theo tên ĐÃ CHỐT trong thùng (kể cả hậu tố -2-…): hai lần xoá cùng giây cùng tên không trùng id (phản biện P2)
  const t: TrashEntry = { id: `${kind}:${path.basename(trashed)}`, kind, file, trashed, title: String(entry.title ?? path.basename(file).replace(/\.[^.]+$/, "")), entry, at: now.toISOString(), by };
  writeJsonList(indexFile(dataDir), [...readListForWrite<TrashEntry>(indexFile(dataDir)), t]);
  const tomb = readListForWrite<Tombstone>(removedFile(dataDir)).filter((x) => !(x.kind === kind && x.file === file));
  writeJsonList(removedFile(dataDir), [...tomb, { kind, file, at: now.toISOString() }]);
  return { ok: true, entry: t };
}

/** Khôi phục: trả tệp về thư viện (tên cũ; trùng thì thêm -2…) và trả mục danh mục nguyên văn. */
export function restoreAsset(dataDir: string, id: string): Result<{ file: string; entry: TrashEntry }> {
  const all = listTrash(dataDir);
  const t = all.find((x) => x.id === id);
  if (!t || !TRASH_KINDS.includes(t.kind)) return { ok: false, error: "Không có mục này trong Đã xoá" };
  const src = libraryFile(trashDir(dataDir), t.trashed);
  if (!src) return { ok: false, error: "Tệp trong Đã xoá không còn" };
  const dir = libDir(dataDir, t.kind);
  const mf = path.join(dir, "manifest.json");
  let items: Record<string, unknown>[];
  try {
    items = readJsonList<Record<string, unknown>>(mf);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const ext = path.extname(t.file);
  const base = t.file.slice(0, t.file.length - ext.length);
  let rel = t.file;
  for (let i = 2; fs.existsSync(path.join(dir, rel)) || items.some((x) => x && x.file === rel); i++) rel = `${base}-${i}${ext}`;
  const dest = inside(dir, rel);
  if (!dest) return { ok: false, error: "Đường dẫn khôi phục không hợp lệ" };
  moveFile(src, dest);
  try {
    writeJsonList(mf, [...readJsonList<Record<string, unknown>>(mf), { ...t.entry, file: rel }]);
  } catch (e) {
    moveFile(dest, src);
    return { ok: false, error: `Không ghi lại được danh mục: ${(e as Error).message}` };
  }
  writeJsonList(indexFile(dataDir), readListForWrite<TrashEntry>(indexFile(dataDir)).filter((x) => x.id !== id));
  writeJsonList(removedFile(dataDir), readListForWrite<Tombstone>(removedFile(dataDir)).filter((x) => !(x.kind === t.kind && x.file === t.file)));
  return { ok: true, file: rel, entry: t };
}

/** Dọn hẳn tệp đã ở thùng quá `days` ngày (lượt dọn hằng ngày). Trả số mục đã dọn. */
export function purgeTrash(dataDir: string, now = Date.now(), days = TRASH_DAYS): number {
  if (!fs.existsSync(indexFile(dataDir))) return 0;
  const all = readListForWrite<TrashEntry>(indexFile(dataDir)).filter((e) => e && typeof e.id === "string");
  const cutoff = now - days * 86_400_000;
  const old = all.filter((x) => Date.parse(x.at) < cutoff);
  if (!old.length) return 0;
  for (const x of old) {
    const p = libraryFile(trashDir(dataDir), x.trashed);
    if (p) fs.rmSync(p, { force: true });
  }
  writeJsonList(indexFile(dataDir), all.filter((x) => !old.includes(x)));
  return old.length;
}
