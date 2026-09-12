import { and, count, eq, inArray, isNull } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import { contentItems as seedContent, scheduledPosts as seedPosts } from "@/lib/data/content";
import { adCampaigns as seedAds, adBudgetGuardrails } from "@/lib/data/ads";
import { leads as seedLeads, conversations as seedConvs, autoReplyRules as seedRules } from "@/lib/data/customers";
import { emailSequences as seedSeqs, emailCampaigns as seedEmailCampaigns } from "@/lib/data/email";
import { integrations as seedIntegrations, automationSettings } from "@/lib/data/settings";
import { personas as seedPersonas, insights as seedInsights } from "@/lib/data/insights";
import { platformResearch as seedResearch } from "@/lib/data/research";
import { recentActivity } from "@/lib/data/pipeline";
import { people as seedPeople } from "@/lib/data/people";
import { products as seedProducts } from "@/lib/data/products";
import { videos as seedVideos } from "@/lib/data/videos";
import { competitors as seedCompetitors } from "@/lib/data/competitors";
import { defaultFaqs, defaultRules } from "@/lib/data/automation";
import {
  campaignApprovals as seedApprovals,
  campaignLogs as seedCampaignLogs,
  campaignResults as seedResults,
  campaigns as seedCampaigns,
  channelGoals as seedGoals,
  linkedRows,
  marketingLinks as seedLinks,
  sampleOrders as seedOrders,
} from "@/lib/data/campaigns";

type Db = BetterSQLite3Database<typeof schema>;

// Nạp dữ liệu mẫu khi CSDL còn trống để giao diện có gì đó để thao tác ngay.
export function seedIfEmpty(db: Db) {
  const [{ n }] = db.select({ n: count() }).from(schema.contentItems).all();
  if (n > 0) return;
  seedAll(db);
}

export function seedAll(db: Db) {
  db.transaction((tx) => {
    tx.insert(schema.contentItems)
      .values(
        seedContent.map((c) => ({
          id: c.id,
          title: c.title,
          format: c.format,
          status: c.status,
          insightId: c.insightId,
          pillar: c.pillar,
          hook: c.hook,
          outline: JSON.stringify(c.outline),
          draft: c.draft ?? null,
          assignee: c.assignee,
          scheduledFor: c.scheduledFor ?? null,
          createdAt: c.createdAt,
          score: c.score ?? null,
          source: "seed",
        })),
      )
      .run();
    tx.insert(schema.scheduledPosts)
      .values(seedPosts.map((p) => ({ ...p, reach: p.reach ?? null, engagement: p.engagement ?? null, error: p.error ?? null })))
      .run();
    tx.insert(schema.adCampaigns)
      .values(seedAds.map((a) => ({ ...a, contentId: a.contentId ?? null, startedAt: a.startedAt ?? null, aiNote: a.aiNote ?? null })))
      .run();
    tx.insert(schema.leads)
      .values(seedLeads.map((l) => ({ ...l, phone: l.phone ?? null, email: l.email ?? null, tags: JSON.stringify(l.tags) })))
      .run();
    tx.insert(schema.conversations)
      .values(seedConvs.map((c) => ({ id: c.id, leadId: c.leadId, leadName: c.leadName, platform: c.platform, needsHuman: c.needsHuman })))
      .run();
    tx.insert(schema.messages)
      .values(seedConvs.flatMap((c) => c.messages.map((m) => ({ conversationId: c.id, from: m.from, text: m.text, at: m.at }))))
      .run();
    tx.insert(schema.autoReplyRules).values(seedRules).run();
    tx.insert(schema.emailSequences).values(seedSeqs).run();
    tx.insert(schema.emailCampaigns)
      .values(seedEmailCampaigns.map((e) => ({ ...e, sentAt: e.sentAt ?? null, openRate: e.openRate ?? null, clickRate: e.clickRate ?? null })))
      .run();
    tx.insert(schema.integrations)
      .values(seedIntegrations.map((i) => ({ key: i.key, name: i.name, description: i.description, connected: false, account: null, config: "{}" })))
      .onConflictDoNothing()
      .run();
    tx.insert(schema.personas)
      .values(
        seedPersonas.map((p) => ({
          ...p,
          goals: JSON.stringify(p.goals),
          painPoints: JSON.stringify(p.painPoints),
          objections: JSON.stringify(p.objections),
          channels: JSON.stringify(p.channels),
        })),
      )
      .run();
    tx.insert(schema.insights).values(seedInsights).run();
    tx.insert(schema.platformResearch)
      .values(
        seedResearch.map((r) => ({
          ...r,
          trendingTopics: JSON.stringify(r.trendingTopics),
          bestPostingTimes: JSON.stringify(r.bestPostingTimes),
          contentFormats: JSON.stringify(r.contentFormats),
        })),
      )
      .run();
    tx.insert(schema.activity).values(recentActivity.map((a) => ({ at: a.at, actor: a.actor, message: a.message, step: a.step }))).run();

    const settingRows: { key: string; value: string }[] = [
      { key: "brand.name", value: "" },
      { key: "brand.products", value: "" },
      { key: "brand.voice", value: "Gần gũi, xưng 'em' với khách, luôn có bằng chứng, không hứa suông." },
      { key: "ads.dailyCap", value: String(adBudgetGuardrails.dailyCap) },
      { key: "ads.monthlyCap", value: String(adBudgetGuardrails.monthlyCap) },
      { key: "ads.autoPauseCplAbove", value: String(adBudgetGuardrails.autoPauseCplAbove) },
      ...automationSettings.map((s) => ({ key: `automation.${s.key}`, value: s.enabled ? "1" : "0" })),
    ];
    tx.insert(schema.settings).values(settingRows).onConflictDoNothing().run();
    seedCampaignData(tx);
    seedCatalogData(tx);
    seedAutomationData(tx);
    seedCompetitorsData(tx);
  });
}

// Cài đặt (sản phẩm, nhân sự) và Video Studio: nạp khi bảng còn trống, kể cả CSDL đã có dữ liệu cũ.
export function seedCatalogIfEmpty(db: Db) {
  const [{ n }] = db.select({ n: count() }).from(schema.people).all();
  const [{ v }] = db.select({ v: count() }).from(schema.videos).all();
  if (!(n > 0 && v > 0)) db.transaction((tx) => seedCatalogData(tx));
  // Đơn hàng mẫu cho CSDL đã nạp chiến dịch trước khi có bảng orders.
  const [{ o }] = db.select({ o: count() }).from(schema.orders).all();
  const [{ c }] = db.select({ c: count() }).from(schema.campaigns).all();
  if (o === 0 && c > 0 && db.select().from(schema.campaigns).where(eq(schema.campaigns.id, "cp_sale99")).get()) {
    db.transaction((tx) => seedOrdersData(tx));
  }
  const [{ r }] = db.select({ r: count() }).from(schema.automationRules).all();
  if (r === 0) db.transaction((tx) => seedAutomationData(tx));
  const [{ cm }] = db.select({ cm: count() }).from(schema.competitors).all();
  if (cm === 0) db.transaction((tx) => seedCompetitorsData(tx));
}

function seedCompetitorsData(tx: Db) {
  const now = new Date().toISOString();
  tx.insert(schema.competitors)
    .values(seedCompetitors.map((c) => ({ ...c, channels: JSON.stringify(c.channels), offers: JSON.stringify(c.offers), strengths: JSON.stringify(c.strengths), weaknesses: JSON.stringify(c.weaknesses), active: true, updatedAt: now })))
    .onConflictDoNothing()
    .run();
}

// Quy tắc Automation mặc định + kho câu trả lời chuẩn.
function seedAutomationData(tx: Pick<Db, "insert">) {
  const now = "2026-09-10T08:00:00+07:00";
  tx.insert(schema.automationRules)
    .values(defaultRules.map((r) => ({ id: r.id, name: r.name, description: r.description, trigger: r.trigger, condition: JSON.stringify(r.condition), action: r.action, params: JSON.stringify(r.params), priority: r.priority, enabled: r.enabled, requiresApproval: r.requiresApproval, campaignId: r.campaignId, status: r.enabled ? "active" : "draft", runs: 0, lastRunAt: null, lastError: null, createdAt: now, updatedAt: now })))
    .onConflictDoNothing()
    .run();
  tx.insert(schema.faqs)
    .values(defaultFaqs.map((f) => ({ id: f.id, question: f.question, keywords: JSON.stringify(f.keywords.map((k) => k.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").toLowerCase())), answer: f.answer, active: true, hits: 0, updatedAt: now })))
    .onConflictDoNothing()
    .run();
}

function seedCatalogData(tx: Pick<Db, "insert">) {
  const now = "2026-09-10T08:00:00+07:00";
  tx.insert(schema.products).values(seedProducts.map((p) => ({ ...p, active: true, updatedAt: now }))).onConflictDoNothing().run();
  tx.insert(schema.people).values(seedPeople.map((p) => ({ ...p, active: true, updatedAt: now }))).onConflictDoNothing().run();
  tx.insert(schema.videos).values(seedVideos.map((v) => ({ ...v, platforms: JSON.stringify(v.platforms) }))).onConflictDoNothing().run();
}

// Nạp dữ liệu mẫu phân hệ Chiến dịch khi bảng campaigns còn trống (kể cả CSDL đã có dữ liệu cũ).
export function seedCampaignsIfEmpty(db: Db) {
  const [{ n }] = db.select({ n: count() }).from(schema.campaigns).all();
  if (n > 0) return;
  db.transaction((tx) => {
    // Kết nối mới (YouTube, Website) cho CSDL đã nạp trước đây.
    tx.insert(schema.integrations)
      .values(seedIntegrations.map((i) => ({ key: i.key, name: i.name, description: i.description, connected: false, account: null, config: "{}" })))
      .onConflictDoNothing()
      .run();
    seedCampaignData(tx);
  });
}

function seedOrdersData(tx: Pick<Db, "insert">) {
  const leadName = new Map([...seedLeads, ...linkedRows.leads].map((l) => [l.id, l.name]));
  const productOf = new Map(seedProducts.map((p) => [p.id, p]));
  tx.insert(schema.orders)
    .values(
      seedOrders.map((o) => {
        const p = productOf.get(o.productId)!;
        return { id: o.id, leadId: o.leadId, leadName: leadName.get(o.leadId) ?? "Khách", campaignId: o.campaignId, channelGoalId: o.channelGoalId, productId: o.productId, productName: p.name, quantity: o.quantity, unitPrice: p.price, total: p.price * o.quantity, status: o.status, note: o.note, createdBy: "seed", createdAt: o.createdAt, updatedAt: o.createdAt };
      }),
    )
    .onConflictDoNothing()
    .run();
  tx.insert(schema.marketingLinks)
    .values(
      seedOrders.flatMap((o) => [
        { id: `ml_${o.id}`, campaignId: o.campaignId, channelGoalId: o.channelGoalId, entityType: "order", entityId: o.id, status: o.status, ownerId: null, viaType: "lead", viaId: o.leadId, createdAt: o.createdAt },
        ...(o.status === "paid" ? [{ id: `ml_${o.id}_rev`, campaignId: o.campaignId, channelGoalId: o.channelGoalId, entityType: "revenue", entityId: o.id, status: "paid", ownerId: null, viaType: "order", viaId: o.id, createdAt: o.createdAt }] : []),
      ]),
    )
    .onConflictDoNothing()
    .run();
}

// Chiến dịch mẫu + các bản ghi ở phân hệ khác mà chiến dịch liên kết tới (chỉ thêm khi chưa có).
function seedCampaignData(tx: Pick<Db, "insert">) {
  tx.insert(schema.insights)
    .values(linkedRows.insights.map((i) => ({ ...i, personaId: i.personaId || null })))
    .onConflictDoNothing()
    .run();
  tx.insert(schema.contentItems)
    .values(
      linkedRows.content.map((c) => ({
        id: c.id,
        title: c.title,
        format: c.format,
        status: c.status,
        insightId: c.insightId || null,
        pillar: c.pillar,
        hook: c.hook,
        outline: JSON.stringify(c.outline),
        draft: c.draft ?? null,
        assignee: c.assignee,
        scheduledFor: c.scheduledFor ?? null,
        createdAt: c.createdAt,
        score: c.score ?? null,
        source: "seed",
      })),
    )
    .onConflictDoNothing()
    .run();
  tx.insert(schema.scheduledPosts)
    .values(linkedRows.posts.map((p) => ({ ...p, reach: p.reach ?? null, engagement: p.engagement ?? null, error: p.error ?? null })))
    .onConflictDoNothing()
    .run();
  tx.insert(schema.adCampaigns)
    .values(linkedRows.ads.map((a) => ({ ...a, contentId: a.contentId ?? null, startedAt: a.startedAt ?? null, aiNote: a.aiNote ?? null })))
    .onConflictDoNothing()
    .run();
  tx.insert(schema.leads)
    .values(linkedRows.leads.map((l) => ({ ...l, phone: l.phone ?? null, email: l.email ?? null, tags: JSON.stringify(l.tags) })))
    .onConflictDoNothing()
    .run();

  tx.insert(schema.campaigns)
    .values(seedCampaigns.map((c) => ({ ...c, productIds: JSON.stringify(c.productIds) })))
    .onConflictDoNothing()
    .run();
  tx.insert(schema.channelGoals).values(seedGoals).onConflictDoNothing().run();
  tx.insert(schema.marketingLinks).values(seedLinks).onConflictDoNothing().run();
  tx.insert(schema.campaignApprovals).values(seedApprovals).onConflictDoNothing().run();
  tx.insert(schema.campaignResults).values(seedResults).onConflictDoNothing().run();
  tx.insert(schema.campaignLogs).values(seedCampaignLogs.map((l) => ({ ...l, idemKey: null }))).run();
  seedOrdersData(tx);
}

// Chỉ xóa bản ghi mẫu (theo ID nạp ban đầu). Dữ liệu người dùng tự tạo được giữ nguyên.
export function clearSampleOnly(db: Db) {
  const ids = {
    content: [...seedContent.map((c) => c.id), ...linkedRows.content.map((c) => c.id)],
    posts: [...seedPosts.map((p) => p.id), ...linkedRows.posts.map((p) => p.id)],
    ads: [...seedAds.map((a) => a.id), ...linkedRows.ads.map((a) => a.id)],
    leads: [...seedLeads.map((l) => l.id), ...linkedRows.leads.map((l) => l.id)],
    convs: seedConvs.map((c) => c.id),
    rules: seedRules.map((r) => r.id),
    seqs: seedSeqs.map((s) => s.id),
    emails: seedEmailCampaigns.map((e) => e.id),
    insights: [...seedInsights.map((i) => i.id), ...linkedRows.insights.map((i) => i.id)],
    personas: seedPersonas.map((p) => p.id),
    research: seedResearch.map((r) => r.id),
    campaigns: seedCampaigns.map((c) => c.id),
    goals: seedGoals.map((g) => g.id),
    links: seedLinks.map((l) => l.id),
    approvals: seedApprovals.map((a) => a.id),
    products: seedProducts.map((p) => p.id),
    people: seedPeople.map((p) => p.id),
    videos: seedVideos.map((v) => v.id),
    activityAt: recentActivity.map((a) => a.at),
    orders: seedOrders.map((o) => o.id),
    competitors: seedCompetitors.map((c) => c.id),
  };
  db.transaction((tx) => {
    tx.delete(schema.messages).where(inArray(schema.messages.conversationId, ids.convs)).run();
    tx.delete(schema.conversations).where(inArray(schema.conversations.id, ids.convs)).run();
    tx.delete(schema.leads).where(inArray(schema.leads.id, ids.leads)).run();
    tx.delete(schema.contentItems).where(inArray(schema.contentItems.id, ids.content)).run();
    tx.delete(schema.scheduledPosts).where(inArray(schema.scheduledPosts.id, ids.posts)).run();
    tx.delete(schema.adCampaigns).where(inArray(schema.adCampaigns.id, ids.ads)).run();
    tx.delete(schema.autoReplyRules).where(inArray(schema.autoReplyRules.id, ids.rules)).run();
    tx.delete(schema.emailSequences).where(inArray(schema.emailSequences.id, ids.seqs)).run();
    tx.delete(schema.emailCampaigns).where(inArray(schema.emailCampaigns.id, ids.emails)).run();
    tx.delete(schema.insights).where(inArray(schema.insights.id, ids.insights)).run();
    tx.delete(schema.personas).where(inArray(schema.personas.id, ids.personas)).run();
    tx.delete(schema.platformResearch).where(inArray(schema.platformResearch.id, ids.research)).run();
    tx.delete(schema.activity).where(inArray(schema.activity.at, ids.activityAt)).run();
    tx.delete(schema.campaignLogs).where(inArray(schema.campaignLogs.campaignId, ids.campaigns)).run();
    tx.delete(schema.campaignResults).where(inArray(schema.campaignResults.campaignId, ids.campaigns)).run();
    tx.delete(schema.campaignApprovals).where(inArray(schema.campaignApprovals.id, ids.approvals)).run();
    tx.delete(schema.marketingLinks).where(inArray(schema.marketingLinks.id, [...ids.links, ...ids.orders.flatMap((o) => [`ml_${o}`, `ml_${o}_rev`])])).run();
    tx.delete(schema.orders).where(inArray(schema.orders.id, ids.orders)).run();
    tx.delete(schema.competitors).where(inArray(schema.competitors.id, ids.competitors)).run();
    tx.delete(schema.channelGoals).where(inArray(schema.channelGoals.id, ids.goals)).run();
    tx.delete(schema.campaigns).where(inArray(schema.campaigns.id, ids.campaigns)).run();
    tx.delete(schema.videos).where(inArray(schema.videos.id, ids.videos)).run();
    tx.delete(schema.products).where(inArray(schema.products.id, ids.products)).run();
    // Nhân sự mẫu: chỉ xóa người chưa được cấp mật khẩu (chưa thành tài khoản thật).
    tx.delete(schema.people).where(and(inArray(schema.people.id, ids.people), isNull(schema.people.passwordHash))).run();
  });
}

export function clearAll(db: Db) {
  db.transaction((tx) => {
    for (const t of [
      schema.messages,
      schema.conversations,
      schema.leads,
      schema.contentItems,
      schema.scheduledPosts,
      schema.adCampaigns,
      schema.autoReplyRules,
      schema.emailSequences,
      schema.emailCampaigns,
      schema.insights,
      schema.personas,
      schema.platformResearch,
      schema.activity,
      schema.campaignLogs,
      schema.campaignResults,
      schema.campaignApprovals,
      schema.marketingLinks,
      schema.channelGoals,
      schema.campaigns,
      schema.videos,
      schema.people,
      schema.products,
      schema.orders,
    ]) {
      tx.delete(t).run();
    }
  });
}
