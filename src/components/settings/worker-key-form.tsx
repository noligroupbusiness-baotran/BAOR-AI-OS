"use client";

import { useActionState } from "react";
import { generateWorkerKeyAction } from "@/lib/actions/settings";

// Tạo khoá máy dựng: khoá chỉ hiện ở đây, một lần (máy chủ chỉ giữ mã băm). Kèm một lệnh dán vào Terminal của máy dựng:
// ghi ~/.baor/render-worker.env (chỉ chủ máy đọc được) — máy dựng chạy nền tự nhận trong 1 phút, không cần cài lại.
export function setupCommand(origin: string, key: string): string {
  const q = (v: string) => `'${v.replace(/'/g, "'\\''")}'`;
  return `mkdir -p ~/.baor && chmod 700 ~/.baor && printf 'BAOR_REMOTE_URL=%s\\nBAOR_WORKER_KEY=%s\\n' ${q(origin)} ${q(key)} > ~/.baor/render-worker.env && chmod 600 ~/.baor/render-worker.env && echo "Đã lưu khoá máy dựng"`;
}

export function WorkerKeyForm({ hasKey }: { hasKey: boolean }) {
  const [state, action, pending] = useActionState(generateWorkerKeyAction, {});
  return (
    <form action={action} className="grid gap-2">
      <div>
        <button type="submit" disabled={pending} title={hasKey ? "Tạo khoá mới (thu hồi khoá cũ)" : "Tạo khoá máy dựng"} className="btn btn-primary h-8 px-3.5 text-[12.5px] font-semibold disabled:opacity-60">
          {pending ? "Đang tạo…" : hasKey ? "Tạo khoá mới" : "Tạo khoá"}
        </button>
      </div>
      {state.key && (
        <div className="rounded-md border border-amber/40 bg-amber-soft px-3 py-2 text-[12.5px] text-ink">
          <div className="font-semibold">Dán lệnh này vào Terminal trên máy dựng — khoá sẽ không hiện lại:</div>
          <code className="mt-1 block break-all select-all text-[12px]">{setupCommand(window.location.origin, state.key)}</code>
          <div className="mt-1 text-ink-2">Máy dựng chạy nền tự nhận khoá trong khoảng 1 phút. Khoá riêng: <code className="break-all select-all">{state.key}</code></div>
        </div>
      )}
    </form>
  );
}
