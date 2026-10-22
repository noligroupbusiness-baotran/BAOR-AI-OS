import { notFound } from "next/navigation";
import { Breadcrumb } from "@/components/shell/module-page";
import { LinkButton } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { getContent } from "@/lib/queries";
import { kindOf } from "@/lib/content/formats";
import { OWNER_MARK, parseShootingScript } from "@/lib/content/shooting-script";
import { contentStatusLabel } from "@/lib/labels";
import type { ContentStatus } from "@/lib/types";

export const metadata = { title: "Bản đọc khi quay – BAOR AI OS" };

// Bản đọc khi quay (CP02): chỉ lời thoại và chữ trên màn hình theo từng cảnh, chữ to, in được.
// Bản chưa duyệt vẫn mở được để tập, nhưng ghi rõ "chưa duyệt".
export default async function RecordingScriptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = getContent(id);
  if (!c || kindOf(c.format) !== "script") notFound();
  const { scenes } = parseShootingScript(c.draft ?? "");
  const approved = c.status === "approved" || c.status === "scheduled" || c.status === "published";
  const st = contentStatusLabel[c.status as ContentStatus];

  return (
    <>
      <div className="print:hidden">
        <Breadcrumb items={[{ label: "Kịch bản & nội dung", href: `/content?tab=${approved ? "done" : "mine"}&open=${c.id}` }, { label: "Bản đọc khi quay" }]} />
      </div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[20px] font-bold tracking-[-0.01em] text-ink">{c.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-2">
            <Pill tone={approved ? "jade" : "amber"}>{approved ? "Đã duyệt, sẵn sàng quay" : `Chưa duyệt (${st?.label ?? c.status}): chỉ dùng để tập`}</Pill>
            <span>{scenes.length} cảnh</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          {approved && <LinkButton href={`/video-studio?upload=1&content=${c.id}`} variant="primary" size="md">Tải video đã quay</LinkButton>}
        </div>
      </div>

      {scenes.length === 0 ? (
        <div className="card px-4 py-6 text-[13px] text-ink-2">Kịch bản chưa theo cấu trúc cảnh (dòng “1. HOOK (0–3s)” và “Lời thoại: …”), nên chưa tách được bản đọc.</div>
      ) : (
        <ol className="m-0 grid list-none gap-3 p-0">
          {scenes.map((s) => (
            <li key={s.index} className="card break-inside-avoid px-5 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-ink-3">Cảnh {s.index} · {s.name}</span>
                <span className="num text-[12px] text-ink-3">{s.seconds}</span>
              </div>
              <p className="m-0 mt-2 text-[22px] leading-[1.55] text-ink md:text-[26px]">
                {s.speech.replace(/\s*\[[SK]\d+\]/g, "").split(OWNER_MARK).map((part, k) =>
                  k === 0 ? part : <mark key={k} className="rounded bg-amber-soft px-1 text-amber">{OWNER_MARK}{part}</mark>,
                )}
              </p>
              {(s.onScreen || s.visual) && (
                <div className="mt-3 grid gap-1 border-t border-border pt-2 text-[13px] text-ink-2 md:grid-cols-2">
                  {s.onScreen && <div><span className="font-semibold text-ink">Chữ trên màn hình:</span> {s.onScreen}</div>}
                  {s.visual && <div><span className="font-semibold text-ink">Khung hình:</span> {s.visual}</div>}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
