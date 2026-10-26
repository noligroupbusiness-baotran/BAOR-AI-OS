"use server";

import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { done, withQuery } from "./common";
import { hashPassword, setSetting, verifyAdmin, getAdminEmail } from "@/lib/admin";
import { clearSampleOnly, seedAll } from "@/db/seed";
import { requirePermission } from "@/lib/permissions";
import { checkPassword } from "@/lib/password-policy";
import { issueSession } from "@/lib/auth";
import { logSecurityEvent, renameSecurityAccount, revokeAllSessions } from "@/lib/security";
import { writeIntegrationConfig } from "@/lib/connectors/config";
import { checkIntegration as runCheck } from "@/lib/connectors/sync";
import { runSchedulerNow } from "@/lib/scheduler";
import { roleById, saveRoleSettings } from "@/lib/ai-roster";
import { generateWorkerKey, revokeWorkerKey } from "@/lib/video/worker-auth";
import { acceptSkillVersions } from "@/lib/video/skill-freshness";
import { logActivity } from "@/lib/activity";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function toggleAutomation(fd: FormData) {
  await requirePermission("manager", "/settings#automation");
  const key = str(fd, "key");
  const on = str(fd, "on") === "1";
  setSetting(`automation.${key}`, on ? "0" : "1");
  done("/settings#automation", on ? "Đã tắt" : "Đã bật");
}

export async function saveBrand(fd: FormData) {
  await requirePermission("manager", "/settings#brand");
  setSetting("brand.name", str(fd, "name"));
  setSetting("brand.products", str(fd, "products"));
  setSetting("brand.voice", str(fd, "voice"));
  done("/settings#brand", "Đã lưu thương hiệu và giọng văn");
}

export async function saveAccount(fd: FormData) {
  const actor = await requirePermission("admin", "/settings#account");
  const email = str(fd, "email").toLowerCase();
  const current = str(fd, "current");
  const next = str(fd, "password");
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return done("/settings?tone=error#account", "Email không hợp lệ");
  if (!verifyAdmin(getAdminEmail(), current)) {
    logSecurityEvent("login_fail", { email: actor.email, detail: "sai mật khẩu hiện tại ở Cài đặt › Tài khoản quản trị" });
    return done("/settings?tone=error#account", "Mật khẩu hiện tại không đúng");
  }
  if (next) {
    const policy = checkPassword(next, { email });
    if (!policy.ok) return done("/settings?tone=error#account", `Mật khẩu mới: ${policy.reason}`);
  }
  const before = getAdminEmail().toLowerCase();
  const changedEmail = before !== email;
  if (changedEmail) {
    setSetting("admin.email", email);
    renameSecurityAccount(before, email);
    logSecurityEvent("permission_changed", { email, detail: `đổi email quản trị từ ${before}` });
  }
  if (next) {
    setSetting("admin.passwordHash", hashPassword(next));
    logSecurityEvent("password_changed", { email, detail: "ở Cài đặt › Tài khoản quản trị" });
  }
  if (changedEmail || next) {
    // Mọi phiên cũ (kể cả theo email cũ) hết hiệu lực; cấp lại phiên cho chính người đang thao tác.
    if (changedEmail) revokeAllSessions(before);
    revokeAllSessions(email);
    await issueSession(email);
  }
  done("/settings#account", "Đã cập nhật tài khoản quản trị");
}

export async function saveIntegration(fd: FormData) {
  await requirePermission("admin", "/settings#integrations");
  const key = str(fd, "key");
  const db = getDb();
  const row = db.select().from(schema.integrations).where(eq(schema.integrations.key, key)).get();
  if (!row) return done("/settings#integrations", "Không tìm thấy kết nối");
  const fields: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (k.startsWith("cfg.") && String(v).trim()) fields[k.slice(4)] = String(v).trim();
  // Giá trị bí mật được mã hóa trước khi ghi. "Đã kết nối" chỉ bật sau khi kiểm tra thật thành công.
  const config = writeIntegrationConfig(key, fields);
  const account = str(fd, "account") || row.account || null;
  db.update(schema.integrations).set({ account }).where(eq(schema.integrations.key, key)).run();
  if (Object.keys(config).length === 0) return done("/settings#integrations", "Chưa có thông tin để lưu");
  const res = await runCheck(key);
  done(`/settings#${key}`, res.ok ? `Đã lưu và kết nối ${row.name}: ${res.message}` : `Đã lưu khóa ${row.name}. Kiểm tra: ${res.message}`);
}

export async function checkIntegration(fd: FormData) {
  await requirePermission("admin", "/settings#integrations");
  const key = str(fd, "key");
  const res = await runCheck(key);
  done(`/settings${res.ok ? "" : "?tone=error"}#${key}`, res.message);
}

// Ô trần nhập bằng $ (26/10): gõ nhầm số đồng vào ô đô sẽ thành trần hàng tỷ ₫ → chặn ở máy chủ (≈ $3.800)
const MAX_AI_CAP_VND = 100_000_000;
const CAP_TOO_BIG = "Trần quá lớn — ô nhập bằng $, kiểm lại số (tối đa ≈ 100 triệu ₫)";

export async function saveAiBudget(fd: FormData) {
  await requirePermission("admin", "/settings#ai");
  const n = (k: string) => Number(String(fd.get(k) ?? "").replace(/[^\d]/g, "")) || 0;
  if (n("dailyCapVnd") > MAX_AI_CAP_VND || n("monthlyCapVnd") > MAX_AI_CAP_VND) return done(withQuery("/settings#ai", "tone", "error"), CAP_TOO_BIG);
  setSetting("ai.dailyCapVnd", String(n("dailyCapVnd")));
  setSetting("ai.monthlyCapVnd", String(n("monthlyCapVnd")));
  // Tỷ giá quy đổi giá USD của hãng AI sang VND (bỏ trống / 0 → giữ mặc định)
  if (n("vndPerUsd") > 0) setSetting("ai.vndPerUsd", String(n("vndPerUsd")));
  done("/settings#ai", "Đã lưu trần chi phí AI");
}

// Cài đặt › Đội AI: công tắc "Cho phép gọi AI", mô hình, trần riêng của từng vị trí
export async function saveAiRole(fd: FormData) {
  await requirePermission("admin", "/settings#ai-team");
  const id = str(fd, "role");
  const role = roleById(id);
  if (!role) return done(withQuery("/settings#ai-team", "tone", "error"), "Không có vị trí AI này");
  const monthlyCapVnd = Number(String(fd.get("monthlyCapVnd") ?? "").replace(/[^\d]/g, "")) || 0;
  if (monthlyCapVnd > MAX_AI_CAP_VND) return done(withQuery("/settings#ai-team", "tone", "error"), CAP_TOO_BIG);
  saveRoleSettings(role.id, {
    enabled: fd.get("enabled") === "on",
    ...(role.local ? {} : { model: str(fd, "model") }),
    monthlyCapVnd,
  });
  done("/settings#ai-team", `Đã lưu ${role.name}`);
}

export async function runBackgroundNow() {
  await requirePermission("manager", "/settings#syslog");
  const result = await runSchedulerNow();
  done("/settings#syslog", `Đã chạy bộ chạy nền: ${result}`);
}

export async function disconnectIntegration(fd: FormData) {
  await requirePermission("admin", "/settings#integrations");
  const key = str(fd, "key");
  getDb().update(schema.integrations).set({ config: "{}", connected: false, account: null }).where(eq(schema.integrations.key, key)).run();
  done("/settings#integrations", "Đã ngắt kết nối");
}

export async function resetSampleData() {
  await requirePermission("admin", "/settings#sample");
  const db = getDb();
  clearSampleOnly(db);
  seedAll(db);
  setSetting("data.sampleCleared", "0");
  done("/dashboard", "Đã nạp lại dữ liệu mẫu. Dữ liệu bạn tự tạo vẫn còn.");
}

export async function clearSampleData() {
  await requirePermission("admin", "/settings#sample");
  clearSampleOnly(getDb());
  setSetting("data.sampleCleared", "1");
  done("/dashboard", "Đã xóa dữ liệu mẫu, giữ nguyên dữ liệu bạn tự tạo. Hệ thống sẵn sàng nhận dữ liệu thật.");
}

// Cài đặt › Video › Nơi dựng video (máy OWNER dựng cho máy chủ)
export async function setRenderModeAction(fd: FormData) {
  await requirePermission("admin", "/settings#render-worker");
  setSetting("video.renderMode", str(fd, "mode") === "remote" ? "remote" : "local");
  done("/settings#render-worker", str(fd, "mode") === "remote" ? "Đã chuyển: video dựng trên máy dựng của anh" : "Đã chuyển: video dựng trên máy chủ");
}

/** Tạo khoá máy dựng (thu hồi khoá cũ). Trả khoá về form để hiện ĐÚNG MỘT LẦN — không đặt vào URL / thông báo. */
type WorkerKeyState = { key?: string; error?: string };
export async function generateWorkerKeyAction(_prev: WorkerKeyState, _fd: FormData): Promise<WorkerKeyState> {
  const actor = await requirePermission("admin", "/settings#render-worker");
  void _prev;
  void _fd;
  const key = generateWorkerKey();
  logActivity("human", `${actor.name} tạo khoá máy dựng mới (khoá cũ bị thu hồi).`, "video");
  return { key };
}

export async function revokeWorkerKeyAction() {
  const actor = await requirePermission("admin", "/settings#render-worker");
  revokeWorkerKey();
  logActivity("human", `${actor.name} thu hồi khoá máy dựng.`, "video");
  done("/settings#render-worker", "Đã thu hồi khoá máy dựng");
}

export async function acceptSkillVersionsAction() {
  await requirePermission("admin", "/settings#render-worker");
  const n = acceptSkillVersions();
  done("/settings#render-worker", `Đã ghi nhận bộ dựng theo skill hiện tại trên Notion (${n} trang)`);
}
