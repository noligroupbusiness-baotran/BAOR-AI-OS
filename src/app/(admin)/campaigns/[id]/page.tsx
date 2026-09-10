import { randomBytes } from "node:crypto";
import { notFound } from "next/navigation";
import { Breadcrumb } from "@/components/shell/module-page";
import { Segment } from "@/components/ui/segment";
import { LinkButton } from "@/components/ui/button";
import { CampaignStatusPill } from "@/components/campaigns/status";
import { ConfirmAction } from "@/components/campaigns/confirm-action";
import { ActivityTab, ApprovalsTab, GoalsTab, OverviewTab, ResultsTab } from "@/components/campaigns/detail-tabs";
import { CampaignEditForm } from "@/components/campaigns/campaign-edit-form";
import { checkBudget } from "@/lib/campaigns/results";
import { campaignRepo } from "@/lib/campaigns/repository";
import { activateCampaign, approveCampaign, endCampaign, pauseCampaign, requestCampaignChanges, submitCampaign } from "@/lib/actions/campaigns";
import { formatCurrency, formatDate } from "@/lib/format";

type Params = Promise<{ id: string }>;
type Search = Promise<{ tab?: string; add?: string; edit?: string; goal?: string }>;
// ?edit=1 ở tab Tổng quan = sửa thông tin chung; ?edit=<goalId> ở tab Mục tiêu = sửa mục tiêu kênh.

export async function generateMetadata({ params }: { params: Params }) {
  const c = campaignRepo.get((await params).id);
  return { title: `${c?.name ?? "Chiến dịch"} – BAOR AI OS` };
}

const tabs = [
  { key: "overview", label: "Tổng quan" },
  { key: "goals", label: "Mục tiêu theo kênh" },
  { key: "activity", label: "Hoạt động thực hiện" },
  { key: "approvals", label: "Chờ phê duyệt" },
  { key: "results", label: "Kết quả" },
];

export default async function CampaignDetailPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { id } = await params;
  const sp = await searchParams;
  const campaign = campaignRepo.get(id);
  if (!campaign) notFound();
  const tab = tabs.some((t) => t.key === sp.tab) ? sp.tab! : "overview";
  const goals = campaignRepo.goals(id);
  const result = campaignRepo.result(id) ?? null;
  const people = campaignRepo.people();
  const products = campaignRepo.products();
  const accounts = campaignRepo.accounts();
  const approvals = campaignRepo.approvals(id);
  const pendingCount = approvals.filter((a) => a.status === "pending").length;
  const today = new Date().toISOString().slice(0, 10);
  const alerts = campaignRepo.alerts(campaign, goals, today);
  const logs = campaignRepo.logs(id, 8);
  const idem = `${id}_${randomBytes(6).toString("hex")}`;
  const owner = people.find((p) => p.id === campaign.ownerId)?.name ?? "Chưa phân công";

  const st = campaign.status;
  const editingGeneral = tab === "overview" && sp.edit === "1" && st !== "ended";
  const actions = (
    <div className="flex flex-wrap gap-1.5">
      {st !== "ended" && !editingGeneral && <LinkButton href={`/campaigns/${id}?edit=1`} size="md">Sửa thông tin</LinkButton>}
      {(st === "draft" || st === "needs_changes") && (
        <ConfirmAction action={submitCampaign} fields={{ id, idem: `${idem}_submit` }} label="Gửi phê duyệt" title="Gửi chiến dịch đi phê duyệt?" message={goals.length ? `Chiến dịch có ${goals.length} mục tiêu kênh, ngân sách ${formatCurrency(campaign.totalBudget)}. Sau khi gửi, bạn không sửa được cho tới khi có quyết định.` : "Chiến dịch chưa có mục tiêu kênh. Nên thêm ít nhất một kênh trước khi gửi."} confirmLabel="Gửi phê duyệt" variant="primary" size="md" />
      )}
      {st === "pending_approval" && (
        <>
          <ConfirmAction action={approveCampaign} fields={{ id, idem: `${idem}_approve` }} label="Phê duyệt" title="Phê duyệt chiến dịch này?" message="Phê duyệt không tự kích hoạt. Bạn sẽ bấm “Kích hoạt” khi sẵn sàng; quảng cáo vẫn cần duyệt riêng trước khi chi tiền." confirmLabel="Phê duyệt" variant="primary" size="md" withNote={{ label: "Ghi chú (tùy chọn)" }} />
          <ConfirmAction action={requestCampaignChanges} fields={{ id, idem: `${idem}_changes` }} label="Cần chỉnh sửa" title="Trả chiến dịch về để chỉnh sửa?" message="Người phụ trách sẽ nhận lại chiến dịch ở trạng thái “Cần chỉnh sửa”." confirmLabel="Trả về chỉnh sửa" size="md" withNote={{ label: "Điều cần sửa", placeholder: "VD: Giảm ngân sách TikTok, làm rõ nhóm khách hàng", required: true }} />
        </>
      )}
      {st === "approved" && (
        <ConfirmAction action={activateCampaign} fields={{ id, idem: `${idem}_activate` }} label="Kích hoạt" title="Kích hoạt chiến dịch?" message="Các mục tiêu kênh chuyển sang “Đang chạy”. Bài đăng, video và quảng cáo vẫn phải được phê duyệt trước khi xuất bản hoặc chi tiền." confirmLabel="Kích hoạt" variant="primary" size="md" />
      )}
      {st === "active" && (
        <ConfirmAction action={pauseCampaign} fields={{ id, idem: `${idem}_pause` }} label="Tạm dừng" title="Tạm dừng chiến dịch?" message="Mọi mục tiêu kênh đang chạy sẽ tạm dừng. Quy trình Automation thuộc chiến dịch cũng dừng cho tới khi chạy lại." confirmLabel="Tạm dừng" size="md" />
      )}
      {st === "paused" && (
        <ConfirmAction action={activateCampaign} fields={{ id, idem: `${idem}_resume` }} label="Chạy lại" title="Chạy lại chiến dịch?" message="Các mục tiêu kênh đã tạm dừng sẽ chạy lại." confirmLabel="Chạy lại" variant="primary" size="md" />
      )}
      {(st === "active" || st === "paused" || st === "approved") && (
        <ConfirmAction action={endCampaign} fields={{ id, idem: `${idem}_end` }} label="Kết thúc" title="Kết thúc chiến dịch?" message="Không thể mở lại sau khi kết thúc. Kết quả được chốt và các mục tiêu kênh chuyển sang “Hoàn thành”." confirmLabel="Kết thúc chiến dịch" size="md" danger />
      )}
    </div>
  );

  return (
    <>
      <Breadcrumb items={[{ label: "Điều hành", href: "/dashboard" }, { label: "Chiến dịch", href: "/campaigns" }, { label: campaign.name }]} />
      <div className="mb-3.5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[20px] font-bold tracking-[-0.01em] text-ink">{campaign.name}</h1>
            <CampaignStatusPill status={campaign.status} />
          </div>
          <p className="mt-1 text-[12.5px] text-ink-2">
            {formatDate(campaign.startDate)} – {formatDate(campaign.endDate)} · {formatCurrency(campaign.totalBudget)} · {goals.length} mục tiêu kênh · {owner}
          </p>
        </div>
        {actions}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Segment basePath={`/campaigns/${id}`} active={tab} items={tabs.map((t) => (t.key === "approvals" && pendingCount ? { ...t, label: `${t.label} · ${pendingCount}` } : t))} />
        {tab === "activity" && <LinkButton href={`/content?campaign=${id}`} variant="ghost" className="ml-auto">Mở Nội dung trong ngữ cảnh chiến dịch</LinkButton>}
      </div>

      {editingGeneral && <CampaignEditForm campaign={campaign} people={people} products={products} allocated={checkBudget(campaign.totalBudget, goals).allocated} idem={`${idem}_edit`} />}
      {tab === "overview" && !editingGeneral && <OverviewTab campaign={campaign} goals={goals} result={result} people={people} products={products} alerts={alerts} logs={logs} />}
      {tab === "goals" && <GoalsTab campaign={campaign} goals={goals} people={people} accounts={accounts} add={sp.add === "1"} edit={sp.edit} idem={idem} />}
      {tab === "activity" && <ActivityTab campaign={campaign} goals={goals} goalFilter={sp.goal?.trim() || null} />}
      {tab === "approvals" && <ApprovalsTab approvals={approvals} goals={goals} />}
      {tab === "results" && <ResultsTab campaign={campaign} goals={goals} result={result} />}
    </>
  );
}
