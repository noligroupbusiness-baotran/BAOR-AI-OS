"use client";

import { useActionState } from "react";
import { generateWorkerKeyAction } from "@/lib/actions/settings";

// Tạo khoá máy dựng: khoá chỉ hiện ở đây, một lần (máy chủ chỉ giữ mã băm). Dán vào .env.render-worker trên máy dựng.
export function WorkerKeyForm({ hasKey }: { hasKey: boolean }) {
  const [state, action, pending] = useActionState(generateWorkerKeyAction, {});
  return (
    <form action={action} className="grid gap-2">
      <div>
        <button type="submit" disabled={pending} className="h-8 rounded-full bg-jade px-3.5 text-[12.5px] font-semibold text-white hover:opacity-90 disabled:opacity-60">
          {pending ? "Đang tạo…" : hasKey ? "Tạo khoá mới (thu hồi khoá cũ)" : "Tạo khoá máy dựng"}
        </button>
      </div>
      {state.key && (
        <div className="rounded-md border border-amber/40 bg-amber-soft px-3 py-2 text-[12.5px] text-ink">
          <div className="font-semibold">Chép khoá này ngay — sẽ không hiện lại:</div>
          <code className="mt-1 block break-all select-all text-[12px]">{state.key}</code>
          <div className="mt-1 text-ink-2">Dán vào tệp <code>.env.render-worker</code> trên máy dựng: <code>BAOR_WORKER_KEY=…</code></div>
        </div>
      )}
    </form>
  );
}
