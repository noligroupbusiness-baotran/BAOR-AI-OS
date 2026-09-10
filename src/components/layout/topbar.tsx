import { logoutAction } from "@/app/login/actions";

export function Topbar({ email }: { email: string }) {
  return (
    <div className="flex items-center justify-end gap-3 px-7 pt-3 text-[12px] text-ink-2">
      <span className="truncate">{email}</span>
      <form action={logoutAction}>
        <button
          type="submit"
          className="h-7 cursor-pointer rounded-full border border-border-2 bg-surface px-3 text-[12px] font-medium text-ink hover:border-ink-3"
        >
          Đăng xuất
        </button>
      </form>
    </div>
  );
}
