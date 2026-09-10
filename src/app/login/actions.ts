"use server";

import { redirect } from "next/navigation";
import {
  clearSessionCookie,
  createSessionToken,
  setSessionCookie,
  verifyCredentials,
} from "@/lib/auth";

export interface LoginState {
  error?: string;
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  if (!verifyCredentials(email, password)) {
    return { error: "Email hoặc mật khẩu không đúng." };
  }

  const token = await createSessionToken(email.trim().toLowerCase());
  await setSessionCookie(token);
  redirect("/dashboard");
}

export async function logoutAction() {
  await clearSessionCookie();
  redirect("/login");
}
