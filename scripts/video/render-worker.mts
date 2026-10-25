// Máy dựng của OWNER (OWNER 25/10/2026): chạy trên máy OWNER, GỌI RA máy chủ (mkt.baor.vn) — không mở cổng nào vào máy này.
// Nhận việc → tải video gốc → dựng tại máy bằng bộ dựng Skill ESV / Edit Video Ngang (Whisper, mô hình tại máy, ffmpeg) với tư liệu
// TRÊN MÁY (DATA_DIR/video-assets: kho nhạc / SFX / ảnh đã đồng bộ từ Drive) → gửi bản dựng về.
//
// Chạy:  npm run render-worker            (chạy tay)
//        npm run render-worker:install    (cài chạy nền, tự bật khi đăng nhập máy — macOS LaunchAgent)
// Cấu hình: ~/.baor/render-worker.env (lệnh dán sẵn ở Cài đặt › Video › Nơi dựng video › Tạo khoá) hoặc .env.render-worker ở gốc repo — không commit
//   BAOR_REMOTE_URL=https://mkt.baor.vn
//   BAOR_WORKER_KEY=bw_...            (hiện một lần khi tạo)
//   BAOR_WORKER_NAME=may-bao          (tuỳ chọn)
//   DATA_DIR=/đường/dẫn/data          (tuỳ chọn, mặc định ./data của repo)
// Chưa có khoá / khoá bị thu hồi: máy dựng chờ và đọc lại cấu hình mỗi phút (không thoát) — dán khoá mới là tự nhận.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { importDrop } from "../../src/lib/video/drop-import.js";

export interface Spec {
  videoId: string;
  version: number;
  title: string;
  sourceName: string;
  aspect: string;
  /** "1080" | "4k" — chất lượng chọn khi thêm video gốc (bộ dựng chỉ xuất 4K khi nguồn đủ điểm ảnh) */
  quality?: string;
  cutSilence: boolean;
  framing: { x?: number; y?: number; zoom?: number } | null;
  aiPlan: boolean;
  sfx: boolean;
  noMusic: boolean;
  music: { name: string; license: string } | null;
  keywords: string;
  model: string;
  corrections: string;
  script: string | null;
  plan: unknown | null;
  words: unknown | null;
  allowAi: boolean;
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Tham số bộ dựng — cùng thứ tự / ý nghĩa với dựng tại máy chủ (src/lib/video/jobs.ts › runJob, nhánh Skill ESV). */
export function buildArgs(spec: Spec, p: { src: string; work: string; script?: string; plan?: string; words?: string; music?: string }): string[] {
  const a = [path.join(ROOT, "scripts", "video", "esv_render.py"), `--input=${p.src}`, `--job-dir=${p.work}`, `--keywords=${spec.keywords}`, `--model=${spec.model}`];
  if (spec.corrections.trim()) a.push(`--corrections=${spec.corrections}`);
  if (spec.cutSilence) a.push("--cut-silence");
  a.push(`--aspect=${spec.aspect || "9:16"}`);
  if (spec.quality === "4k") a.push("--quality=4k");
  if (spec.framing?.x !== undefined) a.push(`--frame-x=${spec.framing.x}`);
  if (spec.framing?.y !== undefined) a.push(`--frame-y=${spec.framing.y}`);
  if (spec.framing?.zoom !== undefined) a.push(`--frame-zoom=${spec.framing.zoom}`);
  if (!spec.sfx) a.push("--no-sfx");
  if (spec.aiPlan) a.push("--ai-plan");
  if (spec.noMusic) a.push("--no-music");
  else if (p.music && spec.music) a.push(`--music=${p.music}`, `--music-license=${spec.music.license}`);
  if (p.script) a.push(`--script=${p.script}`);
  if (p.plan) a.push(`--plan=${p.plan}`);
  if (p.words) a.push(`--words=${p.words}`);
  return a;
}

/** Tệp kết quả gửi về: tệp ở gốc thư mục bản dựng, bỏ tệp đầu vào / tạm. */
export function resultFiles(work: string): string[] {
  const root = fs
    .readdirSync(work, { withFileTypes: true })
    .filter((d) => d.isFile() && !/^(source\.|input-|job\.json|progress\.json)/.test(d.name) && (/\.(mp4|json|png|jpg|txt|srt|vtt|ass|wav|m4a)$/i.test(d.name) || d.name === "checksums.sha256"))
    .map((d) => d.name);
  const snapDir = path.join(work, "snapshots");
  const snaps = fs.existsSync(snapDir) ? fs.readdirSync(snapDir).filter((f) => /^\d{1,4}\.jpg$/.test(f)).map((f) => `snapshots/${f}`) : [];
  return [...root, ...snaps].sort((x, y) => (x === "master.mp4" ? 1 : y === "master.mp4" ? -1 : x.localeCompare(y)));
}

async function sha256File(p: string): Promise<string> {
  const h = createHash("sha256");
  for await (const chunk of fs.createReadStream(p)) h.update(chunk as Buffer);
  return h.digest("hex");
}

export const ENV_FILES = [path.join(os.homedir(), ".baor", "render-worker.env"), path.join(ROOT, ".env.render-worker")];

/** Đọc cấu hình từ tệp (tệp đứng trước thắng); biến môi trường đặt sẵn khi chạy vẫn ưu tiên hơn tệp. */
export function readConfig(files = ENV_FILES, env: Record<string, string | undefined> = process.env): { base: string; key: string; name: string; dataDir: string } {
  const fromFile: Record<string, string> = {};
  for (const f of [...files].reverse()) {
    if (!fs.existsSync(f)) continue;
    for (const line of fs.readFileSync(f, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (m) fromFile[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  const get = (k: string) => env[k] || fromFile[k] || "";
  return {
    base: get("BAOR_REMOTE_URL").replace(/\/+$/, ""),
    key: get("BAOR_WORKER_KEY"),
    name: (get("BAOR_WORKER_NAME") || os.hostname()).replace(/[^\w.-]/g, "").slice(0, 60) || "may-dung",
    dataDir: get("DATA_DIR") || path.join(ROOT, "data"),
  };
}

const log = (...x: unknown[]) => console.log(new Date().toLocaleTimeString("vi-VN"), ...x);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Nhận tư liệu OWNER thả vào DATA_DIR/video-assets/tha-vao/ (ảnh, B-roll, nhạc, hiệu ứng âm thanh) mỗi 5 phút khi rảnh — kể cả lúc
// chưa có khoá máy dựng (tư liệu nằm trên máy này, không cần máy chủ).
let lastImport = 0;
let lastImportSig = "";
function maybeImport(dataDir: string) {
  if (Date.now() - lastImport < 5 * 60_000) return;
  lastImport = Date.now();
  try {
    const r = importDrop(dataDir);
    const sig = `${r.imported.length}/${r.waiting.map((w) => w.file + w.reason).join("|")}`;
    if (r.imported.length || sig !== lastImportSig) log(`Tư liệu thả vào: đã nhận ${r.imported.length}, chờ ${r.waiting.length}${r.waiting[0] ? ` (vd ${r.waiting[0].kind}/${r.waiting[0].file}: ${r.waiting[0].reason})` : ""}`);
    lastImportSig = sig;
  } catch (e) {
    log("Lỗi nhận tư liệu thả vào:", e instanceof Error ? e.message : e);
  }
}

/** Chờ tới khi có cấu hình hợp lệ (đọc lại mỗi phút); `bad` = khoá vừa bị máy chủ từ chối → chờ khoá KHÁC. */
async function waitConfig(bad = ""): Promise<ReturnType<typeof readConfig>> {
  let said = "";
  for (;;) {
    const c = readConfig();
    const why = !/^https?:\/\//.test(c.base) || !c.key ? `Chưa có cấu hình máy dựng (${ENV_FILES[0]}). Tạo khoá ở Cài đặt › Video › Nơi dựng video rồi dán lệnh vào Terminal — máy dựng tự nhận.` : c.key === bad ? "Khoá máy dựng sai / đã bị thu hồi. Tạo khoá mới ở Cài đặt › Video › Nơi dựng video — máy dựng tự nhận khoá mới." : "";
    if (!why) return c;
    if (why !== said) log((said = why));
    maybeImport(c.dataDir);
    await sleep(60_000);
  }
}

async function main() {
  let cfg = await waitConfig();
  let { base, name, dataDir } = cfg;
  let headers = { authorization: `Bearer ${cfg.key}`, "x-baor-worker": name };
  log(`Máy dựng “${name}” → ${base} · tư liệu: ${path.join(dataDir, "video-assets")}`);

  for (;;) {
    let spec: Spec | null = null;
    try {
      const r = await fetch(`${base}/api/render-worker/claim`, { method: "POST", headers });
      if (r.status === 401) {
        cfg = await waitConfig(cfg.key);
        ({ base, name, dataDir } = cfg);
        headers = { authorization: `Bearer ${cfg.key}`, "x-baor-worker": name };
        log(`Đã nhận khoá mới — máy dựng “${name}” → ${base}`);
        continue;
      }
      if (r.status === 200) spec = (await r.json()) as Spec;
    } catch (e) {
      log("Không gọi được máy chủ:", e instanceof Error ? e.message : e);
    }
    if (!spec) {
      maybeImport(dataDir);
      await sleep(20_000);
      continue;
    }
    await runOne(spec, { base, headers, dataDir });
  }
}

export interface RunCtx {
  base: string;
  headers: Record<string, string>;
  dataDir: string;
  /** Thay fetch khi kiểm thử. */
  fetchImpl?: typeof fetch;
  /** Chu kỳ nhịp tim (mặc định 15 giây; máy chủ coi mất kết nối sau 15 phút không có nhịp tim — jobs.ts REMOTE_STALE_MS). */
  beatMs?: number;
}

/**
 * Dựng MỘT việc đã nhận. Nhịp tim bật NGAY khi nhận việc (kiểm toán 26/10: trước đây chỉ bật sau khi tải xong video gốc → tệp gốc lớn /
 * mạng chậm quá 15 phút thì máy chủ tưởng máy dựng mất kết nối và giao việc cho máy khác) và chạy suốt lúc tải nguồn, dựng, gửi kết quả.
 * Máy chủ báo dừng (409) lúc nào cũng huỷ: đang tải thì ngắt tải, đang dựng thì dừng bộ dựng.
 */
export async function runOne(spec: Spec, ctx: RunCtx): Promise<"done" | "stopped" | "failed"> {
  const { base, headers, dataDir } = ctx;
  const f = ctx.fetchImpl ?? fetch;
  const q = `videoId=${encodeURIComponent(spec.videoId)}&version=${spec.version}`;
  log(`Nhận dựng “${spec.title}” bản ${spec.version} (${spec.aspect})`);
  const work = fs.mkdtempSync(path.join(os.tmpdir(), `baor-render-${spec.videoId}-v${spec.version}-`));
  let stopped = false;
  let phase = "Đang tải video gốc";
  let child: ReturnType<typeof spawn> | null = null;
  const abort = new AbortController();
  const beatOnce = async () => {
    let progress: unknown = { step: "download", label: phase, pct: 0 };
    try {
      progress = JSON.parse(fs.readFileSync(path.join(work, "progress.json"), "utf8"));
    } catch {}
    try {
      const r = await f(`${base}/api/render-worker/heartbeat?${q}`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ progress }) });
      if (r.status === 409 && !stopped) {
        stopped = true;
        log("Máy chủ báo dừng — huỷ bản đang dựng.");
        abort.abort();
        if (child?.pid) {
          try {
            process.kill(-child.pid, "SIGTERM");
          } catch {}
        }
      }
    } catch {}
  };
  void beatOnce();
  const beat = setInterval(() => void beatOnce(), ctx.beatMs ?? 15_000);
  try {
    // 1. Video gốc
    const ext = (path.extname(spec.sourceName) || ".mp4").toLowerCase().replace(/[^.a-z0-9]/g, "");
    const src = path.join(work, `source${ext}`);
    const res = await f(`${base}/api/render-worker/source?${q}`, { headers, signal: abort.signal });
    if (!res.ok || !res.body) throw new Error(`Không tải được video gốc (${res.status})`);
    const out = fs.createWriteStream(src);
    const reader = res.body.getReader();
    try {
      for (;;) {
        if (stopped) throw new Error("Máy chủ đã dừng job");
        const { done, value } = await reader.read();
        if (done) break;
        if (!out.write(value)) await new Promise<void>((r) => out.once("drain", () => r()));
      }
    } finally {
      await new Promise<void>((r) => out.end(() => r()));
    }
    if (stopped) return "stopped";
    // 2. Đầu vào phụ
    phase = "Đang chuẩn bị dựng";
    const files: { script?: string; plan?: string; words?: string; music?: string } = {};
    if (spec.music && !spec.noMusic) {
      const mr = await f(`${base}/api/render-worker/music?${q}`, { headers, signal: abort.signal });
      if (mr.ok) {
        files.music = path.join(work, `input-music${(path.extname(spec.music.name) || ".mp3").toLowerCase().replace(/[^.a-z0-9]/g, "")}`);
        fs.writeFileSync(files.music, Buffer.from(await mr.arrayBuffer()));
      }
    }
    if (spec.script) fs.writeFileSync((files.script = path.join(work, "input-script.txt")), spec.script);
    if (spec.plan) fs.writeFileSync((files.plan = path.join(work, "input-plan.json")), JSON.stringify(spec.plan));
    if (spec.words) fs.writeFileSync((files.words = path.join(work, "input-words.json")), JSON.stringify(spec.words));
    if (stopped) return "stopped";
    // 3. Dựng tại máy
    phase = "Đang dựng";
    const proc = spawn(process.env.PYTHON_BIN || "python3", buildArgs(spec, { src, work, ...files }), {
      stdio: ["ignore", "inherit", "pipe"],
      detached: true,
      env: { ...process.env, DATA_DIR: dataDir, ...(spec.allowAi ? {} : { BAOR_AI_PLAN: "off" }) },
    });
    child = proc;
    let err = "";
    proc.stderr?.on("data", (b: Buffer) => {
      err = (err + b.toString()).slice(-4000);
    });
    const code: number = await new Promise((r) => {
      proc.on("error", (e) => {
        err += `\nLỖI: Không chạy được bộ dựng: ${e.message}`;
        r(1);
      });
      proc.on("close", (c) => r(c ?? 1));
    });
    child = null;
    if (stopped) return "stopped";
    if (code !== 0) throw new Error((err.split("\n").reverse().find((l) => l.startsWith("LỖI:")) ?? err.split("\n").filter(Boolean).pop() ?? `mã thoát ${code}`).replace(/^LỖI:\s*/, ""));
    // 4. Gửi kết quả (nhịp tim vẫn chạy: tệp lớn mất nhiều phút)
    phase = "Đang gửi bản dựng";
    for (const name of resultFiles(work)) {
      const fp = path.join(work, name);
      const r = await f(`${base}/api/render-worker/file?${q}&name=${encodeURIComponent(name)}`, { method: "PUT", headers: { ...headers, "x-content-sha256": await sha256File(fp) }, body: await fs.openAsBlob(fp) });
      if (r.status === 409) throw new Error("Máy chủ đã dừng / thu hồi job");
      if (!r.ok) throw new Error(`Gửi ${name} lỗi (${r.status})`);
    }
    const done = await f(`${base}/api/render-worker/complete?${q}`, { method: "POST", headers });
    log(done.ok ? `Xong “${spec.title}” bản ${spec.version} → Chờ kiểm tra` : `Máy chủ không nhận kết quả (${done.status}): ${await done.text()}`);
    return done.ok ? "done" : "failed";
  } catch (e) {
    if (stopped) return "stopped";
    const msg = e instanceof Error ? e.message : String(e);
    log(`Lỗi dựng “${spec.title}”: ${msg}`);
    await f(`${base}/api/render-worker/fail?${q}`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ error: msg }) }).catch(() => {});
    return "failed";
  } finally {
    clearInterval(beat);
    fs.rmSync(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void main();
