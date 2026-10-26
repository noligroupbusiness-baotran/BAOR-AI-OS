"use server";

import fs from "node:fs";
import { requirePermission } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { RATE_RULES, rateLimiter, type RateLimitRule } from "@/lib/rate-limit";
import { done, withQuery } from "./common";
import { setLibraryMusicApproval } from "./media";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
/** Trang quay về sau khi bấm: chỉ trang Tư liệu / Cài đặt (không chuyển hướng ra nơi lạ). */
const backOf = (fd: FormData) => {
  const b = str(fd, "back");
  return /^\/(assets|settings)([?#/]|$)/.test(b) ? b : "/assets#music-library";
};
const fail = (back: string, msg: string): never => done(withQuery(back, "tone", "error"), msg);
/** Giới hạn tần suất bấm theo tài khoản (quyết định máy OWNER, sửa mô tả, gọi AI) — vượt thì báo lỗi, không làm gì. */
function limited(key: string, rule: RateLimitRule, back: string) {
  const r = rateLimiter().check(key, rule);
  if (!r.ok) fail(back, `Bấm quá nhanh — thử lại sau ${r.retryAfterSec} giây`);
}

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
  limited(`asset-decision:${actor.email}`, RATE_RULES.assetDecision, back);
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
/** Tiền tố AssetEntry.id → loại trong thùng "Đã xoá" (máy chủ: xoá ngay; máy OWNER: ghi lệnh xoá cho máy dựng). */
const TRASH_ID = /^(server|owner_mac):(music|sfx|broll|sfx-owner\/moi)\/(.+)$/;

/**
 * Xoá (chuyển vào "Đã xoá", khôi phục được 30 ngày) một tư liệu: id = AssetEntry.id "<server|owner_mac>:<music|sfx|broll|sfx-owner/moi>/<tệp>".
 * Máy chủ: chuyển ngay (src/lib/video/asset-trash.ts; tệp phải nằm trong thư mục thư viện và có trong danh mục), dọn ảnh thu nhỏ.
 * "Máy của anh": ghi lệnh xoá (đúng sha256 + tên tệp) — máy dựng kiểm lại và xoá TRÊN Mac ở lần đồng bộ kế; `cancel=1` huỷ lệnh chưa áp.
 * Quyền quản trị (OWNER).
 */
export async function trashAssetAction(fd: FormData) {
  const m = TRASH_ID.exec(str(fd, "id"));
  const kind = m ? (m[2] === "sfx-owner/moi" ? "sfx-new" : (m[2] as "music" | "sfx" | "broll")) : null;
  const back = kind ? TRASH_BACK[kind] : "/assets";
  const actor = await requirePermission("admin", back);
  if (!m || !kind) return fail(back, "Không xoá được mục này");
  const file = m[3];
  if (m[1] === "owner_mac") {
    limited(`asset-decision:${actor.email}`, RATE_RULES.assetDecision, back);
    const assetId = `${m[2]}/${file}`;
    const { cancelAssetDecision, requestTrashDecision } = await import("@/lib/video/remote-catalog");
    if (str(fd, "cancel") === "1") {
      const r = cancelAssetDecision(assetId, actor);
      if (!r.ok) return fail(back, r.error);
      logActivity("human", `${actor.name} huỷ lệnh xoá tư liệu máy OWNER ${assetId} (chưa áp).`, "settings");
      return done(back, `Đã huỷ lệnh xoá “${file}”.`);
    }
    const r = requestTrashDecision(assetId, { email: actor.email, name: actor.name });
    if (!r.ok) return fail(back, r.error);
    if (r.state === "queued") logActivity("human", `${actor.name} xoá tư liệu máy OWNER ${assetId} — chờ máy dựng chuyển vào Đã xoá trên Mac.`, "settings");
    return done(back, `Đã ghi lệnh xoá “${file}” — chờ máy dựng xoá.`);
  }
  const { dataDir, brollFilePath } = await import("@/lib/video/jobs");
  const { trashAsset } = await import("@/lib/video/asset-trash");
  const { cachedThumbPath } = await import("@/lib/video/thumb-cache");
  const real = kind === "broll" ? brollFilePath(file)?.path : undefined;
  const cached = real ? cachedThumbPath(real) : null; // tính trước khi chuyển tệp (khoá theo đường dẫn + cỡ + mtime)
  const r = trashAsset(dataDir(), kind, file, actor.email);
  if (!r.ok) return fail(back, r.error);
  if (cached) fs.rmSync(cached, { force: true });
  logActivity("human", `${actor.name} xoá tư liệu ${m[2]}/${file} (chuyển vào Đã xoá, khôi phục được 30 ngày).`, "settings");
  done(back, `Đã xoá “${r.entry.title}”. Khôi phục được trong mục Đã xoá.`);
}

/** Id ảnh / clip B-roll MÁY CHỦ ("server:broll/<tệp>") → tên trong manifest; khác → null. */
const brollFileOf = (id: string) => (/^server:broll\/(.+)$/.exec(id)?.[1] ?? null);

/** Sửa / xoá mô tả một ảnh·clip B-roll máy chủ (ô xem lớn › Sửa mô tả). Một dòng, ≤ 200 ký tự (broll-desc.ts › cleanDesc). */
export async function setBrollDescAction(fd: FormData) {
  const back = "/assets#broll";
  const actor = await requirePermission("admin", back);
  const file = brollFileOf(str(fd, "id"));
  if (!file) return fail(back, "Chỉ sửa được mô tả ảnh trên máy chủ");
  limited(`asset-decision:${actor.email}`, RATE_RULES.assetDecision, back);
  const { dataDir } = await import("@/lib/video/jobs");
  const { setBrollDesc } = await import("@/lib/video/broll-desc");
  const r = setBrollDesc(dataDir(), file, String(fd.get("desc") ?? ""), `OWNER (${actor.email})`);
  if (!r.ok) return fail(back, r.error);
  logActivity("human", `${actor.name} ${r.desc ? "sửa" : "xoá"} mô tả ảnh B-roll ${file}.`, "settings");
  done(back, r.desc ? "Đã lưu mô tả." : "Đã xoá mô tả.");
}

/** "Tự mô tả bằng AI" cho MỘT ảnh·clip B-roll máy chủ — qua cổng AI (công tắc + trần của "AI Mô tả ảnh", trần chung, sổ chi phí). */
export async function describeBrollAction(fd: FormData) {
  const back = "/assets#broll";
  const actor = await requirePermission("admin", back);
  const file = brollFileOf(str(fd, "id"));
  if (!file) return fail(back, "Chỉ mô tả được ảnh trên máy chủ");
  limited(`asset-describe-ai:${actor.email}`, RATE_RULES.assetDescribeAi, back);
  const { brollLibrary } = await import("@/lib/video/jobs");
  const { describeBroll } = await import("@/lib/video/broll-describe");
  const r = await describeBroll(file, actor.email, brollLibrary().find((b) => b.file === file)?.keywords ?? []);
  if (!r.ok) return fail(back, r.error);
  logActivity("ai", `AI Mô tả ảnh tả ${file} (${r.model}, ${r.costVnd.toLocaleString("vi-VN")} ₫) theo yêu cầu của ${actor.name}.`, "settings");
  done(back, `AI đã mô tả: “${r.desc}”`);
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
