import Link from "next/link";
import { Panel, PanelHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Button, LinkButton } from "@/components/ui/button";
import { Table, Th, Td } from "@/components/ui/table";
import { Field, inputClass, textareaClass } from "@/components/ui/field";
import { SubmitButton } from "@/components/campaigns/submit-button";
import { EmptyState } from "@/components/ui/empty-state";
import { removeCompetitor, saveCompetitor } from "@/lib/actions/insights";
import { channelLines, competitorSummary, getCompetitor, lines, listCompetitors, offerLines, priceComparison } from "@/lib/insights/competitors";
import { catalogRepo } from "@/lib/catalog/repository";
import { formatCurrency, formatDate, formatNumber, cn } from "@/lib/format";

// Nghiên cứu & Insight › Đối thủ: theo dõi thủ công, so sánh giá theo luật với danh mục sản phẩm.
export function CompetitorsPanel({ editing }: { editing?: string }) {
  const competitors = listCompetitors();
  const products = catalogRepo.listProducts();
  const brands = [...new Set(products.map((p) => p.brand).filter(Boolean))];
  const rows = priceComparison(products, competitors);
  const summary = competitorSummary(rows);
  const current = editing && editing !== "new" ? getCompetitor(editing) : undefined;
  const showForm = editing === "new" || !!current;

  return (
    <Panel id="competitors">
      <PanelHeader
        title="Đối thủ"
        sub="Theo dõi tay: kênh, định vị, bảng giá, điểm mạnh yếu. So sánh giá tính tự động theo tên gói khớp với danh mục sản phẩm, không dùng AI."
        action={showForm ? undefined : <LinkButton href="/insights?competitor=new#competitors" variant="primary">Thêm đối thủ</LinkButton>}
      />

      {showForm && (
        <form action={saveCompetitor} className="grid gap-3 border-b border-border bg-ground p-4 md:grid-cols-2">
          {current && <input type="hidden" name="id" value={current.id} />}
          <Field label="Tên đối thủ" required><input name="name" required defaultValue={current?.name ?? ""} className={inputClass} placeholder="VD: An Spa Gò Vấp" /></Field>
          <Field label="Cạnh tranh với thương hiệu" hint="Chỉ so giá với sản phẩm của thương hiệu này; để trống = so với tất cả.">
            <select name="brand" defaultValue={current?.brand ?? ""} className={inputClass}>
              <option value="">Tất cả</option>
              {brands.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </Field>
          <Field label="Định vị" className="md:col-span-2"><input name="positioning" defaultValue={current?.positioning ?? ""} className={inputClass} placeholder="VD: Spa giá rẻ, đông khách, nhiều chi nhánh" /></Field>
          <Field label="Kênh" hint="Mỗi dòng: nền tảng | đường dẫn | số theo dõi"><textarea name="channels" rows={3} defaultValue={current ? channelLines(current.channels) : ""} className={textareaClass} placeholder={"facebook | https://facebook.com/... | 28000\ntiktok | https://tiktok.com/@... | 41000"} /></Field>
          <Field label="Bảng giá của họ" hint="Mỗi dòng: tên gói | giá | đơn vị. Tên gần giống sản phẩm của bạn để hệ thống tự ghép."><textarea name="offers" rows={3} defaultValue={current ? offerLines(current.offers) : ""} className={textareaClass} placeholder={"Gội đầu dưỡng sinh | 45000 | lượt\nThẻ 10 lượt gội | 390000 | thẻ"} /></Field>
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
        <EmptyState title="Chưa theo dõi đối thủ nào" hint="Thêm 2–3 đối thủ gần nhất kèm bảng giá để hệ thống so sánh với sản phẩm của bạn." />
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

      {competitors.length > 0 && (
        <div className="border-t border-border">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">So sánh giá với danh mục của bạn</div>
            <div className="flex gap-1.5 text-[12px]">
              <Pill tone="jade">{summary.cheaper} rẻ hơn</Pill>
              <Pill>{summary.similar} ngang giá</Pill>
              <Pill tone={summary.pricier ? "amber" : "neutral"}>{summary.pricier} đắt hơn</Pill>
            </div>
          </div>
          {rows.length === 0 ? (
            <div className="px-4 py-3 text-[12.5px] text-ink-2">{summary.text} Đặt tên gói của đối thủ gần với tên sản phẩm của bạn (VD “Gội dưỡng sinh”) để hệ thống ghép được.</div>
          ) : (
            <Table>
              <thead><tr><Th>Sản phẩm của bạn</Th><Th>Giá của bạn</Th><Th>Đối thủ</Th><Th>Gói tương đương</Th><Th right>Chênh lệch</Th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.product.id}_${r.competitor.id}`}>
                    <Td className="font-semibold text-ink">{r.product.name}</Td>
                    <Td className="num">{formatCurrency(r.product.price)}/{r.product.unit}</Td>
                    <Td>{r.competitor.name}</Td>
                    <Td>{r.offer.name} <span className="num text-ink-2">· {formatCurrency(r.offer.price)}/{r.offer.unit}</span></Td>
                    <Td right>
                      <Pill tone={r.verdict === "cheaper" ? "jade" : r.verdict === "pricier" ? "amber" : "neutral"} className="num">{r.diffPct > 0 ? "+" : ""}{r.diffPct}%</Pill>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          <div className="px-4 py-2 text-[11.5px] text-ink-3">Chênh lệch dương = bạn đắt hơn. Ngang giá khi lệch dưới 10%. Ghép theo tên gói, kiểm tra lại nếu ghép sai.</div>
        </div>
      )}
    </Panel>
  );
}
