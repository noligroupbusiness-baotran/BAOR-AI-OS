// Danh mục tư liệu HỢP NHẤT cho trang Tư liệu: tư liệu nằm trên chính máy chủ (DATA_DIR/video-assets) + tư liệu "Máy của OWNER"
// (máy dựng báo lên — src/lib/video/remote-catalog.ts). Chỉ đọc; duyệt / bỏ duyệt qua server action setAssetApproval
// (src/lib/actions/asset-catalog.ts). Mỗi mục có sẵn trạng thái, nhãn ngắn, đường dẫn xem trước để giao diện chỉ việc hiển thị.
import path from "node:path";
import { brollLibrary } from "./jobs";
import { licenseSource, musicDir, musicLibrary, musicSourceLabel, sfxLibrary, sfxNewLibrary } from "./music-library";
import { isBannedMusic, musicApprovalError, musicUnapprovalError, readMusicManifest } from "./music-rules";
import { isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { latestDecisions, ownerMacStatus, parseMeta, rawMusicOf, remotePreviewUrl, type OwnerMacStatus } from "./remote-catalog";
import type { CatalogKind, CatalogMedia } from "./catalog-wire";

export type AssetSource = "server" | "owner_mac";
/** approved = nhạc đã duyệt · pending = nhạc chờ OWNER nghe duyệt · blocked = thiếu giấy phép / không đủ hồ sơ để duyệt ·
 *  excluded = bị loại (BANNED / exclude) · ready = SFX / ảnh có giấy phép · waiting = tư liệu thả vào chưa nhận · removed = đã gỡ khỏi máy OWNER */
export type AssetStatus = "approved" | "pending" | "blocked" | "excluded" | "ready" | "waiting" | "removed";

export const ASSET_STATUS_LABEL: Record<AssetStatus, string> = {
  approved: "Đã duyệt",
  pending: "Chờ duyệt",
  blocked: "Chưa dùng được",
  excluded: "Bị loại",
  ready: "Dùng được",
  waiting: "Chờ nhận",
  removed: "Đã gỡ",
};

export interface AssetEntry {
  /** Khoá duy nhất: "<source>:<đường dẫn trong video-assets>", vd "owner_mac:music/a.mp3". */
  id: string;
  source: AssetSource;
  type: CatalogKind;
  media: CatalogMedia;
  /** Đường dẫn tương đối trong video-assets (máy chủ hoặc máy OWNER), vd "music/a.mp3". */
  file: string;
  title: string;
  author: string;
  durationSec: number | null;
  tags: string[];
  desc: string;
  /** Ảnh thu nhỏ (ảnh / khung clip) — null nếu không có. */
  thumbUrl: string | null;
  /** Nghe / xem thử (nhạc, SFX, clip ở máy chủ) — null nếu không có. */
  previewUrl: string | null;
  status: AssetStatus;
  statusLabel: string;
  /** Nhãn nguồn giấy phép ngắn: Mixkit / Pixabay / OWNER / Khác. */
  licenseShort: string;
  license: string;
  /** Lý do (bị loại / chờ nhận / chưa dùng được), ngắn — để vào (i). */
  note: string;
  isDefault: boolean;
  /** Chỉ owner_mac: lần máy dựng báo mục này gần nhất. */
  lastSyncedAt: string | null;
  /** Chỉ owner_mac: quyết định duyệt đã ghi, CHƯA được máy dựng áp → hiện "Đang chờ máy dựng áp dụng". */
  pendingDecision: { action: "approve" | "unapprove"; by: string; at: string } | null;
  /** Chỉ owner_mac: lần áp gần nhất không thành (vd tệp đã đổi) — null nếu không có. */
  decisionError: string | null;
  /** Duyệt / bỏ duyệt được ngay (đúng luật approveMusic); đang có quyết định chờ thì cả hai false, dùng nút Huỷ. */
  canApprove: boolean;
  canUnapprove: boolean;
}

const enc = encodeURIComponent;

function musicStatus(raw: Record<string, unknown>): AssetStatus {
  const license = String(raw.license ?? "");
  if (raw.exclude || isBannedMusic(raw)) return "excluded";
  if (!license.trim()) return "blocked";
  if (!license.includes("chờ OWNER")) return "approved";
  return musicApprovalError(raw) ? "blocked" : "pending";
}

function serverEntries(): AssetEntry[] {
  const out: AssetEntry[] = [];
  const raws = new Map(readMusicManifest(musicDir()).map((x) => [String(x.file ?? ""), x]));
  const base = { source: "server" as const, lastSyncedAt: null, pendingDecision: null, decisionError: null, note: "", desc: "" };
  for (const t of musicLibrary()) {
    const raw = raws.get(t.file) ?? {};
    const status = musicStatus(raw);
    out.push({
      ...base,
      id: `server:music/${t.file}`,
      type: "music",
      media: "audio",
      file: `music/${t.file}`,
      title: t.title,
      author: t.author,
      durationSec: t.durationSec,
      tags: [t.genre, ...t.mood].filter(Boolean),
      thumbUrl: null,
      previewUrl: /\.(mp3|wav)$/i.test(t.file) ? `/api/video-assets/music?file=${enc(t.file)}` : null,
      status,
      statusLabel: ASSET_STATUS_LABEL[status],
      licenseShort: musicSourceLabel(t.license, raw.catalogStatus),
      license: t.license,
      isDefault: t.isDefault,
      canApprove: !musicApprovalError(raw),
      canUnapprove: !musicUnapprovalError(raw),
    });
  }
  for (const s of sfxLibrary()) {
    out.push({
      ...base,
      id: `server:sfx/${s.file}`,
      type: "sfx",
      media: "audio",
      file: `sfx/${s.file}`,
      title: s.title,
      author: "",
      durationSec: s.durationSec,
      tags: s.kind ? [s.kind] : [],
      thumbUrl: null,
      previewUrl: /\.(mp3|wav)$/i.test(s.file) ? `/api/video-assets/sfx?file=${enc(s.file)}` : null,
      status: "ready",
      statusLabel: ASSET_STATUS_LABEL.ready,
      licenseShort: licenseSource(s.license),
      license: s.license,
      isDefault: false,
      canApprove: false,
      canUnapprove: false,
    });
  }
  // Hiệu ứng OWNER thả vào / tải lên (sfx-owner/moi): nghe thử + xoá được; chưa gán vai trò → bộ dựng chưa dùng (không tự gán)
  for (const s of sfxNewLibrary()) {
    out.push({
      ...base,
      id: `server:sfx-owner/moi/${s.file}`,
      type: "sfx",
      media: "audio",
      file: `sfx-owner/moi/${s.file}`,
      title: s.title,
      author: "",
      durationSec: s.durationSec,
      tags: ["moi"],
      thumbUrl: null,
      previewUrl: /\.(mp3|wav)$/i.test(s.file) ? `/api/video-assets/sfx?set=moi&file=${enc(s.file)}` : null,
      status: "ready",
      statusLabel: "Mới · chưa gán vai",
      licenseShort: licenseSource(s.license),
      license: s.license,
      isDefault: false,
      canApprove: false,
      canUnapprove: false,
    });
  }
  for (const b of brollLibrary()) {
    if (!b.exists || !b.file) continue;
    const status: AssetStatus = b.license.trim() ? "ready" : "blocked";
    const url = `/api/video-assets/broll?file=${enc(b.file)}`;
    out.push({
      ...base,
      id: `server:broll/${b.file}`,
      type: "broll",
      media: b.kind,
      file: `broll/${b.file}`,
      title: path.basename(b.file).replace(/\.[^.]+$/, ""),
      author: "",
      durationSec: null,
      tags: b.keywords,
      desc: b.desc,
      thumbUrl: b.kind === "image" ? url : null,
      previewUrl: b.kind === "video" ? url : null,
      status,
      statusLabel: ASSET_STATUS_LABEL[status],
      licenseShort: licenseSource(b.license),
      license: b.license,
      isDefault: false,
      canApprove: false,
      canUnapprove: false,
    });
  }
  return out;
}

function ownerMacEntries(includeRemoved: boolean): AssetEntry[] {
  const decisions = latestDecisions();
  const out: AssetEntry[] = [];
  const q = getDb().select().from(schema.remoteAssets);
  for (const r of includeRemoved ? q.all() : q.where(isNull(schema.remoteAssets.removedAt)).all()) {
    const m = parseMeta(r);
    const kind = r.kind as CatalogKind;
    const d = decisions.get(r.id);
    const pending = d?.status === "pending" ? { action: d.action as "approve" | "unapprove", by: d.byName || d.by, at: d.at } : null;
    const raw = kind === "music" ? rawMusicOf(r) : null;
    const license = m.license ?? "";
    let status: AssetStatus;
    if (r.removedAt) status = "removed";
    else if (raw) status = musicStatus(raw);
    else if (kind === "drop") status = "waiting";
    else if (m.exclude) status = "excluded";
    else status = license.trim() ? "ready" : "blocked";
    const prev = remotePreviewUrl(r.previewSha, r.previewType);
    out.push({
      id: `owner_mac:${r.id}`,
      source: "owner_mac",
      type: kind,
      media: m.media ?? "other",
      file: r.id,
      title: r.title,
      author: m.author ?? "",
      durationSec: typeof m.durationSec === "number" ? m.durationSec : null,
      tags: [...(m.genre ? [m.genre] : []), ...(m.tags ?? [])],
      desc: m.desc ?? "",
      thumbUrl: r.previewType === "jpg" ? prev : null,
      previewUrl: r.previewType === "mp3" ? prev : null,
      status,
      statusLabel: ASSET_STATUS_LABEL[status],
      licenseShort: license ? (raw ? musicSourceLabel(license, raw.catalogStatus) : licenseSource(license)) : "",
      license,
      note: m.reason ?? m.excludeReason ?? "",
      isDefault: !!m.isDefault,
      lastSyncedAt: r.syncedAt,
      pendingDecision: pending,
      decisionError: d && d.status === "failed" ? (d.error ?? "Không áp được") : null,
      canApprove: !!raw && !r.removedAt && !pending && !musicApprovalError(raw),
      canUnapprove: !!raw && !r.removedAt && !pending && !musicUnapprovalError(raw),
    });
  }
  return out;
}

const ORDER: Record<CatalogKind, number> = { music: 0, sfx: 1, broll: 2, drop: 3 };

/** Danh mục hợp nhất (máy chủ + máy OWNER), lọc tuỳ chọn theo loại / nguồn. Mặc định ẩn mục đã gỡ khỏi máy OWNER. */
export function listAssetCatalog(opts: { type?: CatalogKind; source?: AssetSource; includeRemoved?: boolean } = {}): AssetEntry[] {
  const all = [...(opts.source === "owner_mac" ? [] : serverEntries()), ...(opts.source === "server" ? [] : ownerMacEntries(!!opts.includeRemoved))];
  return all
    .filter((e) => !opts.type || e.type === opts.type)
    .sort((a, b) => ORDER[a.type] - ORDER[b.type] || Number(b.isDefault) - Number(a.isDefault) || a.source.localeCompare(b.source) || a.file.localeCompare(b.file));
}

/** "Máy của OWNER: đồng bộ lúc …, N mục" — cho trang Tư liệu và Cài đặt › Video › Máy dựng. */
export function ownerMacSummary(now = Date.now()): OwnerMacStatus & { label: string } {
  const s = ownerMacStatus(now);
  const at = s.syncedAt ? new Date(s.syncedAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }) : "";
  return { ...s, label: s.syncedAt ? `Máy của OWNER: đồng bộ lúc ${at}, ${s.count} mục` : "Máy của OWNER: chưa đồng bộ" };
}

export { ownerMacStatus, type OwnerMacStatus };
