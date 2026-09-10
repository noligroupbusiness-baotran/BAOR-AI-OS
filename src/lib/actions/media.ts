"use server";

import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getSetting, setSetting } from "@/lib/admin";
import { deleteUpload, getUpload, saveUpload } from "@/lib/uploads";
import { requirePermission, currentActor } from "@/lib/permissions";
import { sendAlert, type AlertLevel } from "@/lib/alerts";
import { campaignRepo } from "@/lib/campaigns/repository";
import { logActivity } from "@/lib/activity";
import { done } from "./common";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const fail = (path: string, msg: string): never => done(`${path}${path.includes("?") ? "&" : "?"}tone=error`, msg);

// ---------- Thương hiệu: logo, màu, font ----------

export async function saveBrandIdentity(fd: FormData) {
  await requirePermission("manager", "/settings#brand");
  const color = (k: string) => {
    const v = str(fd, k);
    return /^#[0-9a-fA-F]{6}$/.test(v) ? v : "";
  };
  setSetting("brand.primaryColor", color("primaryColor"));
  setSetting("brand.secondaryColor", color("secondaryColor"));
  setSetting("brand.font", str(fd, "font"));
  setSetting("brand.tagline", str(fd, "tagline"));
  logActivity("human", "Cập nhật nhận diện thương hiệu (màu, font, khẩu hiệu).", "settings");
  done("/settings#brand", "Đã lưu nhận diện thương hiệu");
}

// ---------- Logo giao diện quản trị (góc trái sidebar) ----------
// Tách riêng khỏi Thương hiệu: logo này chỉ hiện trên giao diện hệ thống, không in lên ảnh/video.

const APP_LOGO_KEYS = { light: "ui.logoLightUploadId", dark: "ui.logoDarkUploadId" } as const;

export async function saveAppLogo(fd: FormData) {
  const actor = await requirePermission("manager", "/settings#app-logo");
  let saved = 0;
  for (const variant of ["light", "dark"] as const) {
    const file = fd.get(variant === "light" ? "logoLight" : "logoDark");
    if (!(file instanceof File) || file.size === 0) continue;
    const r = await saveUpload("logo", file, actor.email, { use: "app", variant });
    if (!r.ok) return fail("/settings#app-logo", `Logo nền ${variant === "light" ? "sáng" : "tối"}: ${r.error}`);
    const old = getSetting(APP_LOGO_KEYS[variant]);
    if (old) deleteUpload(old);
    setSetting(APP_LOGO_KEYS[variant], r.upload.id);
    saved++;
  }
  if (!saved) return fail("/settings#app-logo", "Chưa chọn tệp logo nào.");
  logActivity("human", `${actor.name} cập nhật logo giao diện quản trị.`, "settings");
  done("/settings#app-logo", "Đã lưu logo. Góc trái sẽ hiện logo mới.");
}

export async function removeAppLogo(fd: FormData) {
  await requirePermission("manager", "/settings#app-logo");
  const key = APP_LOGO_KEYS[str(fd, "variant") === "dark" ? "dark" : "light"];
  const old = getSetting(key);
  if (old) deleteUpload(old);
  setSetting(key, "");
  done("/settings#app-logo", "Đã gỡ logo");
}

// ---------- Kho nhạc ----------

export async function uploadMusic(fd: FormData) {
  const actor = await requirePermission("manager", "/settings#music");
  const file = fd.get("file");
  if (!(file instanceof File)) return fail("/settings#music", "Chưa chọn tệp nhạc");
  const r = await saveUpload("music", file, actor.email, { mood: str(fd, "mood") || "chung", title: str(fd, "title") || file.name, license: str(fd, "license") });
  if (!r.ok) return fail("/settings#music", r.error);
  logActivity("human", `Thêm nhạc nền “${r.upload.meta.title}” (${r.upload.meta.mood}).`, "settings");
  done("/settings#music", "Đã thêm nhạc vào kho. Agent Edit Video chỉ dùng nhạc trong kho này.");
}

export async function deleteMusic(fd: FormData) {
  await requirePermission("manager", "/settings#music");
  const id = str(fd, "id");
  const u = getUpload(id);
  if (!u || u.kind !== "music") return fail("/settings#music", "Không tìm thấy bản nhạc");
  deleteUpload(id);
  done("/settings#music", "Đã xóa bản nhạc");
}

// ---------- Video Studio: tải video lên ----------

export async function uploadVideo(fd: FormData) {
  const actor = await currentActor();
  const file = fd.get("file");
  const title = str(fd, "title");
  const back = "/video-studio?tab=review";
  if (!title) return fail("/video-studio?upload=1", "Cần đặt tên video");
  if (!(file instanceof File) || file.size === 0) return fail("/video-studio?upload=1", "Chưa chọn tệp video");
  const r = await saveUpload("video", file, actor.email, { title });
  if (!r.ok) return fail("/video-studio?upload=1", r.error);
  const id = `v_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const contentId = str(fd, "contentId") || null;
  const platforms = fd.getAll("platforms").map(String).filter(Boolean);
  getDb().insert(schema.videos).values({ id, title, contentId, agent: actor.name, status: "review", platforms: JSON.stringify(platforms), version: 1, note: str(fd, "note"), uploadId: r.upload.id, updatedAt: new Date().toISOString() }).run();
  // Kế thừa chiến dịch từ kịch bản (nếu có) hoặc gắn theo lựa chọn.
  if (contentId) campaignRepo.inheritLinks("content", contentId, "video", id, "review");
  const campaignId = str(fd, "campaignId");
  if (campaignId && campaignRepo.get(campaignId)) campaignRepo.addLink({ campaignId, channelGoalId: str(fd, "channelGoalId") || null, entityType: "video", entityId: id, status: "review", ownerId: actor.personId, viaType: contentId ? "content" : null, viaId: contentId });
  logActivity("human", `${actor.name} tải video “${title}” lên (${Math.round(r.upload.size / 1024 / 1024)} MB), chờ kiểm tra.`, "video");
  done(back, "Đã tải video lên, đang ở Chờ kiểm tra");
}

// ---------- Cảnh báo ra ngoài ----------

export async function saveAlerts(fd: FormData) {
  await requirePermission("admin", "/settings#alerts");
  const url = str(fd, "webhookUrl");
  if (url && !/^https?:\/\//.test(url)) return fail("/settings#alerts", "Địa chỉ webhook phải bắt đầu bằng http:// hoặc https://");
  setSetting("alerts.webhookUrl", url);
  const level = str(fd, "minLevel") as AlertLevel;
  setSetting("alerts.minLevel", ["info", "warn", "error"].includes(level) ? level : "error");
  done("/settings#alerts", url ? "Đã lưu địa chỉ nhận cảnh báo" : "Đã tắt gửi cảnh báo ra ngoài");
}

export async function testAlert() {
  await requirePermission("admin", "/settings#alerts");
  const r = await sendAlert({ level: "error", title: "Thử cảnh báo từ BAOR AI OS", text: "Nếu bạn nhận được tin này, kênh cảnh báo đã hoạt động.", href: "/settings#alerts" });
  done(`/settings${r.sent ? "" : "?tone=error"}#alerts`, r.message);
}

// Xóa tệp bất kỳ (ảnh/video) khi không còn dùng.
export async function deleteUploadAction(fd: FormData) {
  await requirePermission("manager", "/settings");
  const id = str(fd, "id");
  const u = getUpload(id);
  if (!u) return fail("/settings", "Không tìm thấy tệp");
  if (u.kind === "video") {
    getDb().update(schema.videos).set({ uploadId: null }).where(eq(schema.videos.uploadId, id)).run();
  }
  deleteUpload(id);
  done("/settings", "Đã xóa tệp");
}
