import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Panel, PanelHeader } from "@/components/ui/card";
import { cn } from "@/lib/format";
import type { PostStatus } from "@/lib/types";

// Lịch tháng cho Đăng bài: mỗi ô ngày liệt kê bài theo giờ Việt Nam, màu theo trạng thái.
// Không dùng thư viện ngoài; tuần bắt đầu thứ hai; ngày hôm nay có viền jade.
export interface CalendarPost {
  id: string;
  title: string;
  at: string; // ISO
  platforms: string[];
  status: PostStatus;
}

const TZ = "Asia/Ho_Chi_Minh";
const ymd = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(d);
const hm = (iso: string) => new Intl.DateTimeFormat("vi-VN", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

const dot: Record<PostStatus, string> = { scheduled: "bg-sky", publishing: "bg-amber", published: "bg-jade", failed: "bg-brick" };

export function monthOf(value: string | undefined, now = new Date()): string {
  return value && /^\d{4}-\d{2}$/.test(value) ? value : ymd(now).slice(0, 7);
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function MonthCalendar({ month, posts, hrefFor }: { month: string; posts: CalendarPost[]; hrefFor: (month: string) => string }) {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  // Thứ hai = 0 … chủ nhật = 6
  const lead = (first.getUTCDay() + 6) % 7;
  const cells: (string | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
  while (cells.length % 7) cells.push(null);
  const today = ymd(new Date());
  const byDay = new Map<string, CalendarPost[]>();
  for (const p of posts) {
    const day = ymd(new Date(p.at));
    if (!day.startsWith(month)) continue;
    byDay.set(day, [...(byDay.get(day) ?? []), p]);
  }
  for (const list of byDay.values()) list.sort((a, b) => a.at.localeCompare(b.at));
  const total = [...byDay.values()].reduce((n, l) => n + l.length, 0);
  const label = new Intl.DateTimeFormat("vi-VN", { timeZone: TZ, month: "long", year: "numeric" }).format(new Date(Date.UTC(y, m - 1, 15)));

  return (
    <Panel>
      <PanelHeader
        title={`Lịch tháng · ${label}`}
        sub={`${total} lượt đăng trong tháng. Bấm vào bài để mở nội dung gốc.`}
        action={
          <div className="flex items-center gap-1">
            <Link href={hrefFor(shiftMonth(month, -1))} aria-label="Tháng trước" className="grid h-7 w-7 place-items-center rounded-md border border-border-2 text-ink-2 hover:bg-ground-2 hover:text-ink"><ChevronLeft size={15} /></Link>
            <Link href={hrefFor(ymd(new Date()).slice(0, 7))} className="h-7 rounded-md border border-border-2 px-2.5 text-[12px] font-medium leading-7 text-ink hover:bg-ground-2">Tháng này</Link>
            <Link href={hrefFor(shiftMonth(month, 1))} aria-label="Tháng sau" className="grid h-7 w-7 place-items-center rounded-md border border-border-2 text-ink-2 hover:bg-ground-2 hover:text-ink"><ChevronRight size={15} /></Link>
          </div>
        }
      />
      <div className="overflow-x-auto">
        <div className="min-w-[760px]">
          <div className="grid grid-cols-7 border-b border-border text-[11px] font-semibold uppercase tracking-wide text-ink-3">
            {["Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy", "Chủ nhật"].map((d) => <div key={d} className="px-2 py-1.5">{d}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((day, i) => {
              const list = day ? byDay.get(day) ?? [] : [];
              const isToday = day === today;
              return (
                <div key={i} className={cn("min-h-[104px] border-b border-r border-border p-1.5 [&:nth-child(7n)]:border-r-0", !day && "bg-ground/60", isToday && "bg-jade-soft/30")}>
                  {day && (
                    <>
                      <div className={cn("num mb-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11.5px]", isToday ? "bg-jade font-semibold text-white" : "text-ink-2")}>{Number(day.slice(8))}</div>
                      <ul className="m-0 grid list-none gap-0.5 p-0">
                        {list.slice(0, 3).map((p) => (
                          <li key={p.id}>
                            <Link href={`/content?tab=done&open=${p.id.split("::")[0]}`} title={`${hm(p.at)} · ${p.title} · ${p.platforms.join(", ")}`} className="flex items-center gap-1.5 rounded px-1 py-0.5 text-[11.5px] text-ink hover:bg-surface">
                              <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dot[p.status])} aria-hidden />
                              <span className="num shrink-0 text-ink-3">{hm(p.at)}</span>
                              <span className="truncate">{p.title}</span>
                            </Link>
                          </li>
                        ))}
                        {list.length > 3 && <li className="px-1 text-[11px] text-ink-3">và {list.length - 3} bài khác</li>}
                      </ul>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-2 text-[11.5px] text-ink-2">
        <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-sky" /> Chờ đăng</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-amber" /> Đang đăng</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-jade" /> Đã đăng</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-brick" /> Lỗi</span>
      </div>
    </Panel>
  );
}
