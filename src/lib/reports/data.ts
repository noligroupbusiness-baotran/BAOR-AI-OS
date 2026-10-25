// Lớp dữ liệu Báo cáo: so sánh mục tiêu với kết quả ở cấp chiến dịch, kênh, nội dung, video, lead,
// chi phí (chỉ marketing — không đơn hàng / doanh thu, OWNER 25/10/2026). Không có số trang trí; mọi con số truy ngược được về bản ghi nguồn.
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { channelLabel, metricLabel } from "@/config/channels";
import { campaignRepo } from "@/lib/campaigns/repository";
import { campaignProgress, costPerLead, goalProgress, overlapsMonth } from "@/lib/campaigns/results";
import type { CampaignStatus, ChannelGoal } from "@/lib/campaigns/types";
import { listLeads, listPosts } from "@/lib/queries";
import { listVideos } from "@/lib/videos/repository";
import { getAiBudget } from "@/lib/router";
import { isSampleAd, monthSpentDetail, vnDate } from "@/lib/ads/authorization";
import { isSample } from "@/lib/sample";

export interface ReportFilter {
  month?: string; // YYYY-MM
  campaignId?: string;
}

export interface CampaignRow {
  id: string;
  name: string;
  status: CampaignStatus;
  objective: string;
  startDate: string;
  endDate: string;
  targetMetric: string;
  targetValue: number | null;
  achieved: number;
  progress: number;
  leads: number;
  spent: number;
  budget: number;
  cpl: number | null;
  source: "system" | "sample" | "mixed" | "none";
  /** Chiến dịch mẫu (dữ liệu demo): không cộng vào tổng số thật, hiện nhãn "Mẫu". */
  sample: boolean;
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
      const spent = r?.spent ?? 0;
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        objective: c.objective,
        startDate: c.startDate,
        endDate: c.endDate,
        targetMetric: c.targetMetric,
        targetValue: c.targetValue,
        achieved: r?.achievedValue ?? 0,
        progress: campaignProgress(c, goals, r ?? null),
        leads,
        spent,
        budget: c.totalBudget,
        cpl: costPerLead(spent, leads),
        source: r ? r.source : "none",
        sample: isSample("campaign", c.id) || r?.source === "sample",
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
  /** Dòng gộp từ mục tiêu kênh MẪU (dòng thật không bao giờ lẫn mục tiêu mẫu). */
  sample: boolean;
}

export function channelRows(f: ReportFilter = {}): ChannelRow[] {
  const campaigns = campaignRepo.list().filter((c) => (f.campaignId ? c.id === f.campaignId : true)).filter((c) => (f.month ? overlapsMonth(c.startDate, c.endDate, f.month) : true)).filter((c) => c.status !== "draft");
  // Gộp theo (kênh, thật / mẫu): mục tiêu kênh MẪU không cộng vào dòng thật — thành dòng riêng gắn nhãn "Mẫu".
  const byChannel = new Map<string, { channel: string; sample: boolean; goals: ChannelGoal[]; campaigns: Set<string> }>();
  for (const c of campaigns) {
    for (const g of campaignRepo.goals(c.id)) {
      const sample = isSample("goal", g.id);
      const k = `${g.channel}|${sample ? 1 : 0}`;
      const e = byChannel.get(k) ?? { channel: g.channel, sample, goals: [], campaigns: new Set() };
      e.goals.push(g);
      e.campaigns.add(c.id);
      byChannel.set(k, e);
    }
  }
  const leadLinks = getDb().select().from(schema.marketingLinks).where(eq(schema.marketingLinks.entityType, "lead")).all();
  const groupOf = new Map<string, string>();
  for (const [k, e] of byChannel) for (const g of e.goals) groupOf.set(g.id, k);
  const leadsByGroup = new Map<string, number>();
  for (const l of leadLinks) {
    const k = l.channelGoalId ? groupOf.get(l.channelGoalId) : undefined;
    // lead mẫu chỉ tính ở dòng mẫu; dòng thật chỉ lead thật
    if (k && isSample("lead", l.entityId) === k.endsWith("|1")) leadsByGroup.set(k, (leadsByGroup.get(k) ?? 0) + 1);
  }
  return [...byChannel.entries()]
    .map(([k, e]) => {
      const counts = new Map<string, number>();
      for (const g of e.goals) counts.set(g.primaryMetric, (counts.get(g.primaryMetric) ?? 0) + 1);
      const metric = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
      const same = e.goals.filter((g) => g.primaryMetric === metric);
      const target = same.reduce((n, g) => n + g.targetValue, 0);
      const current = same.reduce((n, g) => n + g.currentValue, 0);
      return {
        channel: e.channel,
        label: channelLabel(e.channel),
        goals: e.goals.length,
        campaigns: e.campaigns.size,
        metric,
        metricLabel: metricLabel(metric),
        target,
        current,
        progress: goalProgress({ targetValue: target, currentValue: current }),
        budget: e.goals.reduce((n, g) => n + g.budget, 0),
        spent: e.goals.reduce((n, g) => n + g.spent, 0),
        leads: leadsByGroup.get(k) ?? 0,
        sample: e.sample,
      };
    })
    .sort((a, b) => Number(a.sample) - Number(b.sample) || b.spent - a.spent || b.budget - a.budget);
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
  /** Lead MẪU (dữ liệu demo): KHÔNG nằm trong total / các nhóm, chỉ đếm riêng để hiện nhãn "Mẫu". */
  sample: number;
  sampleWon: number;
}

export function leadSummary(f: ReportFilter = {}): LeadSummary {
  const leads = listLeads().filter((l) => (f.month ? l.lastMessageAt.startsWith(f.month) : true));
  const links = campaignRepo.linksForEntities("lead", leads.map((l) => l.id));
  const scoped = f.campaignId ? leads.filter((l) => (links.get(l.id) ?? []).some((x) => x.campaignId === f.campaignId)) : leads;
  // Số chính chỉ từ lead thật; lead mẫu tách riêng
  const filtered = scoped.filter((l) => !isSample("lead", l.id));
  const sampleLeads = scoped.filter((l) => isSample("lead", l.id));
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
    sample: sampleLeads.length,
    sampleWon: sampleLeads.filter((l) => l.stage === "won").length,
  };
}


/** Tổng của các dòng chiến dịch, tách số thật / số mẫu (kiểm toán 26/10: không cộng số mẫu vào số thật). */
export function campaignTotals(rows: CampaignRow[]) {
  const sum = (list: CampaignRow[]) => {
    const leads = list.reduce((n, r) => n + r.leads, 0);
    const spent = list.reduce((n, r) => n + r.spent, 0);
    return { leads, spent, budget: list.reduce((n, r) => n + r.budget, 0), cpl: costPerLead(spent, leads) };
  };
  return { real: sum(rows.filter((r) => !r.sample)), sample: sum(rows.filter((r) => r.sample)) };
}

/** "Đã chi quảng cáo" của tháng lọc (mặc định tháng này, giờ VN) — cùng cách tính với trang Quảng cáo (monthSpentDetail, bỏ mẫu).
 *  Tháng đã qua: tính tới ngày cuối tháng đó; tháng chưa tới: 0. */
export function adSpentForMonth(month?: string, today = vnDate()): number {
  const cur = today.slice(0, 7);
  if (!month || month === cur) return monthSpentDetail(today).total;
  if (month > cur) return 0;
  const [y, m] = month.split("-").map(Number);
  const last = `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
  return monthSpentDetail(last).total;
}

export function costSummary(f: ReportFilter = {}) {
  const rows = campaignRows(f);
  const t = campaignTotals(rows);
  // Quảng cáo: "Đã chi tháng" = đúng số của trang Quảng cáo / Đăng bài (monthSpentDetail, đã bỏ quảng cáo mẫu); phần mẫu tách riêng.
  const adSpent = adSpentForMonth(f.month);
  const adSpentSample = getDb().select().from(schema.adCampaigns).all().filter((a) => isSampleAd(a.id)).reduce((n, a) => n + a.spent, 0);
  const ai = getAiBudget();
  return {
    budget: t.real.budget,
    spent: t.real.spent,
    budgetSample: t.sample.budget,
    spentSample: t.sample.spent,
    leads: t.real.leads,
    leadsSample: t.sample.leads,
    adSpent,
    adSpentSample,
    aiMonth: ai.spentMonthVnd,
    aiCap: ai.monthlyCapVnd,
    byCampaign: rows.map((r) => ({ name: r.name, budget: r.budget, spent: r.spent, leads: r.leads, cpl: r.cpl, sample: r.sample })),
  };
}


export function recentDecisions(limit = 10) {
  return getDb().select().from(schema.marketingDecisions).orderBy(desc(schema.marketingDecisions.at)).limit(limit).all();
}
