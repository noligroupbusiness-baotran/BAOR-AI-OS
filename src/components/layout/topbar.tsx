import { MiniStat } from "@/components/ui/stat";
import { logoutAction } from "@/app/login/actions";

export function Topbar({ email }: { email: string }) {
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center gap-6 border-b border-border bg-bg/90 px-5 backdrop-blur">
      <div className="flex items-center gap-6">
        <MiniStat label="Chi phí AI tháng này" value="$42,18" sub="anthropic · claude-opus-5" />
        <MiniStat label="Lưu trữ" value="local" sub="postgres · s3" />
        <MiniStat label="Ngân sách ads" value="35%" sub="4,25 / 12 triệu" />
      </div>
      <div className="ml-auto flex items-center gap-3">
        <div className="hidden items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-[12px] text-muted lg:flex">
          <span className="text-faint">⌘K</span>
          <span>Tìm nội dung, lead, chiến dịch…</span>
        </div>
        <div className="flex items-center gap-2 text-[12px]">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gold-soft text-[12px] font-bold text-gold">
            {email.slice(0, 1).toUpperCase()}
          </div>
          <span className="hidden max-w-[180px] truncate text-muted sm:inline">{email}</span>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="cursor-pointer rounded-full border border-border bg-surface px-2.5 py-1 text-[11.5px] text-muted hover:text-ink"
          >
            Đăng xuất
          </button>
        </form>
      </div>
    </header>
  );
}
