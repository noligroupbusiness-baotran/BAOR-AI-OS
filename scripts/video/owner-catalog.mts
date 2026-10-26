// Máy dựng của OWNER → máy chủ: danh mục tư liệu TRÊN MÁY NÀY (DATA_DIR/video-assets: nhạc, SFX, ảnh / B-roll, tư liệu thả vào)
// để mkt.baor.vn hiện đúng kho đang có. Chỉ gửi metadata đã lọc (không ID Drive / đường dẫn tuyệt đối) + sha256 tệp gốc + tệp xem
// trước nhỏ do ffmpeg tạo tại máy (ảnh JPEG ≤ 480 px ~60 KB, nghe thử MP3 ≤ 30 s 64 kbps). KHÔNG BAO GIỜ gửi tệp gốc.
// Quyết định duyệt nhạc OWNER bấm trên web: kéo về, kiểm đúng tệp (tên + sha256), áp bằng music-rules.approveMusicIn /
// unapproveMusicIn (cùng hàm máy chủ dùng), rồi xác nhận trong lần gửi danh mục kế tiếp.
// Máy dựng chỉ GHI: DATA_DIR/preview-cache/ (tệp xem trước + bộ nhớ mã băm) và music/manifest.json (qua approveMusicIn).
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { lastDropReport } from "../../src/lib/video/drop-import.js";
import { approveMusicIn, isBannedMusic, readMusicManifest, unapproveMusicIn } from "../../src/lib/video/music-rules.js";
import { libraryFile } from "../../src/lib/video/safe-path.js";
import { CATALOG_LIMITS, PREVIEW_TARGET, PREVIEW_TYPES, isSha256, safeCatalogPath, stripAbsPaths, type CatalogAck, type CatalogItemIn, type CatalogKind, type CatalogSyncResponse, type DecisionOut, type PreviewType } from "../../src/lib/video/catalog-wire.js";

type Raw = Record<string, unknown>;
const PREVIEW_VERSION = "p1"; // đổi cách tạo xem trước → tăng số để tạo lại
const AUDIO_EXT = /\.(mp3|wav|m4a|aac|flac|ogg)$/i;
const VIDEO_EXT = /\.(mp4|mov|m4v|webm)$/i;
const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;

export const previewCacheDir = (dataDir: string) => path.join(dataDir, "preview-cache");

// ---------- Mã băm có bộ nhớ (tệp lớn chỉ băm lại khi đổi kích thước / thời điểm sửa) ----------

export class HashCache {
  private file: string;
  private map: Record<string, { size: number; mtimeMs: number; sha: string }> = {};
  private dirty = false;
  constructor(dataDir: string) {
    this.file = path.join(previewCacheDir(dataDir), "hashes.json");
    try {
      this.map = JSON.parse(fs.readFileSync(this.file, "utf8"));
    } catch {}
  }
  async sha(abs: string): Promise<string> {
    const st = fs.statSync(abs);
    const c = this.map[abs];
    if (c && c.size === st.size && c.mtimeMs === st.mtimeMs) return c.sha;
    const h = createHash("sha256");
    for await (const chunk of fs.createReadStream(abs)) h.update(chunk as Buffer);
    const sha = h.digest("hex");
    this.map[abs] = { size: st.size, mtimeMs: st.mtimeMs, sha };
    this.dirty = true;
    return sha;
  }
  save() {
    if (!this.dirty) return;
    for (const k of Object.keys(this.map)) if (!fs.existsSync(k)) delete this.map[k];
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.map));
    fs.renameSync(tmp, this.file);
    this.dirty = false;
  }
}

// ---------- Tạo tệp xem trước bằng ffmpeg (mảng tham số, không qua shell) ----------

function run(bin: string, args: string[], timeoutMs = 90_000): Promise<boolean> {
  return new Promise((resolve) => execFile(bin, args, { timeout: timeoutMs, maxBuffer: 1 << 20 }, (e) => resolve(!e)));
}

/** Ảnh thu nhỏ JPEG (ảnh, hoặc khung giây thứ 1 của clip): cạnh dài ≤ 480 px, hạ chất lượng / cỡ tới khi ≤ ~60 KB. */
export async function makeThumb(ffmpeg: string, src: string, out: string, isVideo: boolean): Promise<boolean> {
  const tmp = `${out}.${process.pid}.tmp.jpg`;
  const steps: [number, number][] = [[PREVIEW_TARGET.thumbPx, 5], [PREVIEW_TARGET.thumbPx, 9], [PREVIEW_TARGET.thumbPx, 14], [360, 14], [320, 20]];
  let ok = false;
  for (const [px, q] of steps) {
    const vf = `scale='min(${px},iw)':'min(${px},ih)':force_original_aspect_ratio=decrease,format=yuvj420p`;
    const base = ["-nostdin", "-y", "-v", "error"];
    const tail = ["-i", src, "-frames:v", "1", "-vf", vf, "-q:v", String(q), "-f", "image2", "-c:v", "mjpeg", tmp];
    ok = (isVideo && (await run(ffmpeg, [...base, "-ss", "1", ...tail]))) || (await run(ffmpeg, [...base, ...tail]));
    ok = ok && fs.existsSync(tmp) && fs.statSync(tmp).size > 0;
    if (!ok) break;
    if (fs.statSync(tmp).size <= PREVIEW_TARGET.thumbBytes) break;
  }
  if (!ok || fs.statSync(tmp).size > PREVIEW_TYPES.jpg.maxBytes) {
    fs.rmSync(tmp, { force: true });
    return false;
  }
  fs.renameSync(tmp, out);
  return true;
}

/** Đoạn nghe thử MP3: ≤ 30 giây đầu, mono 64 kbps, bỏ metadata. */
export async function makeAudioPreview(ffmpeg: string, src: string, out: string): Promise<boolean> {
  const tmp = `${out}.${process.pid}.tmp.mp3`;
  const ok = await run(ffmpeg, ["-nostdin", "-y", "-v", "error", "-i", src, "-t", String(PREVIEW_TARGET.audioSec), "-vn", "-ac", "1", "-ar", "44100", "-c:a", "libmp3lame", "-b:a", `${PREVIEW_TARGET.audioKbps}k`, "-map_metadata", "-1", "-f", "mp3", tmp]);
  if (!ok || !fs.existsSync(tmp) || fs.statSync(tmp).size === 0 || fs.statSync(tmp).size > PREVIEW_TYPES.mp3.maxBytes) {
    fs.rmSync(tmp, { force: true });
    return false;
  }
  fs.renameSync(tmp, out);
  return true;
}

// ---------- Danh mục ----------

export interface CatalogCtx {
  dataDir: string;
  /** Lệnh ffmpeg (mặc định FFMPEG_BIN hoặc "ffmpeg"). */
  ffmpeg?: string;
  log?: (...x: unknown[]) => void;
}

export interface BuiltCatalog {
  items: CatalogItemIn[];
  /** sha256 tệp xem trước → đường dẫn tại máy (để gửi khi máy chủ báo thiếu). */
  previews: Map<string, string>;
  hash: string;
}

const s = (v: unknown, max = 300) => (typeof v === "string" ? v.slice(0, max) : undefined);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined);
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 30) : undefined);

function readObj(f: string): Raw {
  try {
    const v = JSON.parse(fs.readFileSync(f, "utf8")) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {};
  } catch {
    return {};
  }
}

/** Đọc kho tư liệu trên máy (chỉ đọc), băm tệp gốc, tạo / dùng lại tệp xem trước. */
export async function buildCatalog(ctx: CatalogCtx): Promise<BuiltCatalog> {
  const va = path.join(ctx.dataDir, "video-assets");
  const ffmpeg = ctx.ffmpeg ?? process.env.FFMPEG_BIN ?? "ffmpeg";
  const cache = new HashCache(ctx.dataDir);
  const pdir = previewCacheDir(ctx.dataDir);
  fs.mkdirSync(pdir, { recursive: true });
  const items: CatalogItemIn[] = [];
  const previews = new Map<string, string>();
  const seen = new Set<string>();

  const add = async (kind: CatalogKind, dir: string, rel: string, meta: Omit<CatalogItemIn, "path" | "kind" | "sha256" | "preview" | "media">, wantPreview: boolean, prefix: string) => {
    const p = `${prefix}${rel}`;
    if (seen.has(p) || !safeCatalogPath(p, kind)) return;
    const abs = libraryFile(dir, rel);
    if (!abs) return; // không có tệp (hoặc trỏ ra ngoài thư mục thư viện) → không báo
    seen.add(p);
    const media = AUDIO_EXT.test(rel) ? "audio" : VIDEO_EXT.test(rel) ? "video" : IMAGE_EXT.test(rel) ? "image" : "other";
    const sha = await cache.sha(abs);
    let preview: CatalogItemIn["preview"] = null;
    const type: PreviewType | null = !wantPreview ? null : media === "audio" ? "mp3" : media === "image" || media === "video" ? "jpg" : null;
    if (type) {
      const out = path.join(pdir, `${sha}.${PREVIEW_VERSION}.${type}`);
      const ok = fs.existsSync(out) || (type === "mp3" ? await makeAudioPreview(ffmpeg, abs, out) : await makeThumb(ffmpeg, abs, out, media === "video"));
      if (ok) {
        const psha = await cache.sha(out);
        preview = { sha256: psha, type, bytes: fs.statSync(out).size };
        previews.set(psha, out);
      } else ctx.log?.(`Không tạo được tệp xem trước cho ${p}`);
    }
    items.push({ path: p, kind, media, sha256: sha, size: fs.statSync(abs).size, preview, ...meta });
  };

  // 1. Nhạc nền (music/manifest.json — library_sync.py + thư mục thả)
  const mdir = path.join(va, "music");
  for (const x of readMusicManifest(mdir)) {
    if (typeof x.file !== "string") continue;
    const owner = x.ownerApproved as { by?: unknown; at?: unknown } | undefined;
    const excluded = !!x.exclude || isBannedMusic(x);
    await add(
      "music",
      mdir,
      x.file,
      {
        title: s(x.title) || x.file,
        author: s(x.author, 200),
        durationSec: num(x.durationSec),
        genre: s(x.genre, 80),
        tags: strs(x.mood),
        source: s(x.source, 500),
        license: s(x.license, 2000),
        catalogStatus: s(x.catalogStatus, 40),
        exclude: excluded || undefined,
        excludeReason: x.excludeReason ? stripAbsPaths(String(x.excludeReason)).slice(0, 500) : undefined,
        approvedBy: owner?.by ? String(owner.by).slice(0, 200) : undefined,
        approvedAt: owner?.at ? String(owner.at).slice(0, 40) : undefined,
        hasCatalogLicense: typeof x.catalogLicense === "string" || undefined,
        isDefault: !!x.default || undefined,
      },
      !excluded,
      "music/",
    );
  }
  // 2. Hiệu ứng âm thanh: kho (sfx/manifest.json) + của OWNER (sfx-owner/: giấy phép chung + vai trò; sfx-owner/moi: thả vào)
  const sdir = path.join(va, "sfx");
  for (const x of readMusicManifest(sdir)) {
    if (typeof x.file !== "string") continue;
    await add("sfx", sdir, x.file, { title: s(x.title) || x.file, author: s(x.author, 200), durationSec: num(x.durationSec), tags: x.kind ? [String(x.kind).slice(0, 80)] : undefined, source: s(x.source, 500), license: s(x.license, 2000), catalogStatus: s(x.catalogStatus, 40) }, true, "sfx/");
  }
  const odir = path.join(va, "sfx-owner");
  const om = readObj(path.join(odir, "manifest.json"));
  const roles = (om.roles && typeof om.roles === "object" ? om.roles : {}) as Record<string, Record<string, unknown>>;
  const rolesOf = (f: string) => Object.entries(roles).filter(([, v]) => v && typeof v === "object" && Object.values(v).includes(f)).map(([k]) => k);
  if (fs.existsSync(odir)) {
    for (const d of fs.readdirSync(odir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!d.isFile() || !AUDIO_EXT.test(d.name)) continue;
      await add("sfx", odir, d.name, { title: d.name.replace(/\.[^.]+$/, ""), tags: rolesOf(d.name), source: s(om.source, 500), license: s(om.license, 2000) }, true, "sfx-owner/");
    }
  }
  const mo = path.join(odir, "moi");
  for (const x of readMusicManifest(mo)) {
    if (typeof x.file !== "string") continue;
    await add("sfx", mo, x.file, { title: x.file.replace(/\.[^.]+$/, ""), tags: strs(x.keywords), source: s(x.source, 500), license: s(x.license, 2000) }, true, "sfx-owner/moi/");
  }
  // 3. Ảnh / B-roll (broll/manifest.json) — KHÔNG gửi driveId
  const bdir = path.join(va, "broll");
  for (const x of readMusicManifest(bdir)) {
    if (typeof x.file !== "string") continue;
    await add("broll", bdir, x.file, { title: path.basename(x.file).replace(/\.[^.]+$/, ""), tags: strs(x.keywords), desc: s(x.desc, 1000), source: s(x.source, 500), license: s(x.license, 2000), exclude: !!x.exclude || undefined, excludeReason: x.excludeReason ? stripAbsPaths(String(x.excludeReason)).slice(0, 500) : undefined }, true, "broll/");
  }
  // 4. Tư liệu thả vào CHƯA nhận (báo cáo lần nhận gần nhất): chỉ tên + lý do (bỏ đường dẫn tuyệt đối trong lỗi), không băm / không xem trước
  const drop = lastDropReport(ctx.dataDir);
  for (const w of drop?.waiting ?? []) {
    const p = `tha-vao/${w.kind}/${w.file.split(path.sep).join("/")}`;
    if (seen.has(p) || !safeCatalogPath(p, "drop")) continue;
    seen.add(p);
    const media = AUDIO_EXT.test(p) ? "audio" : VIDEO_EXT.test(p) ? "video" : IMAGE_EXT.test(p) ? "image" : "other";
    items.push({ path: p, kind: "drop", media, title: path.basename(w.file), reason: stripAbsPaths(String(w.reason ?? "")).slice(0, 300), sha256: "", preview: null });
  }
  cache.save();
  // Dọn tệp xem trước không còn dùng
  const keep = new Set([...previews.values()].map((p) => path.basename(p)));
  for (const f of fs.readdirSync(pdir)) if (f !== "hashes.json" && !keep.has(f) && !f.endsWith(".tmp")) fs.rmSync(path.join(pdir, f), { force: true });
  const hash = createHash("sha256").update(JSON.stringify(items)).digest("hex");
  return { items, previews, hash };
}

/** Dấu nhanh (không băm) để biết kho đổi: thời điểm sửa / cỡ của các manifest, báo cáo thả vào, thư mục sfx-owner. */
export function catalogSignature(dataDir: string): string {
  const va = path.join(dataDir, "video-assets");
  const files = ["music/manifest.json", "sfx/manifest.json", "sfx-owner/manifest.json", "sfx-owner/moi/manifest.json", "broll/manifest.json", "tha-vao/BAO-CAO.json", "sfx-owner"];
  return files
    .map((f) => {
      try {
        const st = fs.statSync(path.join(va, f));
        return `${f}:${st.size}:${st.mtimeMs}`;
      } catch {
        return `${f}:-`;
      }
    })
    .join("|");
}

// ---------- Giới hạn thân yêu cầu ----------

type Trim = { title: number; author: number; genre: number; source: number; license: number; desc: number; excludeReason: number; reason: number; tags: number; tagLen: number };
/** Mức rút gọn dần (mức 0 = giữ nguyên). Chỉ cắt chữ hiển thị (tiêu đề, tác giả, mô tả, từ khoá, lý do; giấy phép / nguồn của SFX và ảnh).
 *  KHÔNG BAO GIỜ cắt: đường dẫn, mã băm, các trường trạng thái (catalogStatus, exclude, approvedBy, hasCatalogLicense) và license / source
 *  của NHẠC — máy chủ dùng hai trường này cho luật duyệt (musicApprovalError: dấu "chờ OWNER nghe duyệt") và BANNED (isBannedMusic). */
const TRIMS: (Trim | null)[] = [
  null,
  { title: 200, author: 120, genre: 60, source: 200, license: 600, desc: 300, excludeReason: 200, reason: 200, tags: 10, tagLen: 40 },
  { title: 120, author: 60, genre: 40, source: 80, license: 300, desc: 120, excludeReason: 80, reason: 120, tags: 5, tagLen: 30 },
  { title: 60, author: 0, genre: 20, source: 0, license: 120, desc: 0, excludeReason: 0, reason: 60, tags: 1, tagLen: 20 },
];
const cut = (v: string | undefined, n: number) => (v === undefined ? undefined : n === 0 ? undefined : v.length > n ? `${v.slice(0, n - 1)}…` : v);
const BODY_BUDGET = CATALOG_LIMITS.maxBodyBytes - 256 * 1024; // chừa chỗ cho hash + xác nhận quyết định

/** Danh mục vừa giới hạn thân yêu cầu của máy chủ (phản biện P3): kho thật (~0,7 KB / mục) không phải cắt; chỉ khi vượt mới rút gọn
 *  chữ dài theo từng mức. `trimmed` = mức đã dùng (0 = nguyên vẹn); `bytes` > giới hạn = vẫn không vừa (không gửi). */
export function fitCatalogBody(items: CatalogItemIn[]): { items: CatalogItemIn[]; bytes: number; trimmed: number } {
  let out = items;
  let bytes = 0;
  for (let level = 0; level < TRIMS.length; level++) {
    const t = TRIMS[level];
    out = !t
      ? items
      : items.map((x) => ({
          ...x,
          title: cut(x.title, t.title) ?? x.path.split("/").pop() ?? "",
          author: cut(x.author, t.author),
          genre: cut(x.genre, t.genre),
          source: x.kind === "music" ? x.source : cut(x.source, t.source),
          license: x.kind === "music" ? x.license : cut(x.license, t.license),
          desc: cut(x.desc, t.desc),
          excludeReason: cut(x.excludeReason, t.excludeReason),
          reason: cut(x.reason, t.reason),
          tags: x.tags?.slice(0, t.tags).map((g) => g.slice(0, t.tagLen)),
        }));
    bytes = Buffer.byteLength(JSON.stringify({ items: out }));
    if (bytes <= BODY_BUDGET) return { items: out, bytes, trimmed: level };
  }
  return { items: out, bytes, trimmed: TRIMS.length - 1 };
}

// ---------- Áp quyết định duyệt từ web ----------

/** Áp từng quyết định vào music/manifest.json của máy này — chỉ khi đúng tệp (tên + sha256). Đã ở đúng trạng thái → coi là đã áp
 *  (xác nhận lần trước bị mất trên đường truyền không làm hỏng quyết định). */
export async function applyDecisions(dataDir: string, decisions: DecisionOut[], cache = new HashCache(dataDir)): Promise<CatalogAck[]> {
  const dir = path.join(dataDir, "video-assets", "music");
  const acks: CatalogAck[] = [];
  for (const d of decisions) {
    const id = typeof d.id === "string" ? d.id.slice(0, 80) : "";
    if (!id) continue;
    if (!isSha256(d.sha256) || typeof d.file !== "string" || (d.action !== "approve" && d.action !== "unapprove")) {
      acks.push({ id, ok: false, error: "Quyết định không hợp lệ" });
      continue;
    }
    const it = readMusicManifest(dir).find((x) => x.file === d.file);
    const abs = it ? libraryFile(dir, d.file) : null;
    if (!it || !abs) {
      acks.push({ id, ok: false, error: "Không còn bài này trên máy OWNER" });
      continue;
    }
    if ((await cache.sha(abs)) !== d.sha256) {
      acks.push({ id, ok: false, error: "Tệp trên máy OWNER đã đổi (sha256 khác) — không áp" });
      continue;
    }
    let r: { ok: true } | { ok: false; error: string };
    if (d.action === "approve") {
      const at = new Date(d.at);
      r = it.ownerApproved ? { ok: true } : approveMusicIn(dir, d.file, String(d.by ?? "OWNER").slice(0, 120), Number.isNaN(at.getTime()) ? new Date() : at);
    } else r = it.ownerApproved ? unapproveMusicIn(dir, d.file) : { ok: true };
    acks.push(r.ok ? { id, ok: true } : { id, ok: false, error: r.error });
  }
  cache.save();
  return acks;
}

// ---------- Đồng bộ với máy chủ ----------

export interface SyncCtx extends CatalogCtx {
  base: string;
  headers: Record<string, string>;
  fetchImpl?: typeof fetch;
}

export type SyncResult = { ok: true; items: number; previewsSent: number; applied: number; failed: number; rounds: number } | { ok: false; status: number; error: string };

/** Gửi danh mục → gửi tệp xem trước còn thiếu → áp quyết định duyệt → gửi lại danh mục kèm xác nhận (tối đa 5 vòng). */
export async function syncCatalog(ctx: SyncCtx): Promise<SyncResult> {
  const f = ctx.fetchImpl ?? fetch;
  let acks: CatalogAck[] = [];
  let previewsSent = 0;
  let applied = 0;
  let failed = 0;
  for (let round = 1; round <= 5; round++) {
    const cat = await buildCatalog(ctx);
    const fit = fitCatalogBody(cat.items);
    if (fit.bytes > BODY_BUDGET) return { ok: false, status: 413, error: `Danh mục quá lớn (${Math.round(fit.bytes / 1024 / 1024)} MB, ${cat.items.length} mục) kể cả khi đã rút gọn — không gửi` };
    if (fit.trimmed) ctx.log?.(`Danh mục lớn: rút gọn chữ mức ${fit.trimmed} để vừa giới hạn gửi`);
    const r = await f(`${ctx.base}/api/render-worker/catalog`, { method: "POST", headers: { ...ctx.headers, "content-type": "application/json" }, body: JSON.stringify({ hash: cat.hash, items: fit.items, acks }) });
    if (!r.ok) return { ok: false, status: r.status, error: r.status === 401 ? "Khoá máy dựng sai / đã bị thu hồi" : (await r.text().catch(() => "")).slice(0, 300) };
    const res = (await r.json()) as CatalogSyncResponse;
    for (const m of res.missingPreviews ?? []) {
      const p = cat.previews.get(m.sha256);
      if (!p) continue;
      const pr = await f(`${ctx.base}/api/render-worker/preview?sha=${m.sha256}&type=${m.type}`, { method: "PUT", headers: { ...ctx.headers, "content-type": PREVIEW_TYPES[m.type].mime }, body: fs.readFileSync(p) });
      if (pr.ok) previewsSent++;
      else {
        ctx.log?.(`Máy chủ không nhận tệp xem trước (${pr.status}): ${(await pr.text().catch(() => "")).slice(0, 200)}`);
        if (pr.status === 507 || pr.status === 429 || pr.status === 401) break;
      }
    }
    if (!res.decisions?.length) return { ok: true, items: cat.items.length, previewsSent, applied, failed, rounds: round };
    acks = await applyDecisions(ctx.dataDir, res.decisions);
    applied += acks.filter((a) => a.ok).length;
    failed += acks.filter((a) => !a.ok).length;
  }
  return { ok: false, status: 0, error: "Quá 5 vòng đồng bộ quyết định duyệt — sẽ thử lại lần sau" };
}
