import Link from "next/link";
import { Breadcrumb, ModuleGroups } from "@/components/shell/module-page";
import { PageHead, Panel, PanelHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { Segment } from "@/components/ui/segment";
import { EmptyState } from "@/components/ui/empty-state";
import { platformLabel } from "@/components/ui/platform";
import { ConfirmAction } from "@/components/campaigns/confirm-action";
import { CampaignContextBar } from "@/components/campaigns/campaign-context";
import { CampaignTags, LinkToCampaignForm } from "@/components/campaigns/entity-campaign";
import { campaignRepo } from "@/lib/campaigns/repository";
import { readCampaignContext, withCampaignContext } from "@/lib/campaigns/context";
import { transitionVideo } from "@/lib/actions/videos";
import { listVideos } from "@/lib/videos/repository";
import { videoStatusLabel, type VideoStatus } from "@/lib/data/videos";
import { formatDateTime, cn } from "@/lib/format";
import type { Platform } from "@/lib/types";

export const metadata = { title: "Video Studio – BAOR AI OS" };

const tabs: { key: VideoStatus | "all"; label: string }[] = [
  { key: "all", label: "Tất cả" },
  { key: "editing", label: "Đang dựng" },
  { key: "review", label: "Chờ kiểm tra" },
  { key: "needs_changes", label: "Cần chỉnh sửa" },
  { key: "pending_approval", label: "Chờ phê duyệt" },
  { key: "approved", label: "Đã phê duyệt" },
];

export default async function VideoStudioPage({ searchParams }: { searchParams: Promise<{ tab?: string; campaign?: string; goal?: string; link?: string }> }) {
  const sp = await searchParams;
  const tab = tabs.some((t) => t.key === sp.tab) ? (sp.tab as VideoStatus | "all") : "all";
  const ctx = readCampaignContext(sp);
  const campaign = ctx.campaignId ? campaignRepo.get(ctx.campaignId) : undefined;
  const linkedIds = campaign ? new Set(campaignRepo.links(campaign.id, ctx.channelGoalId).filter((l) => l.entityType === "video").map((l) => l.entityId)) : null;
  const all = listVideos().filter((v) => (linkedIds ? linkedIds.has(v.id) : true));
  const list = tab === "all" ? all : all.filter((v) => v.status === tab);
  const links = campaignRepo.linksForEntities("video", all.map((v) => v.id));
  const back = withCampaignContext(`/video-studio?tab=${tab}`, ctx);
  const count = (s: VideoStatus) => all.filter((v) => v.status === s).length;

  return (
    <>
      <Breadcrumb items={[{ label: "Điều hành", href: "/dashboard" }, { label: "Video Studio" }]} />
      <PageHead
        title="Video Studio"
        sub="Agent Edit Video dựng từ kịch bản đã duyệt và chuẩn bị phiên bản cho từng nền tảng. Video chỉ được đăng sau khi bạn phê duyệt, và việc đăng làm ở Đăng bài & Quảng cáo."
        action={<Button variant="primary" size="md" disabled title="Kết nối Agent Edit Video ở giai đoạn sau">Tải video lên</Button>}
      />
      <CampaignContextBar ctx={ctx} pathname="/video-studio" params={{ tab }} note={linkedIds ? "chỉ hiện video của chiến dịch" : undefined} />

      <div className="mt-3.5 grid grid-cols-2 gap-2.5 md:grid-cols-4">
        {(["editing", "review", "pending_approval", "approved"] as VideoStatus[]).map((s) => (
          <Link key={s} href={withCampaignContext(`/video-studio?tab=${s}`, ctx)} className="card px-3.5 py-2.5 transition-colors hover:border-ink-3 hover:bg-ground-2">
            <div className="text-[12px] font-medium text-ink-2">{videoStatusLabel[s].label}</div>
            <div className={cn("num text-[20px] font-bold leading-tight", s === "pending_approval" && count(s) ? "text-amber" : "text-ink")}>{count(s)}</div>
          </Link>
        ))}
      </div>

      <div className="mt-3.5 overflow-x-auto">
        <Segment basePath={withCampaignContext("/video-studio", ctx)} active={tab} items={tabs.map((t) => ({ key: t.key, label: t.key === "all" ? `${t.label} · ${all.length}` : `${t.label} · ${count(t.key as VideoStatus)}` }))} />
      </div>

      <Panel>
        <PanelHeader title={tabs.find((t) => t.key === tab)?.label ?? "Video"} sub="Mỗi video biết kịch bản gốc, chiến dịch, mục tiêu kênh, Agent thực hiện và phiên bản theo nền tảng." />
        {list.length === 0 ? (
          <EmptyState title={linkedIds ? "Chiến dịch này chưa có video" : "Chưa có video ở mục này"} hint="Video xuất hiện khi Agent Edit Video nhận kịch bản đã duyệt từ phân hệ Nội dung." />
        ) : (
          <ul className="m-0 list-none p-0">
            {list.map((v) => {
              const st = videoStatusLabel[v.status];
              const vLinks = links.get(v.id);
              return (
                <li key={v.id} className="grid gap-3 border-b border-border px-4 py-3 last:border-b-0 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13.5px] font-semibold text-ink">{v.title}</span>
                      <Pill tone={st.tone}>{st.label}</Pill>
                      <Pill className="num">Bản {v.version}</Pill>
                    </div>
                    <div className="mt-1 text-[12px] text-ink-2">
                      {v.agent} · Phiên bản cho {v.platforms.map((p) => platformLabel(p as Platform)).join(", ") || "chưa chọn nền tảng"} · <span className="num">{formatDateTime(v.updatedAt)}</span>
                    </div>
                    <div className="mt-1 text-[12px] text-ink-2">
                      Kịch bản: {v.contentId ? <Link href={`/content?tab=done&open=${v.contentId}`} className="text-jade hover:underline">{v.contentTitle ?? v.contentId}</Link> : <span className="text-ink-3">chưa gắn kịch bản</span>}
                    </div>
                    {v.note && <p className="mt-1 text-[12px] text-ink">{v.note}</p>}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <CampaignTags links={vLinks} />
                      <LinkToCampaignForm entityType="video" entityId={v.id} status={v.status} back={back} links={vLinks} compact open={sp.link === v.id} />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 lg:justify-end">
                    {(v.status === "editing" || v.status === "needs_changes") && (
                      <ConfirmAction action={transitionVideo} fields={{ id: v.id, kind: "send_review", back }} label="Gửi kiểm tra" title="Chuyển video sang chờ kiểm tra?" message="Dùng khi Agent đã dựng xong và bạn muốn xem bản này." confirmLabel="Gửi kiểm tra" variant="soft" />
                    )}
                    {v.status === "review" && (
                      <ConfirmAction action={transitionVideo} fields={{ id: v.id, kind: "send_approval", back }} label="Đạt, gửi phê duyệt" title="Gửi video đi phê duyệt?" message="Video sẽ hiện ở Chờ phê duyệt của chiến dịch đã gắn." confirmLabel="Gửi phê duyệt" variant="primary" />
                    )}
                    {v.status === "pending_approval" && (
                      <ConfirmAction action={transitionVideo} fields={{ id: v.id, kind: "approve", back }} label="Phê duyệt" title="Phê duyệt video này?" message="Video được đánh dấu đã duyệt để lên lịch đăng. Không tự động đăng." confirmLabel="Phê duyệt" variant="primary" withNote={{ label: "Ghi chú (tùy chọn)" }} />
                    )}
                    {(v.status === "review" || v.status === "pending_approval") && (
                      <ConfirmAction action={transitionVideo} fields={{ id: v.id, kind: "request_changes", back }} label="Yêu cầu chỉnh sửa" title="Yêu cầu Agent chỉnh sửa?" message="Agent Edit Video sẽ dựng bản mới theo ghi chú của bạn." confirmLabel="Gửi yêu cầu" withNote={{ label: "Điều cần sửa", required: true, placeholder: "VD: Cắt ngắn 10 giây đầu, đổi nhạc nền nhẹ hơn" }} />
                    )}
                    {v.status === "approved" && <Link href="/publishing" className="inline-flex h-[26px] items-center rounded-full border border-border-2 px-2.5 text-[12px] font-medium text-ink hover:border-ink-3">Lên lịch ở Đăng bài</Link>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      <ModuleGroups moduleKey="video-studio" />
    </>
  );
}
