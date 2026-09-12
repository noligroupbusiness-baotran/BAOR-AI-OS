import Link from "next/link";
import { AlertOctagon, CalendarCheck, ChevronRight, Clapperboard, FileText, Megaphone, MessageSquare, Wallet } from "lucide-react";
import { Pill } from "@/components/ui/pill";
import { kindLabel, priorityLabel, type ApprovalItem, type PendingItem } from "@/lib/dashboard-types";
import { cn } from "@/lib/format";

const kindIcon: Record<ApprovalItem["kind"], typeof FileText> = {
  content: FileText,
  video: Clapperboard,
  schedule: CalendarCheck,
  customer: MessageSquare,
  workflow: AlertOctagon,
  campaign: Megaphone,
  ad: Wallet,
};

// Một dòng việc chờ xử lý: cả dòng bấm được, một nút duy nhất "Xem và xử lý".
export function PendingRow({ item, compact }: { item: PendingItem; compact?: boolean }) {
  const Icon = kindIcon[item.kind];
  const pr = priorityLabel[item.priority];
  const urgent = item.kind === "workflow" || item.priority === "high";
  return (
    <li className="border-b border-border last:border-b-0">
      <Link
        href={item.moduleHref}
        className={cn(
          "group flex items-center gap-3 px-4 transition-colors hover:bg-ground-2 focus-visible:bg-ground-2 focus-visible:outline-none",
          compact ? "py-2.5" : "py-3",
        )}
      >
        <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", urgent ? "bg-brick-soft text-brick" : "bg-ground-2 text-ink-2")}>
          <Icon size={15} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-ink">{item.title}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-ink-2">
            <span>{kindLabel[item.kind]}</span>
            <span aria-hidden>·</span>
            <span className="num">{item.waited}</span>
            {item.priority !== "low" && <Pill tone={pr.tone} className="h-[18px] px-1.5 text-[10.5px]">{pr.label}</Pill>}
          </span>
        </span>
        <span className="hidden shrink-0 rounded-full border border-border-2 px-3 py-1 text-[12px] font-medium text-ink transition-colors group-hover:border-jade group-hover:text-jade sm:inline-flex">
          Xem và xử lý
        </span>
        <ChevronRight size={16} className="shrink-0 text-ink-3 sm:hidden" aria-label="Xem và xử lý" />
      </Link>
    </li>
  );
}
