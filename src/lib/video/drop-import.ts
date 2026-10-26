// Thư mục thả tư liệu (OWNER 25/10/2026: "tải các tài liệu đó về nhét vào đâu để máy tự tìm"; không dùng Google Drive for desktop vì
// đồng bộ liên tục): OWNER tải tay từ Drive rồi chép vào DATA_DIR/video-assets/tha-vao/<ngăn>/ — máy dựng tự nhận mỗi 5 phút (hoặc
// bấm "Nhận ngay" ở Cài đặt › Video). Luật bản quyền giữ nguyên: ngăn / tệp KHÔNG có giấy phép thì chưa nhận, báo lại; nhạc mới chờ
// OWNER nghe duyệt; ảnh / clip cần từ khoá (tên tệp, thư mục con hoặc tệp .txt cùng tên) để bộ dựng biết chèn ở đâu.
// Mô-đun chỉ dùng node:fs / node:path (không alias @/) để máy dựng (scripts/video/render-worker.mts) gọi thẳng được.
import fs from "node:fs";
import path from "node:path";

import { DROP_KINDS, type DropKind } from "./drop-kinds";

export { DROP_KINDS, type DropKind };

export const LICENSE_FILE = "GIAY-PHEP.txt";
const GUIDE_FILE = "HUONG-DAN.txt";
const DONE_DIR = "da-nhan";
const REPORT_FILE = "BAO-CAO.json";
const MUSIC_PENDING = "chờ OWNER nghe duyệt"; // trùng src/lib/video/music-library.ts › MUSIC_PENDING
export const OWNER_STATUS = "OWNER-CUNG-CAP"; // nhạc OWNER tự khai giấy phép (khác "ĐỦ-HỒ-SƠ" của kho)
const SETTLE_MS = 60_000; // tệp vừa chép (< 1 phút) có thể chưa chép xong → để lần sau
const JUNK = new Set(["img", "image", "dsc", "dscn", "pxl", "photo", "anh", "video", "vid", "mov", "screenshot", "copy", "ban", "sao", "final", "edit", "untitled"]);

export interface DropItem {
  kind: DropKind;
  file: string; // đường dẫn tương đối trong ngăn
  reason?: string; // lý do chưa nhận
  to?: string; // nơi đã nhận vào thư viện
}
export interface DropReport {
  at: string;
  imported: DropItem[];
  waiting: DropItem[];
}

export const dropDir = (dataDir: string) => path.join(dataDir, "video-assets", "tha-vao");

const GUIDE = `THƯ MỤC THẢ TƯ LIỆU — máy dựng tự nhận mỗi 5 phút (hoặc bấm "Nhận ngay" ở Cài đặt › Video)

Chép tệp đã tải từ Drive vào đúng ngăn:
  anh-broll/           ảnh (.jpg .png .webp) và clip (.mp4 .mov) minh hoạ
  nhac/                nhạc nền (.mp3 .wav .m4a)
  hieu-ung-am-thanh/   hiệu ứng âm thanh (.mp3 .wav)

1. GIẤY PHÉP (bắt buộc): đặt tệp ${LICENSE_FILE} trong ngăn (hoặc thư mục con), 1 dòng ghi nguồn / quyền dùng,
   vd "Ảnh tự chụp — tôi sở hữu" hoặc "Pixabay Content License". Không có giấy phép → máy CHƯA nhận, báo ở Cài đặt › Video.
2. TỪ KHOÁ: đặt tên tệp / thư mục con có nghĩa, vd anh-broll/van-phong/tang-qua-20-10.jpg → từ khoá "văn phòng", "tặng quà".
   Hoặc kèm tệp .txt cùng tên: dòng "Từ khoá: a, b", dòng "Mô tả: ..." (tả nội dung ảnh để AI chọn đúng ảnh), "Giấy phép: ...".
3. Nhạc mới vào thư viện ở trạng thái chờ nghe duyệt — vào Cài đặt › Video › Thư viện nhạc nền nghe rồi bấm Duyệt dùng.
4. Tệp đã nhận được chuyển vào thư viện; tệp .txt kèm theo cất ở ${DONE_DIR}/. Ngăn trống lại là đã nhận xong.
`;

export function ensureDropFolders(dataDir: string): string {
  const root = dropDir(dataDir);
  for (const k of Object.keys(DROP_KINDS)) fs.mkdirSync(path.join(root, k), { recursive: true });
  const g = path.join(root, GUIDE_FILE);
  if (!fs.existsSync(g)) fs.writeFileSync(g, GUIDE);
  return root;
}

const firstLine = (f: string) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? "" : "");

/** Giấy phép gần nhất: GIAY-PHEP.txt ở thư mục chứa tệp, đi ngược lên tới gốc ngăn. */
function folderLicense(dir: string, kindRoot: string): string {
  for (let d = dir; d.startsWith(kindRoot); d = path.dirname(d)) {
    const l = firstLine(path.join(d, LICENSE_FILE));
    if (l) return l;
    if (d === kindRoot) break;
  }
  return "";
}

/** Tệp .txt cùng tên: "Từ khoá: …", "Mô tả: …", "Giấy phép: …"; dòng không nhãn coi là mô tả. */
function sidecar(file: string): { keywords: string[]; desc: string; license: string; path: string | null } {
  const p = file.replace(/\.[^.]+$/, ".txt");
  const out = { keywords: [] as string[], desc: "", license: "", path: fs.existsSync(p) ? p : null };
  if (!out.path) return out;
  const free: string[] = [];
  for (const raw of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const l = raw.trim();
    const m = l.match(/^(t[ừu] kh[oó]a|t[ừu] kho[áa]|keywords?|m[ôo] t[ảa]|giấy phép|giay phep|license)\s*:\s*(.*)$/i);
    if (!m) {
      if (l) free.push(l);
      continue;
    }
    const key = m[1].toLowerCase();
    if (/^(m)/.test(key)) out.desc = m[2].trim();
    else if (/^(g|l)/.test(key)) out.license = m[2].trim();
    else out.keywords.push(...m[2].split(/[,;]/).map((x) => x.trim()).filter(Boolean));
  }
  if (!out.desc && free.length) out.desc = free.join(" ");
  return out;
}

/** Từ khoá từ tên tệp + tên thư mục con (bỏ số, chữ máy ảnh đặt sẵn như IMG / DSC). */
export function keywordsFromPath(rel: string): string[] {
  const parts = rel.split(/[\\/]/);
  const name = parts.pop()!.replace(/\.[^.]+$/, "");
  const words = name.split(/[-_.\s,]+/).filter((w) => w.length > 1 && !/^\d+$/.test(w) && !JUNK.has(w.toLowerCase()));
  const folders = parts.map((p) => p.replace(/[-_]+/g, " ").trim()).filter(Boolean);
  const kws = [...folders, ...(words.length ? [words.join(" ")] : [])].map((k) => k.toLowerCase());
  return [...new Set(kws)];
}

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^\w-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
/** Tên an toàn, giữ đuôi; tên toàn chữ không Latin (vd 日本.mp3) → "tep-<số>" thay vì tệp ẩn ".mp3". */
export const safeName = (s: string) => {
  const ext = path.extname(s).toLowerCase().replace(/[^.a-z0-9]/g, "");
  const base = slug(s.slice(0, s.length - path.extname(s).length));
  return `${base || `tep-${Date.now().toString(36)}`}${ext}`;
};

function freeName(dir: string, name: string): string {
  const ext = path.extname(name);
  const base = name.slice(0, name.length - ext.length);
  let n = name;
  for (let i = 2; fs.existsSync(path.join(dir, n)); i++) n = `${base}-${i}${ext}`;
  return n;
}

/** Chuyển tệp (cùng ổ: đổi chỗ; khác ổ: chép xong mới gỡ bản cũ). */
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

/** Danh mục hiện tại; chưa có tệp → []; tệp hỏng / không phải mảng → lỗi (KHÔNG ghi đè danh mục hỏng bằng danh sách mới). */
function readList(f: string): Record<string, unknown>[] {
  if (!fs.existsSync(f)) return [];
  const v = JSON.parse(fs.readFileSync(f, "utf8")) as unknown;
  if (!Array.isArray(v)) throw new Error(`danh mục ${path.basename(path.dirname(f))}/manifest.json không đúng dạng`);
  return v as Record<string, unknown>[];
}

/** Thêm một mục: đọc lại danh mục MỚI NHẤT ngay trước khi ghi (không đè lượt duyệt / bỏ duyệt vừa ghi chen), tmp riêng + rename. */
function appendEntry(f: string, entry: Record<string, unknown>) {
  const items = readList(f);
  items.push(entry);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = `${f}.${process.pid}.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(items, null, 1));
  fs.renameSync(tmp, f);
}

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    if (d.name.startsWith(".") || d.name === DONE_DIR) continue;
    const p = path.join(dir, d.name);
    if (d.isDirectory()) walk(p, out);
    else if (d.isFile()) out.push(p);
  }
  return out;
}

const vnDate = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

/** Nhận tệp trong thư mục thả vào thư viện của bộ dựng. Chạy lại nhiều lần an toàn; tệp chưa đủ điều kiện ở yên chỗ cũ.
 *  `opts.fresh`: đường dẫn tuyệt đối của tệp CHÍNH máy chủ vừa ghi xong (nút "Tải lên", src/lib/video/asset-upload.ts) — chỉ những
 *  tệp này được bỏ qua bước chờ ổn định SETTLE_MS (đã ghi trọn, không còn đang chép). Mọi tệp khác và mọi luật khác giữ nguyên. */
export function importDrop(dataDir: string, now = new Date(), opts: { fresh?: readonly string[] } = {}): DropReport {
  const fresh = new Set((opts.fresh ?? []).map((f) => path.resolve(f)));
  const root = ensureDropFolders(dataDir);
  const assets = path.join(dataDir, "video-assets");
  const report: DropReport = { at: now.toISOString(), imported: [], waiting: [] };
  const brollMf = path.join(assets, "broll", "manifest.json");
  const musicMf = path.join(assets, "music", "manifest.json");
  const sfxMf = path.join(assets, "sfx-owner", "moi", "manifest.json");

  /** Chuyển tệp vào thư viện rồi ghi danh mục NGAY; ghi lỗi → trả tệp về chỗ cũ (không để tệp mồ côi trong thư viện). */
  const place = (from: string, toDir: string, name: string, mf: string, entry: (to: string) => Record<string, unknown>): string => {
    const to = freeName(toDir, name);
    const dest = path.join(toDir, to);
    moveFile(from, dest);
    try {
      appendEntry(mf, entry(to));
    } catch (e) {
      moveFile(dest, from);
      throw e;
    }
    return to;
  };

  for (const kind of Object.keys(DROP_KINDS) as DropKind[]) {
    const kindRoot = path.join(root, kind);
    for (const file of walk(kindRoot)) {
      const rel = path.relative(kindRoot, file);
      try {
        // Danh sách quét có thể đã cũ: tệp .txt vừa cất cùng tệp chính, hoặc tiến trình khác (máy dựng / nút Nhận ngay) vừa nhận
        if (!fs.existsSync(file)) continue;
        const base = path.basename(file);
        if (base === LICENSE_FILE || base === GUIDE_FILE || base === REPORT_FILE) continue;
        const ext = path.extname(file).toLowerCase();
        if (ext === ".txt") {
          const owner = (DROP_KINDS[kind].exts as readonly string[]).some((e) => fs.existsSync(file.replace(/\.txt$/i, e)) || fs.existsSync(file.replace(/\.txt$/i, e.toUpperCase())));
          if (!owner) report.waiting.push({ kind, file: rel, reason: "tệp .txt không có tệp cùng tên đi kèm" });
          continue;
        }
        if (!(DROP_KINDS[kind].exts as readonly string[]).includes(ext)) {
          report.waiting.push({ kind, file: rel, reason: `không phải loại tệp của ngăn ${DROP_KINDS[kind].label}` });
          continue;
        }
        if (!fresh.has(path.resolve(file)) && now.getTime() - fs.statSync(file).mtimeMs < SETTLE_MS) {
          report.waiting.push({ kind, file: rel, reason: "đang chép — nhận ở lần sau" });
          continue;
        }
        const sc = sidecar(file);
        const license = sc.license || folderLicense(path.dirname(file), kindRoot);
        if (!license) {
          report.waiting.push({ kind, file: rel, reason: `thiếu giấy phép (đặt ${LICENSE_FILE} trong ngăn, hoặc dòng "Giấy phép:" trong tệp .txt cùng tên)` });
          continue;
        }
        const source = `Thả vào máy ${vnDate(now)}: ${kind}/${rel}`;
        const name = safeName(base);

        if (kind === "anh-broll") {
          const keywords = [...new Set([...sc.keywords.map((k) => k.toLowerCase()), ...keywordsFromPath(rel)])];
          if (!keywords.length) {
            report.waiting.push({ kind, file: rel, reason: 'thiếu từ khoá (đặt tên tệp / thư mục con có nghĩa, hoặc dòng "Từ khoá:" trong tệp .txt cùng tên)' });
            continue;
          }
          const to = place(file, path.join(assets, "broll", "tha-vao"), name, brollMf, (to) => ({ file: `tha-vao/${to}`, kind: /\.(mp4|mov|m4v)$/.test(ext) ? "video" : "image", keywords, license, source, ...(sc.desc ? { desc: sc.desc, descBy: "OWNER (tệp .txt kèm theo)" } : {}), addedAt: now.toISOString() }));
          report.imported.push({ kind, file: rel, to: `broll/tha-vao/${to}` });
        } else if (kind === "nhac") {
          const sub = rel.split(/[\\/]/).slice(0, -1).join(" ");
          const to = place(file, path.join(assets, "music"), name, musicMf, (to) => ({ file: to, title: base.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "), author: "", genre: sub ? slug(sub) || "khac" : "khac", mood: [...sc.keywords, ...(sub ? [sub] : [])], license: `${license} — ${MUSIC_PENDING}`, source, catalogStatus: OWNER_STATUS, credit: "", addedAt: now.toISOString() }));
          report.imported.push({ kind, file: rel, to: `music/${to}` });
        } else {
          // Hiệu ứng âm thanh OWNER: vào kho, CHƯA gán vai trò trong bộ dựng (sfx-owner/manifest.json › roles) — gán khi OWNER chốt
          const to = place(file, path.join(assets, "sfx-owner", "moi"), name, sfxMf, (to) => ({ file: to, keywords: [...sc.keywords, ...keywordsFromPath(rel)], license, source, addedAt: now.toISOString() }));
          report.imported.push({ kind, file: rel, to: `sfx-owner/moi/${to}` });
        }
        if (sc.path && fs.existsSync(sc.path)) moveFile(sc.path, path.join(root, DONE_DIR, kind, freeName(path.join(root, DONE_DIR, kind), path.basename(sc.path))));
      } catch (e) {
        report.waiting.push({ kind, file: rel, reason: `lỗi khi nhận: ${e instanceof Error ? e.message : String(e)}` });
      }
    }
  }

  fs.writeFileSync(path.join(root, REPORT_FILE), JSON.stringify(report, null, 1));
  return report;
}

/** Báo cáo lần nhận gần nhất (để Cài đặt hiện). */
export function lastDropReport(dataDir: string): DropReport | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(dropDir(dataDir), REPORT_FILE), "utf8")) as DropReport;
  } catch {
    return null;
  }
}
