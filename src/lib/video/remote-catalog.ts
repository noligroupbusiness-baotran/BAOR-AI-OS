// Máy chủ giữ danh mục tư liệu MÁY CỦA OWNER (OWNER 26/10/2026: mkt.baor.vn hiện đúng kho tư liệu đang nằm trên máy OWNER).
// Máy dựng (scripts/video/render-worker.mts) gửi lên bằng khoá máy dựng: metadata + tệp xem trước nhỏ (ảnh thu nhỏ JPEG, đoạn nghe
// thử MP3) — KHÔNG BAO GIỜ tệp gốc. Mỗi lần gửi thay bản trước (mục không còn → đánh dấu đã gỡ). Tệp xem trước lưu theo mã băm
// (DATA_DIR/remote-assets/previews/<sha256>.<jpg|mp3>) nên tên tệp ở máy chủ không bao giờ lấy từ dữ liệu gửi lên.
// Duyệt nhạc trên web: máy chủ chỉ GHI quyết định (ai, khi nào, đúng sha256 + tên tệp), máy dựng kéo về, áp bằng
// music-rules.approveMusicIn / unapproveMusicIn trên máy OWNER rồi xác nhận trong lần gửi danh mục kế tiếp.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { and, eq, isNotNull, isNull, lt, ne, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getSetting, setSetting } from "@/lib/admin";
import { dataDir } from "./jobs";
import { musicApprovalError, musicUnapprovalError, type RawMusic } from "./music-rules";
import {
  CATALOG_KINDS,
  CATALOG_LIMITS,
  PREVIEW_TYPES,
  isPreviewType,
  isSha256,
  previewMagicOk,
  stripAbsPaths,
  safeCatalogPath,
  type CatalogAck,
  type CatalogItemIn,
  type CatalogKind,
  type CatalogMedia,
  type CatalogSyncRequest,
  type CatalogSyncResponse,
  type DecisionOut,
  type PreviewType,
} from "./catalog-wire";

export type RemoteAssetRow = typeof schema.remoteAssets.$inferSelect;
export type RemoteDecisionRow = typeof schema.remoteAssetDecisions.$inferSelect;
/** Metadata lưu ở cột meta (JSON) — đúng các trường đã lọc của CatalogItemIn. */
export type RemoteAssetMeta = Omit<CatalogItemIn, "path" | "kind" | "title" | "sha256" | "preview">;

const STATUS_KEY = "video.ownerCatalog";

export function remoteAssetsDir(): string {
  return path.join(dataDir(), "remote-assets");
}
export function previewsDir(): string {
  return path.join(remoteAssetsDir(), "previews");
}

// ---------- Kiểm dữ liệu gửi lên ----------

const MEDIA: CatalogMedia[] = ["audio", "image", "video", "other"];
type Bad = { ok: false; error: string };

function optStr(v: unknown, max: number, field: string): string | undefined | Bad {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") return { ok: false, error: `${field} phải là chuỗi` };
  return v.slice(0, max);
}
const isBad = (v: unknown): v is Bad => !!v && typeof v === "object" && (v as Bad).ok === false;

/** Kiểm cả lô (sai một mục → từ chối cả lô, máy dựng thấy lỗi ngay thay vì danh mục thiếu âm thầm). */
export function validateCatalog(body: unknown): { ok: true; req: CatalogSyncRequest } | Bad {
  if (!body || typeof body !== "object") return { ok: false, error: "Thân yêu cầu không phải JSON object" };
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b.items)) return { ok: false, error: "Thiếu items[]" };
  if (b.items.length > CATALOG_LIMITS.maxItems) return { ok: false, error: `Quá ${CATALOG_LIMITS.maxItems} mục` };
  const hash = typeof b.hash === "string" && /^[a-f0-9]{64}$/.test(b.hash) ? b.hash : "";
  const seen = new Set<string>();
  const items: CatalogItemIn[] = [];
  for (let i = 0; i < b.items.length; i++) {
    const x = b.items[i] as Record<string, unknown>;
    const at = `mục ${i + 1}`;
    if (!x || typeof x !== "object") return { ok: false, error: `${at}: không phải object` };
    const kind = x.kind as CatalogKind;
    if (!CATALOG_KINDS.includes(kind)) return { ok: false, error: `${at}: loại không hợp lệ` };
    if (!safeCatalogPath(x.path, kind)) return { ok: false, error: `${at}: đường dẫn không an toàn / sai loại` };
    if (seen.has(x.path)) return { ok: false, error: `${at}: trùng đường dẫn ${x.path}` };
    seen.add(x.path);
    if (!MEDIA.includes(x.media as CatalogMedia)) return { ok: false, error: `${at}: media không hợp lệ` };
    const sha = x.sha256;
    if (!(isSha256(sha) || (sha === "" && kind === "drop"))) return { ok: false, error: `${at}: sha256 không hợp lệ` };
    let preview: CatalogItemIn["preview"] = null;
    if (x.preview !== undefined && x.preview !== null) {
      const p = x.preview as Record<string, unknown>;
      const type = p.type;
      if (!isSha256(p.sha256) || !isPreviewType(type) || typeof p.bytes !== "number" || !(p.bytes > 0) || p.bytes > PREVIEW_TYPES[type].maxBytes)
        return { ok: false, error: `${at}: tệp xem trước không hợp lệ (loại / mã băm / quá cỡ)` };
      if (kind === "drop") return { ok: false, error: `${at}: tư liệu chưa nhận không gửi xem trước` };
      preview = { sha256: p.sha256, type, bytes: p.bytes };
    }
    const fields: [keyof CatalogItemIn, number][] = [["title", 300], ["author", 200], ["genre", 80], ["source", 500], ["license", 2000], ["catalogStatus", 40], ["excludeReason", 500], ["desc", 1000], ["approvedBy", 200], ["approvedAt", 40], ["reason", 300]];
    const out: Record<string, unknown> = { path: x.path, kind, media: x.media, sha256: sha, preview };
    for (const [k, max] of fields) {
      const v = optStr(x[k], max, `${at}: ${k}`);
      if (isBad(v)) return v;
      if (v !== undefined) out[k] = v;
    }
    out.title = (out.title as string | undefined) ?? x.path.split("/").pop();
    // Lý do / lỗi có thể chứa đường dẫn tuyệt đối trên máy OWNER (vd lỗi đổi tên tệp khi nhận tư liệu thả vào) → chỉ giữ tên tệp
    for (const k of ["reason", "excludeReason"] as const) if (typeof out[k] === "string") out[k] = stripAbsPaths(out[k] as string);
    if (x.tags !== undefined) {
      if (!Array.isArray(x.tags) || x.tags.some((t) => typeof t !== "string")) return { ok: false, error: `${at}: tags phải là mảng chuỗi` };
      out.tags = (x.tags as string[]).slice(0, 30).map((t) => t.slice(0, 80));
    }
    for (const k of ["durationSec", "size"] as const) {
      const v = x[k];
      if (v === undefined || v === null) continue;
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return { ok: false, error: `${at}: ${k} không hợp lệ` };
      out[k] = v;
    }
    for (const k of ["exclude", "hasCatalogLicense", "isDefault"] as const) if (x[k] !== undefined) out[k] = x[k] === true;
    items.push(out as unknown as CatalogItemIn);
  }
  const acks: CatalogAck[] = [];
  if (b.acks !== undefined) {
    if (!Array.isArray(b.acks) || b.acks.length > 500) return { ok: false, error: "acks[] không hợp lệ" };
    for (const a of b.acks as Record<string, unknown>[]) {
      if (!a || typeof a.id !== "string" || a.id.length > 80 || typeof a.ok !== "boolean") return { ok: false, error: "ack không hợp lệ" };
      acks.push({ id: a.id, ok: a.ok, error: typeof a.error === "string" ? a.error.slice(0, 300) : undefined });
    }
  }
  return { ok: true, req: { hash, items, acks } };
}

// ---------- Đồng bộ ----------

const metaOf = (it: CatalogItemIn): RemoteAssetMeta => {
  const m: Record<string, unknown> = { ...it };
  for (const k of ["path", "kind", "title", "sha256", "preview"]) delete m[k];
  return m as RemoteAssetMeta;
};

export function parseMeta(row: Pick<RemoteAssetRow, "meta">): RemoteAssetMeta {
  try {
    const v = JSON.parse(row.meta) as RemoteAssetMeta;
    return v && typeof v === "object" ? v : ({ media: "other" } as RemoteAssetMeta);
  } catch {
    return { media: "other" } as RemoteAssetMeta;
  }
}

/** Tên tệp trong music/manifest.json của máy OWNER ứng với mục "music/<tệp>". */
export const musicFileOf = (assetId: string) => assetId.replace(/^music\//, "");

/** Mục nhạc máy OWNER báo lên → dạng manifest để dùng ĐÚNG hàm luật musicApprovalError / musicUnapprovalError. */
export function rawMusicOf(row: Pick<RemoteAssetRow, "id" | "meta">): RawMusic {
  const m = parseMeta(row);
  return {
    file: musicFileOf(row.id),
    source: m.source ?? "",
    license: m.license ?? "",
    catalogStatus: m.catalogStatus,
    exclude: m.exclude ? true : undefined,
    ownerApproved: m.approvedBy ? { by: m.approvedBy, at: m.approvedAt } : undefined,
    catalogLicense: m.hasCatalogLicense ? "" : undefined,
  };
}

function nowIso(d: Date) {
  return d.toISOString();
}
const newId = () => `rad_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const DAY_MS = 86_400_000;
class SyncRejected extends Error {}

/** Nhận một lần gửi danh mục đã kiểm (validateCatalog). Một giao dịch: thêm / đổi / gỡ mục, ghi xác nhận quyết định, huỷ quyết định
 *  không còn khớp (bài đã gỡ / tệp đổi sha256). Trả tệp xem trước còn thiếu và các quyết định đang chờ máy dựng áp.
 *  Bảng không phình (phản biện P2): mục đã gỡ quá `removedKeepDays` ngày bị xoá hẳn; nếu tổng dòng vẫn vượt `maxRows` thì xoá mục đã gỡ
 *  cũ nhất trước (chỉ là lịch sử); danh mục đang hiện tự nó vượt trần → từ chối cả lần gửi, không ghi gì. */
export function syncRemoteCatalog(req: CatalogSyncRequest, worker: string, now = new Date(), opts: { maxRows?: number } = {}): CatalogSyncResponse | { ok: false; error: string } {
  const db = getDb();
  const at = nowIso(now);
  const maxRows = opts.maxRows ?? CATALOG_LIMITS.maxRows;
  const incoming = new Map(req.items.map((it) => [it.path, it]));
  let added = 0;
  let changed = 0;
  let unchanged = 0;
  let removed = 0;
  try {
    db.transaction((tx) => {
      const A = schema.remoteAssets;
      tx.delete(A).where(and(isNotNull(A.removedAt), lt(A.removedAt, nowIso(new Date(now.getTime() - CATALOG_LIMITS.removedKeepDays * DAY_MS))))).run();
      tx.delete(schema.remoteAssetDecisions).where(and(ne(schema.remoteAssetDecisions.status, "pending"), lt(schema.remoteAssetDecisions.at, nowIso(new Date(now.getTime() - 30 * DAY_MS))))).run();
      let rows = tx.select().from(A).all();
      const have = new Set(rows.map((r) => r.id));
      const over = rows.length + req.items.filter((it) => !have.has(it.path)).length - maxRows;
      if (over > 0) {
        const oldRemoved = rows.filter((r) => r.removedAt && !incoming.has(r.id)).sort((a, b) => String(a.removedAt).localeCompare(String(b.removedAt)));
        if (oldRemoved.length < over) throw new SyncRejected(`Danh mục máy OWNER vượt ${maxRows} dòng (${rows.length - oldRemoved.length} dòng đang hiện / chưa gỡ + ${req.items.length} mục gửi lên) — không nhận lần gửi này`);
        for (const r of oldRemoved.slice(0, over)) tx.delete(A).where(eq(A.id, r.id)).run();
        rows = tx.select().from(A).all();
      }
      const byId = new Map(rows.map((r) => [r.id, r]));
      for (const it of req.items) {
        const meta = JSON.stringify(metaOf(it));
        const vals = { kind: it.kind, title: it.title, sha256: it.sha256, meta, previewSha: it.preview?.sha256 ?? null, previewType: it.preview?.type ?? null, syncedAt: at, removedAt: null };
        const old = byId.get(it.path);
        if (!old) {
          tx.insert(A).values({ id: it.path, firstSeenAt: at, ...vals }).run();
          added++;
          continue;
        }
        const same = old.kind === it.kind && old.title === it.title && old.sha256 === it.sha256 && old.meta === meta && old.previewSha === vals.previewSha && old.previewType === vals.previewType && !old.removedAt;
        tx.update(A).set(vals).where(eq(A.id, it.path)).run();
        if (same) unchanged++;
        else changed++;
      }
      for (const r of rows) {
        if (incoming.has(r.id) || r.removedAt) continue;
        tx.update(A).set({ removedAt: at }).where(eq(A.id, r.id)).run();
        removed++;
      }
      // Xác nhận của máy dựng: chỉ quyết định còn chờ; "đã áp" phải khớp danh mục vừa gửi (không tin lời báo suông)
      for (const a of req.acks ?? []) {
        const d = tx.select().from(schema.remoteAssetDecisions).where(and(eq(schema.remoteAssetDecisions.id, a.id), eq(schema.remoteAssetDecisions.status, "pending"))).get();
        if (!d) continue;
        const it = incoming.get(d.assetId);
        let status: "applied" | "failed" = a.ok ? "applied" : "failed";
        let error = a.ok ? null : stripAbsPaths(a.error || "Máy dựng không áp được");
        if (a.ok && (!it || it.sha256 !== d.sha256 || (d.action === "approve" ? !it.approvedBy : !!it.approvedBy))) {
          status = "failed";
          error = "Máy dựng báo đã áp nhưng danh mục trên máy OWNER chưa đổi";
        }
        tx.update(schema.remoteAssetDecisions).set({ status, error, resultAt: at }).where(eq(schema.remoteAssetDecisions.id, d.id)).run();
      }
      // Quyết định còn chờ nhưng bài không còn / tệp đã đổi → không áp nhầm bản khác
      for (const d of tx.select().from(schema.remoteAssetDecisions).where(eq(schema.remoteAssetDecisions.status, "pending")).all()) {
        const it = incoming.get(d.assetId);
        if (!it) tx.update(schema.remoteAssetDecisions).set({ status: "cancelled", error: "Bài không còn trên máy OWNER", resultAt: at }).where(eq(schema.remoteAssetDecisions.id, d.id)).run();
        else if (it.sha256 !== d.sha256) tx.update(schema.remoteAssetDecisions).set({ status: "failed", error: "Tệp trên máy OWNER đã đổi — nghe lại rồi duyệt", resultAt: at }).where(eq(schema.remoteAssetDecisions.id, d.id)).run();
      }
    });
  } catch (e) {
    if (e instanceof SyncRejected) return { ok: false, error: e.message };
    throw e;
  }
  setSetting(STATUS_KEY, JSON.stringify({ at, worker, hash: req.hash, count: req.items.length }));
  gcPreviews();
  const missing = new Map<string, PreviewType>();
  for (const it of req.items) if (it.preview && !fs.existsSync(previewPath(it.preview.sha256, it.preview.type))) missing.set(it.preview.sha256, it.preview.type);
  return { ok: true, added, changed, removed, unchanged, missingPreviews: [...missing].map(([sha256, type]) => ({ sha256, type })), decisions: pendingDecisions() };
}

// ---------- Tệp xem trước ----------

const previewPath = (sha: string, type: PreviewType) => path.join(previewsDir(), `${sha}.${type}`);
const PART_STALE_MS = 10 * 60_000;

function activePreviewRef(sha: string, type: PreviewType): boolean {
  return !!getDb()
    .select({ id: schema.remoteAssets.id })
    .from(schema.remoteAssets)
    .where(and(eq(schema.remoteAssets.previewSha, sha), eq(schema.remoteAssets.previewType, type), isNull(schema.remoteAssets.removedAt)))
    .get();
}

// Tổng dung lượng giữ trong bộ nhớ (quét đĩa một lần, cập nhật khi ghi / dọn) + phần "giữ chỗ" của các PUT đang nhận. Node chạy một
// luồng: kiểm + giữ chỗ là một bước đồng bộ, nên nhiều PUT song song không thể cùng lọt qua trần (phản biện P3).
const g = globalThis as unknown as { __baorPreviewUsage?: { dir: string; bytes: number; reserved: number } };
function scanBytes(d: string): number {
  if (!fs.existsSync(d)) return 0;
  let n = 0;
  for (const f of fs.readdirSync(d)) if (!f.endsWith(".part")) n += fs.statSync(path.join(d, f)).size;
  return n;
}
function usage() {
  const dir = previewsDir();
  if (!g.__baorPreviewUsage || g.__baorPreviewUsage.dir !== dir) g.__baorPreviewUsage = { dir, bytes: scanBytes(dir), reserved: 0 };
  return g.__baorPreviewUsage;
}

/** Tổng dung lượng tệp xem trước đang lưu (không gồm tệp đang nhận). */
export function previewBytes(): number {
  return usage().bytes;
}

/** Xoá tệp xem trước không còn mục nào (đang hiện) trỏ tới, và tệp tạm .part bỏ dở quá 10 phút (tệp đang ghi thì để yên). */
export function gcPreviews(now = Date.now()): number {
  const d = previewsDir();
  if (!fs.existsSync(d)) return 0;
  const keep = new Set(
    getDb()
      .select({ s: schema.remoteAssets.previewSha, t: schema.remoteAssets.previewType })
      .from(schema.remoteAssets)
      .where(isNull(schema.remoteAssets.removedAt))
      .all()
      .filter((r) => r.s && r.t)
      .map((r) => `${r.s}.${r.t}`),
  );
  let n = 0;
  for (const f of fs.readdirSync(d)) {
    if (keep.has(f)) continue;
    const p = path.join(d, f);
    if (f.endsWith(".part")) {
      try {
        if (now - fs.statSync(p).mtimeMs < PART_STALE_MS) continue;
      } catch {
        continue;
      }
    }
    fs.rmSync(p, { force: true });
    n++;
  }
  usage().bytes = scanBytes(d);
  return n;
}

export type PreviewSaveResult = { ok: true; bytes: number; existed: boolean } | { ok: false; status: number; error: string };

/**
 * Nhận MỘT tệp xem trước. Thứ tự kiểm (phản biện P1): loại (chỉ "jpg" / "mp3") + mã băm → Content-Length ≤ trần theo loại → danh mục
 * hiện hành có trỏ tới → tổng dung lượng (giữ chỗ trước khi đọc) → đọc dạng luồng thẳng xuống tệp tạm, cắt ngay khi vượt trần → mã băm
 * + magic bytes → đổi tên. Tên tệp ở máy chủ = mã băm đã kiểm (không lấy tên từ dữ liệu gửi lên). Tối đa ~400 KB nằm trong bộ nhớ.
 */
export async function savePreview(sha: string, type: string, body: ReadableStream<Uint8Array> | null, contentLength?: string | null, opts: { maxTotal?: number } = {}): Promise<PreviewSaveResult> {
  const drop = async () => {
    await body?.cancel().catch(() => {});
  };
  if (!isSha256(sha) || !isPreviewType(type)) {
    await drop();
    return { ok: false, status: 400, error: "Mã băm / loại tệp xem trước không hợp lệ" };
  }
  const max = PREVIEW_TYPES[type].maxBytes;
  const tooBig = { ok: false as const, status: 413, error: `Tệp xem trước vượt ${Math.round(max / 1024)} KB` };
  const declared = contentLength === null || contentLength === undefined || contentLength === "" ? null : Number(contentLength);
  if (declared !== null && (!Number.isInteger(declared) || declared < 0)) {
    await drop();
    return { ok: false, status: 400, error: "Content-Length không hợp lệ" };
  }
  if (declared !== null && declared > max) {
    await drop();
    return tooBig;
  }
  if (!activePreviewRef(sha, type)) {
    await drop();
    return { ok: false, status: 409, error: "Danh mục hiện hành không có tệp xem trước này" };
  }
  const final = previewPath(sha, type);
  if (fs.existsSync(final)) {
    await drop();
    return { ok: true, bytes: fs.statSync(final).size, existed: true };
  }
  if (!body) return { ok: false, status: 400, error: "Không có dữ liệu" };
  const maxTotal = opts.maxTotal ?? CATALOG_LIMITS.maxTotalPreviewBytes;
  const want = declared ?? max;
  const u = usage();
  if (u.bytes + u.reserved + want > maxTotal) {
    await drop();
    return { ok: false, status: 507, error: `Kho xem trước đầy (${Math.round(maxTotal / 1024 / 1024)} MB)` };
  }
  // Giữ chỗ NGAY trước try: mọi lỗi sau đó (kể cả lỗi đĩa EACCES / ENOSPC / EMFILE khi tạo thư mục / mở tệp) đều trả lại giữ chỗ
  u.reserved += want;
  const tmp = `${final}.${process.pid}.${Math.random().toString(36).slice(2, 8)}.part`;
  let fd: number | null = null;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  try {
    fs.mkdirSync(previewsDir(), { recursive: true });
    fd = fs.openSync(tmp, "w");
    reader = body.getReader();
    const hash = createHash("sha256");
    const head: number[] = [];
    let n = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      n += value.byteLength;
      if (n > max || (declared !== null && n > declared)) {
        reader.cancel().catch(() => {});
        return n > max ? tooBig : { ok: false, status: 400, error: "Nhiều byte hơn Content-Length" };
      }
      for (let i = 0; head.length < 4 && i < value.byteLength; i++) head.push(value[i]);
      hash.update(value);
      fs.writeSync(fd, value);
    }
    fs.closeSync(fd);
    fd = null;
    if (declared !== null && n !== declared) return { ok: false, status: 400, error: `Nhận ${n} / ${declared} byte — tệp bị cắt` };
    if (hash.digest("hex") !== sha) return { ok: false, status: 400, error: "Mã băm không khớp" };
    if (!previewMagicOk(type, Uint8Array.from(head))) return { ok: false, status: 415, error: `Không phải tệp ${type.toUpperCase()}` };
    if (fs.existsSync(final)) return { ok: true, bytes: fs.statSync(final).size, existed: true }; // PUT song song cùng tệp đã ghi xong
    fs.renameSync(tmp, final);
    u.bytes += n;
    return { ok: true, bytes: n, existed: false };
  } catch (e) {
    if (!reader) await drop();
    else reader.cancel().catch(() => {});
    const code = (e as NodeJS.ErrnoException).code;
    return { ok: false, status: code === "ENOSPC" ? 507 : 500, error: `Máy chủ không ghi được tệp xem trước${code ? ` (${code})` : ""}` };
  } finally {
    u.reserved -= want; // trừ TRƯỚC khi dọn: dọn lỗi cũng không làm rò giữ chỗ
    try {
      if (fd !== null) fs.closeSync(fd);
    } catch {}
    try {
      fs.rmSync(tmp, { force: true });
    } catch {}
  }
}

/** Đường dẫn tệp xem trước để phát (route GET /api/video-assets/remote?p=<sha>.<jpg|mp3>), chỉ khi mục đang hiện trỏ tới. */
export function remotePreviewFile(name: string): { path: string; type: string } | null {
  const m = /^([a-f0-9]{64})\.(jpg|mp3)$/.exec(name);
  if (!m) return null;
  const t = m[2] as PreviewType;
  const p = previewPath(m[1], t);
  return activePreviewRef(m[1], t) && fs.existsSync(p) ? { path: p, type: PREVIEW_TYPES[t].mime } : null;
}

export const remotePreviewUrl = (sha: string | null, type: string | null) => (sha && type ? `/api/video-assets/remote?p=${sha}.${type}` : null);

// ---------- Quyết định duyệt nhạc ----------

export function pendingDecisions(): DecisionOut[] {
  return getDb()
    .select()
    .from(schema.remoteAssetDecisions)
    .where(eq(schema.remoteAssetDecisions.status, "pending"))
    .orderBy(sql`rowid`)
    .all()
    .map((d) => ({ id: d.id, file: d.file, sha256: d.sha256, action: d.action as DecisionOut["action"], by: d.by, at: d.at }));
}

export function pendingDecisionCount(): number {
  return getDb().select({ id: schema.remoteAssetDecisions.id }).from(schema.remoteAssetDecisions).where(eq(schema.remoteAssetDecisions.status, "pending")).all().length;
}

/** Quyết định mới nhất (theo thứ tự ghi) của từng mục (để giao diện hiện "Đang chờ máy dựng áp dụng" / lỗi lần áp gần nhất). */
export function latestDecisions(): Map<string, RemoteDecisionRow> {
  const out = new Map<string, RemoteDecisionRow>();
  for (const d of getDb().select().from(schema.remoteAssetDecisions).orderBy(sql`rowid`).all()) out.set(d.assetId, d);
  return out;
}

export type DecisionResult = { ok: true; state: "queued" | "already" | "cancelled" } | { ok: false; error: string };

/**
 * OWNER bấm Duyệt / Bỏ duyệt một bài nhạc của máy OWNER. Kiểm bằng ĐÚNG hàm luật của approveMusic (BANNED_IDS, bài bị loại, chỉ bài
 * ĐỦ-HỒ-SƠ / OWNER tự khai đang chờ) trên trạng thái máy OWNER báo lên gần nhất. Bấm ngược lại khi quyết định trước chưa áp = huỷ nó.
 * Quyết định gắn sha256 + tên tệp: máy dựng chỉ áp khi tệp trên máy vẫn đúng mã băm đó.
 */
export function requestMusicDecision(assetId: string, approve: boolean, actor: { email: string; name: string }, now = new Date()): DecisionResult {
  const db = getDb();
  const row = db.select().from(schema.remoteAssets).where(and(eq(schema.remoteAssets.id, assetId), isNull(schema.remoteAssets.removedAt))).get();
  if (!row || row.kind !== "music") return { ok: false, error: "Không có bài này trên máy OWNER" };
  const action = approve ? "approve" : "unapprove";
  const pending = db.select().from(schema.remoteAssetDecisions).where(and(eq(schema.remoteAssetDecisions.assetId, assetId), eq(schema.remoteAssetDecisions.status, "pending"))).get();
  if (pending) {
    if (pending.action === action) return { ok: true, state: "already" };
    db.update(schema.remoteAssetDecisions).set({ status: "cancelled", error: `Huỷ bởi ${actor.email}`, resultAt: nowIso(now) }).where(eq(schema.remoteAssetDecisions.id, pending.id)).run();
    return { ok: true, state: "cancelled" };
  }
  const raw = rawMusicOf(row);
  const err = approve ? musicApprovalError(raw) : musicUnapprovalError(raw);
  if (err) return { ok: false, error: err };
  db.insert(schema.remoteAssetDecisions).values({ id: newId(), assetId, file: musicFileOf(assetId), sha256: row.sha256, action, by: actor.email, byName: actor.name, at: nowIso(now), status: "pending" }).run();
  return { ok: true, state: "queued" };
}

/** Huỷ quyết định đang chờ (chưa áp) của một mục. */
export function cancelMusicDecision(assetId: string, actor: { email: string }, now = new Date()): DecisionResult {
  const r = getDb()
    .update(schema.remoteAssetDecisions)
    .set({ status: "cancelled", error: `Huỷ bởi ${actor.email}`, resultAt: nowIso(now) })
    .where(and(eq(schema.remoteAssetDecisions.assetId, assetId), eq(schema.remoteAssetDecisions.status, "pending")))
    .run();
  return r.changes ? { ok: true, state: "cancelled" } : { ok: false, error: "Không có quyết định đang chờ" };
}

// ---------- Trạng thái ----------

export interface OwnerMacStatus {
  /** Lần máy dựng gửi danh mục gần nhất (ISO) — null = chưa từng đồng bộ. */
  syncedAt: string | null;
  worker: string;
  /** Số mục đang hiện (chưa gỡ). */
  count: number;
  byKind: Record<CatalogKind, number>;
  pendingDecisions: number;
  previewBytes: number;
  /** Quá 30 phút chưa đồng bộ (máy dựng gửi mỗi 10 phút khi rảnh). */
  stale: boolean;
}

export function ownerMacStatus(now = Date.now()): OwnerMacStatus {
  let s: { at?: string; worker?: string } = {};
  try {
    s = JSON.parse(getSetting(STATUS_KEY) ?? "{}");
  } catch {}
  const byKind = { music: 0, sfx: 0, broll: 0, drop: 0 } as Record<CatalogKind, number>;
  const active = getDb().select({ kind: schema.remoteAssets.kind }).from(schema.remoteAssets).where(isNull(schema.remoteAssets.removedAt)).all();
  for (const r of active) if (r.kind in byKind) byKind[r.kind as CatalogKind]++;
  const syncedAt = s.at ?? null;
  return { syncedAt, worker: s.worker ?? "", count: active.length, byKind, pendingDecisions: pendingDecisionCount(), previewBytes: previewBytes(), stale: !syncedAt || now - Date.parse(syncedAt) > 30 * 60_000 };
}
