import Link from "next/link";
import { Panel, PanelHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Button, LinkButton } from "@/components/ui/button";
import { Field, inputClass, textareaClass } from "@/components/ui/field";
import { SubmitButton } from "@/components/campaigns/submit-button";
import { EmptyState } from "@/components/ui/empty-state";
import { removeCompetitor, saveCompetitor } from "@/lib/actions/insights";
import { channelLines, getCompetitor, lines, listCompetitors, offerLines } from "@/lib/insights/competitors";
import { formatDate, formatNumber, cn } from "@/lib/format";

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
        sub="Theo dõi tay: kênh, định vị, gói họ công bố, điểm mạnh yếu."
        action={showForm ? undefined : <LinkButton href="/insights?competitor=new#competitors" variant="primary">Thêm đối thủ</LinkButton>}
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
          <Field label="Bảng giá của họ" hint="Mỗi dòng: tên gói | giá | đơn vị (thông tin họ công bố)."><textarea name="offers" rows={3} defaultValue={current ? offerLines(current.offers) : ""} className={textareaClass} placeholder={"Gội đầu dưỡng sinh | 45000 | lượt\nThẻ 10 lượt gội | 390000 | thẻ"} /></Field>
          <Field label="Điểm mạnh" hint="Mỗi dòng một ý"><textarea name="strengths" rows={3} defaultValue={current ? lines(current.strengths) : ""} className={textareaClass} /></Field>
          <Field label="Điểm yếu" hint="Mỗi dòng một ý"><textarea name="weaknesses" rows={3} defaultValue={current ? lines(current.weaknesses) : ""} className={textareaClass} /></Field>
          <Field label="Ghi chú" className="md:col-span-2"><input name="note" defaultValue={current?.note ?? ""} className={inputClass} placeholder="Điều bạn thấy ở bình luận, review, quảng cáo của họ" /></Field>
          <Field label="Ngày xem gần nhất"><input type="date" name="lastCheckedAt" defaultValue={current?.lastCheckedAt ?? ""} className={inputClass} /></Field>
          <div className="flex items-end gap-2">
            <SubmitButton pendingText="Đang lưu…">{current ? "Lưu thay đổi" : "Thêm đối thủ"}</SubmitButton>
            <LinkButton href="/insights#competitors" variant="ghost">Hủy</LinkButton>
          </div>
        </form>
      )}

      {competitors.length === 0 ? (
        <EmptyState title="Chưa theo dõi đối thủ nào" hint="Thêm 2–3 đối thủ gần nhất để theo dõi kênh và cách họ làm nội dung." />
      ) : (
        <ul className="m-0 list-none p-0">
          {competitors.map((c) => (
            <li key={c.id} className={cn("grid gap-2 border-b border-border px-4 py-3 last:border-b-0 md:grid-cols-[minmax(0,1fr)_auto]", current?.id === c.id && "bg-jade-soft/30")}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-semibold text-ink">{c.name}</span>
                  {c.brand && <Pill>{c.brand}</Pill>}
                  {c.lastCheckedAt && <span className="num text-[11.5px] text-ink-3">xem {formatDate(c.lastCheckedAt)}</span>}
                </div>
                {c.positioning && <div className="mt-0.5 text-[12.5px] text-ink-2">{c.positioning}</div>}
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-ink-3">
                  {c.channels.map((ch) => (
                    <span key={ch.platform + ch.url}>
                      {ch.url ? <Link href={ch.url} target="_blank" rel="noreferrer" className="text-jade hover:underline">{ch.platform}</Link> : ch.platform}
                      {ch.followers ? <span className="num"> · {formatNumber(ch.followers)}</span> : null}
                    </span>
                  ))}
                  {c.offers.length > 0 && <span>{c.offers.length} gói giá</span>}
                </div>
                {(c.strengths.length > 0 || c.weaknesses.length > 0) && (
                  <div className="mt-1.5 grid gap-x-4 gap-y-0.5 text-[12px] md:grid-cols-2">
                    {c.strengths.length > 0 && <div><span className="text-jade">Mạnh:</span> <span className="text-ink-2">{c.strengths.join(" · ")}</span></div>}
                    {c.weaknesses.length > 0 && <div><span className="text-amber">Yếu:</span> <span className="text-ink-2">{c.weaknesses.join(" · ")}</span></div>}
                  </div>
                )}
                {c.note && <div className="mt-1 text-[12px] text-ink-3">Ghi chú: {c.note}</div>}
              </div>
              <div className="flex gap-1.5 md:justify-end">
                <LinkButton href={`/insights?competitor=${c.id}#competitors`}>Sửa</LinkButton>
                <form action={removeCompetitor}><input type="hidden" name="id" value={c.id} /><Button type="submit" variant="ghost">Xóa</Button></form>
              </div>
            </li>
          ))}
        </ul>
      )}

    </Panel>
  );
}
