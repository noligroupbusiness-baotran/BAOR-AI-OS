import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { dataDir } from "./jobs";

// Ảnh thu nhỏ cho tư liệu trên MÁY CHỦ (lưới Ảnh / B-roll ở trang Tư liệu): ảnh gốc ~600 KB → bản ≤ 480 px ~30–60 KB, clip → khung
// hình ở giây 0,5. Tạo theo yêu cầu lần đầu bằng ffmpeg (mảng tham số, không qua shell), lưu DATA_DIR/preview-cache/server/<khoá>.jpg.
// Khoá = sha1(đường dẫn thật + cỡ + mtime) → tệp gốc đổi thì tự tạo lại. Chống tạo trùng: cùng khoá dùng chung một lần chạy
// (trong tiến trình), ghi ra tệp tạm rồi rename (giữa tiến trình). Tối đa THUMB_CONCURRENCY ffmpeg chạy cùng lúc.

export const THUMB_PX = 480;
const THUMB_CONCURRENCY = 3;
const TIMEOUT_MS = 20_000;

export function thumbCacheDir(): string {
  return path.join(dataDir(), "preview-cache", "server");
}

const inflight = new Map<string, Promise<string | null>>();
let running = 0;
const waiters: (() => void)[] = [];
async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= THUMB_CONCURRENCY) await new Promise<void>((r) => waiters.push(r));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    waiters.shift()?.();
  }
}

/** Số lần thật sự gọi ffmpeg (cho kiểm thử: lần 2 phải dùng cache). */
export const thumbStats = { generated: 0 };

function runFfmpeg(src: string, out: string, video: boolean): Promise<boolean> {
  const args = [
    "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
    ...(video ? ["-ss", "0.5"] : []),
    "-i", src,
    "-frames:v", "1",
    "-vf", `scale=w=${THUMB_PX}:h=${THUMB_PX}:force_original_aspect_ratio=decrease`,
    "-q:v", "5",
    "-f", "mjpeg",
    out,
  ];
  return new Promise((resolve) => {
    let done = false;
    const p = spawn(process.env.FFMPEG_BIN || "ffmpeg", args, { stdio: "ignore" });
    const t = setTimeout(() => p.kill("SIGKILL"), TIMEOUT_MS);
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(t);
      resolve(ok);
    };
    p.on("error", () => finish(false));
    p.on("close", (code) => finish(code === 0));
  });
}

const thumbKey = (src: string, st: fs.Stats) => crypto.createHash("sha1").update(`${src}\0${st.size}\0${st.mtimeMs}\0${THUMB_PX}`).digest("hex");

/** Đường dẫn ảnh thu nhỏ ĐÃ có trong cache của tệp `src` (đường dẫn thật), hoặc null — để dọn khi xoá tư liệu. */
export function cachedThumbPath(src: string): string | null {
  try {
    const out = path.join(thumbCacheDir(), `${thumbKey(src, fs.statSync(src))}.jpg`);
    return fs.existsSync(out) ? out : null;
  } catch {
    return null;
  }
}

/**
 * Đường dẫn ảnh thu nhỏ (tạo nếu chưa có) của một tệp ĐÃ kiểm nằm trong thư viện (brollFilePath). null nếu ffmpeg không tạo được.
 * `src` phải là đường dẫn thật trả về từ brollFilePath / libraryFile — hàm này không tự kiểm thư mục.
 */
export async function serverThumb(src: string, video: boolean): Promise<string | null> {
  let st: fs.Stats;
  try {
    st = fs.statSync(src);
  } catch {
    return null;
  }
  const key = thumbKey(src, st);
  const dir = thumbCacheDir();
  const out = path.join(dir, `${key}.jpg`);
  if (fs.existsSync(out)) return out;
  const cur = inflight.get(key);
  if (cur) return cur;
  const job = slot(async () => {
    if (fs.existsSync(out)) return out;
    fs.mkdirSync(dir, { recursive: true });
    const tmp = path.join(dir, `${key}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`);
    thumbStats.generated++;
    const ok = await runFfmpeg(src, tmp, video);
    if (!ok || !fs.existsSync(tmp) || fs.statSync(tmp).size === 0) {
      fs.rmSync(tmp, { force: true });
      return null;
    }
    fs.renameSync(tmp, out);
    return out;
  }).finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}
