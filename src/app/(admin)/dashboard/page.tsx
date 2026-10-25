import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Panel, PanelHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PendingRow } from "@/components/dashboard/pending-row";
import { PendingAllButton } from "@/components/dashboard/pending-all";
import { getPending, getSystemStatus } from "@/lib/dashboard-data";
import { OverviewStrip } from "@/components/dashboard/overview-strip";
import { journeyCards } from "@/lib/brand/journey";
import { cn } from "@/lib/format";
import { menu, type GroupTone } from "@/config/menu";
import { PageIcon } from "@/components/shell/page-icon";
import { CountUp } from "@/components/ui/count-up";
import { JOURNEY_STEPS } from "@/config/journey";
import type { JourneyCard } from "@/lib/brand/journey";

export const metadata = { title: "Tổng quan – BAOR AI OS" };

// Màu nhóm của từng bước = màu phân hệ của trang bước đó trên menu
const stepTone = (href: string): GroupTone => menu.find((m) => m.href === href)?.tone ?? "slate";

const stateDot = { done: "bg-jade", working: "bg-sky", waiting: "bg-amber", not_started: "bg-border-2" } as const;
const stateLabel = { done: "Xong", working: "Đang làm", waiting: "Chờ anh", not_started: "Chưa bắt đầu" } as const;

// 7 bước hiển thị (OWNER 26/10/2026): gộp các thẻ con cùng bước (bước 1 = Chủ đề + Nghiên cứu insight) — giữ số liệu và
// nút của từng phần; trạng thái chung ưu tiên "chờ anh" > "đang làm" > "chưa bắt đầu" > "xong".
function mergeState(parts: JourneyCard[]): JourneyCard["state"] {
  for (const st of ["waiting", "working", "not_started"] as const) if (parts.some((p) => p.state === st)) return st;
  return "done";
}

// Trang chính = Tổng quan (OWNER 25/10/2026, đổi từ "Hành trình"): tình hình chung (AI, kết nối, nơi dựng, sao lưu, lỗi) →
// hành trình marketing 7 bước (sơ đồ Personal Brand System, mỗi bước một nút bấm) → việc cần làm. Đọc một trang là nắm hết.
export default async function JourneyHome() {
  const cards = journeyCards();
  const pending = getPending();
  const status = getSystemStatus(pending.length);
  const next = cards.find((c) => c.state === "waiting") ?? cards.find((c) => c.state === "not_started");
  const steps = JOURNEY_STEPS.map((d) => ({ ...d, parts: cards.filter((c) => c.step === d.step) })).filter((d) => d.parts.length > 0);
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="flex items-center gap-3 text-[22px] font-bold tracking-[-0.01em] text-ink">
          <PageIcon className="appear appear--pop" />
          <span className="appear appear--mask">Tổng quan</span>
        </h1>
        {next && (
          <Link href={next.go} className="btn btn-primary appear appear--btn flex h-10 items-center gap-1.5 px-4 text-[13px] font-semibold [--d:2]">
            Làm tiếp: bước {next.step} · {next.label} <ArrowRight size={15} aria-hidden />
          </Link>
        )}
      </div>

      <OverviewStrip issues={status.issues} />

      <h2 className="mb-2 mt-5 text-[13px] font-semibold uppercase tracking-wide text-ink-3">Hành trình marketing</h2>
      <ol className="stagger m-0 grid list-none gap-3 p-0 sm:grid-cols-2 xl:grid-cols-4">
        {steps.map((d) => {
          const state = mergeState(d.parts);
          const solo = d.parts.length === 1;
          return (
            <li key={d.step} className={cn("card lift chip-host appear appear--scale flex flex-col gap-2 p-4", `tone-${stepTone(d.href)}`)}>
              <div className="flex items-center gap-2">
                <span className="chip num h-7 w-7 text-[13px] font-bold">{d.step}</span>
                <span className="flex-1 text-[14px] font-semibold text-ink">{solo ? d.parts[0].label : d.label}</span>
                <span className={cn("h-2.5 w-2.5 rounded-full", stateDot[state])} role="img" aria-label={stateLabel[state]} title={stateLabel[state]} />
              </div>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                {d.parts.map((c) => (
                  <span key={c.n} className="flex items-baseline gap-1.5">
                    <span className="num text-[28px] font-bold leading-none text-ink"><CountUp value={c.value} /></span>
                    <span className="text-[12.5px] text-ink-2">{c.unit}</span>
                  </span>
                ))}
              </div>
              <p className="line-clamp-1 min-h-[18px] text-[12px] text-ink-3">{(d.parts.find((c) => c.state === state) ?? d.parts[0]).note}</p>
              <div className={cn("mt-auto grid gap-2", !solo && "grid-cols-2")}>
                {d.parts.map((c) => (
                  <Link key={c.n} href={c.go} className="btn btn-glass flex h-9 items-center justify-center px-2 text-[13px] font-semibold">
                    {c.action}
                  </Link>
                ))}
              </div>
            </li>
          );
        })}
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
