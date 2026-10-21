// Hàng đợi dựng video theo "Skill Edit video Vlog" (Second Brain). Thêm nguồn → video "Đang dựng" →
// bộ dựng (scripts/video/pipeline.py) chạy ngầm từng việc một, không chặn máy chủ → "Chờ kiểm tra" kèm bảng kiểm A–P.
// Trạng thái mỗi lần dựng nằm trong DATA_DIR/video-jobs/<videoId>/v<N>/ (job.json, progress.json, report.json),
// không cần bảng mới. Mỗi lần dựng lại là một bản mới vN, không ghi đè, không xoá bản trước.
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getSetting } from "@/lib/admin";
import { finishRun, startRun } from "@/lib/connectors/config";
import { getUpload, listUploads, uploadPath, uploadsDir } from "@/lib/uploads";
import { logActivity } from "@/lib/activity";
import { sendAlert } from "@/lib/alerts";
import skillJson from "../../../scripts/video/skill-vlog.json";
import { isJobFile, type JobProgress, type VideoJob, type VideoReport } from "./job-types";
import { addVideoFeedback } from "./feedback";
import { campaignRepo } from "@/lib/campaigns/repository";
import { parseShootingScript } from "@/lib/content/shooting-script";

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
  return getSetting("video.engine") === "legacy" ? `${SKILL.name} ${SKILL.version}` : "Skill ESV v0.3.1 (Notion 02 SKILL)";
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
  musicUploadId: string;
  /** #78c: âm pop tổng hợp ở chữ nhấn. Mặc định tắt cho tới khi OWNER quyết. */
  sfx: boolean;
}

export function editSettings(): EditSettings {
  return {
    keywords: getSetting("video.keywords") ?? "",
    model: getSetting("video.whisperModel") || "medium",
    musicUploadId: getSetting("video.musicUploadId") ?? "",
    sfx: getSetting("video.sfx") === "1",
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
function scriptPrompt(contentId: string | null): string {
  if (!contentId) return "";
  const c = getDb().select({ draft: schema.contentItems.draft }).from(schema.contentItems).where(eq(schema.contentItems.id, contentId)).get();
  const speech = parseShootingScript(c?.draft ?? "").scenes.map((s) => s.speech.replace(/\[[SK]\d+\]/g, "").trim()).filter(Boolean).join(" ");
  return speech.replace(/\s+/g, " ").slice(0, 800);
}

// ---------------------------------------------------------------- tạo việc

const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** Video mới từ một tệp nguồn đã nằm trong kho tải lên: "Đang dựng" bản 1, xếp hàng dựng. */
export function createVideoFromSource(opts: { title: string; sourceUploadId: string; cutSilence: boolean; prompt?: string; by: string; contentId?: string | null }): string {
  const videoId = newId("v");
  const now = new Date().toISOString();
  const content = opts.contentId ? getDb().select().from(schema.contentItems).where(eq(schema.contentItems.id, opts.contentId)).get() : undefined;
  const contentId = content?.id ?? null;
  getDb()
    .insert(schema.videos)
    .values({ id: videoId, title: (content?.title ?? opts.title).slice(0, 200), contentId, agent: "Agent Edit Video", status: "editing", platforms: JSON.stringify(["tiktok", "facebook"]), version: 1, note: `Đang dựng tự động theo ${engineLabel()}.`, uploadId: null, updatedAt: now })
    .run();
  // Video kế thừa chiến dịch và mục tiêu kênh của kịch bản.
  if (contentId) campaignRepo.inheritLinks("content", contentId, "video", videoId, "editing");
  const prompt = [opts.prompt ?? "", scriptPrompt(contentId)].filter(Boolean).join(" ").slice(0, 800);
  writeJob({ videoId, version: 1, status: "queued", sourceUploadId: opts.sourceUploadId, cutSilence: opts.cutSilence, prompt, createdAt: now, by: opts.by });
  addVideoFeedback({ videoId, version: 1, kind: "upload", note: `Nguồn: ${opts.title}${content ? ` · kịch bản “${content.title}”` : ""}${opts.cutSilence ? " · cắt khoảng lặng" : ""}`, by: opts.by });
  logActivity("human", `${opts.by} thêm nguồn “${opts.title}”, Agent Edit Video xếp hàng dựng.`, "video");
  void kickWorker();
  return videoId;
}

/** Dựng lại từ cùng nguồn thành bản mới (vN+1). Bản trước giữ nguyên. */
export function rerenderVideo(videoId: string, by: string, cutSilence?: boolean): { ok: true; version: number } | { ok: false; error: string } {
  const prev = latestJob(videoId);
  const v = getDb().select().from(schema.videos).where(eq(schema.videos.id, videoId)).get();
  if (!prev || !v) return { ok: false, error: "Video này không có nguồn để dựng lại" };
  // Video đã gửi phê duyệt hoặc đã duyệt: không kéo ngược về "Đang dựng" (muốn sửa thì Yêu cầu chỉnh sửa trước).
  if (!["editing", "review", "needs_changes"].includes(v.status)) return { ok: false, error: "Chỉ dựng lại video đang dựng, chờ kiểm tra hoặc cần chỉnh sửa" };
  if (prev.job.status === "queued" || prev.job.status === "running") return { ok: false, error: "Video đang trong hàng dựng" };
  const version = Math.max(prev.job.version, v.version) + 1;
  const now = new Date().toISOString();
  writeJob({ videoId, version, status: "queued", sourceUploadId: prev.job.sourceUploadId, cutSilence: cutSilence ?? prev.job.cutSilence, prompt: prev.job.prompt ?? "", createdAt: now, by });
  getDb().update(schema.videos).set({ status: "editing", version, updatedAt: now, note: `Đang dựng bản ${version}.` }).where(eq(schema.videos.id, videoId)).run();
  campaignRepo.syncEntityStatus("video", videoId, "editing");
  addVideoFeedback({ videoId, version, kind: "rerender", note: `Dựng lại từ cùng nguồn${(cutSilence ?? prev.job.cutSilence) ? ", cắt khoảng lặng" : ""}`, by });
  logActivity("human", `${by} yêu cầu dựng lại “${v.title}” thành bản ${version}.`, "video");
  void kickWorker();
  return { ok: true, version };
}

// ---------------------------------------------------------------- chạy ngầm

function pythonBin(): string {
  return process.env.PYTHON_BIN || "python3";
}

/** Còn sống VÀ đúng là bộ dựng của mình (sau khi máy khởi động lại, PID có thể đã thuộc tiến trình khác). */
function isOurRenderer(pid: number | undefined): boolean {
  if (!pid || pid === process.pid) return false;
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }
  const r = spawnSync("ps", ["-o", "command=", "-p", String(pid)], { encoding: "utf8", timeout: 5_000 });
  return r.status === 0 && r.stdout.includes("pipeline.py");
}

/** Dừng cả nhóm tiến trình (python + ffmpeg / whisper con), không để tiến trình con chạy mồ côi. */
function killGroup(pid: number) {
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {}
  }
}

function recoverStale() {
  if (worker.recovered) return;
  worker.recovered = true;
  for (const j of allJobs()) {
    if (j.status !== "running") continue;
    // Tiến trình dựng của lần chạy trước còn sống: dừng hẳn trước khi xếp lại, để hai bộ dựng không cùng ghi một thư mục.
    if (isOurRenderer(j.pid)) killGroup(j.pid!);
    if (j.runId) finishRun(j.runId, false, "Máy chủ khởi động lại giữa lúc dựng");
    writeJob({ ...j, status: "queued", pid: undefined, note: "Máy chủ khởi động lại giữa chừng, dựng lại từ đầu" });
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

/** Gọi khi thêm nguồn và mỗi phút từ bộ chạy nền. Không chờ: dựng chạy trong tiến trình con. */
export async function kickWorker(): Promise<void> {
  // Kiểm thử chạy trên CSDL tạm: không chạy bộ dựng thật.
  if (process.env.BAOR_VIDEO_WORKER === "off") return;
  if (worker.running) return;
  recoverStale();
  const next = allJobs()
    .filter((j) => j.status === "queued")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  if (!next) return;
  worker.running = `${next.videoId}/v${next.version}`;
  try {
    await runJob(next);
  } finally {
    worker.running = null;
  }
  void kickWorker();
}

function runJob(job: VideoJob): Promise<void> {
  const dir = jobDir(job.videoId, job.version);
  const video = getDb().select().from(schema.videos).where(eq(schema.videos.id, job.videoId)).get();
  const title = video?.title ?? job.videoId;
  const src = getUpload(job.sourceUploadId);
  const srcPath = src ? uploadPath(src) : null;
  const runId = startRun("video_auto_edit", title);
  const started = new Date().toISOString();
  writeJob({ ...job, status: "running", startedAt: started, runId });
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
  const music = s.musicUploadId ? listUploads("music").find((u) => u.id === s.musicUploadId) : undefined;
  const musicPath = music ? uploadPath(music) : null;
  if (music && musicPath) args.push(`--music=${musicPath}`, `--music-license=${String(music.meta.license ?? "")}`);
  const prevVersion = jobVersions(job.videoId).find((v) => v < job.version);
  // Bộ dựng mặc định: Skill ESV (Notion 02 SKILL). Bộ cũ (pipeline.py) chỉ khi Cài đặt chọn "legacy".
  // Kế hoạch dựng (chữ nhấn, sơ đồ, zoom): lấy từ bản trước nếu có (biên tập đã lập), không thì bộ dựng tự lập theo luật.
  const prevPlan = prevVersion ? path.join(jobDir(job.videoId, prevVersion), "plan.json") : "";
  const ownPlan = path.join(dir, "plan.json");
  if (getSetting("video.engine") !== "legacy") {
    args.length = 0;
    args.push(path.join(process.cwd(), "scripts", "video", "esv_render.py"), `--input=${srcPath}`, `--job-dir=${dir}`, `--keywords=${s.keywords}`, `--model=${s.model}`);
    if (fs.existsSync(ownPlan)) args.push(`--plan=${ownPlan}`);
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
    const child = spawn(pythonBin(), args, { stdio: ["ignore", "pipe", "pipe"], detached: true });
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
      if (timedOut) {
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
  const note = `Bản ${job.version}: ${report.output.seconds.toFixed(0)} giây, ${report.captions.units} khung phụ đề, ${report.emphasis.length} chữ nhấn. Bảng kiểm: ${failed.length ? `chưa đạt ${failed.join(", ")}` : "các mục đo được đều đạt"}; ${report.blockers.length} điểm chặn đăng.`;
  getDb().update(schema.videos).set({ status: "review", version: job.version, uploadId: upId, note, updatedAt: now }).where(eq(schema.videos.id, job.videoId)).run();
  writeJob({ ...job, status: "done", startedAt: started, finishedAt: now, runId, masterUploadId: upId });
  finishRun(runId, true, `Dựng xong “${title}” bản ${job.version} → Chờ kiểm tra`, 1);
  logActivity("ai", `Agent Edit Video dựng xong “${title}” bản ${job.version} theo ${engineLabel()}, chờ kiểm tra.`, "video");
}

function failJob(job: VideoJob, msg: string, runId: string, title: string) {
  const now = new Date().toISOString();
  writeJob({ ...job, status: "error", finishedAt: now, error: msg.slice(0, 600), runId });
  getDb().update(schema.videos).set({ note: `Dựng lỗi: ${msg.slice(0, 300)}`, updatedAt: now }).where(eq(schema.videos.id, job.videoId)).run();
  finishRun(runId, false, msg);
  logActivity("system", `Dựng “${title}” bản ${job.version} lỗi: ${msg.slice(0, 160)}`, "video");
  void sendAlert({ level: "error", title: "Dựng video lỗi", text: `${title}: ${msg.slice(0, 300)}`, href: "/video-studio" });
}
