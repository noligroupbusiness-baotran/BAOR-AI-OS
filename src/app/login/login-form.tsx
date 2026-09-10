"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";

const initial: LoginState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initial);

  return (
    <form action={formAction} className="mt-5 space-y-3.5">
      <label className="block">
        <span className="eyebrow">Email</span>
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          placeholder="ban@email.com"
          className="mt-1 h-9 w-full rounded-lg border border-border-strong bg-bg-elevated px-3 text-[13px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </label>
      <label className="block">
        <span className="eyebrow">Mật khẩu</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="••••••••"
          className="mt-1 h-9 w-full rounded-lg border border-border-strong bg-bg-elevated px-3 text-[13px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </label>
      {state.error && (
        <div className="rounded-lg bg-red-soft px-3 py-2 text-[12px] text-red">{state.error}</div>
      )}
      <button
        type="submit"
        disabled={pending}
        className="h-9 w-full cursor-pointer rounded-full bg-primary text-[13px] font-semibold text-white transition-colors hover:bg-primary-strong disabled:opacity-60"
      >
        {pending ? "Đang đăng nhập…" : "Đăng nhập"}
      </button>
    </form>
  );
}
