"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff, LoaderCircle, LockKeyhole, Mail, TriangleAlert } from "lucide-react";
import { loginAction, type LoginState } from "./actions";

const field =
  "h-11 w-full rounded-lg border border-border-2 bg-surface pl-10 pr-3 text-[14px] text-ink placeholder:text-ink-3 outline-none transition-[border-color,box-shadow] focus:border-jade focus:ring-4 focus:ring-jade/15 aria-[invalid=true]:border-brick";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, {} as LoginState);
  const [showPassword, setShowPassword] = useState(false);
  const invalid = Boolean(state.error);

  return (
    <form action={formAction} className="mt-6 space-y-4" noValidate>
      <div>
        <label htmlFor="email" className="lbl">
          Email
        </label>
        <div className="relative mt-1.5">
          <Mail aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
          <input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoFocus
            required
            defaultValue={state.email ?? ""}
            aria-invalid={invalid}
            placeholder="ban@email.com"
            className={field}
          />
        </div>
      </div>

      <div>
        <label htmlFor="password" className="lbl">
          Mật khẩu
        </label>
        <div className="relative mt-1.5">
          <LockKeyhole aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            aria-invalid={invalid}
            placeholder="••••••••"
            className={`${field} pr-11`}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
            aria-pressed={showPassword}
            className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 cursor-pointer place-items-center rounded-md text-ink-3 transition-colors hover:bg-ground-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-jade"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {state.error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-brick/30 bg-brick-soft px-3 py-2.5 text-[12.5px] text-brick"
        >
          <TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{state.error}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-jade text-[14px] font-semibold text-white shadow-[0_1px_0_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.15)] transition-colors hover:bg-jade-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jade disabled:cursor-progress disabled:opacity-70"
      >
        {pending ? (
          <>
            <LoaderCircle aria-hidden className="h-4 w-4 animate-spin" />
            Đang đăng nhập…
          </>
        ) : (
          "Đăng nhập"
        )}
      </button>

      <p className="text-center text-[12px] text-ink-3">
        Quên mật khẩu? Đặt lại trong <span className="font-medium text-ink-2">.env.local</span> trên máy chủ.
      </p>
    </form>
  );
}
