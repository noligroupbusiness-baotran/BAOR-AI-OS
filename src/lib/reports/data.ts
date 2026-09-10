// Lớp dữ liệu Báo cáo: so sánh mục tiêu với kết quả ở cấp chiến dịch, kênh, nội dung, video, lead,
// đơn hàng, chi phí. Không có số trang trí; mọi con số truy ngược được về bản ghi nguồn.
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { channelLabel, metricLabel } from "@/config/channels";
import { campaignRepo } from "@/lib/campaigns/repository";
import { campaignProgress, conversionRate, costPerLead, goalProgress, overlapsMonth, roas } from "@/lib/campaigns/results";
import type { CampaignStatus, ChannelGoal } from "@/lib/campaigns/types";
import { listOrders } from "@/lib/orders/repository";
import { listLeads, listPosts } from "@/lib/queries";
import { listVideos } from "@/lib/videos/repository";
import { getAiBudget } from "@/lib/router";
import { catalogRepo } from "@/lib/catalog/repository";

export interface ReportFilter {
  month?: string; // YYYY-MM
  campaignId?: string;
}

export interface CampaignRow {
  id: string;
  name: string;
  status: CampaignStatus;
  objective: string;
  targetMetric: string;
  targetValue: number | null;
  achieved: number;
  progress: number;
  leads: number;
  orders: number;
  revenue: number;
  spent: number;
  budget: number;
  cpl: number | null;
  conversion: number | null;
  roas: number | null;
  source: "system" | "sample" | "none";
}

export function campaignRows(f: ReportFilter = {}): CampaignRow[] {
  return campaignRepo
    .list()
    .filter((c) => (f.campaignId ? c.id === f.campaignId : true))
    .filter((c) => (f.month ? overlapsMonth(c.startDate, c.endDate, f.month) : true))
    .filter((c) => c.status !== "draft")
    .map((c) => {
      const goals = campaignRepo.goals(c.id);
      const r = campaignRepo.result(c.id);
      const leads = r?.leads ?? 0;
      const orders = r?.orders ?? 0;
      const revenue = r?.revenue ?? 0;
      const spent = r?.spent ?? 0;
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        objective: c.objective,
        targetMetric: c.targetMetric,
        targetValue: c.targetValue,
        achieved: r?.achievedValue ?? 0,
        progress: campaignProgress(c, goals, r ?? null),
        leads,
        orders,
        revenue,
        spent,
        budget: c.totalBudget,
        cpl: costPerLead(spent, leads),
        conversion: conversionRate(orders, leads),
        roas: roas(revenue, spent),
        source: r ? r.source : "none",
      };
    });
}

export interface ChannelRow {
  channel: string;
  label: string;
  goals: number;
  campaigns: number;
  /** Chỉ số chính phổ biến nhất của kênh, gộp chỉ tiêu và thực tế theo chỉ số đó. */
  metric: string;
  metricLabel: string;
  target: number;
  current: number;
  progress: number;
  budget: number;
  spent: number;
  leads: number;
}

export function channelRows(f: ReportFilter = {}): ChannelRow[] {
  const campaigns = campaignRepo.list().filter((c) => (f.campaignId ? c.id === f.campaignId : true)).filter((c) => (f.month ? overlapsMonth(c.startDate, c.endDate, f.month) : true)).filter((c) => c.status !== "draft");
  const byChannel = new Map<string, { goals: ChannelGoal[]; campaigns: Set<string> }>();
  for (const c of campaigns) {
    for (const g of campaignRepo.goals(c.id)) {
      const e = byChannel.get(g.channel) ?? { goals: [], campaigns: new Set() };
      e.goals.push(g);
      e.campaigns.add(c.id);
      byChannel.set(g.channel, e);
    }
  }
  const leadLinks = getDb().select().from(schema.marketingLinks).where(eq(schema.marketingLinks.entityType, "lead")).all();
  const goalOf = new Map<string, string>();
  for (const e of byChannel.values()) for (const g of e.goals) goalOf.set(g.id, g.channel);
  const leadsByChannel = new Map<string, number>();
  for (const l of leadLinks) {
    const ch = l.channelGoalId ? goalOf.get(l.channelGoalId) : undefined;
    if (ch) leadsByChannel.set(ch, (leadsByChannel.get(ch) ?? 0) + 1);
  }
  return [...byChannel.entries()]
    .map(([channel, e]) => {
      const counts = new Map<string, number>();
      for (const g of e.goals) counts.set(g.primaryMetric, (counts.get(g.primaryMetric) ?? 0) + 1);
      const metric = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
      const same = e.goals.filter((g) => g.primaryMetric === metric);
      const target = same.reduce((n, g) => n + g.targetValue, 0);
      const current = same.reduce((n, g) => n + g.currentValue, 0);
      return {
        channel,
        label: channelLabel(channel),
        goals: e.goals.length,
        campaigns: e.campaigns.size,
        metric,
        metricLabel: metricLabel(metric),
        target,
        current,
        progress: goalProgress({ targetValue: target, currentValue: current }),
        budget: e.goals.reduce((n, g) => n + g.budget, 0),
        spent: e.goals.reduce((n, g) => n + g.spent, 0),
        leads: leadsByChannel.get(channel) ?? 0,
      };
    })
    .sort((a, b) => b.spent - a.spent || b.budget - a.budget);
}

export interface ContentRow {
  contentId: string;
  title: string;
  platforms: string[];
  posts: number;
  reach: number;
  engagement: number;
  rate: number | null;
  campaigns: string[];
}

export function contentRows(f: ReportFilter = {}): ContentRow[] {
  const posts = listPosts().filter((p) => p.status === "published").filter((p) => (f.month ? p.scheduledFor.startsWith(f.month) : true));
  const links = campaignRepo.linksForEntities("publication", posts.map((p) => p.id));
  const map = new Map<string, ContentRow>();
  for (const p of posts) {
    const camps = (links.get(p.id) ?? []).map((l) => l.campaignName);
    if (f.campaignId && !(links.get(p.id) ?? []).some((l) => l.campaignId === f.campaignId)) continue;
    const row = map.get(p.contentId) ?? { contentId: p.contentId, title: p.title, platforms: [], posts: 0, reach: 0, engagement: 0, rate: null, campaigns: [] };
    row.posts++;
    row.reach += p.reach ?? 0;
    row.engagement += p.engagement ?? 0;
    if (!row.platforms.includes(p.platform)) row.platforms.push(p.platform);
    for (const c of camps) if (!row.campaigns.includes(c)) row.campaigns.push(c);
    map.set(p.contentId, row);
  }
  return [...map.values()].map((r) => ({ ...r, rate: r.reach ? Math.round((r.engagement / r.reach) * 1000) / 10 : null })).sort((a, b) => b.reach - a.reach);
}

export function videoSummary() {
  const vids = listVideos();
  const by = (s: string) => vids.filter((v) => v.status === s).length;
  return { total: vids.length, editing: by("editing"), review: by("review"), needsChanges: by("needs_changes"), pending: by("pending_approval"), approved: by("approved"), approvedList: vids.filter((v) => v.status === "approved") };
}

export interface LeadSummary {
  total: number;
  byStage: { stage: string; n: number }[];
  bySource: { source: string; n: number }[];
  byPlatform: { platform: string; n: number }[];
  byCampaign: { campaign: string; n: number; won: number }[];
  won: number;
}

export function leadSummary(f: ReportFilter = {}): LeadSummary {
  const leads = listLeads().filter((l) => (f.month ? l.lastMessageAt.startsWith(f.month) : true));
  const links = campaignRepo.linksForEntities("lead", leads.map((l) => l.id));
  const filtered = f.campaignId ? leads.filter((l) => (links.get(l.id) ?? []).some((x) => x.campaignId === f.campaignId)) : leads;
  const count = <K extends string>(items: typeof filtered, key: (l: (typeof filtered)[number]) => K) => {
    const m = new Map<K, number>();
    for (const l of items) m.set(key(l), (m.get(key(l)) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const byCampaign = new Map<string, { n: number; won: number }>();
  for (const l of filtered) {
    const names = (links.get(l.id) ?? []).map((x) => x.campaignName);
    for (const name of names.length ? names : ["Chưa gắn chiến dịch"]) {
      const e = byCampaign.get(name) ?? { n: 0, won: 0 };
      e.n++;
      if (l.stage === "won") e.won++;
      byCampaign.set(name, e);
    }
  }
  return {
    total: filtered.length,
    byStage: count(filtered, (l) => l.stage).map(([stage, n]) => ({ stage, n })),
    bySource: count(filtered, (l) => l.source).map(([source, n]) => ({ source, n })),
    byPlatform: count(filtered, (l) => l.platform).map(([platform, n]) => ({ platform, n })),
    byCampaign: [...byCampaign.entries()].map(([campaign, e]) => ({ campaign, ...e })).sort((a, b) => b.n - a.n),
    won: filtered.filter((l) => l.stage === "won").length,
  };
}

export function orderSummary(f: ReportFilter = {}) {
  const orders = listOrders().filter((o) => (f.month ? o.createdAt.startsWith(f.month) : true)).filter((o) => (f.campaignId ? o.campaignId === f.campaignId : true));
  const paid = orders.filter((o) => o.status === "paid");
  const revenue = paid.reduce((n, o) => n + o.total, 0);
  const group = (key: (o: (typeof paid)[number]) => string) => {
    const m = new Map<string, { n: number; revenue: number }>();
    for (const o of paid) {
      const k = key(o);
      const e = m.get(k) ?? { n: 0, revenue: 0 };
      e.n += o.quantity;
      e.revenue += o.total;
      m.set(k, e);
    }
    return [...m.entries()].map(([name, e]) => ({ name, ...e })).sort((a, b) => b.revenue - a.revenue);
  };
  return { orders: orders.length, paid: paid.length, pending: orders.filter((o) => o.status === "new").length, revenue, aov: paid.length ? Math.round(revenue / paid.length) : 0, byProduct: group((o) => o.productName), byCampaign: group((o) => o.campaignName ?? "Chưa gắn chiến dịch") };
}

export function costSummary(f: ReportFilter = {}) {
  const rows = campaignRows(f);
  const adSpent = getDb().select().from(schema.adCampaigns).all().reduce((n, a) => n + a.spent, 0);
  const ai = getAiBudget();
  return {
    budget: rows.reduce((n, r) => n + r.budget, 0),
    spent: rows.reduce((n, r) => n + r.spent, 0),
    revenue: rows.reduce((n, r) => n + r.revenue, 0),
    adSpent,
    aiMonth: ai.spentMonthVnd,
    aiCap: ai.monthlyCapVnd,
    byCampaign: rows.map((r) => ({ name: r.name, budget: r.budget, spent: r.spent, revenue: r.revenue, roas: r.roas })),
  };
}

export function productCount() {
  return catalogRepo.listProducts().length;
}

export function recentDecisions(limit = 10) {
  return getDb().select().from(schema.marketingDecisions).orderBy(desc(schema.marketingDecisions.at)).limit(limit).all();
}
