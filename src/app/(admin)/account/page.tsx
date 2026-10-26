import Link from "next/link";
import { PageHead, Panel, PanelHeader } from "@/components/ui/card";
import { Breadcrumb } from "@/components/shell/module-page";
import { Field, inputClass } from "@/components/ui/field";
import { SubmitButton } from "@/components/campaigns/submit-button";
import { MfaPanel } from "@/components/account/mfa-panel";
import { currentActor } from "@/lib/permissions";
import { permissionLabel } from "@/lib/catalog/repository";
import { changeMyPassword, logoutEverywhere } from "@/lib/actions/account";
import { listSecurityEvents, securityAccount, securityPosture } from "@/lib/security";
import { pendingTotpQr } from "@/lib/mfa-qr";
import { PASSWORD_MIN_LENGTH } from "@/lib/password-policy";
import { cn, formatDateTime } from "@/lib/format";

export const metadata = { title: "Tài khoản của tôi – BAOR AI OS" };

// Trang cá nhân: ai đăng nhập cũng xem được thông tin, tự đổi mật khẩu, bật xác thực hai lớp,
// đăng xuất mọi thiết bị và xem sự kiện bảo mật của mình. Tên, vai trò, quyền do Quản trị làm trong Cài đặt › Nhân sự.
export default async function AccountPage() {
  const actor = await currentActor();
  const account = securityAccount(actor.email);
  const pending = account.totpEnabled ? null : await pendingTotpQr(actor.email);
  const events = listSecurityEvents({ email: actor.email, limit: 15 });
  const posture = actor.permission === "admin" ? securityPosture() : [];
  const dot = (level: "ok" | "warn" | "error") => (level === "error" ? "bg-brick" : level === "warn" ? "bg-amber" : "bg-jade");

  return (
    <>
      <Breadcrumb items={[{ label: "Tổng quan", href: "/dashboard" }, { label: "Tài khoản của tôi" }]} />
      <PageHead title="Tài khoản của tôi" sub="Thông tin đăng nhập, mật khẩu và xác thực hai lớp của bạn. Tên, vai trò và quyền do Quản trị đặt trong Cài đặt › Nhân sự." />

      <div className="grid gap-3.5 md:grid-cols-2">
        <Panel>
          <PanelHeader title="Thông tin" />
          <dl className="grid gap-2 p-4 text-[13px]">
            <div className="grid grid-cols-[130px_1fr] gap-2"><dt className="text-ink-3">Họ tên</dt><dd className="font-semibold text-ink">{actor.name}</dd></div>
            <div className="grid grid-cols-[130px_1fr] gap-2"><dt className="text-ink-3">Email</dt><dd className="text-ink">{actor.email}</dd></div>
            <div className="grid grid-cols-[130px_1fr] gap-2"><dt className="text-ink-3">Vai trò</dt><dd className="text-ink">{actor.role}</dd></div>
            <div className="grid grid-cols-[130px_1fr] gap-2"><dt className="text-ink-3">Quyền</dt><dd className="text-ink">{permissionLabel[actor.permission].label} · {permissionLabel[actor.permission].hint}</dd></div>
            <div className="grid grid-cols-[130px_1fr] gap-2"><dt className="text-ink-3">Đăng nhập gần nhất</dt><dd className="text-ink">{account.lastLoginAt ? <>{formatDateTime(account.lastLoginAt)}{account.lastLoginIp ? <span className="text-ink-3"> · IP {account.lastLoginIp}</span> : null}</> : <span className="text-ink-3">Chưa ghi nhận</span>}</dd></div>
            <div className="grid grid-cols-[130px_1fr] gap-2"><dt className="text-ink-3">Xác thực hai lớp</dt><dd className={cn("font-medium", account.totpEnabled ? "text-jade-ink" : "text-amber")}>{account.totpEnabled ? "Đang bật" : "Chưa bật"}</dd></div>
          </dl>
          {actor.permission === "admin" && (
            <div className="border-t border-border px-4 py-2.5 text-[12px] text-ink-2">
              Bạn là tài khoản quản trị. Đổi email đăng nhập ở <Link href="/settings#account" className="font-medium text-jade hover:underline">Cài đặt › Tài khoản quản trị</Link>.
            </div>
          )}
          <form action={logoutEverywhere} className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2.5">
            <span className="text-[12px] text-ink-2">Nghi ngờ tài khoản bị dùng ở nơi khác? Đăng xuất mọi thiết bị, phiên này vẫn giữ.</span>
            <SubmitButton variant="outline" pendingText="Đang thu hồi…">Đăng xuất mọi thiết bị</SubmitButton>
          </form>
        </Panel>

        <Panel>
          <PanelHeader title="Đổi mật khẩu" sub={`Cần mật khẩu hiện tại. Mật khẩu mới ít nhất ${PASSWORD_MIN_LENGTH} ký tự, không chứa tên hay email. Đổi xong, các thiết bị khác bị đăng xuất.`} />
          <form action={changeMyPassword} className="grid gap-3 p-4">
            <input type="hidden" name="username" value={actor.email} autoComplete="username" />
            <Field label="Mật khẩu hiện tại" required><input name="current" type="password" required autoComplete="current-password" className={inputClass} /></Field>
            <Field label="Mật khẩu mới" required><input name="password" type="password" required minLength={PASSWORD_MIN_LENGTH} autoComplete="new-password" className={inputClass} /></Field>
            <Field label="Nhập lại mật khẩu mới" required><input name="confirm" type="password" required minLength={PASSWORD_MIN_LENGTH} autoComplete="new-password" className={inputClass} /></Field>
            <div><SubmitButton pendingText="Đang lưu…">Đổi mật khẩu</SubmitButton></div>
          </form>
        </Panel>
      </div>

      <Panel id="mfa" className="scroll-mt-20">
        <PanelHeader title="Xác thực hai lớp" sub="Lớp bảo vệ thứ hai ngoài mật khẩu: mã 6 số từ ứng dụng xác thực trên điện thoại. Bắt buộc nên bật với tài khoản Quản trị và Quản lý." />
        <MfaPanel enabled={account.totpEnabled} backupCodesLeft={account.backupCodesLeft} pending={pending} />
      </Panel>

      {posture.length > 0 && (
        <Panel>
          <PanelHeader title="Tình trạng bảo mật hệ thống" sub="Chỉ Quản trị thấy mục này. Điểm đỏ cần xử lý trước khi chạy thật; điểm vàng nên làm sớm." />
          <ul className="m-0 list-none p-0">
            {posture.map((p, i) => (
              <li key={i} className="flex items-start gap-2.5 border-b border-border px-4 py-2.5 text-[12.5px] last:border-b-0">
                <span className={cn("mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full", dot(p.level))} aria-hidden />
                <span className="text-ink">{p.text}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel>
        <PanelHeader title="Sự kiện bảo mật gần đây" sub="Đăng nhập, đăng nhập sai, khóa tạm, đổi mật khẩu, xác thực hai lớp của tài khoản này." />
        {events.length === 0 ? (
          <div className="px-4 py-3 text-[12.5px] text-ink-2">Chưa có sự kiện bảo mật nào.</div>
        ) : (
          <ul className="m-0 list-none p-0">
            {events.map((e) => (
              <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-border px-4 py-2.5 text-[12.5px] last:border-b-0">
                <span className="num shrink-0 text-ink-3">{formatDateTime(e.at)}</span>
                <span className={cn("font-medium", e.kind === "login_fail" || e.kind === "login_locked" || e.kind === "mfa_fail" || e.kind === "rate_limited" ? "text-brick" : "text-ink")}>{e.label}</span>
                {e.detail && <span className="text-ink-2">{e.detail}</span>}
                {e.ip && <span className="num text-ink-3">IP {e.ip}</span>}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
