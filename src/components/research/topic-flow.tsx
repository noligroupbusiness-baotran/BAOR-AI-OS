import { Check } from "lucide-react";
import { LinkButton } from "@/components/ui/button";
import { SubmitButton } from "@/components/campaigns/submit-button";
import { aiGenerateHooks } from "@/lib/actions/hooks";
import { NEXT_LABEL, progress, type NextStepKey, type TopicCounts } from "@/lib/content/flow";
import { HOOK_COUNT } from "@/lib/content/hooks";
import { cn } from "@/lib/format";

// Luồng một chủ đề: Insight › Hook › Kịch bản (chấm màu = đã xong chặng) + MỘT nút bước tiếp theo theo trạng thái.

export function FlowSteps({ counts, className }: { counts: TopicCounts; className?: string }) {
  const steps = progress(counts);
  return (
    <ol className={cn("m-0 flex list-none items-center gap-1 p-0 text-[11.5px]", className)} aria-label="Tiến độ chủ đề">
      {steps.map((s, i) => (
        <li key={s.key} className="flex items-center gap-1">
          {i > 0 && <span aria-hidden className={cn("h-px w-3", s.done ? "bg-jade" : "bg-border-2")} />}
          <span className={cn("inline-flex items-center gap-1 whitespace-nowrap", s.done ? "font-semibold text-jade-ink" : "text-ink-3")} title={`${s.label}: ${s.n}`}>
            <span aria-hidden className={cn("grid h-3.5 w-3.5 place-items-center rounded-full", s.done ? "bg-jade text-white" : "border border-border-2")}>
              {s.done && <Check size={9} strokeWidth={3} />}
            </span>
            {s.label}
            {s.n > 0 && <span className="num font-normal text-ink-3">{s.n}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * Nút bước tiếp theo. "Tạo hook" gọi thẳng AI tạo 10 hook từ insight của chủ đề (nếu AI sẵn sàng), các bước khác mở đúng chỗ trên trang chủ đề.
 * `onDetail`: đang ở trang chủ đề → nút trỏ tới khối tương ứng trên trang (#insight-add / #hooks).
 */
export function NextStep({ id, topic, step, aiReady, aiReason, onDetail }: { id: string; topic: string; step: NextStepKey; aiReady: boolean; aiReason?: string; onDetail?: boolean }) {
  const detail = `/insights/research/${id}`;
  const primary = step !== "view";
  if (step === "hook" && aiReady) {
    return (
      <form action={aiGenerateHooks} className="shrink-0">
        <input type="hidden" name="research" value={id} />
        <input type="hidden" name="topic" value={topic} />
        <input type="hidden" name="back" value={`${detail}#hooks`} />
        <SubmitButton pendingText="AI đang viết…" title={`AI tạo ${HOOK_COUNT} hook vlog < 1 phút từ insight đã duyệt`}>{NEXT_LABEL.hook}</SubmitButton>
      </form>
    );
  }
  const anchor = step === "insight" ? "#insight-add" : step === "approve" ? "#insights" : step === "view" ? "" : "#hooks";
  const href = onDetail && step === "view" ? `/content/hooks?research=${id}` : `${detail}${anchor}`;
  return (
    <LinkButton href={href} variant={primary ? "primary" : "outline"} className="shrink-0" title={step === "hook" && !aiReady ? aiReason : undefined}>
      {NEXT_LABEL[step]}
    </LinkButton>
  );
}
