import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Panel, PanelHeader } from "@/components/ui/card";
import { Pill, type Tone } from "@/components/ui/pill";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/format";
import { stageStateLabel, type BrandPipeline, type StageState } from "@/lib/brand/pipeline";

const tone: Record<StageState, Tone> = { done: "jade", working: "sky", waiting: "amber", not_started: "neutral" };

// Dây chuyền thương hiệu: mỗi chặng một thẻ, số liệu chỉ tính bản ghi thật.
export function BrandPipelineStrip({ data }: { data: BrandPipeline }) {
  return (
    <section aria-labelledby="day-chuyen" className="mt-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="day-chuyen" className="text-[13px] font-bold text-ink">Dây chuyền thương hiệu</h2>
        <span className="text-[11.5px] text-ink-3">Chỉ đếm dữ liệu thật; dữ liệu mẫu ghi riêng.</span>
      </div>
      <ol className="m-0 mt-2 grid list-none grid-cols-1 gap-2.5 p-0 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
        {data.stages.map((s) => (
          <li key={s.key} className="min-w-0">
            <Link href={s.href} className="card flex h-full flex-col gap-2 px-3.5 py-3 transition-colors hover:border-ink-3 hover:bg-ground-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jade">
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="num grid h-5 w-5 shrink-0 place-items-center rounded-full bg-ground-2 text-[11px] font-bold text-ink-2">{s.step}</span>
                  <span className="truncate text-[13px] font-semibold text-ink">{s.name}</span>
                </span>
                <Pill tone={tone[s.state]} className="h-[18px] shrink-0 px-1.5 text-[10.5px]">{stageStateLabel[s.state]}</Pill>
              </div>
              <p className="m-0 line-clamp-3 text-[12px] leading-snug text-ink-2">{s.summary}</p>
              <dl className="m-0 mt-auto grid gap-0.5">
                {s.lines.map((l) => (
                  <div key={l.label} className="flex items-baseline justify-between gap-2 text-[11.5px]">
                    <dt className="truncate text-ink-3">{l.label}</dt>
                    <dd className={cn("num m-0 font-semibold", l.value ? "text-ink" : "text-ink-3")}>{l.value}</dd>
                  </div>
                ))}
              </dl>
              {s.sample > 0 && <div className="text-[11px] text-ink-3">+ {s.sample} bản ghi mẫu (không tính)</div>}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function OwnerActions({ data }: { data: BrandPipeline }) {
  const ceo = data.actions.filter((a) => a.ceo);
  const work = data.actions.filter((a) => !a.ceo);
  const list = [...work, ...ceo];
  return (
    <Panel id="anh-can-lam" className="mt-0">
      <PanelHeader title="Anh cần làm gì" sub={list.length ? `${work.length} việc vận hành, ${ceo.length} việc cần anh quyết (quyền truy cập, chi phí).` : "Không có việc nào đang chờ anh."} />
      {list.length === 0 ? (
        <EmptyState title="Dây chuyền không có việc chờ anh" />
      ) : (
        <ul className="m-0 list-none p-0">
          {list.map((a) => (
            <li key={a.stage + a.text} className="border-b border-border last:border-b-0">
              <Link href={a.href} className="group flex items-start gap-3 px-4 py-2.5 hover:bg-ground-2 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-jade">
                <span className="w-[84px] shrink-0 pt-px text-[11.5px] font-semibold text-ink-2">{a.stage}</span>
                <span className="min-w-0 flex-1 text-[12.5px] text-ink">{a.text}</span>
                {a.ceo && <Pill tone="amber" className="h-[18px] shrink-0 px-1.5 text-[10.5px]">Anh quyết</Pill>}
                <ArrowRight size={14} className="mt-0.5 shrink-0 text-ink-3 group-hover:text-ink" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
