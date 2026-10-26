import { useId } from "react";
import { cn } from "@/lib/format";
import { scoreTone } from "@/lib/content/scoring";

const tone = { jade: "bg-jade-soft text-jade-ink", amber: "bg-amber-soft text-amber", neutral: "bg-ground-2 text-ink-2" } as const;

// Ô điểm ưu tiên 0–100 (chấm theo luật, src/lib/content/scoring.ts): rê chuột thấy lý do, bấm mở bảng lý do (Popover API như InfoTip).
export function ScoreTip({ score, reasons, kind, className }: { score: number; reasons: string[]; kind: string; className?: string }) {
  const id = `score-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const why = reasons.length ? reasons.join(" · ") : "Chưa đủ tín hiệu";
  return (
    <>
      <button
        type="button"
        popoverTarget={id}
        title={`Điểm ${kind} ${score}/100: ${why}`}
        aria-label={`Điểm ${kind} ${score} trên 100 — xem lý do`}
        data-score={score}
        className={cn("num inline-flex h-5 min-w-[30px] shrink-0 cursor-pointer items-center justify-center rounded-full px-1.5 text-[11px] font-bold tabular-nums focus-visible:outline-2 focus-visible:outline-jade", tone[scoreTone(score)], className)}
      >
        {score}
      </button>
      <div id={id} popover="auto" className="info-pop">
        <div className="mb-1 font-semibold text-ink">Điểm {kind}: <span className="num">{score}</span>/100</div>
        <ul className="m-0 list-disc space-y-0.5 pl-4">
          {(reasons.length ? reasons : ["Chưa đủ tín hiệu"]).map((r) => <li key={r}>{r}</li>)}
        </ul>
        <div className="mt-1.5 text-[11px] text-ink-3">Chấm theo luật, không tốn AI.</div>
      </div>
    </>
  );
}

/** Nhãn "Nên làm" cho 3 mục điểm cao nhất. */
export function TopPick() {
  return <span className="inline-flex h-5 items-center whitespace-nowrap rounded-full bg-jade px-2 text-[11px] font-semibold text-white">Nên làm</span>;
}
