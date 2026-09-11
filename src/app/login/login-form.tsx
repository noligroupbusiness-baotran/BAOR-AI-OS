"use client";

import { useState } from "react";
import { useActionState } from "react";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { loginAction, type LoginState } from "./actions";

const input =
  "h-10 w-full rounded-md border border-border-2 bg-surface px-3 text-[13.5px] text-ink outline-none placeholder:text-ink-3 focus-visible:outline-2 focus-visible:outline-jade";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, {} as LoginState);
  const [show, setShow] = useState(false);
  return (
    <form action={formAction} className="space-y-4">
      <label className="block">
        <span className="lbl">Email</span>
        <input id="email" name="email" type="email" autoComplete="username" required autoFocus placeholder="ten@congty.vn" className={`${input} mt-1.5`} />
      </label>
      <label className="block">
        <span className="lbl">Mật khẩu</span>
        <span className="relative mt-1.5 block">
          <input id="password" name="password" type={show ? "text" : "password"} autoComplete="current-password" required placeholder="Nhập mật khẩu" className={`${input} pr-10`} />
          <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Ẩn mật khẩu" : "Hiện mật khẩu"} className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 cursor-pointer place-items-center rounded-md text-ink-3 hover:bg-ground-2 hover:text-ink">
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </span>
      </label>
      {state.error && (
        <div role="alert" className="rounded-md border border-brick/30 bg-brick-soft px-3 py-2 text-[12.5px] text-brick">{state.error}</div>
      )}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-jade text-[13.5px] font-semibold text-white transition-colors hover:bg-jade-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jade disabled:opacity-60"
      >
        <LogIn size={16} aria-hidden />
        {pending ? "Đang đăng nhập…" : "Đăng nhập"}
      </button>
    </form>
  );
}
