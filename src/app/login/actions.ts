"use server";

import { redirect } from "next/navigation";
import { clearSessionCookie, createSessionToken, setSessionCookie } from "@/lib/auth";
import { verifyLogin } from "@/lib/admin";

export interface LoginState {
  error?: string;
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!verifyLogin(email, password)) return { error: "Email hoặc mật khẩu không đúng, hoặc tài khoản chưa được cấp quyền đăng nhập." };
  await setSessionCookie(await createSessionToken(email.trim().toLowerCase()));
  redirect("/dashboard");
}

export async function logoutAction() {
  await clearSessionCookie();
  redirect("/login");
}
