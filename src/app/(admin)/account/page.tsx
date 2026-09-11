import Link from "next/link";
import { desc, like } from "drizzle-orm";
import { PageHead, Panel, PanelHeader } from "@/components/ui/card";
import { Breadcrumb } from "@/components/shell/module-page";
import { Field, inputClass } from "@/components/ui/field";
import { SubmitButton } from "@/components/campaigns/submit-button";
import { currentActor } from "@/lib/permissions";
import { permissionLabel } from "@/lib/catalog/repository";
import { changeMyPassword } from "@/lib/actions/account";
import { getDb, schema } from "@/db";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Tài khoản của tôi – BAOR AI OS" };

// Trang cá nhân: ai đăng nhập cũng xem được thông tin và tự đổi mật khẩu.
// Đổi tên, vai trò, quyền do Quản trị làm trong Cài đặt › Nhân sự.
export default async function AccountPage() {
  const actor = await currentActor();
  // Nhật ký bảo mật liên quan tới chính tài khoản này (đổi mật khẩu, bị khóa đăng nhập).
  const security = getDb()
    .select()
    .from(schema.activity)
    .where(like(schema.activity.message, `%${actor.email}%`))
    .orderBy(desc(schema.activity.at))
    .limit(5)
    .all()
    .filter((a) => a.step === "security");

  return (
    <>
      <Breadcrumb items={[{ label: "Điều hành", href: "/dashboard" }, { label: "Tài khoản của tôi" }]} />
      <PageHead title="Tài khoản của tôi" sub="Thông tin đăng nhập và mật khẩu của bạn. Tên, vai trò và quyền do Quản trị đặt trong Cài đặt › Nhân sự." />

      <div className="grid gap-3.5 md:grid-cols-2">
        <Panel>
          <PanelHeader title="Thông tin" />
          <dl className="grid gap-2 p-4 text-[13px]">
            <div className="grid grid-cols-[110px_1fr] gap-2"><dt className="text-ink-3">Họ tên</dt><dd className="font-semibold text-ink">{actor.name}</dd></div>
            <div className="grid grid-cols-[110px_1fr] gap-2"><dt className="text-ink-3">Email</dt><dd className="text-ink">{actor.email}</dd></div>
            <div className="grid grid-cols-[110px_1fr] gap-2"><dt className="text-ink-3">Vai trò</dt><dd className="text-ink">{actor.role}</dd></div>
            <div className="grid grid-cols-[110px_1fr] gap-2"><dt className="text-ink-3">Quyền</dt><dd className="text-ink">{permissionLabel[actor.permission].label} · {permissionLabel[actor.permission].hint}</dd></div>
          </dl>
          {actor.permission === "admin" && (
            <div className="border-t border-border px-4 py-2.5 text-[12px] text-ink-2">
              Bạn là tài khoản quản trị. Đổi email đăng nhập ở <Link href="/settings#account" className="font-medium text-jade hover:underline">Cài đặt › Tài khoản quản trị</Link>.
            </div>
          )}
        </Panel>

        <Panel>
          <PanelHeader title="Đổi mật khẩu" sub="Cần mật khẩu hiện tại. Mật khẩu mới ít nhất 8 ký tự." />
          <form action={changeMyPassword} className="grid gap-3 p-4">
            <input type="hidden" name="username" value={actor.email} autoComplete="username" />
            <Field label="Mật khẩu hiện tại" required><input name="current" type="password" required autoComplete="current-password" className={inputClass} /></Field>
            <Field label="Mật khẩu mới" required><input name="password" type="password" required minLength={8} autoComplete="new-password" className={inputClass} /></Field>
            <Field label="Nhập lại mật khẩu mới" required><input name="confirm" type="password" required minLength={8} autoComplete="new-password" className={inputClass} /></Field>
            <div><SubmitButton pendingText="Đang lưu…">Đổi mật khẩu</SubmitButton></div>
          </form>
        </Panel>
      </div>

      <Panel>
        <PanelHeader title="Bảo mật gần đây" sub="Lần đổi mật khẩu và lần bị khóa đăng nhập của tài khoản này." />
        {security.length === 0 ? (
          <div className="px-4 py-3 text-[12.5px] text-ink-2">Chưa có sự kiện bảo mật nào.</div>
        ) : (
          <ul className="m-0 list-none p-0">
            {security.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-border px-4 py-2.5 text-[12.5px] last:border-b-0">
                <span className="num shrink-0 text-ink-3">{formatDateTime(a.at)}</span>
                <span className="text-ink">{a.message}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
