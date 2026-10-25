import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Panel, PanelHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PendingRow } from "@/components/dashboard/pending-row";
import { PendingAllButton } from "@/components/dashboard/pending-all";
import { getPending } from "@/lib/dashboard-data";
import { journeyCards } from "@/lib/brand/journey";
import { cn } from "@/lib/format";

export const metadata = { title: "Hành trình marketing – BAOR AI OS" };

const stateDot = { done: "bg-jade", working: "bg-sky", waiting: "bg-amber", not_started: "bg-border-2" } as const;

// Trang chính = hành trình marketing 8 bước (sơ đồ Personal Brand System): ít chữ, mỗi bước một nút bấm.
export default async function JourneyHome() {
  const cards = journeyCards();
  const pending = getPending();
  const next = cards.find((c) => c.state === "waiting") ?? cards.find((c) => c.state === "not_started");
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-[22px] font-bold tracking-[-0.01em] text-ink">Hành trình marketing</h1>
        {next && (
          <Link href={next.go} className="flex h-9 items-center gap-1.5 rounded-full bg-jade px-4 text-[13px] font-semibold text-white hover:opacity-90">
            Làm tiếp: bước {next.n} · {next.label} <ArrowRight size={15} aria-hidden />
          </Link>
        )}
      </div>

      <ol className="m-0 mt-4 grid list-none gap-3 p-0 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <li key={c.n} className="card flex flex-col gap-2 p-4">
            <div className="flex items-center gap-2">
              <span className="num grid h-7 w-7 place-items-center rounded-full bg-ground-2 text-[13px] font-bold text-ink">{c.n}</span>
              <span className="flex-1 text-[14px] font-semibold text-ink">{c.label}</span>
              <span className={cn("h-2.5 w-2.5 rounded-full", stateDot[c.state])} aria-label={c.state} />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="num text-[28px] font-bold leading-none text-ink">{c.value}</span>
              <span className="text-[12.5px] text-ink-2">{c.unit}</span>
            </div>
            <p className="line-clamp-1 min-h-[18px] text-[12px] text-ink-3">{c.note}</p>
            <Link href={c.go} className="mt-auto flex h-9 items-center justify-center rounded-lg border border-border-2 text-[13px] font-semibold text-ink hover:bg-ground-2">
              {c.action}
            </Link>
          </li>
        ))}
      </ol>

      <Panel id="cho-toi-xu-ly">
        <PanelHeader title="Việc cần làm" />
        {pending.length === 0 ? (
          <EmptyState title="Không có việc nào chờ anh" />
        ) : (
          <>
            <ul className="m-0 list-none p-0">
              {pending.slice(0, 5).map((it) => <PendingRow key={it.id} item={it} />)}
            </ul>
            <PendingAllButton items={pending} />
          </>
        )}
      </Panel>
    </>
  );
}
