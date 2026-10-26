"use server";

import fs from "node:fs";
import { requirePermission } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { done } from "./common";
import { setLibraryMusicApproval } from "./media";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
/** Trang quay về sau khi bấm: chỉ trang Tư liệu / Cài đặt (không chuyển hướng ra nơi lạ). */
const backOf = (fd: FormData) => {
  const b = str(fd, "back");
  return /^\/(assets|settings)([?#/]|$)/.test(b) ? b : "/assets#music-library";
};
const fail = (back: string, msg: string): never => done(`${back}${back.includes("?") ? "&" : "?"}tone=error`, msg);

/**
 * Duyệt / Bỏ duyệt / Huỷ cho một bài nhạc trong danh mục hợp nhất (listAssetCatalog). Form gửi:
 *   id      = AssetEntry.id ("server:music/<tệp>" hoặc "owner_mac:music/<tệp>")
 *   approve = "1" (duyệt) | "0" (bỏ duyệt) · cancel = "1" (huỷ quyết định đang chờ máy dựng — chỉ owner_mac)
 *   back    = trang quay về (tuỳ chọn, /assets… hoặc /settings…)
 * Quyền: như setLibraryMusicApproval (quản trị — OWNER). Nhạc máy chủ → đúng hành động cũ (approveMusic ngay);
 * nhạc máy OWNER → ghi quyết định, máy dựng áp ở lần đồng bộ kế (thường < 1 phút khi máy dựng đang rảnh).
 */
export async function setAssetApproval(fd: FormData) {
  const back = backOf(fd);
  const actor = await requirePermission("admin", back);
  const id = str(fd, "id");
  if (id.startsWith("server:music/")) {
    const f = new FormData();
    f.set("file", id.slice("server:music/".length));
    f.set("approve", str(fd, "approve") === "1" ? "1" : "0");
    return setLibraryMusicApproval(f);
  }
  if (!id.startsWith("owner_mac:music/")) return fail(back, "Chỉ duyệt được nhạc nền");
  const assetId = id.slice("owner_mac:".length);
  const { cancelMusicDecision, requestMusicDecision } = await import("@/lib/video/remote-catalog");
  const name = assetId.replace(/^music\//, "");
  if (str(fd, "cancel") === "1") {
    const r = cancelMusicDecision(assetId, actor);
    if (!r.ok) return fail(back, r.error);
    logActivity("human", `${actor.name} huỷ quyết định duyệt nhạc máy OWNER “${name}” (chưa áp).`, "settings");
    return done(back, `Đã huỷ quyết định cho “${name}”.`);
  }
  const approve = str(fd, "approve") === "1";
  const r = requestMusicDecision(assetId, approve, { email: actor.email, name: actor.name });
  if (!r.ok) return fail(back, r.error);
  if (r.state === "cancelled") {
    logActivity("human", `${actor.name} huỷ quyết định duyệt nhạc máy OWNER “${name}” (chưa áp).`, "settings");
    return done(back, `Đã huỷ quyết định trước cho “${name}”.`);
  }
  if (r.state === "queued") logActivity("human", `${actor.name} ${approve ? "duyệt dùng" : "bỏ duyệt"} nhạc nền máy OWNER “${name}” — chờ máy dựng áp dụng.`, "settings");
  done(back, `${approve ? "Đã duyệt" : "Đã bỏ duyệt"} “${name}” — đang chờ máy dựng áp dụng.`);
}

const TRASH_BACK: Record<string, string> = { music: "/assets#music-library", sfx: "/assets#sfx", "sfx-new": "/assets#sfx", broll: "/assets#broll" };
/** Tiền tố AssetEntry.id (tư liệu máy chủ) → loại trong thùng "Đã xoá". */
const TRASH_ID = /^server:(music|sfx|broll|sfx-owner\/moi)\/(.+)$/;

/**
 * Xoá (chuyển vào "Đã xoá", khôi phục được 30 ngày) một tư liệu MÁY CHỦ: id = AssetEntry.id "server:<music|sfx|broll|sfx-owner/moi>/<tệp>".
 * Tư liệu "Máy của anh" không xoá từ đây. Quyền quản trị (OWNER). Tệp phải nằm trong thư mục thư viện và có trong danh mục
 * (src/lib/video/asset-trash.ts); ảnh thu nhỏ trong cache được dọn theo.
 */
export async function trashAssetAction(fd: FormData) {
  const m = TRASH_ID.exec(str(fd, "id"));
  const kind = m ? (m[1] === "sfx-owner/moi" ? "sfx-new" : (m[1] as "music" | "sfx" | "broll")) : null;
  const back = kind ? TRASH_BACK[kind] : "/assets";
  const actor = await requirePermission("admin", back);
  if (!m || !kind) return fail(back, "Chỉ xoá được tư liệu trên máy chủ");
  const file = m[2];
  const { dataDir, brollFilePath } = await import("@/lib/video/jobs");
  const { trashAsset } = await import("@/lib/video/asset-trash");
  const { cachedThumbPath } = await import("@/lib/video/thumb-cache");
  const real = kind === "broll" ? brollFilePath(file)?.path : undefined;
  const cached = real ? cachedThumbPath(real) : null; // tính trước khi chuyển tệp (khoá theo đường dẫn + cỡ + mtime)
  const r = trashAsset(dataDir(), kind, file, actor.email);
  if (!r.ok) return fail(back, r.error);
  if (cached) fs.rmSync(cached, { force: true });
  logActivity("human", `${actor.name} xoá tư liệu ${m[1]}/${file} (chuyển vào Đã xoá, khôi phục được 30 ngày).`, "settings");
  done(back, `Đã xoá “${r.entry.title}”. Khôi phục được trong mục Đã xoá.`);
}

/** Khôi phục một mục trong "Đã xoá" về thư viện máy chủ (trả nguyên mục danh mục: giấy phép, từ khoá, trạng thái duyệt). */
export async function restoreAssetAction(fd: FormData) {
  const actor = await requirePermission("admin", "/assets#da-xoa");
  const { dataDir } = await import("@/lib/video/jobs");
  const { restoreAsset } = await import("@/lib/video/asset-trash");
  const r = restoreAsset(dataDir(), str(fd, "id"));
  if (!r.ok) return fail("/assets#da-xoa", r.error);
  logActivity("human", `${actor.name} khôi phục tư liệu ${r.entry.kind}/${r.file} từ Đã xoá.`, "settings");
  done(TRASH_BACK[r.entry.kind] ?? "/assets", `Đã khôi phục “${r.entry.title}”.`);
}
