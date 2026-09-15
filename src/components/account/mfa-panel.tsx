"use client";

import { useActionState, useState } from "react";
import { Copy, ShieldCheck, ShieldOff } from "lucide-react";
import { Field, inputClass } from "@/components/ui/field";
import { SubmitButton } from "@/components/campaigns/submit-button";
import { Button } from "@/components/ui/button";
import { cancelTotpSetupAction, confirmTotpAction, disableTotpAction, regenerateBackupCodesAction, startTotpSetup, type MfaState } from "@/lib/actions/account";

export interface MfaPanelProps {
  enabled: boolean;
  backupCodesLeft: number;
  /** Khóa đang chờ xác nhận: QR đã vẽ sẵn ở máy chủ và khóa base32 để nhập tay. */
  pending: { secret: string; svgDataUri: string } | null;
}

function Notice({ state }: { state: MfaState }) {
  if (state.error) return <div role="alert" className="rounded-md border border-brick/30 bg-brick-soft px-3 py-2 text-[12.5px] text-brick">{state.error}</div>;
  if (state.message) return <div className="rounded-md border border-jade/30 bg-jade-soft px-3 py-2 text-[12.5px] text-jade-ink">{state.message}</div>;
  return null;
}

function BackupCodes({ codes }: { codes: string[] }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="rounded-md border border-amber/40 bg-amber-soft p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[12.5px] font-semibold text-ink">Mã dự phòng (mỗi mã dùng một lần)</div>
        <button type="button" onClick={copy} className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border-2 bg-surface px-2 py-1 text-[12px] text-ink hover:bg-ground-2">
          <Copy size={13} aria-hidden /> {copied ? "Đã chép" : "Chép tất cả"}
        </button>
      </div>
      <ul className="num mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-[13.5px] text-ink sm:grid-cols-5">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <p className="mt-2 text-[12px] text-ink-2">In ra hoặc lưu vào trình quản lý mật khẩu. Đóng trang là không xem lại được; muốn có mã mới thì bấm “Tạo lại mã dự phòng”.</p>
    </div>
  );
}

export function MfaPanel({ enabled, backupCodesLeft, pending }: MfaPanelProps) {
  const [confirm, confirmAction] = useActionState(confirmTotpAction, {} as MfaState);
  const [off, offAction] = useActionState(disableTotpAction, {} as MfaState);
  const [regen, regenAction] = useActionState(regenerateBackupCodesAction, {} as MfaState);
  const [showRegen, setShowRegen] = useState(false);
  const [showOff, setShowOff] = useState(false);

  // Vừa bật xong: hiện mã dự phòng một lần, chưa cần hiện phần tắt.
  if (confirm.backupCodes) {
    return (
      <div className="grid gap-3 p-4">
        <Notice state={confirm} />
        <BackupCodes codes={confirm.backupCodes} />
      </div>
    );
  }

  if (!enabled && !pending) {
    return (
      <div className="grid gap-3 p-4">
        <p className="text-[13px] text-ink-2">Khi bật, mỗi lần đăng nhập cần thêm mã 6 số từ ứng dụng xác thực trên điện thoại (Google Authenticator, Authy, 1Password, Microsoft Authenticator). Có 10 mã dự phòng phòng khi mất điện thoại.</p>
        <Notice state={off} />
        <form action={startTotpSetup}>
          <SubmitButton pendingText="Đang tạo khóa…">Bắt đầu thiết lập</SubmitButton>
        </form>
      </div>
    );
  }

  if (!enabled && pending) {
    return (
      <div className="grid gap-3 p-4">
        <ol className="grid list-decimal gap-1 pl-5 text-[13px] text-ink-2">
          <li>Mở ứng dụng xác thực, chọn thêm tài khoản, quét mã QR.</li>
          <li>Nhập mã 6 số đang hiện trên ứng dụng để xác nhận.</li>
        </ol>
        <div className="flex flex-wrap items-start gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pending.svgDataUri} alt="Mã QR thiết lập xác thực hai lớp" width={200} height={200} className="rounded-md border border-border bg-white p-1" />
          <div className="min-w-0 flex-1 text-[12.5px] text-ink-2">
            <div>Không quét được thì nhập khóa này bằng tay (kiểu “theo thời gian”, 6 số, 30 giây):</div>
            <code className="num mt-1 block break-all rounded-md border border-border bg-ground-2 px-2 py-1.5 text-[13px] text-ink">{pending.secret.replace(/(.{4})/g, "$1 ").trim()}</code>
          </div>
        </div>
        <form action={confirmAction} className="grid gap-3">
          <Field label="Mã 6 số từ ứng dụng" required>
            <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" required className={`${inputClass} max-w-[200px] tracking-[0.3em]`} />
          </Field>
          <Notice state={confirm} />
          <div className="flex flex-wrap gap-2">
            <SubmitButton pendingText="Đang kiểm tra…">Xác nhận và bật</SubmitButton>
            <Button type="submit" variant="ghost" formAction={cancelTotpSetupAction} formNoValidate>Hủy</Button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="grid gap-3 p-4">
      <div className="flex items-center gap-2 text-[13px] text-ink">
        <ShieldCheck size={16} className="text-jade" aria-hidden />
        <span>Đang bật. Còn <span className="num font-semibold">{backupCodesLeft}</span> mã dự phòng{backupCodesLeft <= 2 ? " — nên tạo lại sớm" : ""}.</span>
      </div>
      <Notice state={regen} />
      {regen.backupCodes && <BackupCodes codes={regen.backupCodes} />}
      <Notice state={off} />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => { setShowRegen((v) => !v); setShowOff(false); }}>Tạo lại mã dự phòng</Button>
        <Button type="button" variant="ghost" onClick={() => { setShowOff((v) => !v); setShowRegen(false); }}><ShieldOff size={14} aria-hidden /> Tắt xác thực hai lớp</Button>
      </div>
      {showRegen && (
        <form action={regenAction} className="grid gap-3 rounded-md border border-border p-3">
          <input type="hidden" name="username" value="" autoComplete="username" />
          <Field label="Mật khẩu hiện tại" required><input name="password" type="password" required autoComplete="current-password" className={inputClass} /></Field>
          <Field label="Mã từ ứng dụng" required><input name="code" inputMode="numeric" autoComplete="one-time-code" required className={`${inputClass} max-w-[200px]`} /></Field>
          <div><SubmitButton pendingText="Đang tạo…">Tạo mã mới (mã cũ hết hiệu lực)</SubmitButton></div>
        </form>
      )}
      {showOff && (
        <form action={offAction} className="grid gap-3 rounded-md border border-brick/30 p-3">
          <p className="text-[12.5px] text-ink-2">Tắt sẽ làm tài khoản chỉ còn mật khẩu. Cần mật khẩu hiện tại và một mã (từ ứng dụng hoặc mã dự phòng).</p>
          <Field label="Mật khẩu hiện tại" required><input name="password" type="password" required autoComplete="current-password" className={inputClass} /></Field>
          <Field label="Mã xác thực" required><input name="code" autoComplete="one-time-code" required className={`${inputClass} max-w-[200px]`} /></Field>
          <div><SubmitButton variant="outline" pendingText="Đang tắt…">Tắt xác thực hai lớp</SubmitButton></div>
        </form>
      )}
    </div>
  );
}
