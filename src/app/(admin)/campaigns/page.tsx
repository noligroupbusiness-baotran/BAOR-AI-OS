import Link from "next/link";
import { AlertTriangle, ClipboardCheck, Megaphone, Wallet } from "lucide-react";
import { Breadcrumb } from "@/components/shell/module-page";
import { Button, LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { inputClass } from "@/components/ui/field";
import { ProgressBar } from "@/components/ui/progress";
import { CampaignStatusPill } from "@/components/campaigns/status";
import { campaignRepo } from "@/lib/campaigns/repository";
import { campaignStatusLabel, campaignStatusOrder } from "@/lib/campaigns/labels";
import type { CampaignFilter, CampaignSort, CampaignStatus } from "@/lib/campaigns/types";
import { timingLabel } from "@/lib/campaigns/results";
import { formatCurrency, formatDate, cn } from "@/lib/format";
import { Pager, paginate } from "@/components/ui/pager";

export const metadata = { title: "Chiến dịch – BAOR AI OS" };

type Search = { q?: string; status?: string; product?: string; owner?: string; month?: string; alerts?: string; sort?: string; page?: string };

const sortOptions: { value: CampaignSort; label: string }[] = [
  { value: "updated", label: "Mới cập nhật" },
  { value: "status", label: "Theo trạng thái" },
  { value: "ending", label: "Sắp kết thúc" },
  { value: "budget", label: "Ngân sách lớn nhất" },
  { value: "progress", label: "Tiến độ cao nhất" },
];

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const filter: CampaignFilter = {
    q: sp.q?.trim() || undefined,
    status: (sp.status && sp.status in campaignStatusLabel ? (sp.status as CampaignStatus) : "") || undefined,
    product: sp.product || undefined,
    owner: sp.owner || undefined,
    month: sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : undefined,
    alerts: sp.alerts === "1" || undefined,
    sort: sortOptions.some((o) => o.value === sp.sort) ? (sp.sort as CampaignSort) : undefined,
  };
  const filtering = Object.entries(filter).some(([k, v]) => k !== "sort" && Boolean(v));
  const today = new Date().toISOString().slice(0, 10);
  const stats = campaignRepo.stats(today);
  const list = campaignRepo.list(filter);
  const total = filtering ? campaignRepo.list().length : list.length;
  const paged = paginate(list, sp.page);
  const hrefFor = (p: number) => {
    const u = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => !!e[1] && e[0] !== "page"));
    u.set("page", String(p));
    return `/campaigns?${u.toString()}`;
  };
  const people = campaignRepo.people();
  const products = campaignRepo.products();

  const tiles: { label: string; value: string; hint: string; icon: typeof Megaphone; tone?: "amber" | "brick"; href: string }[] = [
    { label: "Đang thực hiện", value: String(stats.active), hint: "chiến dịch", icon: Megaphone, href: "/campaigns?status=active" },
    { label: "Chờ phê duyệt", value: String(stats.pendingApproval), hint: "cần bạn quyết định", icon: ClipboardCheck, tone: stats.pendingApproval ? "amber" : undefined, href: "/campaigns?status=pending_approval" },
    { label: "Ngân sách tháng này", value: formatCurrency(stats.monthBudget), hint: "chiến dịch chạm tháng " + today.slice(5, 7), icon: Wallet, href: `/campaigns?month=${today.slice(0, 7)}` },
    { label: "Cảnh báo cần xử lý", value: String(stats.alerts), hint: "tài khoản, ngân sách, hạn", icon: AlertTriangle, tone: stats.alerts ? "brick" : undefined, href: "/campaigns?alerts=1" },
  ];

  return (
    <>
      <Breadcrumb items={[{ label: "Điều hành", href: "/dashboard" }, { label: "Chiến dịch" }]} />
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-bold tracking-[-0.01em] text-ink">Chiến dịch</h1>
          <p className="mt-1 max-w-[64ch] text-ink-2">Đặt mục tiêu và điều phối hoạt động Marketing trên từng kênh.</p>
        </div>
        <LinkButton href="/campaigns/new" variant="primary" size="md">Tạo chiến dịch</LinkButton>
      </div>

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {tiles.map((t) => {
          const Icon = t.icon;
          return (
            <Link key={t.label} href={t.href} className="card flex items-center justify-between gap-2 px-3.5 py-2.5 transition-colors hover:border-ink-3 hover:bg-ground-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jade">
              <div className="min-w-0">
                <div className="truncate text-[12px] font-medium text-ink-2">{t.label}</div>
                <div className={cn("num truncate text-[20px] font-bold leading-tight tracking-[-0.02em]", t.tone === "brick" ? "text-brick" : t.tone === "amber" ? "text-amber" : "text-ink")}>{t.value}</div>
                <div className="truncate text-[11.5px] text-ink-3">{t.hint}</div>
              </div>
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-ground-2 text-ink-2"><Icon size={14} aria-hidden /></span>
            </Link>
          );
        })}
      </div>

      {/* Bộ lọc: biểu mẫu GET, chia sẻ được liên kết */}
      <form method="get" action="/campaigns" className="card mt-3.5 grid gap-2 px-4 py-3 md:grid-cols-[1.4fr_1fr_1fr_1fr_1fr_1fr_auto] md:items-end">
        <label className="block">
          <span className="lbl">Tìm theo tên</span>
          <input name="q" defaultValue={filter.q ?? ""} className={`${inputClass} mt-1`} placeholder="Tên hoặc mục tiêu chiến dịch" />
        </label>
        <label className="block">
          <span className="lbl">Trạng thái</span>
          <select name="status" defaultValue={filter.status ?? ""} className={`${inputClass} mt-1`}>
            <option value="">Tất cả</option>
            {campaignStatusOrder.map((s) => (
              <option key={s} value={s}>{campaignStatusLabel[s].label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="lbl">Sản phẩm / dịch vụ</span>
          <select name="product" defaultValue={filter.product ?? ""} className={`${inputClass} mt-1`}>
            <option value="">Tất cả</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="lbl">Người phụ trách</span>
          <select name="owner" defaultValue={filter.owner ?? ""} className={`${inputClass} mt-1`}>
            <option value="">Tất cả</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="lbl">Thời gian</span>
          <input type="month" name="month" defaultValue={filter.month ?? ""} className={`${inputClass} mt-1`} />
        </label>
        <label className="block">
          <span className="lbl">Sắp xếp</span>
          <select name="sort" defaultValue={filter.sort ?? "updated"} className={`${inputClass} mt-1`}>
            {sortOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <div className="flex gap-1.5">
          <Button type="submit" variant="soft" size="md">Lọc</Button>
          {filtering && <LinkButton href="/campaigns" variant="ghost" size="md">Xóa lọc</LinkButton>}
        </div>
        <label className="flex items-center gap-2 text-[12.5px] text-ink-2 md:col-span-full">
          <input type="checkbox" name="alerts" value="1" defaultChecked={!!filter.alerts} className="h-3.5 w-3.5 accent-jade" />
          Chỉ chiến dịch đang có cảnh báo
        </label>
      </form>

      <section className="card mt-3.5 overflow-hidden" aria-label="Danh sách chiến dịch">
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 className="text-[13px] font-bold text-ink">Danh sách chiến dịch</h2>
          <span className="num text-[12px] text-ink-2">{filtering ? `${list.length} / ${total} chiến dịch` : `${list.length} chiến dịch`}</span>
        </header>
        {list.length === 0 ? (
          filtering ? (
            <EmptyState title="Không có chiến dịch phù hợp bộ lọc" hint="Thử bỏ bớt điều kiện lọc hoặc tìm bằng từ khóa khác." action={<LinkButton href="/campaigns">Xóa lọc</LinkButton>} />
          ) : (
            <EmptyState title="Chưa có chiến dịch nào" hint="Tạo chiến dịch đầu tiên để đặt mục tiêu chung và mục tiêu cho từng kênh." action={<LinkButton href="/campaigns/new" variant="primary">Tạo chiến dịch</LinkButton>} />
          )
        ) : (
          <ul className="m-0 list-none p-0">
            {paged.items.map((c) => (
              <li key={c.id} className="grid gap-3 border-b border-border px-4 py-3.5 last:border-b-0 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_150px_auto] lg:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/campaigns/${c.id}`} className="text-[13.5px] font-semibold text-ink hover:underline">{c.name}</Link>
                    <CampaignStatusPill status={c.status} />
                    {c.alerts > 0 && <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-brick"><AlertTriangle size={12} aria-hidden />{c.alerts} cảnh báo</span>}
                  </div>
                  <div className="mt-0.5 text-[12.5px] text-ink-2">{c.objective}</div>
                  <div className="mt-1 truncate text-[12px] text-ink-3">{c.productNames.join(", ")}</div>
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[12px] lg:grid-cols-1">
                  <div className="flex flex-wrap gap-1.5">
                    <dt className="text-ink-3">Thời gian</dt>
                    <dd className="num text-ink">{formatDate(c.startDate)} – {formatDate(c.endDate)}</dd>
                    {(c.status === "active" || c.status === "approved" || c.status === "paused") && (() => {
                      const t = timingLabel(c.startDate, c.endDate, today);
                      return <dd className={cn("text-[11.5px]", t.tone === "brick" ? "text-brick" : t.tone === "amber" ? "text-amber" : "text-ink-3")}>· {t.text}</dd>;
                    })()}
                  </div>
                  <div className="flex gap-1.5"><dt className="text-ink-3">Ngân sách</dt><dd className="num text-ink">{formatCurrency(c.totalBudget)}</dd></div>
                  <div className="flex gap-1.5"><dt className="text-ink-3">Kênh</dt><dd className="num text-ink">{c.channelCount} kênh · {c.goalCount} mục tiêu</dd></div>
                  <div className="flex gap-1.5"><dt className="text-ink-3">Phụ trách</dt><dd className="text-ink">{c.ownerName}</dd></div>
                </dl>
                <div>
                  <div className="mb-1 flex items-center justify-between text-[11.5px] text-ink-2">
                    <span>Tiến độ</span>
                    <span className="num font-semibold text-ink">{c.progress}%</span>
                  </div>
                  <ProgressBar value={c.progress} label={`Tiến độ ${c.name}`} muted={c.status === "draft" || c.status === "pending_approval" || c.status === "needs_changes"} />
                </div>
                <div className="flex lg:justify-end">
                  <LinkButton href={`/campaigns/${c.id}`}>Xem chi tiết</LinkButton>
                </div>
              </li>
            ))}
          </ul>
        )}
        <Pager page={paged.page} pages={paged.pages} total={paged.total} hrefFor={hrefFor} label="chiến dịch" />
      </section>
    </>
  );
}
