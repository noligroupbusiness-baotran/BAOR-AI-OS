"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { clearSessionCookie, createSessionToken, setSessionCookie } from "@/lib/auth";
import { verifyLogin } from "@/lib/admin";
import { clientIp, loginGuard } from "@/lib/login-guard";
import { logActivity } from "@/lib/activity";

export interface LoginState {
  error?: string;
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const h = await headers();
  const ip = clientIp((n) => h.get(n));
  const guard = loginGuard();
  const keys = [`email:${email}`, `ip:${ip}`];

  const locked = guard.lockedSeconds(keys);
  if (locked > 0) {
    return { error: `Đăng nhập sai quá nhiều lần. Thử lại sau ${Math.ceil(locked / 60)} phút.` };
  }
  if (!verifyLogin(email, password)) {
    const r = guard.fail(keys);
    if (r.locked) logActivity("system", `Khóa đăng nhập 15 phút cho ${email || "(trống)"} từ IP ${ip} vì sai mật khẩu liên tiếp.`, "security");
    else logActivity("system", `Đăng nhập sai cho ${email || "(trống)"} từ IP ${ip}.`, "security");
    guard.prune();
    return {
      error: r.locked
        ? "Đăng nhập sai quá nhiều lần. Tài khoản tạm khóa 15 phút."
        : `Email hoặc mật khẩu không đúng, hoặc tài khoản chưa được cấp quyền đăng nhập.${r.remaining <= 2 ? ` Còn ${r.remaining} lần thử.` : ""}`,
    };
  }
  guard.succeed(keys);
  await setSessionCookie(await createSessionToken(email));
  redirect("/dashboard");
}

export async function logoutAction() {
  await clearSessionCookie();
  redirect("/login");
}
