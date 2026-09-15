"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { clearMfaCookie, clearSessionCookie, getCurrentUser, getPendingMfa, issueSession, setMfaCookie } from "@/lib/auth";
import { verifyLogin } from "@/lib/admin";
import { clientIp, loginGuard } from "@/lib/login-guard";
import { logActivity } from "@/lib/activity";
import { RATE_RULES, rateLimiter } from "@/lib/rate-limit";
import { logSecurityEvent, mfaRequired, recordLogin, verifySecondFactor } from "@/lib/security";

export interface LoginState {
  error?: string;
}

async function requestIp(): Promise<string> {
  const h = await headers();
  return clientIp((n) => h.get(n));
}

// Bước 1: email + mật khẩu. Đúng và tài khoản có bật hai lớp thì sang /login/verify; không thì cấp phiên luôn.
export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const ip = await requestIp();
  const guard = loginGuard();
  const keys = [`email:${email}`, `ip:${ip}`];

  // Giới hạn tần suất theo IP (chặn quét hàng loạt email) bên cạnh khóa 5 lần sai theo email/IP.
  const rl = rateLimiter().check(`login:${ip}`, RATE_RULES.login);
  if (!rl.ok) {
    logSecurityEvent("rate_limited", { email, ip, detail: "đăng nhập" });
    return { error: `Quá nhiều lần đăng nhập từ địa chỉ này. Thử lại sau ${Math.ceil(rl.retryAfterSec / 60)} phút.` };
  }

  const locked = guard.lockedSeconds(keys);
  if (locked > 0) {
    return { error: `Đăng nhập sai quá nhiều lần. Thử lại sau ${Math.ceil(locked / 60)} phút.` };
  }
  if (!verifyLogin(email, password)) {
    const r = guard.fail(keys);
    logSecurityEvent("login_fail", { email, ip, detail: r.locked ? "khóa 15 phút" : `còn ${r.remaining} lần` });
    // Chỉ ghi nhật ký hoạt động khi bị khóa (mỗi lần sai đều ghi sẽ làm ngập Trung tâm thông báo); lần sai lẻ chỉ in ra log máy chủ.
    if (r.locked) {
      logSecurityEvent("login_locked", { email, ip });
      logActivity("system", `Khóa đăng nhập 15 phút cho ${email || "(trống)"} từ IP ${ip} sau 5 lần sai mật khẩu.`, "security");
    } else console.warn(`[BAOR] Đăng nhập sai cho ${email || "(trống)"} từ IP ${ip} (còn ${r.remaining} lần).`);
    guard.prune();
    return {
      error: r.locked
        ? "Đăng nhập sai quá nhiều lần. Tài khoản tạm khóa 15 phút."
        : `Email hoặc mật khẩu không đúng, hoặc tài khoản chưa được cấp quyền đăng nhập.${r.remaining <= 2 ? ` Còn ${r.remaining} lần thử.` : ""}`,
    };
  }
  guard.succeed(keys);
  if (mfaRequired(email)) {
    await setMfaCookie(email, ip);
    redirect("/login/verify");
  }
  await finishLogin(email, ip, "mật khẩu");
  redirect("/dashboard");
}

async function finishLogin(email: string, ip: string, how: string) {
  await issueSession(email);
  recordLogin(email, ip);
  logSecurityEvent("login_ok", { email, ip, detail: how });
}

// Bước 2: mã 6 số từ ứng dụng xác thực hoặc một mã dự phòng.
export async function verifyMfaAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const pending = await getPendingMfa();
  if (!pending) redirect("/login");
  const ip = await requestIp();
  const code = String(formData.get("code") ?? "").trim();
  const rl = rateLimiter().check(`mfa:${pending.email}`, RATE_RULES.mfa);
  if (!rl.ok) {
    logSecurityEvent("rate_limited", { email: pending.email, ip, detail: "mã xác thực hai lớp" });
    await clearMfaCookie();
    redirect("/login");
  }
  const r = verifySecondFactor(pending.email, code);
  if (!r.ok) {
    logSecurityEvent("mfa_fail", { email: pending.email, ip });
    return { error: r.error };
  }
  rateLimiter().reset(`mfa:${pending.email}`);
  await clearMfaCookie();
  await finishLogin(pending.email, ip, r.method === "backup" ? `mã dự phòng (còn ${r.backupCodesLeft})` : "mật khẩu + mã xác thực");
  redirect("/dashboard");
}

export async function cancelMfaAction() {
  await clearMfaCookie();
  redirect("/login");
}

export async function logoutAction() {
  const u = await getCurrentUser();
  if (u) logSecurityEvent("logout", { email: u.email, ip: await requestIp() });
  await clearSessionCookie();
  redirect("/login");
}
