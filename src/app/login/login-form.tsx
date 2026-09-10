"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";

const input =
  "mt-1 h-9 w-full rounded-md border border-border-2 bg-surface px-3 text-[13px] text-ink outline-none focus-visible:outline-2 focus-visible:outline-jade";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, {} as LoginState);
  return (
    <form action={formAction} className="mt-5 space-y-3.5">
      <label className="block">
        <span className="lbl">Email</span>
        <input id="email" name="email" type="email" autoComplete="username" required placeholder="ban@email.com" className={input} />
      </label>
      <label className="block">
        <span className="lbl">Mật khẩu</span>
        <input id="password" name="password" type="password" autoComplete="current-password" required placeholder="••••••••" className={input} />
      </label>
      {state.error && <div className="rounded-md bg-brick-soft px-3 py-2 text-[12px] text-brick">{state.error}</div>}
      <button
        type="submit"
        disabled={pending}
        className="h-9 w-full cursor-pointer rounded-full bg-jade text-[13px] font-semibold text-white transition-colors hover:bg-jade-2 disabled:opacity-60"
      >
        {pending ? "Đang đăng nhập…" : "Đăng nhập"}
      </button>
    </form>
  );
}
