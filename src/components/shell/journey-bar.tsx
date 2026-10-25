"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { JOURNEY, journeyStepFor } from "@/config/journey";
import { cn } from "@/lib/format";

// Thanh hành trình marketing 8 bước ở đầu mỗi trang của hành trình: thấy mình ở bước nào, bấm sang bước khác / bước tiếp.
export function JourneyBar() {
  const pathname = usePathname();
  const cur = journeyStepFor(pathname);
  if (!cur) return null;
  // Bước kế dùng chung trang với bước hiện tại (bước 1 → 2 đều ở Nghiên cứu): không hiện nút "tiếp" dẫn về chính trang này
  const next = JOURNEY.find((s) => s.n > cur.n && s.href !== pathname);
  return (
    <nav aria-label="Hành trình marketing" className="mb-4 flex items-center gap-2 rounded-xl border border-border bg-surface px-2.5 py-2">
      <ol className="m-0 flex min-w-0 flex-1 list-none items-center gap-1 overflow-x-auto p-0">
        {JOURNEY.map((s) => {
          const active = s.n === cur.n;
          const done = s.n < cur.n;
          return (
            <li key={s.n} className="flex shrink-0 items-center gap-1">
              <Link
                href={s.href}
                aria-current={active ? "step" : undefined}
                title={`Bước ${s.n}: ${s.label}`}
                className={cn(
                  "flex h-8 items-center gap-1.5 rounded-full px-2 text-[12.5px] font-medium transition-colors",
                  active ? "bg-jade text-white" : done ? "text-jade-ink hover:bg-jade-soft/60" : "text-ink-3 hover:bg-ground-2 hover:text-ink",
                )}
              >
                <span className={cn("num grid h-5 w-5 place-items-center rounded-full text-[11px] font-bold", active ? "bg-white/25" : done ? "bg-jade-soft" : "bg-ground-2")}>{s.n}</span>
                <span className={cn(active ? "inline" : "hidden lg:inline")}>{s.short}</span>
              </Link>
              {s.n < JOURNEY.length && <span className="h-px w-2 bg-border-2 lg:w-3" aria-hidden />}
            </li>
          );
        })}
      </ol>
      {next && (
        <Link href={next.href} className="flex h-8 shrink-0 items-center gap-1 rounded-full border border-border-2 px-3 text-[12.5px] font-semibold text-ink hover:bg-ground-2">
          <span className="hidden sm:inline">Bước {next.n}</span>
          <ArrowRight size={14} aria-hidden />
        </Link>
      )}
    </nav>
  );
}
