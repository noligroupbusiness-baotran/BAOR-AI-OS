// Repository phân hệ Chiến dịch. Giao diện chỉ gọi qua `campaignRepo`, không truy vấn CSDL trực tiếp.
// Hiện dùng SQLite (Drizzle). Nối API thật: viết một implementation khác của CampaignRepository
// và đổi dòng export ở cuối tệp, không đụng giao diện.
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { channelDef, CHANNELS } from "@/config/channels";
import { catalogRepo } from "@/lib/catalog/repository";
import { videoStatusLabel, type VideoStatus } from "@/lib/data/videos";
import { contentStatusLabel, leadStageLabel, postStatusLabel, adStatusLabel } from "@/lib/labels";
import type { AdStatus, ContentStatus, LeadStage, PostStatus } from "@/lib/types";
import { campaignAlerts, campaignProgress, overlapsMonth } from "./results";
import type {
  ApprovalStatus,
  Campaign,
  CampaignApproval,
  CampaignFilter,
  CampaignLog,
  CampaignResult,
  CampaignStats,
  CampaignStatus,
  CampaignSummary,
  ChannelGoal,
  ChannelGoalStatus,
  LinkedEntityType,
  LinkedMarketingItem,
  NewCampaignInput,
  NewChannelGoalInput,
  Person,
  PlatformAccount,
  Product,
} from "./types";

export interface ResolvedLink {
  link: LinkedMarketingItem;
  title: string;
  sub: string;
  statusLabel: string;
  /** Trạng thái mới nhất của thực thể tại phân hệ nguồn (để mở đúng tab). */
  entityStatus: string;
  found: boolean;
}

export interface PendingCampaignApproval extends CampaignApproval {
  campaignName: string;
}

export interface CampaignRepository {
  list(filter?: CampaignFilter): CampaignSummary[];
  get(id: string): Campaign | undefined;
  summary(id: string): CampaignSummary | undefined;
  stats(today: string): CampaignStats;
  goals(campaignId: string): ChannelGoal[];
  goal(id: string): ChannelGoal | undefined;
  links(campaignId: string, channelGoalId?: string | null): LinkedMarketingItem[];
  resolveLinks(links: LinkedMarketingItem[]): ResolvedLink[];
  approvals(campaignId: string): CampaignApproval[];
  pendingApprovals(): PendingCampaignApproval[];
  result(campaignId: string): CampaignResult | undefined;
  logs(campaignId: string, limit?: number): CampaignLog[];
  alerts(campaign: Campaign, goals: ChannelGoal[], today: string): string[];
  people(): Person[];
  products(): Product[];
  accounts(): PlatformAccount[];
  connectedMap(): Record<string, boolean>;

  create(input: NewCampaignInput, actor: string, status: Extract<CampaignStatus, "draft" | "pending_approval">): Campaign;
  setStatus(id: string, status: CampaignStatus, actor: string, extra?: Partial<Pick<Campaign, "approvedBy" | "approvedAt">>): void;
  addGoal(campaignId: string, input: NewChannelGoalInput, status: ChannelGoalStatus): ChannelGoal;
  updateGoal(id: string, patch: Partial<Omit<ChannelGoal, "id" | "campaignId" | "createdAt">>): void;
  addLink(link: Omit<LinkedMarketingItem, "id" | "createdAt">): void;
  addApproval(a: Omit<CampaignApproval, "id" | "requestedAt" | "decidedBy" | "decidedAt" | "status"> & { status?: ApprovalStatus }): CampaignApproval;
  decideApprovals(campaignId: string, type: CampaignApproval["type"], status: ApprovalStatus, by: string, note?: string): void;
  decideEntityApprovals(campaignId: string, entityType: LinkedEntityType, entityId: string, status: ApprovalStatus, by: string, note?: string): void;
  /** Ghi nhật ký. Trả về false nếu idemKey đã dùng (thao tác lặp). */
  log(campaignId: string, actor: string, action: string, detail?: string, idemKey?: string | null): boolean;
  hasIdem(idemKey: string): boolean;

  update(id: string, patch: Partial<Omit<Campaign, "id" | "createdAt" | "createdBy" | "status">>): void;
  /** Liên kết của một nhóm thực thể (để phân hệ khác hiện nhãn chiến dịch). */
  linksForEntities(entityType: LinkedEntityType, entityIds: string[]): Map<string, EntityCampaignLink[]>;
  removeLink(campaignId: string, entityType: LinkedEntityType, entityId: string): void;
  /** Phân hệ nguồn đổi trạng thái → cập nhật trạng thái trong bảng liên kết. */
  syncEntityStatus(entityType: LinkedEntityType, entityId: string, status: string): void;
  /** Sao chép liên kết của thực thể nguồn sang thực thể sinh ra từ nó (VD: nội dung → bài đăng). */
  inheritLinks(fromType: LinkedEntityType, fromId: string, toType: LinkedEntityType, toId: string, status: string): void;
}

export interface EntityCampaignLink {
  campaignId: string;
  campaignName: string;
  channelGoalId: string | null;
  channel: string | null;
  status: string;
}

const parse = <T>(s: string, fallback: T): T => {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const nowIso = () => new Date().toISOString();

type CampaignRow = typeof schema.campaigns.$inferSelect;
type GoalRow = typeof schema.channelGoals.$inferSelect;
type LinkRow = typeof schema.marketingLinks.$inferSelect;
type ApprovalRow = typeof schema.campaignApprovals.$inferSelect;

const toCampaign = (r: CampaignRow): Campaign => ({
  ...r,
  status: r.status as CampaignStatus,
  productIds: parse<string[]>(r.productIds, []),
});

const toGoal = (r: GoalRow): ChannelGoal => ({
  ...r,
  channel: r.channel as ChannelGoal["channel"],
  executionType: r.executionType as ChannelGoal["executionType"],
  primaryMetric: r.primaryMetric as ChannelGoal["primaryMetric"],
  status: r.status as ChannelGoalStatus,
});

const toLink = (r: LinkRow): LinkedMarketingItem => ({
  ...r,
  entityType: r.entityType as LinkedEntityType,
  viaType: (r.viaType as LinkedEntityType | null) ?? null,
});

const toApproval = (r: ApprovalRow): CampaignApproval => ({
  ...r,
  type: r.type as CampaignApproval["type"],
  status: r.status as ApprovalStatus,
  entityType: (r.entityType as LinkedEntityType | null) ?? null,
});

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();

class SqliteCampaignRepository implements CampaignRepository {
  private get db() {
    return getDb();
  }

  people(): Person[] {
    return catalogRepo.listPeople().map(({ id, name, role }) => ({ id, name, role }));
  }

  products(): Product[] {
    return catalogRepo.listProducts(true).map(({ id, name, brand, price, unit, description }) => ({ id, name, brand, price, unit, description }));
  }

  accounts(): PlatformAccount[] {
    return this.db
      .select({ key: schema.integrations.key, name: schema.integrations.name, connected: schema.integrations.connected, account: schema.integrations.account })
      .from(schema.integrations)
      .all();
  }

  connectedMap(): Record<string, boolean> {
    const out: Record<string, boolean> = {};
    for (const a of this.accounts()) out[a.key] = a.connected;
    return out;
  }

  private summarize(c: Campaign, goals: ChannelGoal[], connected: Record<string, boolean>, today: string, people: Person[], products: Product[]): CampaignSummary {
    const result = this.result(c.id) ?? null;
    return {
      ...c,
      ownerName: people.find((p) => p.id === c.ownerId)?.name ?? "Chưa phân công",
      productNames: c.productIds.map((id) => products.find((p) => p.id === id)?.name ?? id),
      goalCount: goals.length,
      channelCount: new Set(goals.map((g) => g.channel)).size,
      progress: campaignProgress(c, goals, result),
      alerts: campaignAlerts(c, goals, connected, today).length,
    };
  }

  list(filter: CampaignFilter = {}): CampaignSummary[] {
    const rows = this.db.select().from(schema.campaigns).orderBy(desc(schema.campaigns.updatedAt)).all().map(toCampaign);
    const allGoals = this.db.select().from(schema.channelGoals).all().map(toGoal);
    const connected = this.connectedMap();
    const today = new Date().toISOString().slice(0, 10);
    const people = catalogRepo.listPeople(true);
    const products = this.products();
    const q = filter.q ? normalize(filter.q.trim()) : "";
    return rows
      .filter((c) => (filter.status ? c.status === filter.status : true))
      .filter((c) => (filter.product ? c.productIds.includes(filter.product) : true))
      .filter((c) => (filter.owner ? c.ownerId === filter.owner : true))
      .filter((c) => (filter.month ? overlapsMonth(c.startDate, c.endDate, filter.month) : true))
      .filter((c) => (q ? normalize(`${c.name} ${c.objective}`).includes(q) : true))
      .map((c) =>
        this.summarize(
          c,
          allGoals.filter((g) => g.campaignId === c.id),
          connected,
          today,
          people,
          products,
        ),
      );
  }

  get(id: string) {
    const r = this.db.select().from(schema.campaigns).where(eq(schema.campaigns.id, id)).get();
    return r ? toCampaign(r) : undefined;
  }

  summary(id: string) {
    const c = this.get(id);
    if (!c) return undefined;
    return this.summarize(c, this.goals(id), this.connectedMap(), new Date().toISOString().slice(0, 10), catalogRepo.listPeople(true), this.products());
  }

  stats(today: string): CampaignStats {
    const all = this.list();
    const month = today.slice(0, 7);
    return {
      active: all.filter((c) => c.status === "active").length,
      pendingApproval: all.filter((c) => c.status === "pending_approval").length,
      monthBudget: all.filter((c) => c.status !== "draft" && c.status !== "ended" && overlapsMonth(c.startDate, c.endDate, month)).reduce((n, c) => n + c.totalBudget, 0),
      alerts: all.reduce((n, c) => n + c.alerts, 0),
    };
  }

  goals(campaignId: string) {
    return this.db.select().from(schema.channelGoals).where(eq(schema.channelGoals.campaignId, campaignId)).orderBy(asc(schema.channelGoals.createdAt)).all().map(toGoal);
  }

  goal(id: string) {
    const r = this.db.select().from(schema.channelGoals).where(eq(schema.channelGoals.id, id)).get();
    return r ? toGoal(r) : undefined;
  }

  links(campaignId: string, channelGoalId?: string | null) {
    const where = channelGoalId
      ? and(eq(schema.marketingLinks.campaignId, campaignId), eq(schema.marketingLinks.channelGoalId, channelGoalId))
      : eq(schema.marketingLinks.campaignId, campaignId);
    return this.db.select().from(schema.marketingLinks).where(where).orderBy(desc(schema.marketingLinks.createdAt)).all().map(toLink);
  }

  // Tra tên và trạng thái mới nhất của từng thực thể ở phân hệ nguồn.
  resolveLinks(links: LinkedMarketingItem[]): ResolvedLink[] {
    const db = this.db;
    const idsOf = (t: LinkedEntityType) => links.filter((l) => l.entityType === t).map((l) => l.entityId);
    const pick = <T extends { id: string }>(rows: T[]) => new Map(rows.map((r) => [r.id, r]));
    const contentIds = idsOf("content");
    const insightIds = idsOf("insight");
    const postIds = idsOf("publication");
    const adIds = idsOf("ad");
    const leadIds = idsOf("lead");
    const contents = contentIds.length ? pick(db.select().from(schema.contentItems).where(inArray(schema.contentItems.id, contentIds)).all()) : new Map();
    const insights = insightIds.length ? pick(db.select().from(schema.insights).where(inArray(schema.insights.id, insightIds)).all()) : new Map();
    const posts = postIds.length ? pick(db.select().from(schema.scheduledPosts).where(inArray(schema.scheduledPosts.id, postIds)).all()) : new Map();
    const ads = adIds.length ? pick(db.select().from(schema.adCampaigns).where(inArray(schema.adCampaigns.id, adIds)).all()) : new Map();
    const leads = leadIds.length ? pick(db.select().from(schema.leads).where(inArray(schema.leads.id, leadIds)).all()) : new Map();
    const videoIds = idsOf("video");
    const videoMap = videoIds.length ? pick(db.select().from(schema.videos).where(inArray(schema.videos.id, videoIds)).all()) : new Map();

    return links.map((link) => {
      const missing: ResolvedLink = { link, title: `Không tìm thấy (${link.entityId})`, sub: "Bản ghi nguồn đã bị xóa hoặc chưa nạp.", statusLabel: link.status, entityStatus: link.status, found: false };
      switch (link.entityType) {
        case "content": {
          const c = contents.get(link.entityId);
          if (!c) return missing;
          const st = contentStatusLabel[c.status as ContentStatus];
          return { link, title: c.title, sub: c.hook || c.pillar, statusLabel: st?.label ?? c.status, entityStatus: c.status, found: true };
        }
        case "insight": {
          const i = insights.get(link.entityId);
          if (!i) return missing;
          return { link, title: i.title, sub: i.source, statusLabel: `Độ tin cậy ${i.confidence}%`, entityStatus: "active", found: true };
        }
        case "publication": {
          const p = posts.get(link.entityId);
          if (!p) return missing;
          const st = postStatusLabel[p.status as PostStatus];
          return { link, title: p.title, sub: `${p.platform} · ${p.scheduledFor.slice(0, 16).replace("T", " ")}`, statusLabel: st?.label ?? p.status, entityStatus: p.status, found: true };
        }
        case "ad": {
          const a = ads.get(link.entityId);
          if (!a) return missing;
          const st = adStatusLabel[a.status as AdStatus];
          return { link, title: a.name, sub: `${a.dailyBudget.toLocaleString("vi-VN")} ₫/ngày · ${a.audience}`, statusLabel: st?.label ?? a.status, entityStatus: a.status, found: true };
        }
        case "lead": {
          const l = leads.get(link.entityId);
          if (!l) return missing;
          const st = leadStageLabel[l.stage as LeadStage];
          return { link, title: l.name, sub: l.lastMessage, statusLabel: st?.label ?? l.stage, entityStatus: l.stage, found: true };
        }
        case "video": {
          const v = videoMap.get(link.entityId);
          if (!v) return missing;
          return { link, title: v.title, sub: `${v.agent} · bản ${v.version} · ${parse<string[]>(v.platforms, []).join(", ")}`, statusLabel: videoStatusLabel[v.status as VideoStatus]?.label ?? v.status, entityStatus: v.status, found: true };
        }
        default:
          return { ...missing, title: link.entityId, sub: "", found: true };
      }
    });
  }

  approvals(campaignId: string) {
    return this.db
      .select()
      .from(schema.campaignApprovals)
      .where(eq(schema.campaignApprovals.campaignId, campaignId))
      .orderBy(desc(schema.campaignApprovals.requestedAt))
      .all()
      .map(toApproval)
      .sort((a, b) => (a.status === "pending" ? 0 : 1) - (b.status === "pending" ? 0 : 1));
  }

  pendingApprovals(): PendingCampaignApproval[] {
    const rows = this.db.select().from(schema.campaignApprovals).where(eq(schema.campaignApprovals.status, "pending")).orderBy(desc(schema.campaignApprovals.requestedAt)).all().map(toApproval);
    const names = new Map(this.db.select({ id: schema.campaigns.id, name: schema.campaigns.name }).from(schema.campaigns).all().map((c) => [c.id, c.name]));
    return rows.map((a) => ({ ...a, campaignName: names.get(a.campaignId) ?? a.campaignId }));
  }

  result(campaignId: string) {
    const r = this.db.select().from(schema.campaignResults).where(eq(schema.campaignResults.campaignId, campaignId)).get();
    return r ? { ...r, source: r.source as CampaignResult["source"] } : undefined;
  }

  logs(campaignId: string, limit = 20): CampaignLog[] {
    return this.db
      .select({ id: schema.campaignLogs.id, campaignId: schema.campaignLogs.campaignId, at: schema.campaignLogs.at, actor: schema.campaignLogs.actor, action: schema.campaignLogs.action, detail: schema.campaignLogs.detail })
      .from(schema.campaignLogs)
      .where(eq(schema.campaignLogs.campaignId, campaignId))
      .orderBy(desc(schema.campaignLogs.at), desc(schema.campaignLogs.id))
      .limit(limit)
      .all();
  }

  alerts(campaign: Campaign, goals: ChannelGoal[], today: string) {
    return campaignAlerts(campaign, goals, this.connectedMap(), today);
  }

  create(input: NewCampaignInput, actor: string, status: "draft" | "pending_approval"): Campaign {
    const now = nowIso();
    const id = newId("cp");
    const row = {
      id,
      name: input.name,
      description: input.description,
      objective: input.objective,
      targetMetric: input.targetMetric,
      targetValue: input.targetValue,
      productIds: JSON.stringify(input.productIds),
      audience: input.audience,
      location: input.location,
      startDate: input.startDate,
      endDate: input.endDate,
      totalBudget: input.totalBudget,
      budgetNote: input.budgetNote,
      ownerId: input.ownerId,
      status,
      createdBy: actor,
      createdAt: now,
      updatedAt: now,
      approvedBy: null,
      approvedAt: null,
    };
    this.db.transaction((tx) => {
      tx.insert(schema.campaigns).values(row).run();
      if (input.goals.length) {
        tx.insert(schema.channelGoals)
          .values(input.goals.map((g) => ({ ...goalRow(id, g), status: "planned", createdAt: now, updatedAt: now })))
          .run();
      }
    });
    return toCampaign(row);
  }

  setStatus(id: string, status: CampaignStatus, actor: string, extra: Partial<Pick<Campaign, "approvedBy" | "approvedAt">> = {}) {
    void actor;
    this.db.update(schema.campaigns).set({ status, updatedAt: nowIso(), ...extra }).where(eq(schema.campaigns.id, id)).run();
  }

  addGoal(campaignId: string, input: NewChannelGoalInput, status: ChannelGoalStatus): ChannelGoal {
    const now = nowIso();
    const row = { ...goalRow(campaignId, input), status, createdAt: now, updatedAt: now };
    this.db.insert(schema.channelGoals).values(row).run();
    this.db.update(schema.campaigns).set({ updatedAt: now }).where(eq(schema.campaigns.id, campaignId)).run();
    return toGoal(row);
  }

  updateGoal(id: string, patch: Partial<Omit<ChannelGoal, "id" | "campaignId" | "createdAt">>) {
    this.db.update(schema.channelGoals).set({ ...patch, updatedAt: nowIso() }).where(eq(schema.channelGoals.id, id)).run();
  }

  addLink(link: Omit<LinkedMarketingItem, "id" | "createdAt">) {
    this.db
      .insert(schema.marketingLinks)
      .values({ ...link, id: newId("ml"), createdAt: nowIso() })
      .onConflictDoNothing()
      .run();
  }

  addApproval(a: Omit<CampaignApproval, "id" | "requestedAt" | "decidedBy" | "decidedAt" | "status"> & { status?: ApprovalStatus }): CampaignApproval {
    const row = { ...a, id: newId("ap"), status: a.status ?? "pending", requestedAt: nowIso(), decidedBy: null, decidedAt: null };
    this.db.insert(schema.campaignApprovals).values(row).run();
    return toApproval(row);
  }

  decideApprovals(campaignId: string, type: CampaignApproval["type"], status: ApprovalStatus, by: string, note = "") {
    this.db
      .update(schema.campaignApprovals)
      .set({ status, decidedBy: by, decidedAt: nowIso(), ...(note ? { note } : {}) })
      .where(and(eq(schema.campaignApprovals.campaignId, campaignId), eq(schema.campaignApprovals.type, type), eq(schema.campaignApprovals.status, "pending")))
      .run();
  }

  decideEntityApprovals(campaignId: string, entityType: LinkedEntityType, entityId: string, status: ApprovalStatus, by: string, note = "") {
    this.db
      .update(schema.campaignApprovals)
      .set({ status, decidedBy: by, decidedAt: nowIso(), ...(note ? { note } : {}) })
      .where(and(eq(schema.campaignApprovals.campaignId, campaignId), eq(schema.campaignApprovals.entityType, entityType), eq(schema.campaignApprovals.entityId, entityId), eq(schema.campaignApprovals.status, "pending")))
      .run();
  }

  log(campaignId: string, actor: string, action: string, detail = "", idemKey: string | null = null): boolean {
    try {
      this.db.insert(schema.campaignLogs).values({ campaignId, at: nowIso(), actor, action, detail, idemKey }).run();
      return true;
    } catch (e) {
      if (idemKey && String(e).includes("UNIQUE")) return false;
      throw e;
    }
  }

  hasIdem(idemKey: string): boolean {
    const [{ n }] = this.db.select({ n: sql<number>`count(*)` }).from(schema.campaignLogs).where(eq(schema.campaignLogs.idemKey, idemKey)).all();
    return n > 0;
  }

  update(id: string, patch: Partial<Omit<Campaign, "id" | "createdAt" | "createdBy" | "status">>) {
    const { productIds, ...rest } = patch;
    this.db
      .update(schema.campaigns)
      .set({ ...rest, ...(productIds ? { productIds: JSON.stringify(productIds) } : {}), updatedAt: nowIso() })
      .where(eq(schema.campaigns.id, id))
      .run();
  }

  linksForEntities(entityType: LinkedEntityType, entityIds: string[]): Map<string, EntityCampaignLink[]> {
    const out = new Map<string, EntityCampaignLink[]>();
    if (entityIds.length === 0) return out;
    const rows = this.db
      .select({
        entityId: schema.marketingLinks.entityId,
        campaignId: schema.marketingLinks.campaignId,
        channelGoalId: schema.marketingLinks.channelGoalId,
        status: schema.marketingLinks.status,
        campaignName: schema.campaigns.name,
        channel: schema.channelGoals.channel,
      })
      .from(schema.marketingLinks)
      .leftJoin(schema.campaigns, eq(schema.campaigns.id, schema.marketingLinks.campaignId))
      .leftJoin(schema.channelGoals, eq(schema.channelGoals.id, schema.marketingLinks.channelGoalId))
      .where(and(eq(schema.marketingLinks.entityType, entityType), inArray(schema.marketingLinks.entityId, entityIds)))
      .all();
    for (const r of rows) {
      const list = out.get(r.entityId) ?? [];
      list.push({ campaignId: r.campaignId, campaignName: r.campaignName ?? r.campaignId, channelGoalId: r.channelGoalId, channel: r.channel ?? null, status: r.status });
      out.set(r.entityId, list);
    }
    return out;
  }

  removeLink(campaignId: string, entityType: LinkedEntityType, entityId: string) {
    this.db
      .delete(schema.marketingLinks)
      .where(and(eq(schema.marketingLinks.campaignId, campaignId), eq(schema.marketingLinks.entityType, entityType), eq(schema.marketingLinks.entityId, entityId)))
      .run();
  }

  syncEntityStatus(entityType: LinkedEntityType, entityId: string, status: string) {
    this.db.update(schema.marketingLinks).set({ status }).where(and(eq(schema.marketingLinks.entityType, entityType), eq(schema.marketingLinks.entityId, entityId))).run();
  }

  inheritLinks(fromType: LinkedEntityType, fromId: string, toType: LinkedEntityType, toId: string, status: string) {
    const src = this.db.select().from(schema.marketingLinks).where(and(eq(schema.marketingLinks.entityType, fromType), eq(schema.marketingLinks.entityId, fromId))).all();
    for (const l of src) {
      this.addLink({ campaignId: l.campaignId, channelGoalId: l.channelGoalId, entityType: toType, entityId: toId, status, ownerId: l.ownerId, viaType: fromType, viaId: fromId });
    }
  }
}

function goalRow(campaignId: string, g: NewChannelGoalInput) {
  const def = channelDef(g.channel) ?? CHANNELS[0];
  return {
    id: newId("g"),
    campaignId,
    channel: def.key,
    accountId: g.accountId ?? def.integrationKey,
    executionType: g.executionType,
    objective: g.objective,
    primaryMetric: g.primaryMetric,
    targetValue: g.targetValue,
    currentValue: 0,
    budget: g.budget,
    spent: 0,
    ownerId: g.ownerId,
    startDate: g.startDate,
    endDate: g.endDate,
  };
}

// Đổi implementation ở đây khi nối API thật.
export const campaignRepo: CampaignRepository = new SqliteCampaignRepository();
