"use server";

import { redirect } from "next/navigation";
import { clearSessionCookie, createSessionToken, setSessionCookie } from "@/lib/auth";
import { verifyAdmin } from "@/lib/admin";

export interface LoginState {
  error?: string;
  // Giữ lại email đã nhập để người dùng không phải gõ lại khi sai mật khẩu.
  email?: string;
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) return { error: "Vui lòng nhập đủ email và mật khẩu.", email };
  if (!verifyAdmin(email, password)) return { error: "Email hoặc mật khẩu không đúng.", email };

  await setSessionCookie(await createSessionToken(email.toLowerCase()));
  redirect("/dashboard");
}

export async function logoutAction() {
  await clearSessionCookie();
  redirect("/login");
}
