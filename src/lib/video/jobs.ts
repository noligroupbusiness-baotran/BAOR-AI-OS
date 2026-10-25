// Hàng đợi dựng video theo "Skill Edit video Vlog" (Second Brain). Thêm nguồn → video "Đang dựng" →
// bộ dựng (scripts/video/pipeline.py) chạy ngầm từng việc một, không chặn máy chủ → "Chờ kiểm tra" kèm bảng kiểm A–P.
// Trạng thái mỗi lần dựng nằm trong DATA_DIR/video-jobs/<videoId>/v<N>/ (job.json, progress.json, report.json),
// không cần bảng mới. Mỗi lần dựng lại là một bản mới vN, không ghi đè, không xoá bản trước.
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getSetting } from "@/lib/admin";
import { finishRun, startRun } from "@/lib/connectors/config";
import { getUpload, listUploads, uploadPath, uploadsDir } from "@/lib/uploads";
import { logActivity } from "@/lib/activity";
import { sendAlert } from "@/lib/alerts";
import skillJson from "../../../scripts/video/skill-vlog.json";
import { isJobFile, type Aspect, type Framing, type JobProgress, type VideoJob, type VideoQuality, type VideoReport } from "./job-types";
import { addVideoFeedback } from "./feedback";
import { campaignRepo } from "@/lib/campaigns/repository";
import { parseShootingScript } from "@/lib/content/shooting-script";
import { roleAllows, roleById } from "@/lib/ai-roster";
import { skillChangeNote } from "./skill-freshness";
import { recordAiCall } from "@/lib/router";

export const SKILL = skillJson as unknown as {
  skillId: string;
  name: string;
  version: string;
  status: string;
  sourceUrl: string;
  syncedAt: string;
  openQuestions: { id: string; q: string; meanwhile: string }[];
  notYetAutomated: string[];
};

const g = globalThis as unknown as { __baorVideoWorker?: { running: string | null; recovered: boolean } };
const worker = (g.__baorVideoWorker ??= { running: null, recovered: false });

/** Tên skill đang dùng để dựng (hiện trên giao diện / ghi chú). */
export function engineLabel(): string {
  return getSetting("video.engine") === "legacy" ? `${SKILL.name} ${SKILL.version}` : "Skill ESV v0.1.r2 (9:16) + Skill Edit Video Ngang v0.1.r2 (16:9) — Notion 02 SKILL, ACTIVE, OWNER duyệt 22/10/2026";
}

export function dataDir(): string {
  return process.env.DATA_DIR ?? path.join(process.cwd(), "data");
}

export function jobsRoot(): string {
  const d = path.join(dataDir(), "video-jobs");
  fs.mkdirSync(d, { recursive: true });
  return d;
}

const SAFE = /^[A-Za-z0-9_-]{1,80}$/;

export function jobDir(videoId: string, version: number): string {
  if (!SAFE.test(videoId) || !Number.isInteger(version) || version < 1) throw new Error("Mã video không hợp lệ");
  return path.join(jobsRoot(), videoId, `v${version}`);
}

function readJson<T>(p: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as T;
  } catch {
    return null;
  }
}

function writeJob(job: VideoJob) {
  const dir = jobDir(job.videoId, job.version);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, "job.json.tmp");
  fs.writeFileSync(tmp, JSON.stringify(job, null, 1));
  fs.renameSync(tmp, path.join(dir, "job.json"));
  runIndexMemo.at = 0; // job đổi (runId mới / video mới) → ánh xạ run → video đọc lại ở lần sau
}

export function readJob(videoId: string, version: number): VideoJob | null {
  return readJson<VideoJob>(path.join(jobDir(videoId, version), "job.json"));
}

export function readReport(videoId: string, version: number): VideoReport | null {
  return readJson<VideoReport>(path.join(jobDir(videoId, version), "report.json"));
}

export function jobVersions(videoId: string): number[] {
  if (!SAFE.test(videoId)) return [];
  const d = path.join(jobsRoot(), videoId);
  if (!fs.existsSync(d)) return [];
  return fs
    .readdirSync(d)
    .map((n) => /^v(\d+)$/.exec(n)?.[1])
    .filter((x): x is string => !!x)
    .map(Number)
    .sort((a, b) => b - a);
}

export interface JobView {
  job: VideoJob;
  progress: JobProgress | null;
  report: VideoReport | null;
  files: string[];
}

export function latestJob(videoId: string): JobView | null {
  for (const v of jobVersions(videoId)) {
    const job = readJob(videoId, v);
    if (!job) continue;
    const dir = jobDir(videoId, v);
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(isJobFile) : [];
    const snaps = fs.existsSync(path.join(dir, "snapshots")) ? fs.readdirSync(path.join(dir, "snapshots")).filter((n) => /^\d{3}\.jpg$/.test(n)).map((n) => `snapshots/${n}`) : [];
    return { job, progress: readJson<JobProgress>(path.join(dir, "progress.json")), report: readJson<VideoReport>(path.join(dir, "report.json")), files: [...files, ...snaps] };
  }
  return null;
}

/** Mã video theo mã lần chạy (sync_runs) của mọi bản dựng: "Việc cần làm" mở đúng video trong Studio, lỗi cũ được đóng khi bản sau xong. */
// Ánh xạ run → video đọc mọi job.json: nhớ ngắn (một lượt tải trang gọi nhiều lần), làm mới khi ghi job / xoá video.
const runIndexMemo = ((globalThis as unknown as { __baorRunIndex?: { at: number; map: Map<string, string> } }).__baorRunIndex ??= { at: 0, map: new Map() });
const RUN_INDEX_TTL_MS = 3_000;

/** Run của video ĐÃ XOÁ (deleteVideo chuyển thư mục video-jobs đi nên job.json không còn): DATA_DIR/removed/run-index.json. */
function removedRunIndexPath(): string {
  return path.join(dataDir(), "removed", "run-index.json");
}

export function removedRunIndex(): Record<string, string> {
  return readJson<Record<string, string>>(removedRunIndexPath()) ?? {};
}

export function videoIdsByRun(): Map<string, string> {
  if (Date.now() - runIndexMemo.at < RUN_INDEX_TTL_MS) return runIndexMemo.map;
  const out = new Map<string, string>(Object.entries(removedRunIndex()));
  for (const j of allJobs()) if (j.runId) out.set(j.runId, j.videoId);
  runIndexMemo.map = out;
  runIndexMemo.at = Date.now();
  return out;
}

function allJobs(): VideoJob[] {
  const out: VideoJob[] = [];
  for (const vid of fs.readdirSync(jobsRoot())) {
    if (!SAFE.test(vid)) continue;
    for (const v of jobVersions(vid)) {
      const j = readJob(vid, v);
      if (j) out.push(j);
    }
  }
  return out;
}

export function activeJobCount(): number {
  return allJobs().filter((j) => j.status === "queued" || j.status === "running").length;
}

// ---------------------------------------------------------------- cấu hình dựng (Cài đặt › Dựng video)

export interface EditSettings {
  keywords: string;
  model: string;
  /** "" = tự chọn theo loại nhạc AI chọn, chỉ bài OWNER đã duyệt (DATA_DIR/video-assets/music; esv_render.pick_music), "none" = không nhạc, còn lại = id tệp tải lên. */
  musicUploadId: string;
  /** #78c: SFX tổng hợp (tách ở chữ nhấn, vút khi vào minh hoạ). OWNER duyệt dùng 21/10/2026 → mặc định bật. */
  sfx: boolean;
  /** Sửa chữ máy nghe sai: mỗi dòng "sai => đúng" (cùng số tiếng). */
  corrections: string;
  /** #103: OWNER 21/10/2026 "cắt những khoảng lặng" → mặc định cắt lặng cho video mới (tắt được trong Cài đặt). */
  cutSilence: boolean;
}

export function editSettings(): EditSettings {
  return {
    keywords: getSetting("video.keywords") ?? "",
    model: getSetting("video.whisperModel") || "medium",
    musicUploadId: getSetting("video.musicUploadId") ?? "",
    sfx: getSetting("video.sfx") !== "0",
    corrections: getSetting("video.corrections") ?? "",
    cutSilence: getSetting("video.cutSilence") !== "0",
  };
}

/** Thư viện B-roll cục bộ: DATA_DIR/video-assets/broll/manifest.json (chỉ clip có giấy phép mới được dùng). */
export function brollDir(): string {
  const d = path.join(dataDir(), "video-assets", "broll");
  fs.mkdirSync(d, { recursive: true });
  return d;
}

export interface BrollItem {
  file: string;
  keywords: string[];
  license: string;
  source: string;
  exists: boolean;
}

export function brollLibrary(): BrollItem[] {
  const d = brollDir();
  const items = readJson<{ file?: string; keywords?: string[]; license?: string; source?: string }[]>(path.join(d, "manifest.json")) ?? [];
  return items.map((it) => ({ file: String(it.file ?? ""), keywords: (it.keywords ?? []).map(String), license: String(it.license ?? ""), source: String(it.source ?? ""), exists: !!it.file && fs.existsSync(path.join(d, String(it.file))) }));
}

/** Lời thoại của kịch bản đã duyệt: gợi ý cho bộ nhận lời (đúng từ chuyên ngành, tên riêng). */
/** Lời nói của kịch bản gắn với video (bỏ thẻ nguồn [S#]/[K#]) — nguồn cho bộ dựng: gợi ý nghe, sửa chữ, ngữ cảnh biên tập AI. */
/** Kịch bản được phép điều khiển bộ dựng: chỉ bản đã duyệt (đã lên lịch / đã đăng vẫn là bản đã duyệt). */
export const APPROVED_SCRIPT = ["approved", "scheduled", "published"];

export function scriptSpeech(contentId: string | null, max = 20_000): string {
  if (!contentId) return "";
  const c = getDb().select({ draft: schema.contentItems.draft, status: schema.contentItems.status }).from(schema.contentItems).where(eq(schema.contentItems.id, contentId)).get();
  // Kịch bản nháp / bị bỏ duyệt sau khi gắn: KHÔNG được sửa chữ hay dẫn biên tập AI (kiểm cả lúc dựng, không chỉ lúc gắn)
  if (!c || !APPROVED_SCRIPT.includes(c.status)) return "";
  const speech = parseShootingScript(c?.draft ?? "").scenes.map((s) => s.speech.replace(/\[[SK]\d+\]/g, "").trim()).filter(Boolean).join(" ");
  return speech.replace(/\s+/g, " ").slice(0, max);
}

function scriptPrompt(contentId: string | null): string {
  return scriptSpeech(contentId, 800);
}

/** Ghi lời nói kịch bản vào thư mục bản dựng (script.txt) → tham số `--script` cho esv_render. Không có kịch bản → []. */
export function scriptArgs(dir: string, contentId: string | null): string[] {
  const speech = scriptSpeech(contentId);
  if (!speech) return [];
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "script.txt"), speech);
  return [`--script=${path.join(dir, "script.txt")}`];
}

/**
 * Gắn / đổi / bỏ kịch bản cho video có sẵn (Nội dung → Video). Chỉ kịch bản đã duyệt. Bản dựng SAU đó đọc kịch bản mới
 * (script.txt ghi lúc chạy); bản cũ giữ nguyên. Trả lại tên kịch bản để báo.
 */
export function linkVideoScript(videoId: string, contentId: string | null, by: string): { ok: true; title: string | null } | { ok: false; error: string } {
  const db = getDb();
  const v = db.select().from(schema.videos).where(eq(schema.videos.id, videoId)).get();
  if (!v) return { ok: false, error: "Không tìm thấy video" };
  // Đã gửi phê duyệt / đã duyệt: đổi kịch bản sẽ đổi caption và bài đăng theo sau → phải Yêu cầu chỉnh sửa trước
  if (v.status === "pending_approval" || v.status === "approved") return { ok: false, error: "Video đã gửi phê duyệt / đã duyệt: Yêu cầu chỉnh sửa trước khi đổi kịch bản" };
  let title: string | null = null;
  if (contentId) {
    const c = db.select().from(schema.contentItems).where(eq(schema.contentItems.id, contentId)).get();
    if (!c) return { ok: false, error: "Không tìm thấy kịch bản" };
    if (!APPROVED_SCRIPT.includes(c.status)) return { ok: false, error: "Chỉ gắn kịch bản đã duyệt" };
    if (!scriptSpeech(c.id)) return { ok: false, error: "Kịch bản chưa có lời nói theo cảnh" };
    title = c.title;
  }
  const next = contentId || null;
  db.transaction(() => {
    db.update(schema.videos).set({ contentId: next, updatedAt: new Date().toISOString() }).where(eq(schema.videos.id, videoId)).run();
    // Đổi / bỏ kịch bản: liên kết chiến dịch video KẾ THỪA từ kịch bản cũ (via content = kịch bản cũ) gỡ; gắn tay (via trống) giữ
    if (v.contentId && v.contentId !== next) campaignRepo.removeInheritedLinks("video", videoId, "content", v.contentId);
    if (next) campaignRepo.inheritLinks("content", next, "video", videoId, v.status);
    addVideoFeedback({ videoId, version: v.version, kind: "link_script", note: next ? `Gắn kịch bản “${title}”: bản dựng sau dùng kịch bản để nghe, sửa chữ và biên tập AI` : "Bỏ gắn kịch bản", by });
  });
  logActivity("human", `${by} ${contentId ? `gắn kịch bản “${title}” cho` : "bỏ kịch bản khỏi"} video “${v.title}”.`, "video");
  return { ok: true, title };
}

// ---------------------------------------------------------------- tạo việc

const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** Video mới từ một tệp nguồn đã nằm trong kho tải lên: "Đang dựng" bản 1, xếp hàng dựng. */
export function createVideoFromSource(opts: { title: string; sourceUploadId: string; cutSilence: boolean; aspect?: Aspect; framing?: Framing; quality?: VideoQuality; prompt?: string; by: string; contentId?: string | null; start?: boolean }): string {
  const start = opts.start ?? true;
  const videoId = newId("v");
  const now = new Date().toISOString();
  const found = opts.contentId ? getDb().select().from(schema.contentItems).where(eq(schema.contentItems.id, opts.contentId)).get() : undefined;
  // Chỉ gắn kịch bản đã duyệt (đường tải lên cũng phải qua cùng cổng với "Gắn kịch bản")
  const content = found && APPROVED_SCRIPT.includes(found.status) ? found : undefined;
  const contentId = content?.id ?? null;
  getDb()
    .insert(schema.videos)
    .values({ id: videoId, title: (content?.title ?? opts.title).slice(0, 200), contentId, agent: "Agent Edit Video", status: "editing", platforms: JSON.stringify(["tiktok", "facebook"]), version: 1, note: start ? `Đang dựng tự động theo ${engineLabel()}.` : "Đã nhận nguồn. Chọn tỷ lệ, cân chỉnh khung rồi bấm Bắt đầu dựng.", uploadId: null, updatedAt: now })
    .run();
  // Video kế thừa chiến dịch và mục tiêu kênh của kịch bản.
  if (contentId) campaignRepo.inheritLinks("content", contentId, "video", videoId, "editing");
  const prompt = [opts.prompt ?? "", scriptPrompt(contentId)].filter(Boolean).join(" ").slice(0, 800);
  writeJob({ videoId, version: 1, status: start ? "queued" : "setup", sourceUploadId: opts.sourceUploadId, cutSilence: opts.cutSilence, aspect: opts.aspect ?? "9:16", framing: opts.framing, quality: opts.quality ?? "1080", prompt, createdAt: now, by: opts.by });
  addVideoFeedback({ videoId, version: 1, kind: "upload", note: `Nguồn: ${opts.title}${content ? ` · kịch bản “${content.title}”` : ""}${opts.cutSilence ? " · cắt khoảng lặng" : ""} · khung ${opts.aspect ?? "9:16"} · ${opts.quality === "4k" ? "4K" : "1080p"}`, by: opts.by });
  logActivity("human", `${opts.by} thêm nguồn “${opts.title}”${start ? ", Agent Edit Video xếp hàng dựng" : ", chờ chọn khung hình"}.`, "video");
  if (start) void kickWorker();
  return videoId;
}

/** "Bắt đầu dựng" cho video đang chờ chọn khung: ghi tỷ lệ / khung / cắt lặng rồi xếp hàng. */
export function startVideoJob(videoId: string, by: string, opts: { aspect: Aspect; framing?: Framing; cutSilence: boolean; quality?: VideoQuality }): { ok: true } | { ok: false; error: string } {
  const lj = latestJob(videoId);
  if (!lj || lj.job.status !== "setup") return { ok: false, error: "Video này không ở bước chọn khung" };
  const now = new Date().toISOString();
  writeJob({ ...lj.job, status: "queued", aspect: opts.aspect, framing: opts.framing, cutSilence: opts.cutSilence, quality: opts.quality ?? lj.job.quality ?? "1080", createdAt: now, by });
  getDb().update(schema.videos).set({ note: `Đang dựng tự động theo ${engineLabel()}, khung ${opts.aspect}.`, updatedAt: now }).where(eq(schema.videos.id, videoId)).run();
  addVideoFeedback({ videoId, version: lj.job.version, kind: "rerender", note: `Bắt đầu dựng: khung ${opts.aspect}${opts.framing ? " (đã cân chỉnh)" : ""}${opts.cutSilence ? ", cắt khoảng lặng" : ""}`, by });
  logActivity("human", `${by} bắt đầu dựng video ${videoId} khung ${opts.aspect}.`, "video");
  void kickWorker();
  return { ok: true };
}

/** Dựng lại từ cùng nguồn thành bản mới (vN+1). Bản trước giữ nguyên. */
/** Lý do KHÔNG dựng lại được lúc này (null = được). Dùng chung cho Dựng lại và Video Review (kiểm trước khi ghi gì). */
export function rerenderBlock(videoId: string): string | null {
  const prev = latestJob(videoId);
  const v = getDb().select().from(schema.videos).where(eq(schema.videos.id, videoId)).get();
  if (!prev || !v) return "Video này không có nguồn để dựng lại";
  // Video đã gửi phê duyệt hoặc đã duyệt: không kéo ngược về "Đang dựng" (muốn sửa thì Yêu cầu chỉnh sửa trước).
  if (!["editing", "review", "needs_changes"].includes(v.status)) return "Chỉ dựng lại video đang dựng, chờ kiểm tra hoặc cần chỉnh sửa";
  if (prev.job.status === "queued" || prev.job.status === "running") return "Video đang trong hàng dựng";
  if (prev.job.status === "setup") return "Video đang chờ chọn khung hình: chọn xong bấm Bắt đầu dựng";
  return null;
}

export function rerenderVideo(videoId: string, by: string, cutSilence?: boolean, frame?: { aspect: Aspect; framing?: Framing }, feedbackNote?: string, aiPlan = false): { ok: true; version: number } | { ok: false; error: string } {
  const block = rerenderBlock(videoId);
  if (block) return { ok: false, error: block };
  const prev = latestJob(videoId)!;
  const v = getDb().select().from(schema.videos).where(eq(schema.videos.id, videoId)).get()!;
  const version = Math.max(prev.job.version, v.version) + 1;
  const now = new Date().toISOString();
  const aspect = frame?.aspect ?? prev.job.aspect ?? "9:16";
  const framing = frame ? frame.framing : prev.job.framing;
  writeJob({ videoId, version, status: "queued", sourceUploadId: prev.job.sourceUploadId, cutSilence: cutSilence ?? prev.job.cutSilence, aspect, framing, ...(prev.job.quality ? { quality: prev.job.quality } : {}), prompt: prev.job.prompt ?? "", createdAt: now, by, ...(aiPlan ? { aiPlan: true } : {}) });
  getDb().update(schema.videos).set({ status: "editing", version, updatedAt: now, note: `Đang dựng bản ${version}.` }).where(eq(schema.videos.id, videoId)).run();
  campaignRepo.syncEntityStatus("video", videoId, "editing");
  // Một lần dựng = một dòng lịch sử (lý do cụ thể do nơi gọi đưa, vd "Dựng lại theo 2 góp ý: …")
  addVideoFeedback({ videoId, version, kind: "rerender", note: feedbackNote ?? `Dựng lại từ cùng nguồn${(cutSilence ?? prev.job.cutSilence) ? ", cắt khoảng lặng" : ""}, khung ${aspect}${framing ? ` (tâm ${framing.x !== undefined ? Math.round(framing.x * 100) + "%" : "mặt"}, ${framing.y !== undefined ? Math.round(framing.y * 100) + "%" : "giữa"}, phóng ×${(framing.zoom ?? 1).toFixed(2)})` : ""}`, by });
  logActivity("human", `${by} yêu cầu dựng lại “${v.title}” thành bản ${version}.`, "video");
  void kickWorker();
  return { ok: true, version };
}

// ---------------------------------------------------------------- chạy ngầm

function pythonBin(): string {
  return process.env.PYTHON_BIN || "python3";
}

/** Lệnh đọc dòng lệnh của một tiến trình theo hệ điều hành (Windows không có `ps`). */
export function processCommandLineCmd(platform: NodeJS.Platform, pid: number): [string, string[]] {
  if (platform === "win32") {
    return ["powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `(Get-CimInstance Win32_Process -Filter "ProcessId=${Math.trunc(pid)}").CommandLine`]];
  }
  return ["ps", ["-o", "command=", "-p", String(Math.trunc(pid))]];
}

/** Lệnh dừng cả cây tiến trình trên Windows (process.kill(-pid) không có tác dụng ở Windows). */
export function killTreeCmd(platform: NodeJS.Platform, pid: number): [string, string[]] | null {
  return platform === "win32" ? ["taskkill", ["/PID", String(Math.trunc(pid)), "/T", "/F"]] : null;
}

export function isRendererCommandLine(cmd: string): boolean {
  // Cả hai bộ dựng: pipeline.py (bộ cũ) và esv_render.py (Skill ESV, mặc định).
  return cmd.includes("pipeline.py") || cmd.includes("esv_render.py");
}

/** Còn sống VÀ đúng là bộ dựng của mình (sau khi máy khởi động lại, PID có thể đã thuộc tiến trình khác). */
function isOurRenderer(pid: number | undefined): boolean {
  if (!pid || pid === process.pid) return false;
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }
  const [cmd, args] = processCommandLineCmd(process.platform, pid);
  const r = spawnSync(cmd, args, { encoding: "utf8", timeout: 10_000, windowsHide: true });
  return r.status === 0 && isRendererCommandLine(r.stdout ?? "");
}

/** Dừng cả nhóm tiến trình (python + ffmpeg / whisper con), không để tiến trình con chạy mồ côi. */
function killGroup(pid: number) {
  const tree = killTreeCmd(process.platform, pid);
  if (tree) {
    const r = spawnSync(tree[0], tree[1], { timeout: 10_000, windowsHide: true });
    if (r.status === 0) return;
    // taskkill lỗi: ít nhất dừng tiến trình chính
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {}
  }
}

export const RESTART_MSG = "Máy chủ khởi động lại giữa lúc dựng";

/**
 * Job tại chỗ còn "running" từ lần chạy trước (máy chủ khởi động lại): xếp lại qua failJob — khởi động lại KHÔNG ghi run lỗi
 * (run giữ mở, lần dựng lại dùng tiếp), nhưng TĂNG attempt: nguồn làm sập tiến trình lặp lại thì sau MAX_RENDER_RETRIES lần thành lỗi thật,
 * không xếp lại vô hạn. `force` chỉ cho kiểm thử (bình thường chạy một lần mỗi tiến trình).
 */
export function recoverStale(force = false) {
  if (worker.recovered && !force) return;
  worker.recovered = true;
  for (const j of allJobs()) {
    if (j.status !== "running" || j.worker) continue; // job của máy dựng: do recoverRemoteStale xử lý theo nhịp tim
    // Tiến trình dựng của lần chạy trước còn sống: dừng hẳn trước khi xếp lại, để hai bộ dựng không cùng ghi một thư mục.
    if (isOurRenderer(j.pid)) killGroup(j.pid!);
    const title = getDb().select().from(schema.videos).where(eq(schema.videos.id, j.videoId)).get()?.title ?? j.videoId;
    failJob({ ...j, pid: undefined }, RESTART_MSG, runFor(j, title), title);
  }
}

/** Thời gian dựng tối đa (mặc định 3 giờ): quá thì dừng để hàng đợi không kẹt. */
const JOB_TIMEOUT_MS = Number(process.env.BAOR_VIDEO_TIMEOUT_MIN ?? 180) * 60_000;
const children = ((globalThis as unknown as { __baorVideoChildren?: Set<import("node:child_process").ChildProcess> }).__baorVideoChildren ??= new Set());
if (!(globalThis as unknown as { __baorVideoExitHook?: boolean }).__baorVideoExitHook) {
  (globalThis as unknown as { __baorVideoExitHook?: boolean }).__baorVideoExitHook = true;
  // Máy chủ tắt: dừng bộ dựng con, không để chạy mồ côi.
  process.once("exit", () => {
    for (const c of children) if (c.pid) killGroup(c.pid);
  });
}

// Bản đang dựng OWNER bấm Dừng → lời nhắn dừng (khoá mới: Set cũ của bản trước có thể còn trên globalThis khi tải lại nóng)
const stopRequested = ((globalThis as unknown as { __baorVideoStopBy?: Map<string, string> }).__baorVideoStopBy ??= new Map());

/** Lời nhắn của job bị dừng theo yêu cầu (KHÔNG phải lỗi: không ghi run lỗi, không cảnh báo, không vào Việc cần làm). */
export const STOP_PREFIX = "Đã dừng theo yêu cầu";
export const isStoppedJob = (j: Pick<VideoJob, "status" | "error"> | null | undefined) => !!j && j.status === "error" && (j.error ?? "").startsWith(STOP_PREFIX);

export const VIDEO_RUN_KEY = "video_auto_edit";

/** Lần chạy (sync_runs) của job: dùng tiếp run còn mở của lần thử trước (thử lại / khởi động lại không ghi run lỗi), không thì mở run mới. */
function runFor(job: VideoJob, title: string): string {
  if (job.runId) {
    const r = getDb().select({ finishedAt: schema.syncRuns.finishedAt }).from(schema.syncRuns).where(eq(schema.syncRuns.id, job.runId)).get();
    if (r && !r.finishedAt) return job.runId;
  }
  return startRun(VIDEO_RUN_KEY, title);
}

/** Ghi tình trạng vào run còn mở (vd "lỗi tạm → tự thử lại") mà không đóng run. */
function noteRun(runId: string, message: string) {
  getDb().update(schema.syncRuns).set({ message: message.slice(0, 500) }).where(eq(schema.syncRuns.id, runId)).run();
}

function runIsOpen(runId: string | undefined): runId is string {
  if (!runId) return false;
  const r = getDb().select({ finishedAt: schema.syncRuns.finishedAt }).from(schema.syncRuns).where(eq(schema.syncRuns.id, runId)).get();
  return !!r && !r.finishedAt;
}

/** Job dừng theo yêu cầu: ghi job "error" kèm lời nhắn dừng, đóng run là KHÔNG lỗi, không thử lại, không cảnh báo. */
function stoppedJob(job: VideoJob, msg: string, runId: string | undefined) {
  const now = new Date().toISOString();
  writeJob({ ...job, status: "error", finishedAt: now, error: msg, pid: undefined, worker: undefined, heartbeatAt: undefined, ...(runId ? { runId } : {}) });
  if (getDb().select().from(schema.videos).where(eq(schema.videos.id, job.videoId)).get()) getDb().update(schema.videos).set({ note: msg, updatedAt: now }).where(eq(schema.videos.id, job.videoId)).run();
  if (runIsOpen(runId)) finishRun(runId, true, `${msg} (không phải lỗi)`);
}

/** Dừng bản đang dựng / đang chờ của một video (dừng cả nhóm tiến trình ffmpeg / whisper con). Bản trước vẫn giữ nguyên. */
export function stopVideoJob(videoId: string, by: string): { ok: true; version: number } | { ok: false; error: string } {
  const v = jobVersions(videoId)[0];
  const job = v ? readJob(videoId, v) : null;
  if (!job || (job.status !== "queued" && job.status !== "running")) return { ok: false, error: "Video này không có bản đang dựng" };
  const msg = `${STOP_PREFIX} của ${by}`;
  if (job.status === "running" && !job.worker && job.pid && isOurRenderer(job.pid)) {
    // Bộ dựng tại chỗ: dừng tiến trình, runJob (sự kiện close) đóng job + run là "đã dừng"
    stopRequested.set(`${videoId}/v${job.version}`, msg);
    killGroup(job.pid);
  } else {
    // Đang chờ / máy dựng từ xa (nhịp tim sau đó nhận 409) / tiến trình đã mất: đóng job và run ngay
    stoppedJob(job, msg, job.runId);
  }
  logActivity("human", `${by} dừng dựng bản ${job.version} của video ${videoId}.`, "video");
  return { ok: true, version: job.version };
}

/** Đánh dấu bài lỗi "chưa rõ đã lên trang chưa" — PHẢI trùng AMBIGUOUS_MARK của src/lib/publishing/video.ts
 *  (không import để tránh vòng jobs ↔ publishing; tests/video-delete.test.ts giữ hai bên khớp). */
export const POST_AMBIGUOUS_MARK = "[CẦN KIỂM TRA TRANG]";
const PENDING_POST = new Set(["scheduled", "publishing", "verifying"]);
const DELETABLE_STATUS = new Set(["editing", "review", "needs_changes", "approved"]);

type PostRow = typeof schema.scheduledPosts.$inferSelect;
/** Bài đã (hoặc có thể đã) lên nền tảng thật: đã đăng, có mã bài, hay lỗi chưa rõ (cần kiểm trang). Bài chế độ thử không tính. */
const postIsLive = (p: PostRow) => p.status === "published" || !!p.externalId || (p.status === "failed" && (p.error ?? "").startsWith(POST_AMBIGUOUS_MARK));

/**
 * Lý do CHƯA xoá được video (null = xoá được). Dùng chung cho bộ xoá và nút Xoá ở Kho video / Video Studio.
 * Xoá được: video chưa gửi phê duyệt, hoặc ĐÃ duyệt (người có quyền phê duyệt) mà chưa có bài nào đang lên lịch / đã đăng thật
 * và chưa dùng cho quảng cáo. Video đang chờ phê duyệt: yêu cầu chỉnh sửa (hoặc duyệt) trước.
 */
export function videoDeleteBlock(videoId: string, canDeleteApproved: boolean): string | null {
  const db = getDb();
  const v = db.select().from(schema.videos).where(eq(schema.videos.id, videoId)).get();
  if (!v) return "Không tìm thấy video";
  if (!DELETABLE_STATUS.has(v.status)) return "Video đang chờ phê duyệt — yêu cầu chỉnh sửa hoặc duyệt trước rồi mới xoá";
  if (v.status === "approved" && !canDeleteApproved) return "Cần quyền phê duyệt để xoá video đã duyệt";
  const posts = db.select().from(schema.scheduledPosts).where(eq(schema.scheduledPosts.videoId, videoId)).all();
  const pending = posts.filter((p) => PENDING_POST.has(p.status)).length;
  if (pending) return `Video đang có ${pending} bài lên lịch — huỷ lịch trước rồi mới xoá`;
  const live = posts.filter(postIsLive).length;
  if (live) return `Video đã đăng thật ${live} bài — không xoá (giữ bài và báo cáo)`;
  if (db.select().from(schema.adCampaigns).where(eq(schema.adCampaigns.videoId, videoId)).all().length) return "Video đã dùng cho quảng cáo, không xoá";
  return null;
}

/** Xoá video chưa gửi phê duyệt, hoặc video đã duyệt chưa có bài lên lịch / đã đăng (xem videoDeleteBlock): dừng bản đang dựng, gỡ khỏi Studio / Kho.
 *  Tệp (nguồn, bản dựng, thư mục dựng) và dữ liệu được CHUYỂN vào DATA_DIR/removed/<videoId>-<thời điểm>/ để khôi phục được, không xoá vĩnh viễn.
 *  Bài đăng đã huỷ / lỗi chưa lên trang / chế độ thử, lịch sử phản hồi, góp ý theo mốc và liên kết chiến dịch của video được ghi vào
 *  records.json rồi gỡ khỏi bảng (không để dòng mồ côi). Phê duyệt chiến dịch (campaign_approvals) giữ lại: là lịch sử của chiến dịch.
 *  Thứ tự (kiểm toán 26/10 — trước đây chuyển tệp TRƯỚC rồi mới xoá dòng, lỗi giữa chừng để lại video "mất tệp"):
 *  kiểm chặn → ghi records.json (lỗi: chưa đổi gì) → dừng bản đang dựng → MỌI lệnh CSDL trong một transaction (lỗi: CSDL nguyên vẹn,
 *  tệp chưa chuyển, records.json gỡ) → chuyển tệp. Chuyển tệp lỗi: CSDL đã gỡ nhưng records.json đủ để khôi phục → ghi rõ tệp nào còn
 *  ở chỗ cũ vào records.json (fileErrors) + nhật ký, trả warning — không có trạng thái nửa vời không ghi nhận. */
export function deleteVideo(videoId: string, by: string, opts: { canDeleteApproved?: boolean } = {}): { ok: true; title: string; warning?: string } | { ok: false; error: string } {
  const db = getDb();
  const v = db.select().from(schema.videos).where(eq(schema.videos.id, videoId)).get();
  if (!v) return { ok: false, error: "Không tìm thấy video" };
  const block = videoDeleteBlock(videoId, !!opts.canDeleteApproved);
  if (block) return { ok: false, error: block };
  const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
  const posts = db.select().from(schema.scheduledPosts).where(eq(schema.scheduledPosts.videoId, videoId)).all();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const arch = path.join(dataDir(), "removed", `${videoId}-${stamp}`);
  const upIds = new Set<string>();
  for (const ver of jobVersions(videoId)) {
    const j = readJob(videoId, ver);
    if (j?.sourceUploadId) upIds.add(j.sourceUploadId);
    if (j?.masterUploadId) upIds.add(j.masterUploadId);
  }
  if (v.uploadId) upIds.add(v.uploadId);
  const feedback = db.select().from(schema.videoFeedback).where(eq(schema.videoFeedback.videoId, videoId)).all();
  // Góp ý theo mốc (Video Review) + liên kết chiến dịch: lưu trữ cùng video rồi gỡ khỏi bảng (không để dòng mồ côi trỏ video đã xoá)
  const comments = db.select().from(schema.videoComments).where(eq(schema.videoComments.videoId, videoId)).all();
  const links = db.select().from(schema.marketingLinks).where(and(eq(schema.marketingLinks.entityType, "video"), eq(schema.marketingLinks.entityId, videoId))).all();
  // Liên kết chiến dịch của các BÀI ĐĂNG video này (kế thừa lúc lên lịch, entityType "publication") — bài bị gỡ thì liên kết cũng gỡ
  const postIds = posts.map((p) => p.id);
  const postLinks = postIds.length ? db.select().from(schema.marketingLinks).where(and(eq(schema.marketingLinks.entityType, "publication"), inArray(schema.marketingLinks.entityId, postIds))).all() : [];
  const uploads = [...upIds].map((id) => getUpload(id)).filter((u): u is NonNullable<typeof u> => !!u);
  const runIds = jobVersions(videoId).map((ver) => readJob(videoId, ver)?.runId).filter((x): x is string => !!x);
  // Tệp sẽ chuyển (đường dẫn tương đối DATA_DIR, ghi vào records.json để khôi phục tay được nếu bước chuyển lỗi)
  const moves: { from: string; to: string }[] = [];
  for (const u of uploads) {
    const p = path.join(uploadsDir(), u.fileName);
    if (fs.existsSync(p)) moves.push({ from: p, to: path.join(arch, u.fileName) });
  }
  const jd = path.join(jobsRoot(), videoId);
  if (fs.existsSync(jd)) moves.push({ from: jd, to: path.join(arch, "video-jobs") });
  const rel = (p: string) => path.relative(dataDir(), p);
  const recordsPath = path.join(arch, "records.json");
  const records: Record<string, unknown> = { video: v, feedback, comments, links, postLinks, uploads, posts, runIds, files: moves.map((m) => ({ from: rel(m.from), to: rel(m.to) })), by, removedAt: new Date().toISOString() };

  // 1) Bản lưu trữ trước khi đụng gì
  try {
    fs.mkdirSync(arch, { recursive: true });
    fs.writeFileSync(recordsPath, JSON.stringify(records, null, 1));
  } catch (e) {
    try {
      fs.rmSync(recordsPath, { force: true });
      fs.rmdirSync(arch); // chỉ gỡ khi trống (thư mục vừa tạo)
    } catch {}
    return { ok: false, error: `Không ghi được bản lưu trữ, chưa xoá gì: ${errText(e)}` };
  }

  // 2) Dừng bản đang dựng (bộ dựng không ghi tiếp vào thư mục sắp chuyển)
  const last = latestJob(videoId);
  const stopped = !!last && (last.job.status === "queued" || last.job.status === "running");
  if (stopped) {
    try {
      stopVideoJob(videoId, by);
    } catch (e) {
      // Dừng lỗi (ghi job.json / CSDL hỏng): chưa xoá gì → gỡ bản lưu trữ vừa ghi, không để records.json "ma" cho video còn nguyên
      try {
        fs.rmSync(recordsPath, { force: true });
        fs.rmdirSync(arch);
      } catch {}
      return { ok: false, error: `Không dừng được bản đang dựng, chưa xoá gì: ${errText(e)}` };
    }
  }

  // 3) Mọi lệnh CSDL trong MỘT transaction: lỗi giữa chừng → không gỡ dòng nào
  try {
    db.transaction((tx) => {
      if (uploads.length) tx.delete(schema.uploads).where(inArray(schema.uploads.id, uploads.map((u) => u.id))).run();
      tx.delete(schema.videoFeedback).where(eq(schema.videoFeedback.videoId, videoId)).run();
      tx.delete(schema.videoComments).where(eq(schema.videoComments.videoId, videoId)).run();
      // Chỉ còn bài không lên trang (đã huỷ / lỗi rõ / chế độ thử) — videoDeleteBlock đã chặn bài chờ / đã đăng
      tx.delete(schema.scheduledPosts).where(eq(schema.scheduledPosts.videoId, videoId)).run();
      if (postIds.length) tx.delete(schema.marketingLinks).where(and(eq(schema.marketingLinks.entityType, "publication"), inArray(schema.marketingLinks.entityId, postIds))).run();
      tx.delete(schema.marketingLinks).where(and(eq(schema.marketingLinks.entityType, "video"), eq(schema.marketingLinks.entityId, videoId))).run();
      tx.delete(schema.videos).where(eq(schema.videos.id, videoId)).run();
    });
  } catch (e) {
    // CSDL nguyên vẹn, tệp chưa chuyển: bản lưu trữ không ứng với lần xoá nào → gỡ (chỉ gồm records.json vừa ghi)
    try {
      fs.rmSync(recordsPath, { force: true });
      fs.rmdirSync(arch);
    } catch {}
    return { ok: false, error: `Không xoá được video (CSDL lỗi, chưa gỡ gì${stopped ? "; bản đang dựng đã dừng" : ""}): ${errText(e)}` };
  }

  // 4) Giữ ánh xạ run → video sau khi chuyển thư mục dựng đi: lỗi dựng của video đã xoá không còn tính là việc cần xử lý
  const fileErrors: { from: string; to: string; error: string }[] = [];
  if (runIds.length) {
    try {
      const idx = removedRunIndex();
      for (const r of runIds) idx[r] = videoId;
      fs.writeFileSync(removedRunIndexPath(), JSON.stringify(idx));
    } catch (e) {
      fileErrors.push({ from: "", to: rel(removedRunIndexPath()), error: `Không ghi được ánh xạ run → video: ${errText(e)}` });
    }
  }
  // 5) Chuyển tệp (sau khi CSDL đã gỡ): lỗi từng tệp ghi lại, các tệp khác vẫn chuyển
  for (const m of moves) {
    try {
      fs.renameSync(m.from, m.to);
    } catch (e) {
      fileErrors.push({ from: rel(m.from), to: rel(m.to), error: errText(e) });
    }
  }
  runIndexMemo.at = 0;
  if (fileErrors.length) {
    const list = fileErrors.map((f) => (f.from ? `${f.from} (${f.error})` : f.error)).join("; ");
    const warning = `Đã gỡ video khỏi CSDL (dữ liệu lưu trong ${rel(recordsPath)}) nhưng ${fileErrors.length} tệp chưa chuyển được vào lưu trữ, còn ở chỗ cũ: ${list}`;
    try {
      // Ghi qua tệp tạm rồi đổi tên: ghi dở (đĩa đầy) không làm hỏng records.json đầu — bản duy nhất để khôi phục
      const tmpRec = `${recordsPath}.tmp`;
      try {
        fs.writeFileSync(tmpRec, JSON.stringify({ ...records, fileErrors }, null, 1));
        fs.renameSync(tmpRec, recordsPath);
      } catch (e) {
        fs.rmSync(tmpRec, { force: true });
        throw e;
      }
    } catch (e) {
      console.error(`[video] deleteVideo ${videoId}: không cập nhật được records.json:`, e);
    }
    console.error(`[video] deleteVideo ${videoId}: ${warning}`);
    logActivity("human", `${by} xoá video “${v.title}” — CẢNH BÁO: ${warning}`, "video");
    return { ok: true, title: v.title, warning };
  }
  logActivity("human", `${by} xoá video “${v.title}” (lưu trữ ở ${rel(arch)}).`, "video");
  return { ok: true, title: v.title };
}

/** Gọi khi thêm nguồn và mỗi phút từ bộ chạy nền. Không chờ: dựng chạy trong tiến trình con. */
export async function kickWorker(): Promise<void> {
  // Kiểm thử chạy trên CSDL tạm: không chạy bộ dựng thật.
  if (process.env.BAOR_VIDEO_WORKER === "off") return;
  if (worker.running) return;
  // Giữ chỗ NGAY trước khi thu hồi: failJob trong recoverStale / recoverRemoteStale gọi kickWorker lồng nhau — lần lồng phải trả về
  // luôn, không thì nó và lần ngoài cùng chọn job và hai bộ dựng chạy song song.
  worker.running = "kick";
  let next: VideoJob | undefined;
  try {
    // Thu hồi job kẹt ở CẢ hai chế độ: job tại chỗ của lần chạy trước (khởi động lại) + job máy dựng mất nhịp tim
    recoverStale();
    recoverRemoteStale();
    // Chế độ máy dựng của OWNER: máy chủ không tự dựng, máy dựng gọi /api/render-worker/claim để nhận việc
    if (renderMode() === "remote") return;
    next = allJobs()
      .filter((j) => j.status === "queued")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
    if (!next) return;
    worker.running = `${next.videoId}/v${next.version}`;
  } finally {
    if (!next) worker.running = null;
  }
  try {
    await runJob(next);
  } finally {
    worker.running = null;
  }
  void kickWorker();
}

export function runJob(job: VideoJob): Promise<void> {
  const dir = jobDir(job.videoId, job.version);
  const video = getDb().select().from(schema.videos).where(eq(schema.videos.id, job.videoId)).get();
  const title = video?.title ?? job.videoId;
  const src = getUpload(job.sourceUploadId);
  const srcPath = src ? uploadPath(src) : null;
  const runId = runFor(job, title);
  const started = new Date().toISOString();
  writeJob({ ...job, status: "running", startedAt: started, runId, worker: undefined, heartbeatAt: undefined });
  if (!srcPath) {
    failJob(job, "Không tìm thấy tệp nguồn trong kho tải lên", runId, title);
    return Promise.resolve();
  }
  const s = editSettings();
  // Dạng --khoá=giá trị: từ khoá bắt đầu bằng "-" (vd "-50%") không bị hiểu nhầm là tham số.
  const args = [path.join(process.cwd(), "scripts", "video", "pipeline.py"), `--input=${srcPath}`, `--job-dir=${dir}`, `--keywords=${s.keywords}`, `--model=${s.model}`];
  if (job.prompt) args.push(`--prompt=${job.prompt}`);
  if (job.cutSilence) args.push("--cut-silence");
  if (s.sfx) args.push("--sfx");
  const bdir = brollDir();
  if (fs.existsSync(path.join(bdir, "manifest.json"))) args.push(`--broll-dir=${bdir}`);
  const music = s.musicUploadId && s.musicUploadId !== "none" ? listUploads("music").find((u) => u.id === s.musicUploadId) : undefined;
  const musicPath = music ? uploadPath(music) : null;
  if (music && musicPath) args.push(`--music=${musicPath}`, `--music-license=${String(music.meta.license ?? "")}`);
  const prevVersion = jobVersions(job.videoId).find((v) => v < job.version);
  // Bộ dựng mặc định: Skill ESV (Notion 02 SKILL). Bộ cũ (pipeline.py) chỉ khi Cài đặt chọn "legacy".
  // Kế hoạch dựng (chữ nhấn, sơ đồ, zoom): lấy từ bản trước nếu có (biên tập đã lập), không thì bộ dựng tự lập theo luật.
  const prevPlan = prevVersion ? path.join(jobDir(job.videoId, prevVersion), "plan.json") : "";
  const ownPlan = path.join(dir, "plan.json");
  // Bộ cũ chỉ có 9:16: tỷ lệ khác luôn dựng bằng Skill ESV.
  if (getSetting("video.engine") !== "legacy" || (job.aspect ?? "9:16") !== "9:16") {
    args.length = 0;
    args.push(path.join(process.cwd(), "scripts", "video", "esv_render.py"), `--input=${srcPath}`, `--job-dir=${dir}`, `--keywords=${s.keywords}`, `--model=${s.model}`);
    if (s.corrections.trim()) args.push(`--corrections=${s.corrections}`);
    if (job.cutSilence) args.push("--cut-silence");
    args.push(`--aspect=${job.aspect ?? "9:16"}`);
    if (job.quality === "4k") args.push("--quality=4k");
    if (job.framing?.x !== undefined) args.push(`--frame-x=${job.framing.x}`);
    if (job.framing?.y !== undefined) args.push(`--frame-y=${job.framing.y}`);
    if (job.framing?.zoom !== undefined) args.push(`--frame-zoom=${job.framing.zoom}`);
    if (!s.sfx) args.push("--no-sfx");
    if (job.aiPlan) args.push("--ai-plan");
    if (s.musicUploadId === "none") args.push("--no-music");
    else if (music && musicPath) args.push(`--music=${musicPath}`, `--music-license=${String(music.meta.license ?? "")}`);
    // Kế hoạch biên tập ở cấp video (DATA_DIR/video-jobs/<videoId>/plan.json, do biên tập lập) được ưu tiên và giữ qua mọi lần dựng lại.
    // Nội dung → Video: kịch bản HIỆN TẠI của video (gắn lúc tải lên hoặc sau đó) đi vào bộ dựng
    args.push(...scriptArgs(dir, video?.contentId ?? null));
    const editorPlan = path.join(jobsRoot(), job.videoId, "plan.json");
    if (fs.existsSync(ownPlan)) args.push(`--plan=${ownPlan}`);
    else if (fs.existsSync(editorPlan)) args.push(`--plan=${editorPlan}`);
    else if (prevPlan && fs.existsSync(prevPlan)) args.push(`--plan=${prevPlan}`);
    if (prevVersion && fs.existsSync(path.join(jobDir(job.videoId, prevVersion), "words_main.json"))) args.push(`--words=${path.join(jobDir(job.videoId, prevVersion), "words_main.json")}`);
  } else if (prevVersion) {
    const pdir = jobDir(job.videoId, prevVersion);
    if (fs.existsSync(path.join(pdir, "words_main.json"))) args.push(`--reuse-dir=${pdir}`);
    const pjob = readJob(job.videoId, prevVersion);
    const pmaster = pjob?.masterUploadId ? getUpload(pjob.masterUploadId) : undefined;
    const pm = pmaster ? uploadPath(pmaster) : null;
    if (pm) args.push(`--previous=${pm}`);
  }
  return new Promise((resolve) => {
    // detached: bộ dựng chạy trong nhóm tiến trình riêng để dừng được cả ffmpeg / whisper con.
    // Đội AI: "AI Edit Video" tắt "Cho phép gọi AI" → bộ dựng lập kế hoạch theo luật (ai_plan.available() trả False)
    const aiEdit = roleAllows(roleById("video_edit")!);
    const env = aiEdit.ok ? process.env : { ...process.env, BAOR_AI_PLAN: "off" };
    const child = spawn(pythonBin(), args, { stdio: ["ignore", "pipe", "pipe"], detached: true, env });
    children.add(child);
    writeJob({ ...job, status: "running", startedAt: started, runId, pid: child.pid });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      if (child.pid) killGroup(child.pid);
    }, JOB_TIMEOUT_MS);
    let err = "";
    child.stderr.on("data", (b: Buffer) => {
      err = (err + b.toString()).slice(-4000);
    });
    child.stdout.on("data", () => {});
    let settled = false;
    child.on("error", (e) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      children.delete(child);
      failJob(job, `Không chạy được bộ dựng: ${e.message}`, runId, title);
      resolve();
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      children.delete(child);
      const key = `${job.videoId}/v${job.version}`;
      const stopMsg = stopRequested.get(key);
      if (stopMsg) {
        stopRequested.delete(key);
        stoppedJob(job, stopMsg, runId);
      } else if (timedOut) {
        failJob(job, `Dựng quá ${Math.round(JOB_TIMEOUT_MS / 60_000)} phút, đã dừng`, runId, title);
      } else if (code === 0) {
        try {
          finishJob(job, dir, runId, title, started);
        } catch (e) {
          failJob(job, e instanceof Error ? e.message : String(e), runId, title);
        }
      } else {
        const line = err.split("\n").reverse().find((l) => l.startsWith("LỖI:")) ?? err.split("\n").filter(Boolean).pop() ?? `mã thoát ${code}`;
        failJob(job, line.replace(/^LỖI:\s*/, ""), runId, title);
      }
      resolve();
    });
  });
}

function finishJob(job: VideoJob, dir: string, runId: string, title: string, started: string) {
  const report = readJson<VideoReport>(path.join(dir, "report.json"));
  const master = path.join(dir, "master.mp4");
  if (!report || !fs.existsSync(master)) throw new Error("Bộ dựng không tạo ra bản chính");
  // Sổ chi phí AI chung: mô hình biên tập tại máy đã chạy trong lần dựng này → ghi 1 lần gọi, ₫0 (không tốn API)
  try {
    if (report.aiRun) recordAiCall({ purpose: "video_plan", role: "video_edit", model: report.aiRun.model || "mô hình tại máy", inputTokens: 0, outputTokens: 0, ok: true, costVnd: 0 });
  } catch {
    // sổ chi phí lỗi không được làm hỏng bản dựng đã xong
  }
  // Đưa bản chính vào kho tải lên (phát trong Video Studio, đăng bài dùng sau khi duyệt)
  const upId = newId("up");
  const fileName = `${upId}.mp4`;
  fs.renameSync(master, path.join(uploadsDir(), fileName));
  const size = fs.statSync(path.join(uploadsDir(), fileName)).size;
  const now = new Date().toISOString();
  const name = `${title}_v${job.version}.mp4`;
  getDb()
    .insert(schema.uploads)
    .values({ id: upId, kind: "video", name, fileName, mime: "video/mp4", size, meta: JSON.stringify({ title: name, source: "auto-edit", videoId: job.videoId, version: job.version, skill: `${SKILL.skillId} ${SKILL.version}` }), uploadedBy: "agent-edit-video", createdAt: now })
    .run();
  const failed = report.failed ?? [];
  let skillNote = "";
  try {
    skillNote = skillChangeNote();
  } catch {
    // chỉ mục Second Brain lỗi không được làm hỏng bản dựng
  }
  const note = `Bản ${job.version}: ${report.output.seconds.toFixed(0)} giây, ${report.captions.units} khung phụ đề, ${report.emphasis.length} chữ nhấn. Bảng kiểm: ${failed.length ? `chưa đạt ${failed.join(", ")}` : "các mục đo được đều đạt"}; ${report.blockers.length} điểm chặn đăng.${skillNote}`;
  getDb().update(schema.videos).set({ status: "review", version: job.version, uploadId: upId, note, updatedAt: now }).where(eq(schema.videos.id, job.videoId)).run();
  // Liên kết chiến dịch của video theo trạng thái mới (như mọi bước chuyển khác), không kẹt "editing"
  campaignRepo.syncEntityStatus("video", job.videoId, "review");
  writeJob({ ...job, status: "done", startedAt: started, finishedAt: now, runId, masterUploadId: upId });
  adoptAiPlan(job, dir);
  finishRun(runId, true, `Dựng xong “${title}” bản ${job.version} → Chờ kiểm tra`, 1);
  logActivity("ai", `Agent Edit Video dựng xong “${title}” bản ${job.version} theo ${engineLabel()}, chờ kiểm tra.`, "video");
  void verifyCommentsLater(job.videoId);
}

/**
 * Bản dựng do biên tập AI lập kế hoạch: kế hoạch đó thành kế hoạch biên tập của video (Bảng biên tập / góp ý sửa tiếp trên nó).
 * Kế hoạch cấp video cũ được lưu trữ cạnh đó (plan.prev-<thời điểm>.json), không xoá.
 */
export function adoptAiPlan(job: VideoJob, dir: string) {
  const jp = readJson<Record<string, unknown>>(path.join(dir, "plan.json"));
  if (!jp || !String(jp.by ?? "").startsWith("Biên tập AI")) return;
  const own = path.join(jobsRoot(), job.videoId, "plan.json");
  if (fs.existsSync(own) && !job.aiPlan) return; // đã có kế hoạch người biên tập và không yêu cầu AI lập lại
  if (fs.existsSync(own)) fs.renameSync(own, path.join(jobsRoot(), job.videoId, `plan.prev-${new Date().toISOString().replace(/[:.]/g, "-")}.json`));
  fs.copyFileSync(path.join(dir, "plan.json"), own);
}

/** Bản mới xong / lỗi: kiểm các góp ý đang chờ bản này (Video Review). Nạp động để tránh vòng import jobs ↔ review. */
function verifyCommentsLater(videoId: string) {
  return import("./review").then((m) => m.verifyComments(videoId)).catch(() => 0);
}

export const MAX_RENDER_RETRIES = 1;

/**
 * Lỗi dựng có đáng tự thử lại không. KHÔNG thử lại: người dùng dừng, mất tệp nguồn, quá thời gian (thử lại cũng quá),
 * video đã xoá. Còn lại (bộ dựng sập giữa chừng, thiếu bộ nhớ, ffmpeg lỗi, không ra bản chính) là lỗi tạm thời.
 */
export function isRetryableRenderError(msg: string): boolean {
  return !/Đã dừng theo yêu cầu|Không tìm thấy tệp nguồn|Dựng quá \d+ phút|Đã xoá video|không hợp lệ|Thiếu font|Chỉ nhận|không đọc được/i.test(msg);
}

function failJob(job: VideoJob, msg: string, runId: string, title: string) {
  const now = new Date().toISOString();
  // Video đã bị xoá (deleteVideo dừng bộ dựng rồi chuyển thư mục đi): không ghi lại job.json vào chỗ cũ.
  if (!getDb().select().from(schema.videos).where(eq(schema.videos.id, job.videoId)).get()) {
    finishRun(runId, true, `Đã xoá video “${title}”, dừng dựng (không phải lỗi)`);
    return;
  }
  // Lỗi tạm thời (bộ dựng sập, thiếu bộ nhớ, không ra bản chính…): tự xếp hàng dựng lại MỘT lần, không báo lỗi ngay
  if (isRetryableRenderError(msg) && (job.attempt ?? 0) < MAX_RENDER_RETRIES) {
    const attempt = (job.attempt ?? 0) + 1;
    writeJob({ ...job, status: "queued", attempt, lastError: msg.slice(0, 600), pid: undefined, startedAt: undefined, runId });
    getDb().update(schema.videos).set({ note: `Dựng lỗi, tự thử lại lần ${attempt}: ${msg.slice(0, 200)}`, updatedAt: now }).where(eq(schema.videos.id, job.videoId)).run();
    // Lần thử lại KHÔNG ghi run lỗi: run giữ mở, lần dựng lại dùng tiếp (runFor) và đóng nó bằng kết quả cuối cùng
    noteRun(runId, `${msg} → tự thử lại lần ${attempt}`);
    logActivity("system", `Dựng “${title}” bản ${job.version} lỗi (${msg.slice(0, 120)}) — tự thử lại lần ${attempt}.`, "video");
    void kickWorker();
    return;
  }
  writeJob({ ...job, status: "error", finishedAt: now, error: msg.slice(0, 600), runId });
  getDb().update(schema.videos).set({ note: `Dựng lỗi${job.attempt ? ` (đã tự thử lại ${job.attempt} lần)` : ""}: ${msg.slice(0, 300)}`, updatedAt: now }).where(eq(schema.videos.id, job.videoId)).run();
  finishRun(runId, false, `${msg}${job.attempt ? ` (đã tự thử lại ${job.attempt} lần)` : ""}`);
  logActivity("system", `Dựng “${title}” bản ${job.version} lỗi: ${msg.slice(0, 160)}`, "video");
  void sendAlert({ level: "error", title: "Dựng video lỗi", text: `${title}: ${msg.slice(0, 300)}`, href: `/video-studio?open=${encodeURIComponent(job.videoId)}` });
  void verifyCommentsLater(job.videoId);
}

// ---------------------------------------------------------------- bảng biên tập (kế hoạch cấp video)

/** Kế hoạch biên tập đang dùng: kế hoạch cấp video (người / AI biên tập) nếu có, không thì kế hoạch máy lập ở bản mới nhất. Mốc theo video gốc. */
export function readEditorPlan(videoId: string): { plan: Record<string, unknown>; source: "video" | "job" | "none" } {
  const own = readJson<Record<string, unknown>>(path.join(jobsRoot(), videoId, "plan.json"));
  if (own) return { plan: own, source: "video" };
  for (const v of jobVersions(videoId)) {
    const p = readJson<Record<string, unknown>>(path.join(jobDir(videoId, v), "plan.json"));
    if (p) return { plan: p, source: "job" };
  }
  return { plan: {}, source: "none" };
}

const PLAN_TEXT_MAX = 120;

/** Lưu kế hoạch từ bảng biên tập: chỉ nhận các khoá đã biết, kiểm kiểu, giới hạn độ dài chữ; mục tắt giữ lại với off = true. */
export function writeEditorPlan(videoId: string, raw: unknown, by: string): { ok: true } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Kế hoạch không hợp lệ" };
  const r = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 36_000 ? Math.round(v * 100) / 100 : undefined);
  const txt = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, PLAN_TEXT_MAX) : undefined);
  const clean = (x: unknown, depth = 0): unknown => {
    if (depth > 4) return undefined;
    if (Array.isArray(x)) return x.slice(0, 200).map((y) => clean(y, depth + 1)).filter((y) => y !== undefined);
    if (x && typeof x === "object") {
      const o: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
        if (["t", "t0", "t1", "end", "strike", "out", "level", "nin", "nout", "from"].includes(k)) {
          const n = num(v);
          if (n !== undefined) o[k] = n;
        } else if (["text", "keyword", "num"].includes(k)) {
          const s = txt(v);
          if (s !== undefined) o[k] = s;
        } else if (k === "style") {
          if (["blur", "fade", "shine"].includes(String(v))) o[k] = v;
        } else if (k === "type") {
          if (["compare", "arrow", "steps", "mechanism", "process", "chapter", "quote", "fs06", "fs05", "fs01", "leak"].includes(String(v))) o[k] = v;
        } else if (k === "icon") {
          if (["person", "bubble", "heart", "phone", "tick", "x", "pin"].includes(String(v))) o[k] = v;
        } else if (k === "file") {
          const s = txt(v);
          if (s && !s.includes("..") && !s.startsWith("/")) o[k] = s;
        } else if (k === "off") {
          if (v === true) o[k] = true;
        } else if (["wrong", "top", "mid", "bottom", "right", "steps"].includes(k)) {
          const c = clean(v, depth + 1);
          if (c !== undefined) o[k] = c;
        }
      }
      return o;
    }
    return undefined;
  };
  const plan: Record<string, unknown> = {
    by: `Biên tập: ${by} (bảng biên tập, ${new Date().toISOString().slice(0, 16).replace("T", " ")})`,
    note: txt(r.note) ?? "",
    content: txt(r.content) ?? "",
    emphasis: clean(r.emphasis) ?? [],
    diagrams: clean(r.diagrams) ?? [],
    broll: clean(r.broll) ?? [],
  };
  if (typeof r.pace === "string" && ["CHAM", "VUA", "NHANH"].includes(r.pace)) plan.pace = r.pace;
  const d = path.join(jobsRoot(), videoId);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, "plan.json"), JSON.stringify(plan, null, 1));
  logActivity("human", `${by} sửa kế hoạch biên tập video ${videoId} trong bảng biên tập.`, "video");
  return { ok: true };
}

const PLAN_PREV_RE = /^plan\.prev-[0-9TZ-]+\.json$/;
const planStamp = () => new Date().toISOString().replace(/[:.]/g, "-");

/** Các kế hoạch cấp video đã lưu trữ (adoptAiPlan cất khi biên tập AI lập kế hoạch mới), mới nhất trước. Tên có mốc ISO nên sắp theo chữ = theo giờ. */
export function planBackups(videoId: string): string[] {
  const d = path.join(jobsRoot(), videoId);
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter((f) => PLAN_PREV_RE.test(f)).sort().reverse();
}

/**
 * Khôi phục kế hoạch đã lưu trữ gần nhất làm kế hoạch video rồi dựng lại (bản mới, bản cũ giữ). Không xoá gì:
 * kế hoạch đang dùng được cất thành plan.prev-<bây giờ>.json (khôi phục lần nữa = quay lại kế hoạch vừa thay).
 * Kiểm "dựng lại được không" TRƯỚC khi đổi tệp; dựng lại không xếp hàng được thì trả tệp về như cũ (bản lỡ xếp giữa chừng được huỷ trước).
 */
export function restorePrevPlan(videoId: string, by: string): { ok: true; version: number; restored: string } | { ok: false; error: string } {
  const block = rerenderBlock(videoId);
  if (block) return { ok: false, error: block };
  const name = planBackups(videoId)[0];
  if (!name) return { ok: false, error: "Không có kế hoạch trước để khôi phục" };
  const d = path.join(jobsRoot(), videoId);
  const prev = path.join(d, name);
  const restored = readJson<Record<string, unknown>>(prev);
  if (!restored || typeof restored !== "object" || Array.isArray(restored)) return { ok: false, error: "Kế hoạch trước không đọc được" };
  const own = path.join(d, "plan.json");
  const stamp = planStamp();
  let stash = path.join(d, `plan.prev-${stamp}.json`);
  for (let i = 2; fs.existsSync(stash); i++) stash = path.join(d, `plan.prev-${stamp}-${i}.json`);
  const hadOwn = fs.existsSync(own);
  if (hadOwn) fs.renameSync(own, stash);
  fs.renameSync(prev, own);
  const label = String(restored.by ?? "").trim();
  const putBack = () => {
    fs.renameSync(own, prev);
    if (hadOwn) fs.renameSync(stash, own);
  };
  const before = jobVersions(videoId)[0] ?? 0;
  let r: ReturnType<typeof rerenderVideo>;
  try {
    r = rerenderVideo(videoId, by, undefined, undefined, `Khôi phục kế hoạch trước${label ? ` (${label.slice(0, 80)})` : ""} rồi dựng lại`);
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    // rerenderVideo có thể ném SAU khi đã xếp bản dựng (writeJob chạy, bước CSDL / lịch sử sau đó lỗi). Trả tệp về khi bản đó còn
    // trong hàng thì bộ dựng sẽ dựng bằng kế hoạch CŨ mà người dùng tưởng đã huỷ → huỷ bản vừa xếp TRƯỚC (đồng bộ: chưa bộ dựng nào
    // nhận được), rồi mới trả tệp. Không huỷ được → giữ kế hoạch khôi phục (bản đã xếp dựng đúng kế hoạch đó) và báo rõ.
    const queued = (jobVersions(videoId)[0] ?? 0) > before ? readJob(videoId, jobVersions(videoId)[0]) : null;
    if (queued && (queued.status === "queued" || queued.status === "running")) {
      try {
        stoppedJob(queued, `${STOP_PREFIX}: khôi phục kế hoạch lỗi giữa chừng (${why.slice(0, 200)}), huỷ bản ${queued.version} trước khi trả kế hoạch cũ`, queued.runId);
      } catch (e2) {
        // stoppedJob ghi job.json "đã dừng" TRƯỚC rồi mới cập nhật CSDL: CSDL hỏng (chỉ đọc / khoá) thì ném sau khi bản đã thoát hàng
        // → đọc lại job: đã thoát queued / running = đã huỷ, trả tệp như thường. Còn trong hàng mới là "không huỷ được".
        const now = readJob(videoId, queued.version);
        if (!now || now.status === "queued" || now.status === "running") {
          try {
            logActivity("human", `${by} khôi phục kế hoạch trước (${name}) của video ${videoId}: lỗi giữa chừng, bản ${queued.version} ĐÃ xếp dựng với kế hoạch khôi phục.`, "video");
          } catch {}
          return { ok: false, error: `Khôi phục kế hoạch lỗi giữa chừng (${why}) nhưng bản ${queued.version} đã xếp dựng với kế hoạch khôi phục và không huỷ được (${e2 instanceof Error ? e2.message : String(e2)}) — kế hoạch khôi phục được giữ.` };
        }
      }
    }
    putBack();
    return { ok: false, error: `Không dựng lại được: ${why}${queued ? ` (đã huỷ bản ${queued.version} vừa xếp)` : ""}` };
  }
  if (!r.ok) {
    putBack();
    return { ok: false, error: r.error };
  }
  logActivity("human", `${by} khôi phục kế hoạch biên tập trước (${name}) của video ${videoId}, dựng bản ${r.version}.`, "video");
  return { ok: true, version: r.version, restored: name };
}


// ---------------------------------------------------------------------------
// Máy dựng của OWNER (OWNER 25/10/2026: "máy tôi làm máy dựng, lấy skill trên Notion, lấy nguồn từ Drive / có sẵn trong máy").
// Máy chủ (mkt.baor.vn) giữ hàng đợi; máy dựng GỌI RA (không mở cổng vào máy OWNER): nhận việc → tải video gốc + tham số → dựng
// tại máy bằng bộ dựng + tư liệu trên máy (kho Drive đã đồng bộ) → gửi bản dựng về → máy chủ hoàn tất như dựng tại chỗ.
// ---------------------------------------------------------------------------

export function renderMode(): "local" | "remote" {
  return getSetting("video.renderMode") === "remote" ? "remote" : "local";
}

/** Không có nhịp tim quá lâu: máy dựng mất kết nối / tắt máy → lỗi tạm thời (tự xếp lại 1 lần theo failJob). */
export const REMOTE_STALE_MS = 15 * 60_000;

export interface RemoteSpec {
  videoId: string;
  version: number;
  title: string;
  sourceName: string;
  sourceSize: number;
  aspect: string;
  quality: string;
  cutSilence: boolean;
  framing: Framing | null;
  aiPlan: boolean;
  sfx: boolean;
  noMusic: boolean;
  /** Bài nhạc OWNER chọn (máy dựng tải qua GET music) — null khi để AI chọn theo luật A5 / không nhạc. */
  music: { name: string; license: string } | null;
  keywords: string;
  model: string;
  corrections: string;
  script: string | null;
  plan: unknown | null;
  words: unknown | null;
  allowAi: boolean; // Đội AI › AI Edit Video "Cho phép gọi AI"
}

function recoverRemoteStale(now = Date.now()) {
  for (const j of allJobs()) {
    if (j.status !== "running" || !j.worker) continue;
    const beat = Date.parse(j.heartbeatAt ?? j.startedAt ?? "") || 0;
    if (now - beat < REMOTE_STALE_MS) continue;
    const title = getDb().select().from(schema.videos).where(eq(schema.videos.id, j.videoId)).get()?.title ?? j.videoId;
    failJob({ ...j, worker: undefined, heartbeatAt: undefined }, `Máy dựng ${j.worker} mất kết nối quá ${REMOTE_STALE_MS / 60_000} phút`, runFor(j, title), title);
  }
}

function remoteSpec(job: VideoJob, title: string, contentId: string | null): RemoteSpec {
  const s = editSettings();
  const src = getUpload(job.sourceUploadId);
  const dir = jobDir(job.videoId, job.version);
  const prevVersion = jobVersions(job.videoId).find((v) => v < job.version);
  const own = path.join(dir, "plan.json");
  const editorPlan = path.join(jobsRoot(), job.videoId, "plan.json");
  const prevPlan = prevVersion ? path.join(jobDir(job.videoId, prevVersion), "plan.json") : "";
  const planPath = [own, editorPlan, prevPlan].find((p) => p && fs.existsSync(p));
  const wordsPath = prevVersion ? path.join(jobDir(job.videoId, prevVersion), "words_main.json") : "";
  return {
    videoId: job.videoId,
    version: job.version,
    title,
    sourceName: src?.name ?? "source.mp4",
    sourceSize: src?.size ?? 0,
    aspect: job.aspect ?? "9:16",
    quality: job.quality ?? "1080",
    cutSilence: !!job.cutSilence,
    framing: job.framing ?? null,
    aiPlan: !!job.aiPlan,
    sfx: s.sfx,
    noMusic: s.musicUploadId === "none",
    music: (() => {
      const m = s.musicUploadId && s.musicUploadId !== "none" ? listUploads("music").find((u) => u.id === s.musicUploadId) : undefined;
      return m ? { name: m.name, license: String(m.meta.license ?? "") } : null;
    })(),
    keywords: s.keywords,
    model: s.model,
    corrections: s.corrections,
    script: scriptSpeech(contentId) || null,
    plan: planPath ? readJson<unknown>(planPath) : null,
    words: wordsPath && fs.existsSync(wordsPath) ? readJson<unknown>(wordsPath) : null,
    allowAi: roleAllows(roleById("video_edit")!).ok,
  };
}

/** Máy dựng nhận việc kế tiếp (cũ nhất trong hàng đợi). Không có việc → null. */
export function claimRemoteJob(worker: string): RemoteSpec | null {
  recoverRemoteStale();
  const next = allJobs()
    .filter((j) => j.status === "queued")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  if (!next) return null;
  const video = getDb().select().from(schema.videos).where(eq(schema.videos.id, next.videoId)).get();
  const title = video?.title ?? next.videoId;
  const src = getUpload(next.sourceUploadId);
  const srcPath = src ? uploadPath(src) : null;
  const runId = runFor(next, title);
  const now = new Date().toISOString();
  if (!srcPath || !fs.existsSync(srcPath)) {
    failJob(next, "Không tìm thấy tệp nguồn trong kho tải lên", runId, title);
    return null;
  }
  writeJob({ ...next, status: "running", startedAt: now, runId, worker: worker.slice(0, 60), heartbeatAt: now, pid: undefined });
  logActivity("system", `Máy dựng ${worker} nhận dựng “${title}” bản ${next.version}.`, "video");
  return remoteSpec(next, title, video?.contentId ?? null);
}

/** Job đang được đúng máy dựng này giữ (chống máy khác / job đã bị dừng ghi đè). */
export function remoteJobFor(videoId: string, version: number, worker: string): VideoJob | null {
  const j = readJob(videoId, version);
  return j && j.status === "running" && j.worker === worker.slice(0, 60) ? j : null;
}

/** Nhịp tim + tiến độ. Trả false khi job không còn của máy dựng này (bị dừng / quá hạn) → máy dựng huỷ bản đang dựng. */
export function heartbeatRemote(videoId: string, version: number, worker: string, progress?: JobProgress | null): boolean {
  const j = remoteJobFor(videoId, version, worker);
  if (!j) return false;
  writeJob({ ...j, heartbeatAt: new Date().toISOString() });
  if (progress && typeof progress === "object") fs.writeFileSync(path.join(jobDir(videoId, version), "progress.json"), JSON.stringify(progress));
  return true;
}

/** Máy dựng đã gửi đủ tệp vào thư mục bản dựng → hoàn tất như dựng tại chỗ (bản chính vào kho tải lên, video → Chờ kiểm tra). */
export function completeRemoteJob(videoId: string, version: number, worker: string): { ok: true } | { ok: false; error: string } {
  const j = remoteJobFor(videoId, version, worker);
  if (!j) return { ok: false, error: "Job không còn thuộc máy dựng này" };
  const title = getDb().select().from(schema.videos).where(eq(schema.videos.id, videoId)).get()?.title ?? videoId;
  const dir = jobDir(videoId, version);
  try {
    finishJob({ ...j, worker: undefined, heartbeatAt: undefined }, dir, runFor(j, title), title, j.startedAt ?? new Date().toISOString());
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    failJob({ ...j, worker: undefined, heartbeatAt: undefined }, msg, runFor(j, title), title);
    return { ok: false, error: msg };
  }
}

export function failRemoteJob(videoId: string, version: number, worker: string, msg: string): boolean {
  const j = remoteJobFor(videoId, version, worker);
  if (!j) return false;
  const title = getDb().select().from(schema.videos).where(eq(schema.videos.id, videoId)).get()?.title ?? videoId;
  failJob({ ...j, worker: undefined, heartbeatAt: undefined }, `Máy dựng ${worker}: ${msg.slice(0, 500)}`, runFor(j, title), title);
  return true;
}

/** Đường dẫn tệp nguồn của job đang được máy dựng giữ (để máy dựng tải về). */
export function remoteSourcePath(videoId: string, version: number, worker: string): string | null {
  const j = remoteJobFor(videoId, version, worker);
  const u = j ? getUpload(j.sourceUploadId) : undefined;
  const p = u ? uploadPath(u) : null;
  return p && fs.existsSync(p) ? p : null;
}

/** Tên tệp máy dựng được phép gửi về thư mục bản dựng (không đường dẫn, không ghi đè job.json). */
export function remoteFileNameOk(name: string): boolean {
  if (/^snapshots\/\d{1,4}\.jpg$/.test(name) || name === "checksums.sha256") return true; // ảnh mốc + tổng kiểm như dựng tại chỗ
  return /^[\w.-]{1,80}\.(mp4|json|png|jpg|txt|srt|vtt|ass|wav|m4a)$/i.test(name) && !/^(job|progress)\.json$/i.test(name) && !name.startsWith(".");
}

/** Tệp nhạc OWNER chọn ở Cài đặt (máy dựng tải về để dựng giống máy chủ). */
export function remoteMusicPath(videoId: string, version: number, worker: string): string | null {
  if (!remoteJobFor(videoId, version, worker)) return null;
  const s = editSettings();
  const music = s.musicUploadId && s.musicUploadId !== "none" ? listUploads("music").find((u) => u.id === s.musicUploadId) : undefined;
  const p = music ? uploadPath(music) : null;
  return p && fs.existsSync(p) ? p : null;
}
