import { Panel, PanelHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { Table, Th, Td } from "@/components/ui/table";
import { ConfirmAction } from "@/components/campaigns/confirm-action";
import { CampaignTags, LinkToCampaignForm } from "@/components/campaigns/entity-campaign";
import { approveAd, proposeAdsAction, pushAdToMetaAction, rejectAd, revokeAdAuthorization, saveAdAuthorization, submitAdForApproval, toggleAd, updateBudget } from "@/lib/actions/ads";
import { authorizationStatus, daysLeftInMonth, getAuthorization, isSampleAd, monthSpentDetail, vnDate } from "@/lib/ads/authorization";
import { getSetting } from "@/lib/admin";
import { suggestionsFor } from "@/lib/ads/engine";
import { campaignRepo } from "@/lib/campaigns/repository";
import { listAds } from "@/lib/queries";
import { adStatusLabel } from "@/lib/labels";
import { formatNumber, cn } from "@/lib/format";
import type { AdStatus } from "@/lib/types";

const input = "h-8 rounded-md border border-border-2 bg-surface px-2.5 text-[13px] text-ink outline-none focus-visible:outline-2 focus-visible:outline-jade";

// CP05: quảng cáo Meta trong ủy quyền ngân sách của OWNER.
export function AdsPanel({ edit, link }: { edit?: string; link?: string }) {
  const auth = getAuthorization();
  const st = authorizationStatus(auth);
  const ads = listAds().filter((a) => a.status !== "rejected");
  const adLinks = campaignRepo.linksForEntities("ad", ads.map((a) => a.id));
  const spentDetail = monthSpentDetail();
  const spent = spentDetail.total;
  const insightsError = (() => {
    try {
      return JSON.parse(getSetting("ads.insightsError") || "null") as { at: string; errors: string[] } | null;
    } catch {
      return null;
    }
  })();
  const activeDaily = ads.filter((a) => a.status === "active" && !isSampleAd(a.id)).reduce((n, a) => n + a.dailyBudget, 0);
  const projected = spent + activeDaily * daysLeftInMonth();

  return (
    <>
      <Panel id="ads-authorization">
        <PanelHeader
          title="Ủy quyền ngân sách quảng cáo"
          sub="Chỉ OWNER đặt. Không có ủy quyền còn hiệu lực thì không quảng cáo nào bật hoặc tăng ngân sách được, dù ai bấm. Tạm dừng và giảm ngân sách luôn được."
          action={<Pill tone={st.active ? "jade" : "amber"}>{st.active ? "Đang hiệu lực" : "Chưa có / hết hạn"}</Pill>}
        />
        <div className="grid gap-0 md:grid-cols-[1fr_300px]">
          <form action={saveAdAuthorization} className="grid gap-3 border-b border-border p-4 sm:grid-cols-3 md:border-b-0 md:border-r">
            <label className="block"><span className="lbl">Trần mỗi ngày mỗi quảng cáo (₫)</span><input name="dailyCap" defaultValue={auth?.dailyCapVnd ?? ""} placeholder="200000" className={cn(input, "mt-1 w-full")} /></label>
            <label className="block"><span className="lbl">Trần cả tháng (₫)</span><input name="monthlyCap" defaultValue={auth?.monthlyCapVnd ?? ""} placeholder="5000000" className={cn(input, "mt-1 w-full")} /></label>
            <label className="block"><span className="lbl">Hiệu lực tới</span><input type="date" name="validUntil" defaultValue={auth?.validUntil ?? ""} min={vnDate()} className={cn(input, "mt-1 w-full")} /></label>
            <label className="block"><span className="lbl">Tài khoản quảng cáo (act_…)</span><input name="adAccountId" defaultValue={auth?.adAccountId ?? ""} placeholder="act_123…" className={cn(input, "mt-1 w-full")} /></label>
            <label className="block"><span className="lbl">Tự dừng khi chi phí/lead vượt (₫)</span><input name="autoPauseCplAbove" defaultValue={auth?.autoPauseCplAbove ?? 60000} className={cn(input, "mt-1 w-full")} /></label>
            <label className="flex items-end gap-2 pb-1 text-[12.5px] text-ink"><input type="checkbox" name="allowAutoScale" value="1" defaultChecked={auth?.allowAutoScale ?? false} className="h-3.5 w-3.5 accent-[var(--jade)]" /> Cho AI tự tăng ngân sách quảng cáo hiệu quả (vẫn trong trần)</label>
            <label className="block sm:col-span-3"><span className="lbl">Ghi chú</span><input name="note" defaultValue={auth?.note ?? ""} className={cn(input, "mt-1 w-full")} /></label>
            <div className="sm:col-span-3"><Button type="submit" variant="primary">Lưu ủy quyền</Button></div>
          </form>
          <div className="grid content-start gap-2 p-4 text-[12.5px]">
            <div className="text-ink">{st.reason}</div>
            {auth && <div className="text-ink-2">Đặt bởi {auth.authorizedBy}{auth.allowAutoScale ? " · AI được tự tăng trong trần" : " · AI chỉ đề xuất, không tự tăng"}</div>}
            <div className="text-ink-2">Đã chi tháng này <span className="num font-semibold text-ink">{formatNumber(spent)} ₫</span></div>
            {spentDetail.estimated > 0 && (
              <div className="text-[12px] text-amber">Trong đó {formatNumber(spentDetail.estimated)} ₫ là ước tính (ngân sách ngày × ngày chưa có số liệu Insights): {spentDetail.estimatedAds.map((x) => `${x.name} ${x.days} ngày`).join(", ")}. Cổng chi tiêu dùng số này để không tính thiếu.</div>
            )}
            {insightsError && <div className="text-[12px] text-brick">Đồng bộ Insights lỗi lúc {insightsError.at.slice(0, 16).replace("T", " ")}: {insightsError.errors.slice(0, 2).join("; ")}</div>}
            <div className="text-ink-2">Dự chi tới cuối tháng <span className={cn("num font-semibold", auth && projected > auth.monthlyCapVnd ? "text-brick" : "text-ink")}>{formatNumber(projected)} ₫</span></div>
            {auth && <ConfirmAction action={revokeAdAuthorization} fields={{}} label="Thu hồi ủy quyền" title="Thu hồi ủy quyền ngân sách?" message="Mọi quảng cáo đang chạy sẽ bị tạm dừng; không quảng cáo nào bật được cho tới khi ủy quyền lại." confirmLabel="Thu hồi" danger />}
          </div>
        </div>
      </Panel>

      <Panel id="ads">
        <PanelHeader
          title="Quảng cáo"
          sub="Nháp tạo từ video đã đăng và xác minh. Đẩy lên Meta luôn ở trạng thái tạm dừng; chỉ bật khi được duyệt và trong ủy quyền."
          action={<form action={proposeAdsAction}><Button type="submit" variant="soft">AI đề xuất từ video tốt</Button></form>}
        />
        <Table>
          <thead>
            <tr><Th>Chiến dịch</Th><Th right>Ngân sách/ngày</Th><Th right>Đã chi · lead</Th><Th right>Trạng thái</Th></tr>
          </thead>
          <tbody>
            {ads.map((a) => {
              const s = adStatusLabel[a.status as AdStatus] ?? { label: a.status, tone: "neutral" as const };
              const cpl = a.leads ? Math.round(a.spent / a.leads) : 0;
              const editing = edit === a.id;
              const sugg = suggestionsFor(a.id);
              return (
                <tr key={a.id}>
                  <Td>
                    <div className="font-semibold text-ink">{a.name}{isSampleAd(a.id) && <span className="ml-1.5 text-[11px] font-normal text-ink-3">(dữ liệu mẫu, không tiêu tiền)</span>}</div>
                    {a.aiNote && <div className="text-[12px] text-ink-2">{a.aiNote}</div>}
                    <div className="mt-0.5 text-[11.5px] text-ink-3">
                      {a.metaCampaignId ? `Trên Meta: chiến dịch ${a.metaCampaignId}` : a.postId ? "Chưa đẩy lên Meta (không tiêu tiền)" : "Chỉ trong hệ thống"}
                      {a.audience ? ` · ${a.audience}` : ""}
                    </div>
                    {sugg.length > 0 && (
                      <ul className="m-0 mt-1 list-disc space-y-0.5 pl-4 text-[12px] text-ink">
                        {sugg.map((x) => <li key={x.text}>{x.text}</li>)}
                      </ul>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <CampaignTags links={adLinks.get(a.id)} />
                      <LinkToCampaignForm entityType="ad" entityId={a.id} status={a.status} back="/publishing" links={adLinks.get(a.id)} compact open={link === a.id} />
                    </div>
                  </Td>
                  <Td right className="num whitespace-nowrap">
                    {editing ? (
                      <form action={updateBudget} className="flex justify-end gap-1.5">
                        <input type="hidden" name="id" value={a.id} />
                        <input name="dailyBudget" defaultValue={a.dailyBudget} className={cn(input, "w-[110px] text-right")} />
                        <Button type="submit" variant="primary">Lưu</Button>
                      </form>
                    ) : (
                      <a href={`/publishing?edit=${a.id}#ads`} className="hover:underline">{formatNumber(a.dailyBudget)} ₫</a>
                    )}
                  </Td>
                  <Td right className="num whitespace-nowrap">{formatNumber(a.spent)} ₫ · {a.leads}{cpl ? <div className="text-[11.5px] text-ink-2">{formatNumber(cpl)} ₫/lead</div> : null}</Td>
                  <Td right>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <Pill tone={s.tone}>{s.label}</Pill>
                      {a.status === "proposed" && <form action={submitAdForApproval}><input type="hidden" name="id" value={a.id} /><Button type="submit" variant="soft">Gửi duyệt</Button></form>}
                      {a.postId && !a.metaAdId && (a.status === "proposed" || a.status === "pending_approval") && <form action={pushAdToMetaAction}><input type="hidden" name="id" value={a.id} /><Button type="submit" variant="ghost">Tạo trên Meta (tạm dừng)</Button></form>}
                      {a.status === "pending_approval" && (
                        <ConfirmAction action={approveAd} fields={{ id: a.id }} label="Duyệt chạy" title="Bật quảng cáo này?" message={`${formatNumber(a.dailyBudget)} ₫/ngày. Hệ thống kiểm ủy quyền ngân sách trước khi bật.`} confirmLabel="Duyệt chạy" variant="primary" />
                      )}
                      {(a.status === "proposed" || a.status === "pending_approval" || a.status === "paused") && <form action={rejectAd}><input type="hidden" name="id" value={a.id} /><Button variant="ghost" type="submit">Từ chối</Button></form>}
                      {(a.status === "active" || a.status === "paused") && <form action={toggleAd}><input type="hidden" name="id" value={a.id} /><Button variant="ghost" type="submit">{a.status === "active" ? "Tạm dừng" : "Bật lại"}</Button></form>}
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Panel>
    </>
  );
}
