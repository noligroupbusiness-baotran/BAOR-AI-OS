import path from "node:path";
import fs from "node:fs";
import { gzipSync } from "node:zlib";
import { getSqlite } from "@/db";

// Sao lưu cơ sở dữ liệu SQLite định kỳ (mặc định 20 phút/lần) ngay trong tiến trình ứng dụng.
// - Dùng API "online backup" của SQLite nên bản sao luôn nhất quán dù app đang ghi (kể cả WAL).
// - Tệp sao lưu nằm trong DATA_DIR/backups (trên Docker là volume /app/data nên còn nguyên khi cập nhật).
// - Không thay đổi dữ liệu kể từ lần sao lưu trước thì bỏ qua, tránh tạo hàng chục bản giống hệt nhau.
// - Dọn bản cũ: giữ BACKUP_KEEP bản gần nhất (mặc định 72 = 24 giờ) và mỗi ngày 1 bản trong BACKUP_KEEP_DAYS ngày.
//
// - Đẩy lên GitHub (tùy chọn): đặt BACKUP_GITHUB_REPO=owner/repo (PHẢI là repo private vì CSDL chứa khóa API)
//   và BACKUP_GITHUB_TOKEN (fine-grained token, quyền Contents: Read and write trên repo đó). Mỗi bản sao lưu
//   được nén gzip rồi tải lên qua GitHub Contents API, không cần cài git trong container.
//
// Biến môi trường (tùy chọn): BACKUP_INTERVAL_MINUTES, BACKUP_DIR, BACKUP_KEEP, BACKUP_KEEP_DAYS, BACKUP_DISABLED=1,
// BACKUP_GITHUB_REPO, BACKUP_GITHUB_TOKEN, BACKUP_GITHUB_BRANCH (mặc định main), BACKUP_GITHUB_DIR (mặc định backups).

export const BACKUP_PREFIX = "baor-";
const BACKUP_EXT = ".db";
const NAME_RE = /^baor-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.db$/;

export type BackupFile = { name: string; size: number; at: string };
export type BackupStatus = {
  enabled: boolean;
  intervalMinutes: number;
  dir: string;
  keep: number;
  keepDays: number;
  schedulerStartedAt: string | null;
  lastRunAt: string | null; // lần kiểm tra gần nhất (có thể bỏ qua vì không đổi)
  lastBackupAt: string | null; // lần tạo tệp gần nhất
  lastResult: "backed_up" | "unchanged" | "error" | null;
  lastError: string | null;
  nextRunAt: string | null;
  files: BackupFile[];
  totalSize: number;
  github: {
    configured: boolean;
    repo: string | null;
    branch: string;
    dir: string;
    lastUploadAt: string | null;
    lastUploadName: string | null;
    lastUploadError: string | null;
  };
};

type State = {
  timer: NodeJS.Timeout | null;
  running: Promise<BackupResult> | null;
  startedAt: string | null;
  lastRunAt: string | null;
  lastBackupAt: string | null;
  lastResult: BackupStatus["lastResult"];
  lastError: string | null;
  nextRunAt: string | null;
  lastSignature: string | null;
  lastUploadAt: string | null;
  lastUploadName: string | null;
  lastUploadError: string | null;
};

// Trạng thái giữ trên globalThis để không bị nhân đôi khi Next.js nạp lại module (dev/HMR).
const g = globalThis as unknown as { __baorBackup?: State };
const state: State = (g.__baorBackup ??= {
  timer: null,
  running: null,
  startedAt: null,
  lastRunAt: null,
  lastBackupAt: null,
  lastResult: null,
  lastError: null,
  nextRunAt: null,
  lastSignature: null,
  lastUploadAt: null,
  lastUploadName: null,
  lastUploadError: null,
});

const num = (v: string | undefined, def: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : def;
};

export function backupConfig() {
  const dataDir = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
  return {
    enabled: process.env.BACKUP_DISABLED !== "1",
    intervalMinutes: num(process.env.BACKUP_INTERVAL_MINUTES, 20),
    dir: process.env.BACKUP_DIR ?? path.join(dataDir, "backups"),
    keep: Math.floor(num(process.env.BACKUP_KEEP, 72)),
    keepDays: Math.floor(num(process.env.BACKUP_KEEP_DAYS, 30)),
  };
}

export function githubConfig() {
  const repo = (process.env.BACKUP_GITHUB_REPO ?? "").trim();
  const token = (process.env.BACKUP_GITHUB_TOKEN ?? "").trim();
  return {
    configured: /^[\w.-]+\/[\w.-]+$/.test(repo) && token.length > 0,
    repo: repo || null,
    token,
    branch: (process.env.BACKUP_GITHUB_BRANCH ?? "main").trim() || "main",
    dir: (process.env.BACKUP_GITHUB_DIR ?? "backups").trim().replace(/^\/+|\/+$/g, "") || "backups",
  };
}

// Tên tệp theo giờ UTC để không lệ thuộc múi giờ máy chủ: baor-YYYYMMDD-HHMMSS.db
function fileNameFor(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${BACKUP_PREFIX}${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}${BACKUP_EXT}`;
}

export function parseBackupName(name: string): Date | null {
  const m = NAME_RE.exec(name);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m.map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h, mi, s));
}

export function isBackupName(name: string): boolean {
  return NAME_RE.test(name);
}

// Danh sách bản sao lưu, mới nhất trước.
export function listBackups(): BackupFile[] {
  const { dir } = backupConfig();
  if (!fs.existsSync(dir)) return [];
  const out: BackupFile[] = [];
  for (const name of fs.readdirSync(dir)) {
    const at = parseBackupName(name);
    if (!at) continue;
    try {
      const st = fs.statSync(path.join(dir, name));
      if (st.isFile()) out.push({ name, size: st.size, at: at.toISOString() });
    } catch {
      /* tệp vừa bị xóa bởi lần dọn khác */
    }
  }
  return out.sort((a, b) => (a.name < b.name ? 1 : -1));
}

// Chữ ký thay đổi của CSDL: data_version tăng khi kết nối khác ghi, total_changes tăng khi chính kết nối này ghi.
function dbSignature(): string {
  const sqlite = getSqlite();
  const dv = sqlite.pragma("data_version", { simple: true }) as number;
  const tc = sqlite.prepare("SELECT total_changes() AS n").get() as { n: number };
  return `${dv}:${tc.n}`;
}

export type BackupResult = { status: "backed_up" | "unchanged"; file?: BackupFile; removed: number; uploaded?: boolean };

// Tạo một bản sao lưu ngay. force=true thì luôn tạo dù dữ liệu không đổi (nút "Sao lưu ngay").
export async function runBackup(opts: { force?: boolean; reason?: string } = {}): Promise<BackupResult> {
  if (state.running) return state.running;
  state.running = doBackup(opts).finally(() => {
    state.running = null;
  });
  return state.running;
}

async function doBackup({ force = false, reason = "định kỳ" }: { force?: boolean; reason?: string }): Promise<BackupResult> {
  const cfg = backupConfig();
  const now = new Date();
  state.lastRunAt = now.toISOString();
  try {
    const signature = dbSignature();
    const hasAny = listBackups().length > 0;
    if (!force && hasAny && signature === state.lastSignature) {
      state.lastResult = "unchanged";
      state.lastError = null;
      return { status: "unchanged", removed: 0 };
    }

    fs.mkdirSync(cfg.dir, { recursive: true });
    const name = fileNameFor(now);
    const target = path.join(cfg.dir, name);
    const tmp = `${target}.tmp`;
    // Ghi ra tệp tạm rồi đổi tên để không bao giờ có bản sao lưu dở dang mang tên hợp lệ.
    await getSqlite().backup(tmp);
    fs.renameSync(tmp, target);
    const size = fs.statSync(target).size;

    state.lastSignature = signature;
    state.lastBackupAt = now.toISOString();
    state.lastResult = "backed_up";
    state.lastError = null;
    const removed = pruneBackups(cfg);
    console.log(`[backup] Đã sao lưu ${reason}: ${name} (${formatBytes(size)})${removed ? `, dọn ${removed} bản cũ` : ""}`);
    const file = { name, size, at: now.toISOString() };
    // Đẩy lên GitHub nếu đã cấu hình; lỗi mạng/GitHub không làm hỏng bản sao lưu cục bộ.
    let uploaded: boolean | undefined;
    if (githubConfig().configured) {
      try {
        await uploadToGitHub(target, name);
        uploaded = true;
      } catch (err) {
        uploaded = false;
        state.lastUploadError = err instanceof Error ? err.message : String(err);
        console.error(`[backup] Đẩy lên GitHub thất bại: ${state.lastUploadError}`);
      }
    }
    return { status: "backed_up", file, removed, uploaded };
  } catch (err) {
    state.lastResult = "error";
    state.lastError = err instanceof Error ? err.message : String(err);
    console.error(`[backup] Sao lưu thất bại: ${state.lastError}`);
    throw err;
  }
}

// Chính sách giữ bản: `keep` bản gần nhất; các bản cũ hơn chỉ giữ bản cuối của mỗi ngày trong `keepDays` ngày.
// Đầu vào phải sắp xếp mới nhất trước. Trả về danh sách cần xóa.
export function selectToRemove<T extends { name: string; at: string }>(files: T[], cfg = backupConfig()): T[] {
  const cutoff = Date.now() - cfg.keepDays * 86_400_000;
  const keptDays = new Set<string>();
  const remove: T[] = [];
  files.forEach((f, i) => {
    if (i < cfg.keep) return;
    const day = f.name.slice(BACKUP_PREFIX.length, BACKUP_PREFIX.length + 8);
    if (new Date(f.at).getTime() >= cutoff && !keptDays.has(day)) {
      keptDays.add(day);
      return;
    }
    remove.push(f);
  });
  return remove;
}

// Dọn bản cũ trong thư mục cục bộ theo chính sách trên. Trả về số tệp đã xóa.
export function pruneBackups(cfg = backupConfig()): number {
  let removed = 0;
  for (const f of selectToRemove(listBackups(), cfg)) {
    try {
      fs.unlinkSync(path.join(cfg.dir, f.name));
      removed++;
    } catch {
      /* bỏ qua */
    }
  }
  // Dọn tệp tạm bỏ dở (app tắt giữa chừng lần sao lưu trước).
  if (fs.existsSync(cfg.dir)) {
    for (const n of fs.readdirSync(cfg.dir)) {
      if (n.endsWith(".tmp")) {
        try {
          fs.unlinkSync(path.join(cfg.dir, n));
        } catch {
          /* bỏ qua */
        }
      }
    }
  }
  return removed;
}

// ---- GitHub: tải bản sao lưu (nén gzip) lên repo private qua Contents API ----

type GhFile = { name: string; sha: string; path: string };

async function gh(method: string, url: string, body?: unknown): Promise<Response> {
  const { token } = githubConfig();
  const res = await fetch(`https://api.github.com${url}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "baor-ai-os-backup",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(90_000),
  });
  return res;
}

async function ghError(res: Response, what: string): Promise<Error> {
  let detail = "";
  try {
    const j = (await res.json()) as { message?: string };
    detail = j.message ? `: ${j.message}` : "";
  } catch {
    /* không có JSON */
  }
  return new Error(`${what} (GitHub ${res.status}${detail})`);
}

// Liệt kê các bản sao lưu đang có trên GitHub (chỉ tệp đúng định dạng tên), mới nhất trước.
export async function listGitHubBackups(): Promise<(GhFile & { at: string })[]> {
  const g = githubConfig();
  const res = await gh("GET", `/repos/${g.repo}/contents/${g.dir}?ref=${encodeURIComponent(g.branch)}`);
  if (res.status === 404) return [];
  if (!res.ok) throw await ghError(res, "Không đọc được danh sách trên GitHub");
  const items = (await res.json()) as GhFile[] | GhFile;
  const list = Array.isArray(items) ? items : [];
  const out: (GhFile & { at: string })[] = [];
  for (const it of list) {
    const base = it.name.endsWith(".gz") ? it.name.slice(0, -3) : it.name;
    const at = parseBackupName(base);
    if (at) out.push({ ...it, at: at.toISOString() });
  }
  return out.sort((a, b) => (a.name < b.name ? 1 : -1));
}

export async function uploadToGitHub(localPath: string, name: string): Promise<void> {
  const g = githubConfig();
  if (!g.configured) throw new Error("Chưa cấu hình BACKUP_GITHUB_REPO / BACKUP_GITHUB_TOKEN");
  const gz = gzipSync(fs.readFileSync(localPath), { level: 9 });
  const remoteName = `${name}.gz`;
  const res = await gh("PUT", `/repos/${g.repo}/contents/${g.dir}/${remoteName}`, {
    message: `Sao lưu ${name}`,
    content: gz.toString("base64"),
    branch: g.branch,
  });
  if (!res.ok) throw await ghError(res, `Không tải được ${remoteName} lên ${g.repo}`);
  state.lastUploadAt = new Date().toISOString();
  state.lastUploadName = remoteName;
  state.lastUploadError = null;
  console.log(`[backup] Đã đẩy lên GitHub ${g.repo}/${g.dir}/${remoteName} (${formatBytes(gz.byteLength)})`);
  // Áp cùng chính sách giữ bản cho thư mục trên GitHub; lỗi dọn không ảnh hưởng bản vừa tải.
  try {
    const remove = selectToRemove(await listGitHubBackups());
    for (const f of remove) {
      const del = await gh("DELETE", `/repos/${g.repo}/contents/${f.path}`, { message: `Dọn bản cũ ${f.name}`, sha: f.sha, branch: g.branch });
      if (!del.ok) throw await ghError(del, `Không xóa được ${f.name}`);
    }
    if (remove.length) console.log(`[backup] Đã dọn ${remove.length} bản cũ trên GitHub`);
  } catch (err) {
    console.error(`[backup] Dọn bản cũ trên GitHub thất bại: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Bật lịch sao lưu nền. Gọi một lần khi server khởi động (src/instrumentation.ts).
export function startBackupScheduler(): void {
  const cfg = backupConfig();
  if (!cfg.enabled) {
    console.log("[backup] Sao lưu tự động đang tắt (BACKUP_DISABLED=1).");
    return;
  }
  if (state.timer) return;
  const intervalMs = cfg.intervalMinutes * 60_000;
  state.startedAt = new Date().toISOString();

  const tick = (reason: string) => {
    state.nextRunAt = new Date(Date.now() + intervalMs).toISOString();
    runBackup({ reason }).catch(() => {
      /* đã ghi log trong doBackup; lần sau thử lại */
    });
  };

  // Bản đầu tiên ngay sau khi khởi động (chờ 15 giây cho server sẵn sàng), sau đó đều đặn theo chu kỳ.
  const first = setTimeout(() => tick("sau khi khởi động"), 15_000);
  first.unref();
  state.nextRunAt = new Date(Date.now() + 15_000).toISOString();
  state.timer = setInterval(() => tick("định kỳ"), intervalMs);
  state.timer.unref();
  console.log(`[backup] Sao lưu tự động mỗi ${cfg.intervalMinutes} phút vào ${cfg.dir}`);
}

export function getBackupStatus(): BackupStatus {
  const cfg = backupConfig();
  const ghc = githubConfig();
  const files = listBackups();
  return {
    ...cfg,
    schedulerStartedAt: state.startedAt,
    lastRunAt: state.lastRunAt,
    lastBackupAt: state.lastBackupAt ?? files[0]?.at ?? null,
    lastResult: state.lastResult,
    lastError: state.lastError,
    nextRunAt: state.timer ? state.nextRunAt : null,
    files,
    totalSize: files.reduce((s, f) => s + f.size, 0),
    github: {
      configured: ghc.configured,
      repo: ghc.repo,
      branch: ghc.branch,
      dir: ghc.dir,
      lastUploadAt: state.lastUploadAt,
      lastUploadName: state.lastUploadName,
      lastUploadError: state.lastUploadError,
    },
  };
}

export function backupFilePath(name: string): string | null {
  if (!isBackupName(name)) return null;
  const p = path.join(backupConfig().dir, name);
  return fs.existsSync(p) ? p : null;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
