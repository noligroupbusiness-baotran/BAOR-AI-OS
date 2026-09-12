// Dựng video tự động theo luật từ "hộp thư vào": thả clip quay thô vào DATA_DIR/video-inbox,
// bộ chạy nền chuyển chữ (Whisper tại chỗ) → dựng (scripts/video/render.py) → video vào Video Studio "Chờ kiểm tra".
// Mỗi bước ghi vào sync_runs (Cài đặt › Nhật ký hệ thống). Không dùng AI sinh nội dung.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { getDb, schema } from "@/db";
import { getSetting } from "@/lib/admin";
import { finishRun, startRun } from "@/lib/connectors/config";
import { listUploads, uploadPath, uploadsDir } from "@/lib/uploads";
import { logActivity } from "@/lib/activity";
import { sendAlert } from "@/lib/alerts";

const VIDEO_EXT = new Set([".mov", ".mp4", ".m4v", ".webm"]);

export function dataDir(): string {
  return process.env.DATA_DIR ?? path.join(process.cwd(), "data");
}
export function inboxDir(): string {
  const d = path.join(dataDir(), "video-inbox");
  fs.mkdirSync(path.join(d, "da-xu-ly"), { recursive: true });
  fs.mkdirSync(path.join(d, "loi"), { recursive: true });
  return d;
}

export interface AutoEditSettings {
  enabled: boolean;
  keywords: string;
  accent: string;
  captionY: number;
  model: string;
  musicUploadId: string;
  logoUploadId: string;
}

export function autoEditSettings(): AutoEditSettings {
  const y = Number(getSetting("video.captionY") ?? "0.6");
  return {
    enabled: getSetting("video.autoEdit") === "1",
    keywords: getSetting("video.keywords") ?? "",
    accent: (getSetting("video.accent") || getSetting("brand.secondaryColor") || "#F2C94C").replace("#", ""),
    captionY: Number.isFinite(y) && y > 0.2 && y < 0.95 ? y : 0.6,
    model: getSetting("video.whisperModel") || "medium",
    musicUploadId: getSetting("video.musicUploadId") ?? "",
    logoUploadId: getSetting("ui.logoDarkUploadId") ?? "",
  };
}

/** Tệp đang chờ trong hộp thư vào (chưa xử lý). Bỏ qua tệp đang được ghi dở (sửa < 20 giây trước). */
export function pendingInbox(): string[] {
  const dir = inboxDir();
  const now = Date.now();
  return fs
    .readdirSync(dir)
    .filter((f) => VIDEO_EXT.has(path.extname(f).toLowerCase()) && !f.startsWith("."))
    .map((f) => path.join(dir, f))
    .filter((p) => fs.statSync(p).isFile() && now - fs.statSync(p).mtimeMs > 20_000)
    .sort();
}

function logoPath(s: AutoEditSettings): string | null {
  if (s.logoUploadId) {
    const u = listUploads().find((x) => x.id === s.logoUploadId);
    const p = u ? uploadPath(u) : null;
    if (p) return p;
  }
  const pub = path.join(process.cwd(), "public", "brand", "baor-light.png");
  return fs.existsSync(pub) ? pub : null;
}

function musicPath(s: AutoEditSettings): string | null {
  const id = s.musicUploadId;
  if (!id) return null;
  const u = listUploads("music").find((x) => x.id === id);
  return u ? uploadPath(u) : null;
}

const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** Xử lý một tệp: chuyển chữ → dựng → đăng ký video. Trả về id video hoặc lỗi. */
export function processInboxFile(file: string): { ok: true; videoId: string; seconds: number } | { ok: false; error: string } {
  const s = autoEditSettings();
  const run = startRun("video_auto_edit", path.basename(file));
  const t0 = Date.now();
  const work = fs.mkdtempSync(path.join(dataDir(), "tmp-video-"));
  const py = process.env.PYTHON_BIN || "python3";
  const scripts = path.join(process.cwd(), "scripts", "video");
  try {
    // Kịch bản đi kèm (tùy chọn): cùng tên, đuôi .txt → dùng làm gợi ý nhận dạng và bổ sung từ khóa
    const sidecar = file.replace(/\.[^.]+$/, ".txt");
    const hint = fs.existsSync(sidecar) ? fs.readFileSync(sidecar, "utf8").slice(0, 800) : "";
    const words = path.join(work, "words.json");
    const r1 = spawnSync(py, [path.join(scripts, "transcribe.py"), "--input", file, "--out", words, "--model", s.model, "--prompt", `${s.keywords} ${hint}`.trim()], { encoding: "utf8", timeout: 60 * 60_000 });
    if (r1.status !== 0) throw new Error(`Chuyển chữ lỗi: ${(r1.stderr || r1.stdout || "").slice(-400)}`);

    const out = path.join(work, "out.mp4");
    const args = [path.join(scripts, "render.py"), "--input", file, "--transcript", words, "--out", out, "--keywords", s.keywords, "--accent", s.accent, "--caption-y", String(s.captionY)];
    const logo = logoPath(s);
    if (logo) args.push("--logo", logo);
    const music = musicPath(s);
    if (music) args.push("--music", music);
    const r2 = spawnSync(py, args, { encoding: "utf8", timeout: 60 * 60_000 });
    if (r2.status !== 0) throw new Error(`Dựng lỗi: ${(r2.stderr || r2.stdout || "").slice(-400)}`);
    const info = JSON.parse(r2.stdout.trim().split("\n").pop() || "{}") as { output_seconds?: number; cuts?: number; captions?: number };

    // Đưa video vào kho tải lên và Video Studio (chờ kiểm tra)
    const title = path.basename(file).replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || "Video tự dựng";
    const upId = newId("up");
    const fileName = `${upId}.mp4`;
    fs.copyFileSync(out, path.join(uploadsDir(), fileName));
    const size = fs.statSync(out).size;
    const now = new Date().toISOString();
    getDb().insert(schema.uploads).values({ id: upId, kind: "video", name: `${title}.mp4`, fileName, mime: "video/mp4", size, meta: JSON.stringify({ title, source: "auto-edit", cuts: info.cuts ?? 0, captions: info.captions ?? 0 }), uploadedBy: "agent-edit-video", createdAt: now }).run();
    const videoId = newId("v");
    getDb().insert(schema.videos).values({ id: videoId, title, contentId: null, agent: "Agent Edit Video", status: "review", platforms: JSON.stringify(["tiktok", "facebook"]), version: 1, note: `Dựng tự động theo luật: ${info.captions ?? 0} khung phụ đề, cắt ${info.cuts ?? 0} khoảng lặng, ${Math.round(info.output_seconds ?? 0)} giây.`, uploadId: upId, updatedAt: now }).run();

    // Chuyển tệp gốc sang "đã xử lý", giữ lại để dựng lại khi cần
    fs.renameSync(file, path.join(inboxDir(), "da-xu-ly", path.basename(file)));
    if (fs.existsSync(sidecar)) fs.renameSync(sidecar, path.join(inboxDir(), "da-xu-ly", path.basename(sidecar)));
    const seconds = Math.round((Date.now() - t0) / 1000);
    finishRun(run, true, `Dựng xong “${title}” trong ${seconds} giây → Video Studio chờ kiểm tra`, 1);
    logActivity("ai", `Agent Edit Video dựng tự động “${title}” (${info.captions ?? 0} khung phụ đề), đang chờ kiểm tra.`, "video");
    return { ok: true, videoId, seconds };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    try {
      fs.renameSync(file, path.join(inboxDir(), "loi", path.basename(file)));
    } catch {}
    finishRun(run, false, msg);
    logActivity("system", `Dựng tự động thất bại cho ${path.basename(file)}: ${msg.slice(0, 160)}`, "video");
    void sendAlert({ level: "error", title: "Dựng video tự động lỗi", text: msg.slice(0, 300), href: "/settings#syslog" });
    return { ok: false, error: msg };
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

let busy = false;
/** Gọi từ bộ chạy nền mỗi phút: xử lý tối đa một tệp mỗi lần để không quá tải CPU. */
export function runAutoEditOnce(): { processed: number; ok: number; skipped: string } {
  if (busy) return { processed: 0, ok: 0, skipped: "đang bận" };
  const s = autoEditSettings();
  if (!s.enabled) return { processed: 0, ok: 0, skipped: "tắt" };
  const files = pendingInbox();
  if (!files.length) return { processed: 0, ok: 0, skipped: "trống" };
  busy = true;
  try {
    const r = processInboxFile(files[0]);
    return { processed: 1, ok: r.ok ? 1 : 0, skipped: "" };
  } finally {
    busy = false;
  }
}

/** Kiểm tra công cụ trên máy chủ để hiện ở Cài đặt. */
export function toolCheck(): { ffmpeg: boolean; magick: boolean; python: boolean; whisper: boolean } {
  const has = (cmd: string, args: string[]) => spawnSync(cmd, args, { encoding: "utf8" }).status === 0;
  const py = process.env.PYTHON_BIN || "python3";
  return { ffmpeg: has("ffmpeg", ["-version"]), magick: has("magick", ["-version"]), python: has(py, ["--version"]), whisper: has(py, ["-c", "import whisper"]) };
}
