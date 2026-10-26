"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { JOURNEY_STEPS, journeyDisplayStepFor } from "@/config/journey";
import { cn } from "@/lib/format";

// Thanh hành trình marketing 7 bước ở đầu mỗi trang của hành trình: thấy mình ở bước nào, bấm sang bước khác / bước tiếp.
export function JourneyBar() {
  const pathname = usePathname();
  const cur = journeyDisplayStepFor(pathname);
  if (!cur) return null;
  const next = JOURNEY_STEPS.find((s) => s.step > cur.step && s.href !== pathname);
  return (
    <nav aria-label="Hành trình marketing" className="card appear appear--soft mb-4 flex items-center gap-2 rounded-xl px-2.5 py-2">
      <ol className="m-0 flex min-w-0 flex-1 list-none items-center gap-1 overflow-x-auto p-0">
        {JOURNEY_STEPS.map((s) => {
          const active = s.step === cur.step;
          const done = s.step < cur.step;
          return (
            <li key={s.step} className="flex shrink-0 items-center gap-1">
              <Link
                href={s.href}
                aria-current={active ? "step" : undefined}
                title={`Bước ${s.step}: ${s.label}`}
                className={cn(
                  "flex h-8 items-center gap-1.5 px-2 text-[12.5px] font-medium",
                  active ? "metal-pill" : done ? "tab-pill text-jade-ink" : "tab-pill text-ink-3 hover:text-ink",
                )}
              >
                <span className={cn("num grid h-5 w-5 place-items-center rounded-full text-[11px] font-bold", active ? "bg-white/20" : done ? "bg-jade-soft" : "bg-ground-2")}>{s.step}</span>
                <span className={cn(active ? "inline" : "hidden lg:inline")}>{s.short}</span>
              </Link>
              {s.step < JOURNEY_STEPS.length && <span className="h-px w-2 bg-border-2 lg:w-3" aria-hidden />}
            </li>
          );
        })}
      </ol>
      {next && (
        <Link href={next.href} className="btn btn-glass flex h-8 shrink-0 items-center gap-1 px-3 text-[12.5px] font-semibold">
          <span className="hidden sm:inline">Bước {next.step}</span>
          <ArrowRight size={14} aria-hidden />
        </Link>
      )}
    </nav>
  );
}
