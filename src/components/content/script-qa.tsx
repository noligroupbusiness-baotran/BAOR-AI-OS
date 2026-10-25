import Link from "next/link";
import { briefForContent, briefScriptQa } from "@/lib/research";

// Kiểm kịch bản quay sinh từ brief (CP02): hiện ngay trong khung soạn, cùng luật chặn ở máy chủ khi gửi duyệt và duyệt.
export function ScriptQaPanel({ contentId, draft }: { contentId: string; draft: string }) {
  const brief = briefForContent(contentId);
  const qa = brief ? briefScriptQa(contentId, draft) : null;
  if (!brief || !qa) return null;
  return (
    <div className={qa.ok ? "rounded-md border border-jade/40 bg-jade-soft/40 px-3 py-2 text-[12px]" : "rounded-md border border-amber/40 bg-amber-soft px-3 py-2 text-[12px]"}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className={qa.ok ? "font-semibold text-jade-ink" : "font-semibold text-amber"}>{qa.ok ? "Kịch bản đạt kiểm, gửi duyệt được" : `Còn ${qa.blocking.length} lỗi phải sửa trước khi gửi duyệt`}</span>
        <span className="text-ink-2">Lời thoại khoảng <span className="num font-semibold text-ink">{qa.seconds}</span> giây</span>
        {brief.taskId && <Link href={`/insights/research/${brief.taskId}`} className="text-jade hover:underline">Xem chủ đề nghiên cứu</Link>}
      </div>
      {qa.blocking.length > 0 && (
        <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-ink">
          {qa.blocking.map((b) => <li key={b}>{b}</li>)}
        </ul>
      )}
      {qa.warnings.length > 0 && (
        <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-ink-2">
          {qa.warnings.map((w) => <li key={w}>{w}</li>)}
        </ul>
      )}
      <div className="mt-1.5 text-[11px] text-ink-3">Kiểm theo bản đã lưu. Sửa xong bấm Lưu nháp để kiểm lại.</div>
    </div>
  );
}
