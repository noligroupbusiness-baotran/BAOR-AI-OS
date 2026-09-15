"use client";

import { useActionState } from "react";
import { KeyRound } from "lucide-react";
import { cancelMfaAction, verifyMfaAction, type LoginState } from "../actions";

const input =
  "h-11 w-full rounded-md border border-border-2 bg-surface px-3 text-center text-[18px] tracking-[0.3em] text-ink outline-none placeholder:tracking-normal placeholder:text-ink-3 focus-visible:outline-2 focus-visible:outline-jade";

export function VerifyForm() {
  const [state, formAction, pending] = useActionState(verifyMfaAction, {} as LoginState);
  return (
    <form action={formAction} className="space-y-4">
      <label className="block">
        <span className="lbl">Mã xác thực</span>
        <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" required autoFocus placeholder="6 số hoặc mã dự phòng" className={`${input} mt-1.5`} />
      </label>
      {state.error && (
        <div role="alert" className="rounded-md border border-brick/30 bg-brick-soft px-3 py-2 text-[12.5px] text-brick">{state.error}</div>
      )}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-jade text-[13.5px] font-semibold text-white transition-colors hover:bg-jade-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jade disabled:opacity-60"
      >
        <KeyRound size={16} aria-hidden />
        {pending ? "Đang kiểm tra…" : "Xác nhận"}
      </button>
      <button type="submit" formAction={cancelMfaAction} formNoValidate className="block w-full cursor-pointer text-center text-[12.5px] text-ink-3 hover:text-ink hover:underline">
        Quay lại đăng nhập bằng tài khoản khác
      </button>
    </form>
  );
}
