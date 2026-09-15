"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { getAdminEmail, hashPassword, setSetting, verifyLogin } from "@/lib/admin";
import { issueSession } from "@/lib/auth";
import { currentActor } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { clientIp } from "@/lib/login-guard";
import { checkPassword } from "@/lib/password-policy";
import { RATE_RULES, rateLimiter } from "@/lib/rate-limit";
import {
  beginTotpSetup,
  cancelTotpSetup,
  confirmTotpSetup,
  disableTotp,
  logSecurityEvent,
  mfaRequired,
  regenerateBackupCodes,
  revokeAllSessions,
  verifySecondFactor,
} from "@/lib/security";
import { done } from "./common";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

async function ip(): Promise<string> {
  const h = await headers();
  return clientIp((n) => h.get(n));
}

// Ai đăng nhập cũng tự đổi được mật khẩu của mình, cần mật khẩu hiện tại.
// Tài khoản quản trị lưu ở settings; nhân sự lưu ở bảng people. Không đổi email ở đây (quản trị đổi trong Cài đặt › Nhân sự).
// Đổi xong: mọi phiên khác bị đăng xuất, phiên hiện tại được cấp lại.
export async function changeMyPassword(fd: FormData) {
  const actor = await currentActor();
  const current = str(fd, "current");
  const next = str(fd, "password");
  const confirm = str(fd, "confirm");
  const back = "/account";
  const fail = (msg: string) => done(`${back}?tone=error`, msg);
  if (!current) return fail("Cần nhập mật khẩu hiện tại.");
  const policy = checkPassword(next, { email: actor.email, name: actor.name });
  if (!policy.ok) return fail(policy.reason!);
  if (next === current) return fail("Mật khẩu mới phải khác mật khẩu hiện tại.");
  if (next !== confirm) return fail("Hai lần nhập mật khẩu mới không khớp.");
  if (!verifyLogin(actor.email, current)) {
    logSecurityEvent("login_fail", { email: actor.email, ip: await ip(), detail: "sai mật khẩu hiện tại khi đổi mật khẩu" });
    return fail("Mật khẩu hiện tại không đúng.");
  }

  const isAdminAccount = actor.email.toLowerCase() === getAdminEmail().toLowerCase();
  if (isAdminAccount) {
    setSetting("admin.passwordHash", hashPassword(next));
  } else {
    const person = getDb().select().from(schema.people).where(eq(schema.people.email, actor.email)).get();
    if (!person) return fail("Không tìm thấy tài khoản nhân sự tương ứng.");
    getDb().update(schema.people).set({ passwordHash: hashPassword(next), updatedAt: new Date().toISOString() }).where(eq(schema.people.id, person.id)).run();
  }
  revokeAllSessions(actor.email);
  await issueSession(actor.email);
  logSecurityEvent("password_changed", { email: actor.email, ip: await ip(), detail: "các thiết bị khác đã bị đăng xuất" });
  logActivity("human", `${actor.name} đổi mật khẩu đăng nhập.`, "security");
  done(back, "Đã đổi mật khẩu. Các thiết bị khác đã bị đăng xuất.");
}

/** Đăng xuất mọi thiết bị (kể cả phiên đang dùng được cấp lại ngay). */
export async function logoutEverywhere() {
  const actor = await currentActor();
  revokeAllSessions(actor.email);
  await issueSession(actor.email);
  logSecurityEvent("sessions_revoked", { email: actor.email, ip: await ip() });
  logActivity("human", `${actor.name} đăng xuất mọi thiết bị.`, "security");
  done("/account", "Đã đăng xuất mọi thiết bị khác. Phiên này vẫn giữ.");
}

// ---- Xác thực hai lớp -------------------------------------------------------

export interface MfaState {
  error?: string;
  /** Chỉ hiện một lần ngay sau khi bật hoặc tạo lại. */
  backupCodes?: string[];
  message?: string;
}

/** Bước 1: tạo khóa, trang sẽ hiện QR. */
export async function startTotpSetup() {
  const actor = await currentActor();
  if (mfaRequired(actor.email)) return done("/account?tone=error#mfa", "Xác thực hai lớp đã bật.");
  beginTotpSetup(actor.email);
  done("/account#mfa", "Quét mã QR bằng ứng dụng xác thực rồi nhập mã 6 số để xác nhận.");
}

export async function cancelTotpSetupAction() {
  const actor = await currentActor();
  cancelTotpSetup(actor.email);
  done("/account#mfa", "Đã hủy thiết lập.");
}

/** Bước 2: nhập mã đầu tiên. Đúng thì bật và trả về mã dự phòng (hiện một lần). */
export async function confirmTotpAction(_prev: MfaState, fd: FormData): Promise<MfaState> {
  const actor = await currentActor();
  const rl = rateLimiter().check(`mfa-setup:${actor.email}`, RATE_RULES.mfa);
  if (!rl.ok) return { error: `Nhập sai quá nhiều. Thử lại sau ${Math.ceil(rl.retryAfterSec / 60)} phút.` };
  const r = confirmTotpSetup(actor.email, str(fd, "code"));
  if (!r.ok) return { error: r.error };
  rateLimiter().reset(`mfa-setup:${actor.email}`);
  logSecurityEvent("mfa_enabled", { email: actor.email, ip: await ip() });
  logActivity("human", `${actor.name} bật xác thực hai lớp.`, "security");
  revalidatePath("/account");
  return { backupCodes: r.backupCodes, message: "Đã bật xác thực hai lớp. Lưu các mã dự phòng dưới đây vào nơi an toàn; chúng chỉ hiện một lần." };
}

/** Tắt hai lớp: cần mật khẩu hiện tại và một mã (từ ứng dụng hoặc dự phòng). */
export async function disableTotpAction(_prev: MfaState, fd: FormData): Promise<MfaState> {
  const actor = await currentActor();
  if (!verifyLogin(actor.email, str(fd, "password"))) return { error: "Mật khẩu không đúng." };
  const rl = rateLimiter().check(`mfa-off:${actor.email}`, RATE_RULES.mfa);
  if (!rl.ok) return { error: `Nhập sai quá nhiều. Thử lại sau ${Math.ceil(rl.retryAfterSec / 60)} phút.` };
  const r = verifySecondFactor(actor.email, str(fd, "code"));
  if (!r.ok) {
    logSecurityEvent("mfa_fail", { email: actor.email, ip: await ip(), detail: "khi tắt hai lớp" });
    return { error: r.error };
  }
  disableTotp(actor.email);
  logSecurityEvent("mfa_disabled", { email: actor.email, ip: await ip() });
  logActivity("human", `${actor.name} tắt xác thực hai lớp.`, "security");
  revalidatePath("/account");
  return { message: "Đã tắt xác thực hai lớp. Nên bật lại sớm." };
}

/** Tạo lại 10 mã dự phòng (mã cũ hết hiệu lực): cần mật khẩu và mã từ ứng dụng. */
export async function regenerateBackupCodesAction(_prev: MfaState, fd: FormData): Promise<MfaState> {
  const actor = await currentActor();
  if (!verifyLogin(actor.email, str(fd, "password"))) return { error: "Mật khẩu không đúng." };
  const r = verifySecondFactor(actor.email, str(fd, "code"));
  if (!r.ok) return { error: r.error };
  const codes = regenerateBackupCodes(actor.email);
  logSecurityEvent("backup_codes_regenerated", { email: actor.email, ip: await ip() });
  revalidatePath("/account");
  return { backupCodes: codes, message: "Đã tạo mã dự phòng mới. Mã cũ không dùng được nữa." };
}
