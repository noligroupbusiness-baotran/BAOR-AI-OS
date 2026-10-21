// Nguồn vào cho dựng tự động: ngoài nút "Thêm nguồn" ở Video Studio, có thể thả clip quay thô vào DATA_DIR/video-inbox.
// Mỗi phút bộ chạy nền nhận tệp mới vào kho tải lên, tạo video "Đang dựng" và đưa vào hàng đợi (src/lib/video/jobs.ts).
// Hàm ở đây chạy nhanh, không dựng đồng bộ: việc dựng nằm trong tiến trình con nên máy chủ không bị treo.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { uploadsDir } from "@/lib/uploads";
import { createVideoFromSource, dataDir, editSettings, kickWorker } from "@/lib/video/jobs";

const VIDEO_EXT: Record<string, string> = { ".mov": "video/quicktime", ".mp4": "video/mp4", ".m4v": "video/mp4", ".webm": "video/webm" };

export function inboxDir(): string {
  const d = path.join(dataDir(), "video-inbox");
  fs.mkdirSync(path.join(d, "da-xu-ly"), { recursive: true });
  return d;
}

// Kích thước lần quét trước: chỉ nhận tệp có kích thước không đổi qua hai lần quét (bản chép dở bị bỏ qua).
const seen = ((globalThis as unknown as { __baorInboxSeen?: Map<string, number> }).__baorInboxSeen ??= new Map());

/** Tệp đang chờ trong hộp thư vào. Bỏ qua tệp đang được ghi dở (sửa < 20 giây trước). */
export function pendingInbox(): string[] {
  const dir = inboxDir();
  const now = Date.now();
  return fs
    .readdirSync(dir)
    .filter((f) => VIDEO_EXT[path.extname(f).toLowerCase()] && !f.startsWith("."))
    .map((f) => path.join(dir, f))
    .filter((p) => fs.statSync(p).isFile() && now - fs.statSync(p).mtimeMs > 20_000)
    .sort();
}

/** Tệp đã ổn định: kích thước bằng lần quét trước, hoặc không đổi từ 2 phút trở lên. */
function stable(file: string): boolean {
  const st = fs.statSync(file);
  const prev = seen.get(file);
  seen.set(file, st.size);
  return prev === st.size || Date.now() - st.mtimeMs > 120_000;
}

/**
 * Nhận các tệp trong hộp thư vào vào kho tải lên, tạo video và xếp hàng dựng. Không bao giờ làm mất video gốc:
 * ghi bản ghi trước rồi mới chuyển tệp; chép qua ổ khác thì so kích thước rồi mới xoá ở hộp thư; lỗi thì giữ nguyên tệp gốc.
 */
export function ingestInbox(): number {
  let n = 0;
  for (const file of pendingInbox()) {
    if (!stable(file)) continue;
    const ext = path.extname(file).toLowerCase();
    const id = `up_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    const fileName = `${id}${ext}`;
    const sidecar = file.replace(/\.[^.]+$/, ".txt");
    const prompt = fs.existsSync(sidecar) ? fs.readFileSync(sidecar, "utf8").slice(0, 800) : "";
    const size = fs.statSync(file).size;
    const target = path.join(uploadsDir(), fileName);
    const title = path.basename(file).replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || "Video quay thô";
    const db = getDb();
    db.insert(schema.uploads)
      .values({ id, kind: "video", name: path.basename(file), fileName, mime: VIDEO_EXT[ext], size, meta: JSON.stringify({ title, role: "raw", from: "video-inbox" }), uploadedBy: "video-inbox", createdAt: new Date().toISOString() })
      .run();
    try {
      try {
        fs.renameSync(file, target);
      } catch {
        fs.copyFileSync(file, target);
        if (fs.statSync(target).size !== size) throw new Error("Bản chép không đủ dung lượng");
        fs.rmSync(file);
      }
    } catch (e) {
      // Giữ nguyên tệp gốc trong hộp thư, xoá bản chép dở và bản ghi.
      if (fs.existsSync(file)) fs.rmSync(target, { force: true });
      db.delete(schema.uploads).where(eq(schema.uploads.id, id)).run();
      console.error(`[video-inbox] Không nhận được ${path.basename(file)}: ${e instanceof Error ? e.message : e}`);
      continue;
    }
    seen.delete(file);
    if (fs.existsSync(sidecar)) fs.renameSync(sidecar, path.join(inboxDir(), "da-xu-ly", path.basename(sidecar)));
    fs.writeFileSync(path.join(inboxDir(), "da-xu-ly", `${path.basename(file)}.da-nhan.txt`), `Đã nhận vào kho tải lên ${id} lúc ${new Date().toISOString()}\n`);
    createVideoFromSource({ title, sourceUploadId: id, cutSilence: editSettings().cutSilence, prompt, by: "Hộp thư vào" });
    n++;
  }
  return n;
}

/** Bộ chạy nền gọi mỗi phút. Trả về ngay; dựng chạy ngầm. */
export function runAutoEditOnce(): { processed: number; ok: number; skipped: string } {
  const n = ingestInbox();
  void kickWorker();
  return { processed: n, ok: n, skipped: n ? "" : "trống" };
}

export interface ToolStatus {
  ffmpeg: boolean;
  python: boolean;
  whisper: boolean;
  opencv: boolean;
  fonts: boolean;
}

/** Công cụ cần trên máy dựng (hiện ở Cài đặt › Dựng video). */
export function toolCheck(): ToolStatus {
  const py = process.env.PYTHON_BIN || "python3";
  const ok = (cmd: string, args: string[]) => spawnSync(cmd, args, { encoding: "utf8", timeout: 20_000 }).status === 0;
  const fontDirs = [process.env.BAOR_FONT_DIR ?? "", "/System/Library/Fonts/Supplemental", "/Library/Fonts", "/usr/share/fonts/truetype/msttcorefonts"];
  return {
    ffmpeg: ok("ffmpeg", ["-version"]),
    python: ok(py, ["-c", "import numpy, PIL"]),
    whisper: ok(py, ["-c", "import whisper"]),
    opencv: ok(py, ["-c", "import cv2; cv2.CascadeClassifier"]),
    fonts: fontDirs.some((d) => d && fs.existsSync(path.join(d, "Times New Roman Italic.ttf")) && fs.existsSync(path.join(d, "Times New Roman Bold Italic.ttf"))),
  };
}
