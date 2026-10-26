import Link from "next/link";
import { Panel, PanelHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { LinkButton } from "@/components/ui/button";
import { ConfirmAction } from "@/components/campaigns/confirm-action";
import { Field, inputClass, textareaClass } from "@/components/ui/field";
import { SubmitButton } from "@/components/campaigns/submit-button";
import { EmptyState } from "@/components/ui/empty-state";
import { removeCompetitor, saveCompetitor } from "@/lib/actions/insights";
import { channelLines, getCompetitor, lines, listCompetitors, offerLines } from "@/lib/insights/competitors";
import { SamplePill } from "@/components/ui/sample";
import { isSample } from "@/lib/sample";
import { formatDate, formatNumber, cn } from "@/lib/format";
import { ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";

// Nghiên cứu & Insight › Đối thủ: theo dõi thủ công (kênh, định vị, gói / giá họ công bố, điểm mạnh yếu) — nghiên cứu thị trường.
// Không còn so giá với danh mục của mình (chỉ marketing, OWNER 25/10/2026).
export function CompetitorsPanel({ editing }: { editing?: string }) {
  const competitors = listCompetitors();
  const current = editing && editing !== "new" ? getCompetitor(editing) : undefined;
  const showForm = editing === "new" || !!current;

  return (
    <Panel id="competitors">
      <PanelHeader
        title="Đối thủ"
        info="Theo dõi tay: kênh, định vị, gói họ công bố, điểm mạnh yếu. Bấm vào một đối thủ để xem chi tiết."
        tags={competitors.length > 0 ? <Pill className="num">{competitors.length}</Pill> : undefined}
        action={showForm ? undefined : <LinkButton href="/insights/research?tab=insight&competitor=new#competitors" icon={Plus}>Thêm đối thủ</LinkButton>}
      />

      {showForm && (
        <form action={saveCompetitor} className="grid gap-3 border-b border-border bg-ground p-4 md:grid-cols-2">
          {current && <input type="hidden" name="id" value={current.id} />}
          <Field label="Tên đối thủ" required><input name="name" required defaultValue={current?.name ?? ""} className={inputClass} placeholder="VD: An Spa Gò Vấp" /></Field>
          <Field label="Cạnh tranh với thương hiệu" hint="Thương hiệu của anh mà đối thủ này cạnh tranh (tuỳ chọn).">
            <input name="brand" defaultValue={current?.brand ?? ""} className={inputClass} />
          </Field>
          <Field label="Định vị" className="md:col-span-2"><input name="positioning" defaultValue={current?.positioning ?? ""} className={inputClass} placeholder="VD: Spa giá rẻ, đông khách, nhiều chi nhánh" /></Field>
          <Field label="Kênh" hint="Mỗi dòng: nền tảng | đường dẫn | số theo dõi"><textarea name="channels" rows={3} defaultValue={current ? channelLines(current.channels) : ""} className={textareaClass} placeholder={"facebook | https://facebook.com/... | 28000\ntiktok | https://tiktok.com/@... | 41000"} /></Field>
          <Field label="Dịch vụ họ công bố" hint="Mỗi dòng: tên dịch vụ | giá | đơn vị."><textarea name="offers" rows={3} defaultValue={current ? offerLines(current.offers) : ""} className={textareaClass} placeholder={"Gội đầu dưỡng sinh | 45000 | lượt\nThẻ 10 lượt gội | 390000 | thẻ"} /></Field>
          <Field label="Điểm mạnh" hint="Mỗi dòng một ý"><textarea name="strengths" rows={3} defaultValue={current ? lines(current.strengths) : ""} className={textareaClass} /></Field>
          <Field label="Điểm yếu" hint="Mỗi dòng một ý"><textarea name="weaknesses" rows={3} defaultValue={current ? lines(current.weaknesses) : ""} className={textareaClass} /></Field>
          <Field label="Ghi chú" className="md:col-span-2"><input name="note" defaultValue={current?.note ?? ""} className={inputClass} placeholder="Điều bạn thấy ở bình luận, review, quảng cáo của họ" /></Field>
          <Field label="Ngày xem gần nhất"><input type="date" name="lastCheckedAt" defaultValue={current?.lastCheckedAt ?? ""} className={inputClass} /></Field>
          <div className="flex items-end gap-2">
            <SubmitButton pendingText="Đang lưu…">{current ? "Lưu thay đổi" : "Thêm đối thủ"}</SubmitButton>
            <LinkButton href="/insights/research?tab=insight#competitors" variant="ghost">Hủy</LinkButton>
          </div>
        </form>
      )}

      {competitors.length === 0 ? (
        <EmptyState title="Chưa theo dõi đối thủ nào" hint="Thêm 2–3 đối thủ gần nhất để theo dõi kênh và cách họ làm nội dung." />
      ) : (
        <ul className="m-0 list-none p-0">
          {competitors.map((c) => {
            const hasDetail = c.channels.length > 0 || c.offers.length > 0 || c.strengths.length > 0 || c.weaknesses.length > 0 || !!c.note || !!c.lastCheckedAt;
            return (
            <li key={c.id} className={cn("flex items-start gap-2 border-b border-border px-4 py-2.5 last:border-b-0", current?.id === c.id && "bg-jade-soft/30")}>
              {/* Hàng thu gọn (tên + nhãn + 1 dòng định vị); mở ra mới thấy kênh / số theo dõi / mạnh yếu (OWNER 27/10/2026: tối giản). */}
              <details className="group/comp min-w-0 flex-1">
                <summary className={cn("flex min-w-0 list-none items-start gap-1.5 [&::-webkit-details-marker]:hidden", hasDetail ? "cursor-pointer" : "pointer-events-none")}>
                  <ChevronRight size={14} className={cn("mt-[3px] shrink-0 text-ink-3 transition-transform group-open/comp:rotate-90", !hasDetail && "invisible")} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[13px] font-semibold text-ink">{c.name}</span>
                      {c.brand && <Pill>{c.brand}</Pill>}
                      {isSample("competitor", c.id) && <SamplePill />}
                    </span>
                    {c.positioning && <span className="mt-0.5 block truncate text-[12.5px] text-ink-2" title={c.positioning}>{c.positioning}</span>}
                  </span>
                </summary>
                {hasDetail && (
                  <div className="ml-5 mt-1.5 grid gap-1 text-[12px]">
                    {(c.channels.length > 0 || c.offers.length > 0 || c.lastCheckedAt) && (
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-ink-3">
                        {c.channels.map((ch) => (
                          <span key={ch.platform + ch.url}>
                            {ch.url ? <Link href={ch.url} target="_blank" rel="noreferrer" className="text-jade hover:underline">{ch.platform}</Link> : ch.platform}
                            {ch.followers ? <span className="num"> · {formatNumber(ch.followers)}</span> : null}
                          </span>
                        ))}
                        {c.offers.length > 0 && <span>{c.offers.length} dịch vụ</span>}
                        {c.lastCheckedAt && <span className="num">xem {formatDate(c.lastCheckedAt)}</span>}
                      </div>
                    )}
                    {c.strengths.length > 0 && <div><span className="text-jade">Mạnh:</span> <span className="text-ink-2">{c.strengths.join(" · ")}</span></div>}
                    {c.weaknesses.length > 0 && <div><span className="text-amber">Yếu:</span> <span className="text-ink-2">{c.weaknesses.join(" · ")}</span></div>}
                    {c.note && <div className="text-ink-3">Ghi chú: {c.note}</div>}
                  </div>
                )}
              </details>
              <div className="flex shrink-0 gap-0.5">
                <LinkButton href={`/insights/research?tab=insight&competitor=${c.id}#competitors`} variant="ghost" size="icon" aria-label={`Sửa ${c.name}`} title="Sửa" icon={Pencil} />
                <ConfirmAction
                  action={removeCompetitor}
                  fields={{ id: c.id }}
                  label={`Xóa ${c.name}`}
                  title="Xóa đối thủ?"
                  message={`Xóa “${c.name}” khỏi danh sách theo dõi (kênh, dịch vụ, điểm mạnh yếu đã ghi). Không khôi phục được.`}
                  confirmLabel="Xóa"
                  variant="ghost"
                  danger
                  iconOnly={<Trash2 size={16} aria-hidden />}
                />
              </div>
            </li>
            );
          })}
        </ul>
      )}

    </Panel>
  );
}
