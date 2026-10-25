import { ChevronRight, CirclePause, Clapperboard, Gauge, Hourglass, Megaphone, ShieldCheck, Sparkles, TrendingUp, TriangleAlert, Users, type LucideIcon } from "lucide-react";
import { Panel, PanelHeader } from "@/components/ui/card";
import { Pill, type Tone } from "@/components/ui/pill";
import { Button, LinkButton } from "@/components/ui/button";
import { IconChip } from "@/components/ui/icon-chip";
import { InfoTip } from "@/components/ui/info-tip";
import { ActionMenu } from "@/components/ui/action-menu";
import { inputClass } from "@/components/ui/field";
import { ConfirmAction } from "@/components/campaigns/confirm-action";
import { CampaignTags, LinkToCampaignForm } from "@/components/campaigns/entity-campaign";
import { AuthorizationDialog } from "./ads-authorization-dialog";
import { approveAd, proposeAdsAction, pushAdToMetaAction, rejectAd, revokeAdAuthorization, saveAdAuthorization, submitAdForApproval, toggleAd, updateBudget } from "@/lib/actions/ads";
import { adMetrics, pct } from "@/lib/ads/metrics";
import { authorizationStatus, daysLeftInMonth, getAuthorization, isSampleAd, monthSpentDetail, vnDate } from "@/lib/ads/authorization";
import { getSetting } from "@/lib/admin";
import { suggestionsFor, type Suggestion } from "@/lib/ads/engine";
import { campaignRepo } from "@/lib/campaigns/repository";
import { listAds } from "@/lib/queries";
import { adStatusLabel } from "@/lib/labels";
import { formatNumber, cn } from "@/lib/format";
import type { AdStatus } from "@/lib/types";
import { CampaignFilterChip } from "@/components/campaigns/campaign-filter-chip";
import { campaignFilterFor, keepInCampaign } from "@/lib/campaigns/filter";

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
// Số tiền gọn cho nhãn đề xuất (250K, 1,2 tr). Cột số liệu vẫn hiện đủ.
const short = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "").replace(".", ",")} tr` : n >= 1000 ? `${Math.round(n / 1000)}K` : String(n));

// Đề xuất của bộ luật (engine) rút thành MỘT nhãn ngắn có icon; câu đầy đủ ở tooltip + phần mở rộng.
const SUGG: Record<Suggestion["kind"], { icon: LucideIcon; tone: Tone; label: (s: Suggestion) => string; rank: number }> = {
  pause: { icon: CirclePause, tone: "brick", label: () => "Nên dừng", rank: 0 },
  scale: { icon: TrendingUp, tone: "jade", label: (s) => (s.budget ? `${short(s.budget)}/ngày` : "Tăng ngân sách"), rank: 1 },
  creative: { icon: Clapperboard, tone: "amber", label: () => "Đổi video", rank: 2 },
  pacing: { icon: Gauge, tone: "amber", label: () => "Chi chậm", rank: 3 },
  audience: { icon: Users, tone: "sky", label: () => "Đối tượng", rank: 4 },
  wait: { icon: Hourglass, tone: "neutral", label: () => "Chờ dữ liệu", rank: 5 },
};

const th = "whitespace-nowrap border-b border-border py-2 text-[12px] font-medium text-ink-3";
const numTd = "min-w-0 whitespace-nowrap md:table-cell md:px-3 md:py-2.5 md:text-right md:align-top";
const cellLbl = "block text-[11px] text-ink-3 md:hidden";

// CP05: quảng cáo Meta trong ủy quyền ngân sách của OWNER.
// OWNER 26/10: "phần quảng cáo vẫn rườm rà quá" → ủy quyền = một dòng trạng thái + hộp thoại; mỗi quảng cáo một hàng gọn,
// chi tiết (nhắm mục tiêu, cảnh báo, số Insights) mở khi bấm tên; một nút chính, thao tác phụ trong ⋯.
export function AdsPanel({ edit, link, campaign, goal }: { edit?: string; link?: string; campaign?: string; goal?: string }) {
  const auth = getAuthorization();
  const st = authorizationStatus(auth);
  const ads = listAds().filter((a) => a.status !== "rejected");
  const adLinks = campaignRepo.linksForEntities("ad", ads.map((a) => a.id));
  // Mở từ chiến dịch (?campaign=&goal=): bảng chỉ hiện quảng cáo đã gắn chiến dịch; ủy quyền / đã chi / dự chi vẫn tính toàn tài khoản.
  const filter = campaignFilterFor({ campaignId: campaign?.trim() || null, channelGoalId: goal?.trim() || null }, "ad");
  const shown = keepInCampaign(ads, filter);
  const canLink = campaignRepo.list().some((c) => c.status !== "ended");
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
  const projected = spentDetail.projectionBase + activeDaily * daysLeftInMonth(); // hôm nay đã nằm trong ngân sách × ngày còn lại
  const overCap = !!auth && projected > auth.monthlyCapVnd;
  const today = vnDate();
  const authPill = st.active
    ? { tone: "jade" as const, text: `Hiệu lực tới ${ddmm(auth!.validUntil)}` }
    : !auth
      ? { tone: "amber" as const, text: "Chưa có ủy quyền" }
      : auth.validUntil < today
        ? { tone: "brick" as const, text: `Hết hạn ${ddmm(auth.validUntil)}` }
        : { tone: "amber" as const, text: "Chưa hợp lệ" };
  const estimatedNote = spentDetail.estimated > 0
    ? `Trong đó ${formatNumber(spentDetail.estimated)} ₫ là ước tính (ngân sách ngày × ngày chưa có số liệu Insights): ${spentDetail.estimatedAds.map((x) => `${x.name} ${x.days} ngày`).join(", ")}. Cổng chi tiêu dùng số này để không tính thiếu.`
    : "";
  const insightsNote = insightsError ? `Đồng bộ Insights lỗi lúc ${insightsError.at.slice(0, 16).replace("T", " ")}: ${insightsError.errors.slice(0, 2).join("; ")}` : "";

  return (
    <>
      <Panel id="ads-authorization">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5 px-4 py-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <IconChip icon={ShieldCheck} tone="orange" />
            <h2 className="text-[13px] font-bold text-ink">Ủy quyền ngân sách</h2>
            <InfoTip label="Giải thích: Ủy quyền ngân sách">
              <p className="m-0">Chỉ OWNER đặt. Không có ủy quyền còn hiệu lực thì không quảng cáo nào bật hoặc tăng ngân sách được, dù ai bấm. Tạm dừng và giảm ngân sách luôn được.</p>
              <p className="m-0 mt-1.5 text-ink">{st.reason}</p>
              {auth && <p className="m-0 mt-1.5">Đặt bởi {auth.authorizedBy}{auth.allowAutoScale ? " · AI được tự tăng trong trần" : " · AI chỉ đề xuất, không tự tăng"}{auth.adAccountId ? ` · ${auth.adAccountId}` : ""}{auth.note ? ` · ${auth.note}` : ""}</p>}
              {estimatedNote && <p className="m-0 mt-1.5 text-amber">{estimatedNote}</p>}
            </InfoTip>
            <Pill tone={authPill.tone}>{authPill.text}</Pill>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-2">
            <span className="inline-flex items-center gap-1">
              Đã chi tháng <span className="num font-semibold text-ink">{formatNumber(spent)} ₫</span>
              {estimatedNote && (
                <span className="inline-flex text-amber" title={estimatedNote} role="img" aria-label={estimatedNote}>
                  <TriangleAlert size={13} aria-hidden />
                </span>
              )}
            </span>
            <span>
              Dự chi <span className={cn("num font-semibold", overCap ? "text-brick" : "text-ink")}>{formatNumber(projected)} ₫</span>
              {auth && auth.monthlyCapVnd > 0 && <span className="num text-ink-3"> / {formatNumber(auth.monthlyCapVnd)} ₫</span>}
            </span>
            {insightsNote && (
              <span className="inline-flex items-center gap-1 font-medium text-brick" title={insightsNote}>
                <TriangleAlert size={13} aria-hidden /> Insights lỗi
              </span>
            )}
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <AuthorizationDialog
              key={auth?.authorizedAt ?? "none"}
              action={saveAdAuthorization}
              hasAuth={!!auth}
              minDate={today}
              defaults={{
                dailyCap: auth?.dailyCapVnd ?? "",
                monthlyCap: auth?.monthlyCapVnd ?? "",
                validUntil: auth?.validUntil ?? "",
                adAccountId: auth?.adAccountId ?? "",
                autoPauseCplAbove: auth?.autoPauseCplAbove ?? 60000,
                allowAutoScale: auth?.allowAutoScale ?? false,
                note: auth?.note ?? "",
              }}
            />
            {auth && (
              <ActionMenu label="Thao tác ủy quyền">
                <ConfirmAction action={revokeAdAuthorization} fields={{}} label="Thu hồi ủy quyền" title="Thu hồi ủy quyền ngân sách?" message="Mọi quảng cáo đang chạy sẽ bị tạm dừng; không quảng cáo nào bật được cho tới khi ủy quyền lại." confirmLabel="Thu hồi" variant="ghost" danger />
              </ActionMenu>
            )}
          </div>
        </div>
      </Panel>

      <CampaignFilterChip filter={filter} missing={!!campaign?.trim() && !filter} clearHref="/ads" />

      {/* overflow-visible: menu ⋯ của hàng cuối không bị khung thẻ cắt. */}
      <Panel id="ads" className="overflow-visible!">
        <PanelHeader
          title="Quảng cáo"
          icon={Megaphone}
          tone="orange"
          info="Nháp tạo từ video đã đăng và xác minh. Đẩy lên Meta luôn ở trạng thái tạm dừng; chỉ bật khi được duyệt và trong ủy quyền. Bấm tên quảng cáo để xem nhắm mục tiêu, đề xuất và số liệu Insights."
          action={
            <form action={proposeAdsAction}>
              <Button type="submit" variant="outline"><Sparkles size={13} aria-hidden />AI đề xuất từ video tốt</Button>
            </form>
          }
        />
        <table className="block w-full border-collapse text-[13px] md:table">
          <thead className="hidden md:table-header-group">
            <tr>
              <th className={cn(th, "px-4 text-left")}>Quảng cáo</th>
              <th className={cn(th, "px-3 text-right")}>Ngân sách/ngày</th>
              <th className={cn(th, "px-3 text-right")}>Đã chi</th>
              <th className={cn(th, "px-3 text-right")}>Lead</th>
              <th className={cn(th, "px-3 text-right")}>CPL</th>
              <th className={cn(th, "px-4 text-right")}>Trạng thái</th>
            </tr>
          </thead>
          <tbody className="block md:table-row-group">
            {filter && shown.length === 0 && <tr className="block md:table-row"><td colSpan={6} className="block px-4 py-6 text-center text-[12.5px] text-ink-2 md:table-cell">Chiến dịch chưa có quảng cáo.</td></tr>}
            {shown.map((a) => {
              const s = adStatusLabel[a.status as AdStatus] ?? { label: a.status, tone: "neutral" as const };
              const cpl = a.leads ? Math.round(a.spent / a.leads) : 0;
              const editing = edit === a.id;
              const sample = isSampleAd(a.id);
              const sugg = [...suggestionsFor(a.id)].sort((x, y) => SUGG[x.kind].rank - SUGG[y.kind].rank);
              const top = sugg[0];
              const m = a.impressions > 0 ? adMetrics(a) : null;
              const metricsLine = m ? `${a.reach > 0 ? `Reach ${formatNumber(a.reach)} · ` : ""}CPM ${formatNumber(m.cpm ?? 0)} ₫ · CTR ${pct(m.ctr)}${m.frequency ? ` · tần suất ${m.frequency.toString().replace(".", ",")}` : ""}` : "";
              const links = adLinks.get(a.id);
              const canPush = !!a.postId && !a.metaAdId && (a.status === "proposed" || a.status === "pending_approval");
              const canReject = a.status === "proposed" || a.status === "pending_approval" || a.status === "paused";
              const TopIcon = top ? SUGG[top.kind].icon : null;
              return (
                <tr key={a.id} className="grid grid-cols-2 gap-x-3 gap-y-2 border-b border-border px-4 py-3 last:border-b-0 min-[420px]:grid-cols-4 md:table-row md:p-0">
                  <td className="col-span-full min-w-0 md:table-cell md:px-4 md:py-2.5 md:align-top">
                    <details className="group/ad">
                      <summary className="flex cursor-pointer list-none items-center gap-1.5 [&::-webkit-details-marker]:hidden" title="Bấm để xem chi tiết">
                        <ChevronRight size={14} aria-hidden className="shrink-0 text-ink-3 transition-transform group-open/ad:rotate-90" />
                        <span className="min-w-0 font-semibold text-ink">{a.name}</span>
                        {sample && <span title="Dữ liệu mẫu, không tiêu tiền"><Pill>Mẫu</Pill></span>}
                      </summary>
                      <div className="ml-5 mt-1.5 grid gap-1 rounded-md bg-ground-2 px-3 py-2 text-[12px] text-ink-2">
                        {a.aiNote && <div className="flex gap-1.5 text-ink"><Sparkles size={13} aria-hidden className="mt-0.5 shrink-0 text-violet" />{a.aiNote}</div>}
                        <div>
                          {a.metaCampaignId ? `Trên Meta: chiến dịch ${a.metaCampaignId}` : a.postId ? "Chưa đẩy lên Meta (không tiêu tiền)" : "Chỉ trong hệ thống"}
                          {a.audience ? ` · ${a.audience}` : ""}
                        </div>
                        {sample && <div>Dữ liệu mẫu, không tiêu tiền.</div>}
                        {sugg.length > 0 && (
                          <ul className="m-0 list-disc space-y-0.5 pl-4 text-ink">
                            {sugg.map((x) => <li key={x.text}>{x.text}</li>)}
                          </ul>
                        )}
                        {metricsLine && <div className="num" title="Số liệu Meta Insights đã đồng bộ. Reach = người duy nhất (trọn đời quảng cáo).">{metricsLine}</div>}
                      </div>
                    </details>
                    {(top || (links && links.length > 0)) && (
                      <div className="ml-5 mt-1 flex flex-wrap items-center gap-1.5">
                        {top && TopIcon && (
                          <span title={top.text}>
                            <Pill tone={SUGG[top.kind].tone}>
                              <TopIcon size={12} aria-hidden />
                              {SUGG[top.kind].label(top)}
                              {sugg.length > 1 && <span className="font-normal opacity-75">+{sugg.length - 1}</span>}
                            </Pill>
                          </span>
                        )}
                        {top?.kind === "scale" && top.budget && a.status === "active" && (
                          <form action={updateBudget}>
                            <input type="hidden" name="id" value={a.id} />
                            <input type="hidden" name="dailyBudget" value={top.budget} />
                            <Button type="submit" variant="soft" className="h-6 px-2 text-[11.5px]" title={`Đặt ngân sách ${formatNumber(top.budget)} ₫/ngày (qua cổng ủy quyền)`}>Áp dụng</Button>
                          </form>
                        )}
                        <CampaignTags links={links} />
                      </div>
                    )}
                    {link === a.id && (
                      <div className="ml-5 mt-1.5">
                        <LinkToCampaignForm entityType="ad" entityId={a.id} status={a.status} back="/ads" links={links} compact open />
                      </div>
                    )}
                  </td>
                  <td className={cn(numTd, editing && "col-span-full")}>
                    <span className={cellLbl}>Ngân sách/ngày</span>
                    {editing ? (
                      <form action={updateBudget} className="flex gap-1.5 md:justify-end">
                        <input type="hidden" name="id" value={a.id} />
                        <input name="dailyBudget" defaultValue={a.dailyBudget} aria-label="Ngân sách mỗi ngày (₫)" className={cn(inputClass, "num w-[110px] text-right")} />
                        <Button type="submit" variant="primary">Lưu</Button>
                      </form>
                    ) : (
                      <a href={`/ads?edit=${a.id}#ads`} className="num hover:underline" title="Sửa ngân sách">{formatNumber(a.dailyBudget)} ₫</a>
                    )}
                  </td>
                  <td className={numTd} title={metricsLine || undefined}>
                    <span className={cellLbl}>Đã chi</span>
                    <span className="num">{formatNumber(a.spent)} ₫</span>
                  </td>
                  <td className={numTd}>
                    <span className={cellLbl}>Lead</span>
                    <span className="num">{a.leads}</span>
                  </td>
                  <td className={numTd}>
                    <span className={cellLbl}>CPL</span>
                    <span className="num">{cpl ? `${formatNumber(cpl)} ₫` : "—"}</span>
                  </td>
                  <td className="col-span-full md:table-cell md:px-4 md:py-2.5 md:align-top">
                    <div className="flex items-center justify-between gap-1.5 md:justify-end">
                      <Pill tone={s.tone}>{s.label}</Pill>
                      <div className="flex items-center gap-1.5">
                        {a.status === "proposed" && <form action={submitAdForApproval}><input type="hidden" name="id" value={a.id} /><Button type="submit" variant="outline">Gửi duyệt</Button></form>}
                        {a.status === "pending_approval" && (
                          <ConfirmAction action={approveAd} fields={{ id: a.id }} label="Duyệt chạy" title="Bật quảng cáo này?" message={`${formatNumber(a.dailyBudget)} ₫/ngày. Hệ thống kiểm ủy quyền ngân sách trước khi bật.`} confirmLabel="Duyệt chạy" variant="primary" />
                        )}
                        {(a.status === "active" || a.status === "paused") && <form action={toggleAd}><input type="hidden" name="id" value={a.id} /><Button variant="outline" type="submit">{a.status === "active" ? "Tạm dừng" : "Bật lại"}</Button></form>}
                        <ActionMenu label={`Thao tác khác: ${a.name}`}>
                          {canPush && <form action={pushAdToMetaAction} className="contents"><input type="hidden" name="id" value={a.id} /><Button type="submit" variant="ghost">Tạo trên Meta (tạm dừng)</Button></form>}
                          <LinkButton href={`/ads?edit=${a.id}#ads`} variant="ghost" className="justify-start">Sửa ngân sách</LinkButton>
                          {canLink && <LinkButton href={`/ads?link=${encodeURIComponent(a.id)}#ads`} variant="ghost" className="justify-start">{links?.length ? "Sửa gắn chiến dịch" : "Gắn chiến dịch"}</LinkButton>}
                          {canReject && <form action={rejectAd} className="contents"><input type="hidden" name="id" value={a.id} /><Button variant="ghost" type="submit" className="text-brick">Từ chối</Button></form>}
                        </ActionMenu>
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
    </>
  );
}
