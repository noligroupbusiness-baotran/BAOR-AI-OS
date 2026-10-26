import { and, count, inArray, isNull } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type Database from "better-sqlite3";
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
// Sản phẩm / đơn hàng mẫu: không nạp nữa (chỉ marketing, OWNER 25/10/2026); danh sách id giữ để "Xóa dữ liệu mẫu" dọn bản cũ.
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

// Cài đặt (nhân sự) và Video Studio: nạp khi bảng còn trống, kể cả CSDL đã có dữ liệu cũ.
export function seedCatalogIfEmpty(db: Db) {
  const [{ n }] = db.select({ n: count() }).from(schema.people).all();
  const [{ v }] = db.select({ v: count() }).from(schema.videos).all();
  if (!(n > 0 && v > 0)) db.transaction((tx) => seedCatalogData(tx));
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

// Chữ của bản ghi MẪU đã nạp trước khi đổi sang chỉ marketing (OWNER 25/10/2026, kiểm toán 26/10): CSDL đã nạp giữ chữ cũ
// (nạp chỉ khi trống). Chữ mới lấy từ dữ liệu mẫu hiện hành (src/lib/data/*) để hai nơi không lệch nhau.
// Luật an toàn (phản biện 26/10):
// - CHỈ chữ HIỂN THỊ thuần (tên, mô tả, mục tiêu, nhãn). KHÔNG đụng trường mang hành vi: từ khoá / câu trả lời FAQ, trigger / action /
//   condition / params của luật automation, tags lead, audience_json… (automation_rules, faqs KHÔNG bị "Xóa dữ liệu mẫu" xoá — có thể
//   OWNER đang dùng thật). FAQ faq_ship / luật đổi mục đích chỉ đổi trong dữ liệu mẫu cho CÀI MỚI, không đổi qua đây.
// - Theo BẢN GHI: chỉ sửa khi MỌI ô cần đổi còn nguyên chữ cũ (hoặc đã là chữ mới); OWNER sửa bất kỳ ô nào → bỏ qua cả bản ghi.
type FieldFix = { from: string[]; to: string };
export type RecordFix = { table: "campaigns" | "channel_goals" | "ad_campaigns" | "automation_rules" | "email_sequences" | "auto_reply_rules"; id: string; set: Record<string, FieldFix> };

/** Danh sách sửa chữ mẫu. Dựng trong hàm (không lúc nạp module): thiếu bản ghi mẫu nào thì bỏ mục đó, không ném lỗi. */
export function sampleCopyFixes(): RecordFix[] {
  const find = <T extends { id: string }>(list: T[], id: string): T | undefined => list.find((r) => r.id === id);
  const out: RecordFix[] = [];
  const add = <T extends { id: string }>(table: RecordFix["table"], list: T[], id: string, fields: Record<string, { from: string[]; pick: (x: T) => string }>) => {
    const x = find(list, id);
    if (!x) return;
    out.push({ table, id, set: Object.fromEntries(Object.entries(fields).map(([col, f]) => [col, { from: f.from, to: f.pick(x) }])) });
  };
  add("campaigns", seedCampaigns, "cp_mocdiep_t10", {
    description: { from: ["Dùng gội dưỡng sinh 39.000 đồng làm sản phẩm đầu vào để khách trải nghiệm, thu lead bằng Facebook Ads, chăm sóc qua Zalo OA rồi bán thêm thẻ thành viên."], pick: (c) => c.description },
  });
  add("campaigns", seedCampaigns, "cp_noli_chamsoc", {
    description: { from: ["Nhắc mua lại và ưu đãi thành viên cho khách đã mua trong 12 tháng qua, chủ yếu qua Zalo OA và email."], pick: (c) => c.description },
    objective: { from: ["Đưa 400 khách cũ quay lại mua trong quý 4"], pick: (c) => c.objective },
    target_metric: { from: ["khách mua lại"], pick: (c) => c.targetMetric },
    audience: { from: ["Khách đã mua trong 12 tháng qua"], pick: (c) => c.audience },
  });
  add("campaigns", seedCampaigns, "cp_sale99", {
    description: { from: ["Tuần khuyến mãi 9.9: đẩy combo 3 bước cho khách đã tương tác với fanpage."], pick: (c) => c.description },
    objective: { from: ["Bán 500 combo 3 bước trong tuần Sale 9.9"], pick: (c) => c.objective },
    target_metric: { from: ["đơn hàng", "combo"], pick: (c) => c.targetMetric },
  });
  add("channel_goals", seedGoals, "g_care_email", { objective: { from: ["Chuỗi 4 email nhắc mua lại, tỷ lệ mở 30%"], pick: (g) => g.objective } });
  add("channel_goals", seedGoals, "g_care_page", { objective: { from: ["8 bài ưu đãi thành viên trên fanpage"], pick: (g) => g.objective } });
  // Quảng cáo mẫu: name / audience là chữ hiển thị (nhắm mục tiêu thật nằm ở audience_json, không đổi)
  add("ad_campaigns", seedAds, "ad3", {
    name: { from: ["Retarget: người đã inbox chưa mua"], pick: (a) => a.name },
    audience: { from: ["Custom audience: inbox 30 ngày, chưa mua"], pick: (a) => a.audience },
  });
  add("ad_campaigns", seedAds, "ad4", { audience: { from: ["Lookalike 1% từ khách mua 90 ngày, 18–24"], pick: (a) => a.audience } });
  // Luật automation: CHỈ tên + mô tả (trigger / action / condition / params giữ nguyên)
  add("automation_rules", defaultRules, "ar_price", {
    name: { from: ["Hỏi giá → trả lời bảng giá"], pick: (r) => r.name },
    description: { from: ["Giá lấy từ Cài đặt › Sản phẩm, kèm lời mời để lại số điện thoại.", "Hệ thống chỉ làm marketing, không báo giá: chuyển người tư vấn gọi lại."], pick: (r) => r.description },
  });
  add("automation_rules", defaultRules, "ar_complaint", { description: { from: ["Không trả lời tự động khi khách bức xúc, đưa vào Chờ tôi xử lý."], pick: (r) => r.description } });
  add("automation_rules", defaultRules, "ar_cpl", { description: { from: ["Ngưỡng lấy từ Đăng bài & Quảng cáo › Hạn mức ngân sách."], pick: (r) => r.description } });
  // Bảng "Quy tắc trả lời" ở trang Khách hàng (auto_reply_rules) chỉ là nhãn hiển thị — không có mã nào so khớp / thực thi nó
  // (src/lib/queries.ts listRules chỉ đọc để hiện; bật / tắt chỉ đổi cờ) và "Xóa dữ liệu mẫu" xoá theo ID mẫu.
  add("auto_reply_rules", seedRules, "ar6", {
    trigger: { from: ["Hỏi ship / thời gian giao"], pick: (r) => r.trigger },
    action: { from: ["Trả lời chính sách giao hàng theo khu vực"], pick: (r) => r.action },
  });
  add("email_sequences", seedSeqs, "es2", { name: { from: ["Nuôi dưỡng: hỏi giá chưa mua"], pick: (q) => q.name } });
  add("email_sequences", seedSeqs, "es3", { name: { from: ["Sau mua: hướng dẫn & nhắc mua lại"], pick: (q) => q.name } });
  return out;
}

/** Áp sampleCopyFixes theo bản ghi (idempotent). Trả số bản ghi đã sửa. sqlite: kết nối better-sqlite3 thô. */
export function refreshSampleCopy(sqlite: Database.Database): number {
  let n = 0;
  for (const f of sampleCopyFixes()) {
    const cols = Object.keys(f.set);
    // Tên bảng / cột là hằng trong mã (không từ người dùng); giá trị đi qua tham số.
    const row = sqlite.prepare(`select ${cols.map((c) => `"${c}"`).join(", ")} from "${f.table}" where id = ?`).get(f.id) as Record<string, unknown> | undefined;
    if (!row) continue;
    const untouched = cols.every((c) => row[c] === f.set[c].to || f.set[c].from.includes(String(row[c])));
    const changes = cols.filter((c) => row[c] !== f.set[c].to);
    if (!untouched || changes.length === 0) continue;
    const where = changes.map((c) => `"${c}" = ?`).join(" and ");
    const r = sqlite
      .prepare(`update "${f.table}" set ${changes.map((c) => `"${c}" = ?`).join(", ")} where id = ? and ${where}`)
      .run(...changes.map((c) => f.set[c].to), f.id, ...changes.map((c) => row[c]));
    n += r.changes;
  }
  return n;
}
