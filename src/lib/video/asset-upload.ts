// Nút "Tải lên" ở trang Tư liệu — phần máy chủ. Thiết kế: tệp tải lên được ĐẶT VÀO thư mục thả (tha-vao/<ngăn>/) kèm tệp .txt
// cùng tên ("Giấy phép: …", "Từ khoá: …") rồi gọi ngay bộ nhận importDrop — nên MỌI luật của thư mục thả áp nguyên vẹn: không giấy
// phép thì không nhận, ảnh / clip cần từ khoá, nhạc vào thư viện ở trạng thái "chờ OWNER nghe duyệt" (không bao giờ tự duyệt), bài
// trong danh sách cấm (music-rules.ts › BANNED_IDS) bị chặn. Chỉ khác: tệp do chính máy chủ vừa ghi trọn được bỏ qua bước chờ ổn
// định (importDrop › opts.fresh, đúng một đường dẫn), không bỏ cho tệp nào khác. Chạy giống nhau trên Mac (localhost) và máy chủ:
// mọi đường dẫn đều theo DATA_DIR.
import fs from "node:fs";
import path from "node:path";
import { DROP_KINDS, type DropKind } from "./drop-kinds";
import { ensureDropFolders, importDrop, keywordsFromPath } from "./drop-import";
import { isBannedMusic } from "./music-rules";
import { contentMatches, sniffMedia, type UploadCheck } from "./asset-upload-rules";

type OkCheck = Extract<UploadCheck, { ok: true }>;

export interface StagedUpload {
  /** Tệp tạm đang ghi (tên bắt đầu bằng "." → bộ nhận bỏ qua tới khi đổi tên). */
  tmp: string;
  /** Tên cuối cùng trong ngăn (không trùng tệp nào, kể cả tệp .txt cùng tên). */
  final: string;
  sidecar: string;
  /** Đường dẫn tương đối trong ngăn — khoá để tìm kết quả trong báo cáo importDrop. */
  rel: string;
}

export interface UploadResult {
  file: string;
  state: "imported" | "waiting";
  /** Nơi đã nhận trong video-assets, vd "music/buoi-sang.mp3". */
  to?: string;
  /** Nhạc: đang chờ OWNER nghe duyệt. */
  pending?: boolean;
  reason?: string;
}

/** Lý do từ chối trước khi ghi (ngoài checkUpload): bài cấm, B-roll không có từ khoá nào. null = được. */
export function uploadRejectReason(c: OkCheck): string | null {
  if (c.target === "nhac" && isBannedMusic({ file: c.name, license: c.license })) return "Bài này nằm trong danh sách không dùng";
  if (c.target === "anh-broll" && !c.keywords.length && !keywordsFromPath(c.name).length) return "Cần từ khoá (tên tệp chưa có nghĩa)";
  return null;
}

const PART_PREFIX = ".tai-len-";
const PART_MAX_AGE_MS = 86_400_000;
/** Khoá "thân tên" như bộ nhận ghép tệp .txt kèm theo (cùng thư mục, bỏ đuôi) — so không phân biệt hoa thường (APFS / NTFS). */
const stemKey = (n: string) => n.normalize("NFC").replace(/\.[^.]*$/, "").toLowerCase();

/**
 * Tên chưa ai dùng trong ngăn: THÂN tên (bỏ đuôi, mọi đuôi, không phân biệt hoa thường) không trùng tệp nào đang nằm trong ngăn.
 * Lý do (phản biện P1): bộ nhận ghép tệp .txt theo thân tên — tải lên "van-phong.png" cạnh "van-phong.jpg" đang chờ (thiếu giấy phép)
 * thì .txt của bản tải lên sẽ "cho mượn" giấy phép sang tệp đang chờ.
 */
function freeStemName(dir: string, name: string): string {
  const taken = new Set(fs.readdirSync(dir).map(stemKey));
  const ext = path.extname(name);
  const stem = name.slice(0, name.length - ext.length);
  let n = name;
  for (let i = 2; taken.has(stemKey(n)); i++) n = `${stem}-${i}${ext}`;
  return n;
}

const placeOf = (dir: string, n: string) => ({ final: path.join(dir, n), sidecar: path.join(dir, `${n.slice(0, n.length - path.extname(n).length)}.txt`), rel: n });

/** Chọn chỗ đặt tệp trong ngăn của thư mục thả (tên đề xuất — finishUpload chốt lại ngay trước khi đặt). Tên đã qua
 *  sanitizeUploadName; kiểm lại để chắc không thoát khỏi ngăn. Dọn luôn tệp tạm tải dở quá 1 ngày. */
export function stageUpload(dataDir: string, target: DropKind, name: string, now = Date.now()): StagedUpload {
  const dir = path.join(ensureDropFolders(dataDir), target);
  if (!name || name !== path.basename(name) || name.startsWith(".") || name.includes("\0")) throw new Error("tên tệp không hợp lệ");
  for (const f of fs.readdirSync(dir)) {
    if (!f.startsWith(PART_PREFIX) || !f.endsWith(".part")) continue;
    try {
      if (now - fs.statSync(path.join(dir, f)).mtimeMs > PART_MAX_AGE_MS) fs.rmSync(path.join(dir, f), { force: true });
    } catch {
      /* tệp vừa bị tiến trình khác dọn */
    }
  }
  const place = placeOf(dir, freeStemName(dir, name));
  if (path.dirname(place.final) !== dir) throw new Error("tên tệp không hợp lệ");
  const tmp = path.join(dir, `${PART_PREFIX}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}${path.extname(name)}.part`);
  return { tmp, ...place };
}

/** Đặt tệp tạm vào tên thật KHÔNG đè: .txt ghi độc quyền (wx), tệp chính gắn bằng link (EEXIST nếu có tệp chen vào) — trùng thì
 *  chọn tên khác và thử lại. Ổ không hỗ trợ link cứng → kiểm tồn tại ngay trước khi đổi tên. Cập nhật `s` theo tên đã chốt. */
function placeNoClobber(s: StagedUpload, sidecarText: string) {
  const dir = path.dirname(s.final);
  for (let attempt = 0; attempt < 20; attempt++) {
    Object.assign(s, placeOf(dir, freeStemName(dir, s.rel)));
    try {
      fs.writeFileSync(s.sidecar, sidecarText, { flag: "wx" });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "EEXIST") continue;
      throw e;
    }
    try {
      try {
        fs.linkSync(s.tmp, s.final);
        fs.unlinkSync(s.tmp);
      } catch (e) {
        const code = (e as NodeJS.ErrnoException).code;
        if (code === "EEXIST") throw e;
        if (code !== "EPERM" && code !== "ENOTSUP" && code !== "EXDEV" && code !== "ENOSYS") throw e;
        if (fs.existsSync(s.final)) throw Object.assign(new Error("trùng tên"), { code: "EEXIST" });
        fs.renameSync(s.tmp, s.final);
      }
      return;
    } catch (e) {
      fs.rmSync(s.sidecar, { force: true });
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    }
  }
  throw new Error("không chọn được tên tệp trống");
}

/** Nội dung tệp tạm có khớp đuôi không (đọc 16 byte đầu, không tin MIME trình duyệt). */
export function contentOk(file: string, c: OkCheck): boolean {
  const head = Buffer.alloc(16);
  const fd = fs.openSync(file, "r");
  let n = 0;
  try {
    n = fs.readSync(fd, head, 0, 16, 0);
  } finally {
    fs.closeSync(fd);
  }
  // Chỉ xét số byte ĐỌC ĐƯỢC (tệp 3 byte "ID3" không được coi là MP3 nhờ phần đệm 0 của bộ đệm)
  return contentMatches(c.media, c.ext, sniffMedia(head.subarray(0, n)));
}

/** Ghi tệp .txt kèm theo, đổi tên tệp tạm thành tên thật, rồi nhận NGAY vào thư viện (đúng bộ nhận của thư mục thả). */
export function finishUpload(dataDir: string, s: StagedUpload, c: OkCheck, now = new Date()): UploadResult {
  const lines = [`Giấy phép: ${c.license}`, ...(c.keywords.length ? [`Từ khoá: ${c.keywords.join(", ")}`] : [])];
  placeNoClobber(s, `${lines.join("\n")}\n`);
  const r = importDrop(dataDir, now, { fresh: [s.final] });
  const done = r.imported.find((i) => i.kind === c.target && i.file === s.rel);
  if (done) return { file: s.rel, state: "imported", to: done.to, pending: c.target === "nhac" };
  const wait = r.waiting.find((i) => i.kind === c.target && i.file === s.rel);
  if (wait) return { file: s.rel, state: "waiting", reason: wait.reason };
  // Tiến trình khác (máy dựng / nút Nhận ngay) vừa nhận đúng tệp này giữa chừng → tệp đã rời ngăn
  if (!fs.existsSync(s.final)) return { file: s.rel, state: "imported", pending: c.target === "nhac" };
  return { file: s.rel, state: "waiting", reason: "chưa nhận — sẽ thử lại ở lần nhận kế" };
}

export const targetLabel = (t: DropKind) => DROP_KINDS[t].label;
