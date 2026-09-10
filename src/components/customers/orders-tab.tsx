import { Panel, PanelHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Button, LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, inputClass } from "@/components/ui/field";
import { Table, Th, Td } from "@/components/ui/table";
import { Pager, paginate } from "@/components/ui/pager";
import { SubmitButton } from "@/components/campaigns/submit-button";
import { CampaignTags } from "@/components/campaigns/entity-campaign";
import { createOrderAction, setOrderStatusAction } from "@/lib/actions/orders";
import { listOrders, orderStatusLabel } from "@/lib/orders/repository";
import { catalogRepo } from "@/lib/catalog/repository";
import { campaignRepo } from "@/lib/campaigns/repository";
import { listLeads } from "@/lib/queries";
import { formatCurrency, formatDateTime } from "@/lib/format";
import type { Actor } from "@/lib/permissions";

// Khách hàng › Đơn hàng: tạo đơn từ lead với giá lấy từ danh mục; đơn thanh toán tự cập nhật doanh thu chiến dịch.
export function OrdersTab({ add, page, actor, preselectLead }: { add: boolean; page?: string; actor: Actor; preselectLead?: string }) {
  const orders = listOrders();
  const paged = paginate(orders, page);
  const products = catalogRepo.listProducts();
  const leads = listLeads();
  const campaigns = campaignRepo.list().filter((c) => c.status !== "ended");
  const links = campaignRepo.linksForEntities("order", paged.items.map((o) => o.id));
  const paid = orders.filter((o) => o.status === "paid");
  const revenue = paid.reduce((n, o) => n + o.total, 0);
  const back = "/customers?tab=orders";
  return (
    <>
      {add && (
        <Panel>
          <PanelHeader title="Tạo đơn hàng" sub="Giá lấy từ Cài đặt › Sản phẩm. Chiến dịch kế thừa từ lead nếu không chọn. Đơn “Đã thanh toán” chuyển lead sang “Đã mua” và cộng doanh thu vào chiến dịch." />
          <form action={createOrderAction} className="grid gap-3 p-4 md:grid-cols-2">
            <input type="hidden" name="back" value={back} />
            <Field label="Khách (lead)" hint="Không có trong danh sách thì để trống và nhập tên bên cạnh.">
              <select name="leadId" defaultValue={preselectLead ?? ""} className={inputClass}>
                <option value="">Khách lẻ / chưa có lead</option>
                {leads.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}{l.phone ? ` · ${l.phone}` : ""}</option>
                ))}
              </select>
            </Field>
            <Field label="Tên khách (nếu không chọn lead)">
              <input name="leadName" className={inputClass} placeholder="VD: Chị Lan" />
            </Field>
            <Field label="Sản phẩm / dịch vụ" required>
              <select name="productId" required defaultValue="" className={inputClass}>
                <option value="" disabled>Chọn sản phẩm</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} · {p.price > 0 ? `${formatCurrency(p.price)}/${p.unit}` : "không tính giá"}</option>
                ))}
              </select>
            </Field>
            <Field label="Số lượng" required>
              <input name="quantity" inputMode="numeric" defaultValue={1} required className={inputClass} />
            </Field>
            <Field label="Giá khác danh mục (₫)" hint={actor.permission === "staff" ? "Nhân viên dùng giá danh mục, không sửa được." : "Chỉ ghi khi có giảm giá hoặc thỏa thuận; được ghi nhận vào nhật ký quyết định."}>
              <input name="unitPrice" inputMode="numeric" className={inputClass} placeholder="Để trống = giá danh mục" disabled={actor.permission === "staff"} />
            </Field>
            <Field label="Trạng thái">
              <select name="status" defaultValue="new" className={inputClass}>
                <option value="new">Mới (chờ thanh toán)</option>
                <option value="paid">Đã thanh toán</option>
              </select>
            </Field>
            <Field label="Chiến dịch (tùy chọn)">
              <select name="campaignId" defaultValue="" className={inputClass}>
                <option value="">Theo lead</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Ghi chú">
              <input name="note" className={inputClass} placeholder="VD: Chuyển khoản, giao ngày 12/9" />
            </Field>
            <div className="flex gap-2 md:col-span-2">
              <SubmitButton pendingText="Đang tạo…">Tạo đơn</SubmitButton>
              <LinkButton href={back} variant="ghost">Hủy</LinkButton>
            </div>
          </form>
        </Panel>
      )}

      <Panel>
        <PanelHeader
          title="Đơn hàng"
          sub={`${paid.length} đơn đã thanh toán · doanh thu ${formatCurrency(revenue)} · ${orders.filter((o) => o.status === "new").length} đơn chờ thanh toán.`}
          action={add ? undefined : <LinkButton href={`${back}&add=1`} variant="primary">Tạo đơn hàng</LinkButton>}
        />
        {orders.length === 0 ? (
          <EmptyState title="Chưa có đơn hàng" hint="Tạo đơn từ lead khi khách chốt. Đơn đã thanh toán là nguồn doanh thu thật cho Chiến dịch và Báo cáo." action={<LinkButton href={`${back}&add=1`} variant="primary">Tạo đơn hàng</LinkButton>} />
        ) : (
          <>
            <Table>
              <thead>
                <tr><Th>Khách</Th><Th>Sản phẩm</Th><Th>Chiến dịch</Th><Th right>Thành tiền</Th><Th right>Trạng thái</Th></tr>
              </thead>
              <tbody>
                {paged.items.map((o) => {
                  const st = orderStatusLabel[o.status];
                  return (
                    <tr key={o.id}>
                      <Td className="font-semibold text-ink">{o.leadName}<div className="num text-[11px] font-normal text-ink-3">{formatDateTime(o.createdAt)}</div></Td>
                      <Td>{o.productName} × {o.quantity}<div className="num text-[11px] text-ink-3">{formatCurrency(o.unitPrice)}/đv{o.note ? ` · ${o.note}` : ""}</div></Td>
                      <Td><div className="flex flex-wrap gap-1"><CampaignTags links={links.get(o.id)} />{!links.get(o.id)?.length && <span className="text-ink-3">—</span>}</div></Td>
                      <Td right className="num font-semibold text-ink">{formatCurrency(o.total)}</Td>
                      <Td right>
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <Pill tone={st.tone}>{st.label}</Pill>
                          {o.status === "new" && (
                            <form action={setOrderStatusAction}><input type="hidden" name="id" value={o.id} /><input type="hidden" name="status" value="paid" /><input type="hidden" name="back" value={back} /><Button type="submit" variant="primary">Đã thanh toán</Button></form>
                          )}
                          {o.status !== "cancelled" && actor.permission !== "staff" && (
                            <form action={setOrderStatusAction}><input type="hidden" name="id" value={o.id} /><input type="hidden" name="status" value="cancelled" /><input type="hidden" name="back" value={back} /><Button type="submit" variant="ghost">Hủy</Button></form>
                          )}
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            <Pager page={paged.page} pages={paged.pages} total={paged.total} hrefFor={(p) => `${back}&page=${p}`} label="đơn" />
          </>
        )}
      </Panel>
    </>
  );
}
