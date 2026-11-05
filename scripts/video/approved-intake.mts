// Thư mục đã duyệt trên máy OWNER (2.BAOR.vn/7.VIDEO-DA-DUYET, lối tắt ~/Desktop/VIDEO-DA-DUYET): OWNER edit xong, kéo video vào là
// máy dựng (render-worker.mts, chạy nền) gửi lên máy chủ → video vào thẳng Kho (đã duyệt) → máy chủ tự viết tiêu đề + nội dung bài.
// Chỉ OWNER bỏ video vào; máy dựng chỉ ĐỌC và cất tệp đã gửi vào ngăn DA-GUI/ (không xoá, không ghi đè — luật SO-DO-MAY.md).
//
//   <tên>.mp4            video đã duyệt (mp4 / mov / m4v / webm)
//   <tên>.txt            (tuỳ chọn) ghi chú cho AI viết bài: ý chính, hashtag muốn dùng, điều không được nói
//   DA-GUI/<tên>.mp4     đã gửi xong; kèm <tên>.da-gui.txt ghi mã video + đường dẫn mở trên web
//   <tên>.loi.txt        gửi lỗi (giữ tệp tại chỗ, tự thử lại sau 5 phút; gửi được thì tệp .loi.txt tự biến mất)
//
// Trước khi gửi, máy chuyển lời nói thành chữ tại chỗ (Whisper, không gửi dữ liệu ra ngoài) để AI viết bài theo đúng lời trong video.
// Tắt bằng BAOR_WHISPER=off; đổi mô hình bằng BAOR_WHISPER_MODEL (mặc định small — video ngắn, chạy nhanh).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DONE_DIR = "DA-GUI";
export const VIDEO_EXT = /\.(mp4|mov|m4v|webm)$/i;
const SETTLE_MS = 20_000; // tệp vừa chép có thể chưa chép xong: đợi tới khi cỡ đứng yên qua 2 lần quét cách ≥ 20 giây
const RETRY_MS = 5 * 60_000;
const CHUNK = 16 * 1024 * 1024;
const TRANSCRIBE_TIMEOUT_MS = 15 * 60_000;

/** Thư mục đã duyệt: BAOR_APPROVED_DIR, không thì vị trí chuẩn trên máy OWNER (SO-DO-MAY.md), rồi lối tắt cũ. Không có → null. */
export function approvedDir(env: Record<string, string | undefined> = process.env): string | null {
  const c = [env.BAOR_APPROVED_DIR, "/Volumes/NOLI_AI_OS/2.BAOR.vn/7.VIDEO-DA-DUYET", path.join(os.homedir(), "Desktop", "VIDEO-DA-DUYET")].filter((x): x is string => !!x);
  for (const d of c) {
    try {
      if (fs.statSync(d).isDirectory()) return d;
    } catch {}
  }
  return null;
}

/** Trạng thái quét giữa hai lần (cỡ tệp lần trước, lần lỗi gần nhất) — một bản cho cả tiến trình. */
export interface ScanState {
  size: Map<string, number>;
  failedAt: Map<string, number>;
}
export const newScanState = (): ScanState => ({ size: new Map(), failedAt: new Map() });

/** Video ở gốc thư mục đã sẵn sàng gửi: đúng đuôi, không ẩn, sửa lần cuối > 20 giây, cỡ không đổi so với lần quét trước. */
export function pendingApproved(dir: string, st: ScanState, now = Date.now()): string[] {
  const out: string[] = [];
  const present = new Set<string>();
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!d.isFile() || d.name.startsWith(".") || !VIDEO_EXT.test(d.name)) continue;
    const full = path.join(dir, d.name);
    present.add(d.name);
    const s = fs.statSync(full);
    const prev = st.size.get(d.name);
    st.size.set(d.name, s.size);
    if (now - s.mtimeMs < SETTLE_MS) continue;
    if (prev !== s.size) continue;
    const f = st.failedAt.get(d.name);
    if (f !== undefined && now - f < RETRY_MS) continue;
    out.push(full);
  }
  for (const k of [...st.size.keys()]) if (!present.has(k)) st.size.delete(k);
  return out;
}

export async function sha256File(p: string): Promise<string> {
  const h = createHash("sha256");
  for await (const chunk of fs.createReadStream(p)) h.update(chunk as Buffer);
  return h.digest("hex");
}

const sidecarPath = (file: string) => file.replace(/\.[^.]+$/, ".txt");
export const errorPath = (file: string) => file.replace(/\.[^.]+$/, ".loi.txt");
// Lời đã chuyển chữ theo mã băm: thử lại sau lỗi mạng không chạy Whisper lần nữa (một tiến trình)
const transcriptCache = new Map<string, string>();

/** Ghi chú OWNER kèm video (tệp .txt cùng tên), ≤ 2.000 ký tự. */
export function sidecarNote(file: string): string {
  try {
    return fs.readFileSync(sidecarPath(file), "utf8").trim().slice(0, 2000);
  } catch {
    return "";
  }
}

/** Chuyển lời nói thành chữ tại máy (scripts/video/transcribe.py). Không có whisper / lỗi / quá 15 phút → null (vẫn gửi video). */
export async function transcribeLocal(file: string, model = process.env.BAOR_WHISPER_MODEL || "small"): Promise<string | null> {
  if ((process.env.BAOR_WHISPER || "").toLowerCase() === "off") return null;
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "baor-intake-")), "words.json");
  const proc = spawn(process.env.PYTHON_BIN || "python3", [path.join(ROOT, "scripts", "video", "transcribe.py"), `--input=${file}`, `--out=${out}`, `--model=${model}`], { stdio: ["ignore", "ignore", "pipe"] });
  let err = "";
  proc.stderr?.on("data", (b: Buffer) => (err = (err + b.toString()).slice(-2000)));
  const timer = setTimeout(() => proc.kill("SIGKILL"), TRANSCRIBE_TIMEOUT_MS);
  const code: number = await new Promise((r) => {
    proc.on("error", () => r(1));
    proc.on("close", (c) => r(c ?? 1));
  });
  clearTimeout(timer);
  try {
    if (code !== 0) return null;
    const j = JSON.parse(fs.readFileSync(out, "utf8")) as { text?: string };
    return (j.text ?? "").trim() || null;
  } catch {
    return null;
  } finally {
    fs.rmSync(path.dirname(out), { recursive: true, force: true });
  }
}

export interface IntakeCtx {
  base: string;
  headers: Record<string, string>;
  fetchImpl?: typeof fetch;
  log?: (...x: unknown[]) => void;
  /** Thay bộ chuyển chữ (kiểm thử / tắt). */
  transcribe?: (file: string) => Promise<string | null>;
  chunkBytes?: number;
}

export type SendResult = { ok: true; videoId: string; duplicate: boolean } | { ok: false; error: string };

/** Gửi MỘT video: băm → mở phiên (trùng thì thôi) → gửi từng khúc nối tiếp từ vị trí máy chủ đã nhận. */
export async function sendApproved(file: string, ctx: IntakeCtx): Promise<SendResult> {
  const f = ctx.fetchImpl ?? fetch;
  const log = ctx.log ?? (() => {});
  const name = path.basename(file);
  const size = fs.statSync(file).size;
  const sha256 = await sha256File(file);
  const note = sidecarNote(file);
  const transcribe = ctx.transcribe ?? transcribeLocal;
  const transcript = transcriptCache.get(sha256) ?? ((await transcribe(file)) ?? "");
  transcriptCache.set(sha256, transcript);
  if (!transcript) log(`“${name}”: không chuyển được lời nói — AI sẽ viết bài theo tên tệp${note ? " và ghi chú" : ""}.`);
  const q = `name=${encodeURIComponent(name)}&size=${size}&sha256=${sha256}`;
  const open = await f(`${ctx.base}/api/render-worker/intake?${q}`, { method: "POST", headers: { ...ctx.headers, "content-type": "application/json" }, body: JSON.stringify({ transcript, note }) });
  if (!open.ok) return { ok: false, error: `Máy chủ không mở phiên nhận (${open.status}): ${await open.text().catch(() => "")}` };
  const o = (await open.json()) as { duplicate?: boolean; videoId?: string; sid?: string; offset?: number };
  if (o.duplicate && o.videoId) return { ok: true, videoId: o.videoId, duplicate: true };
  if (!o.sid) return { ok: false, error: "Máy chủ không trả mã phiên" };
  let offset = o.offset ?? 0;
  const chunk = ctx.chunkBytes ?? CHUNK;
  const fd = fs.openSync(file, "r");
  try {
    let tries = 0;
    while (offset < size) {
      const len = Math.min(chunk, size - offset);
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, offset);
      const r = await f(`${ctx.base}/api/render-worker/intake?sid=${o.sid}&offset=${offset}&name=${encodeURIComponent(name)}`, { method: "PUT", headers: { ...ctx.headers, "content-type": "application/octet-stream", "content-length": String(len) }, body: new Uint8Array(buf) });
      const b = (await r.json().catch(() => ({}))) as { ok?: boolean; offset?: number; done?: boolean; videoId?: string; error?: string };
      if (r.ok && b.done && b.videoId) return { ok: true, videoId: b.videoId, duplicate: false };
      if (r.ok && typeof b.offset === "number") {
        offset = b.offset;
        tries = 0;
        continue;
      }
      if (r.status === 409 && typeof b.offset === "number") {
        offset = b.offset; // lệch vị trí (gửi lại sau mất mạng) → theo máy chủ
        if (++tries > 5) return { ok: false, error: "Máy chủ liên tục báo sai vị trí khúc" };
        continue;
      }
      if (++tries > 3) return { ok: false, error: `Gửi khúc tại ${offset} lỗi (${r.status}): ${b.error ?? ""}` };
      await new Promise((res) => setTimeout(res, 2000 * tries));
    }
    // đủ byte nhưng máy chủ chưa báo xong (khúc cuối trả lời mất) → hỏi lại
    const info = await f(`${ctx.base}/api/render-worker/intake?sid=${o.sid}`, { headers: ctx.headers });
    const i = (await info.json().catch(() => ({}))) as { done?: boolean; videoId?: string };
    return i.done && i.videoId ? { ok: true, videoId: i.videoId, duplicate: false } : { ok: false, error: "Đã gửi đủ byte nhưng máy chủ chưa xác nhận" };
  } finally {
    fs.closeSync(fd);
  }
}

/** Cất tệp (và .txt kèm) vào DA-GUI/, không ghi đè bất cứ tệp nào: trùng tên (video, .txt hay .da-gui.txt) thì thêm " v2", " v3". */
export function moveDone(file: string, mark: string): string {
  const dir = path.join(path.dirname(file), DONE_DIR);
  fs.mkdirSync(dir, { recursive: true });
  const ext = path.extname(file);
  const stem = path.basename(file, ext);
  const taken = (s: string) => [ext, ".txt", ".da-gui.txt"].some((e) => fs.existsSync(path.join(dir, `${s}${e}`)));
  let name = stem;
  for (let n = 2; taken(name); n++) name = `${stem} v${n}`;
  const dest = path.join(dir, `${name}${ext}`);
  fs.renameSync(file, dest);
  const side = sidecarPath(file);
  if (fs.existsSync(side)) fs.renameSync(side, path.join(dir, `${name}.txt`));
  fs.writeFileSync(path.join(dir, `${name}.da-gui.txt`), mark);
  fs.rmSync(errorPath(file), { force: true });
  return dest;
}

/** Một lượt quét: gửi mọi video sẵn sàng; lỗi thì ghi <tên>.loi.txt và thử lại sau 5 phút. */
export async function runApprovedIntake(ctx: IntakeCtx & { dir: string }, st: ScanState, now = Date.now()): Promise<{ sent: number; duplicates: number; failed: number }> {
  const log = ctx.log ?? (() => {});
  const r = { sent: 0, duplicates: 0, failed: 0 };
  for (const file of pendingApproved(ctx.dir, st, now)) {
    const name = path.basename(file);
    log(`Thư mục đã duyệt: gửi “${name}”…`);
    try {
      const res = await sendApproved(file, ctx);
      if (!res.ok) throw new Error(res.error);
      const link = `${ctx.base}/video-library?focus=${encodeURIComponent(res.videoId)}`;
      moveDone(file, `${res.duplicate ? "Đã có trong Kho từ trước (trùng nội dung), không gửi lại" : "Đã gửi vào Kho video"}\nMã video: ${res.videoId}\nMở: ${link}\nLúc: ${new Date(now).toLocaleString("vi-VN")}\n`);
      st.size.delete(name);
      st.failedAt.delete(name);
      if (res.duplicate) r.duplicates++;
      else r.sent++;
      log(res.duplicate ? `“${name}” đã có trong Kho từ trước → cất vào ${DONE_DIR}/` : `“${name}” → Kho video (${res.videoId}), AI đang viết bài.`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      r.failed++;
      st.failedAt.set(name, now);
      try {
        fs.writeFileSync(errorPath(file), `Chưa gửi được lên máy chủ: ${msg}\nMáy dựng tự thử lại sau 5 phút. ${new Date(now).toLocaleString("vi-VN")}\n`);
      } catch {}
      log(`“${name}” gửi lỗi: ${msg}`);
    }
  }
  return r;
}
