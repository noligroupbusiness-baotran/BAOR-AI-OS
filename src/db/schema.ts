import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// Nội dung (ý tưởng → nháp → duyệt → lên lịch → đã đăng)
export const contentItems = sqliteTable("content_items", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  format: text("format").notNull(), // post | reel | carousel | story | article
  status: text("status").notNull(), // proposed | in_progress | review | approved | scheduled | published | dismissed
  insightId: text("insight_id"),
  pillar: text("pillar").notNull().default(""),
  hook: text("hook").notNull().default(""),
  outline: text("outline").notNull().default("[]"), // JSON string[]
  draft: text("draft"),
  assignee: text("assignee").notNull().default("ai"), // ai | human
  scheduledFor: text("scheduled_for"),
  createdAt: text("created_at").notNull(),
  score: integer("score"),
  source: text("source").notNull().default("seed"), // seed | ai | manual
});

export const scheduledPosts = sqliteTable("scheduled_posts", {
  id: text("id").primaryKey(),
  contentId: text("content_id").notNull(),
  title: text("title").notNull(),
  platform: text("platform").notNull(),
  scheduledFor: text("scheduled_for").notNull(),
  status: text("status").notNull(), // scheduled | publishing | published | failed
  reach: integer("reach"),
  engagement: integer("engagement"),
  error: text("error"),
});

export const adCampaigns = sqliteTable("ad_campaigns", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  objective: text("objective").notNull(),
  status: text("status").notNull(), // proposed | pending_approval | active | paused | ended | rejected
  dailyBudget: integer("daily_budget").notNull(),
  spent: integer("spent").notNull().default(0),
  impressions: integer("impressions").notNull().default(0),
  clicks: integer("clicks").notNull().default(0),
  leads: integer("leads").notNull().default(0),
  audience: text("audience").notNull().default(""),
  contentId: text("content_id"),
  startedAt: text("started_at"),
  aiNote: text("ai_note"),
});

export const leads = sqliteTable("leads", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  source: text("source").notNull(),
  platform: text("platform").notNull(),
  stage: text("stage").notNull(), // new | contacted | qualified | won | lost
  lastMessage: text("last_message").notNull().default(""),
  lastMessageAt: text("last_message_at").notNull(),
  phone: text("phone"),
  email: text("email"),
  tags: text("tags").notNull().default("[]"),
  autoReplied: integer("auto_replied", { mode: "boolean" }).notNull().default(false),
});

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  leadId: text("lead_id").notNull(),
  leadName: text("lead_name").notNull(),
  platform: text("platform").notNull(),
  needsHuman: integer("needs_human", { mode: "boolean" }).notNull().default(false),
});

export const messages = sqliteTable("messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  conversationId: text("conversation_id").notNull(),
  from: text("from").notNull(), // customer | ai | human
  text: text("text").notNull(),
  at: text("at").notNull(),
});

export const autoReplyRules = sqliteTable("auto_reply_rules", {
  id: text("id").primaryKey(),
  trigger: text("trigger").notNull(),
  action: text("action").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  hits: integer("hits").notNull().default(0),
});

export const emailSequences = sqliteTable("email_sequences", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  trigger: text("trigger").notNull(),
  steps: integer("steps").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  subscribers: integer("subscribers").notNull().default(0),
  openRate: real("open_rate").notNull().default(0),
  clickRate: real("click_rate").notNull().default(0),
});

export const emailCampaigns = sqliteTable("email_campaigns", {
  id: text("id").primaryKey(),
  subject: text("subject").notNull(),
  sentAt: text("sent_at"),
  status: text("status").notNull(), // draft | scheduled | sent
  recipients: integer("recipients").notNull().default(0),
  openRate: real("open_rate"),
  clickRate: real("click_rate"),
});

export const integrations = sqliteTable("integrations", {
  key: text("key").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  connected: integer("connected", { mode: "boolean" }).notNull().default(false),
  account: text("account"),
  config: text("config").notNull().default("{}"), // JSON: token, ids... (giá trị bí mật được mã hóa, không hiển thị ra ngoài)
  lastCheckedAt: text("last_checked_at"),
  lastCheckOk: integer("last_check_ok", { mode: "boolean" }),
  lastError: text("last_error"),
  lastSyncAt: text("last_sync_at"),
});

// Cặp key/value: brand, voice, automation flags, admin_email, admin_password_hash, guardrails
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const personas = sqliteTable("personas", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  ageRange: text("age_range").notNull().default(""),
  occupation: text("occupation").notNull().default(""),
  location: text("location").notNull().default(""),
  goals: text("goals").notNull().default("[]"),
  painPoints: text("pain_points").notNull().default("[]"),
  objections: text("objections").notNull().default("[]"),
  channels: text("channels").notNull().default("[]"),
  share: integer("share").notNull().default(0),
});

export const insights = sqliteTable("insights", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  detail: text("detail").notNull().default(""),
  confidence: integer("confidence").notNull().default(0),
  source: text("source").notNull().default(""),
  personaId: text("persona_id"),
  createdAt: text("created_at").notNull(),
  usedInContent: integer("used_in_content").notNull().default(0),
});

export const platformResearch = sqliteTable("platform_research", {
  id: text("id").primaryKey(),
  platform: text("platform").notNull(),
  name: text("name").notNull(),
  updatedAt: text("updated_at").notNull(),
  audienceFit: integer("audience_fit").notNull().default(0),
  trendingTopics: text("trending_topics").notNull().default("[]"),
  bestPostingTimes: text("best_posting_times").notNull().default("[]"),
  contentFormats: text("content_formats").notNull().default("[]"),
  summary: text("summary").notNull().default(""),
});

export const activity = sqliteTable("activity", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  at: text("at").notNull(),
  actor: text("actor").notNull(), // ai | human | system
  message: text("message").notNull(),
  step: text("step").notNull().default(""),
});

// ---------------------------------------------------------------------------
// Phân hệ Chiến dịch: chiến dịch (cấp 1) → mục tiêu kênh (cấp 2) → liên kết dùng chung.
// Domain type tương ứng ở src/lib/campaigns/types.ts.
// ---------------------------------------------------------------------------

export const campaigns = sqliteTable("campaigns", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  objective: text("objective").notNull(),
  targetMetric: text("target_metric").notNull().default(""),
  targetValue: integer("target_value"),
  productIds: text("product_ids").notNull().default("[]"), // JSON string[]
  audience: text("audience").notNull().default(""),
  location: text("location").notNull().default(""),
  startDate: text("start_date").notNull(), // YYYY-MM-DD
  endDate: text("end_date").notNull(),
  totalBudget: integer("total_budget").notNull().default(0),
  budgetNote: text("budget_note").notNull().default(""),
  ownerId: text("owner_id").notNull(),
  status: text("status").notNull(), // draft | pending_approval | needs_changes | approved | active | paused | ended | error
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  approvedBy: text("approved_by"),
  approvedAt: text("approved_at"),
});

export const channelGoals = sqliteTable(
  "channel_goals",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id").notNull(),
    channel: text("channel").notNull(), // khóa trong src/config/channels.ts
    accountId: text("account_id"), // khóa integrations
    executionType: text("execution_type").notNull(), // organic | paid | nurture | lead_gen
    objective: text("objective").notNull(),
    primaryMetric: text("primary_metric").notNull(),
    targetValue: integer("target_value").notNull().default(0),
    currentValue: integer("current_value").notNull().default(0),
    budget: integer("budget").notNull().default(0),
    spent: integer("spent").notNull().default(0),
    ownerId: text("owner_id").notNull(),
    status: text("status").notNull(), // planned | active | paused | done | error
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("channel_goals_campaign_idx").on(t.campaignId)],
);

// Liên kết dùng chung: mọi thực thể (insight, content, video, publication, ad, lead, automation_run...)
// tham chiếu chiến dịch và mục tiêu kênh qua bảng này.
export const marketingLinks = sqliteTable(
  "marketing_links",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id").notNull(),
    channelGoalId: text("channel_goal_id"),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    status: text("status").notNull().default(""),
    ownerId: text("owner_id"),
    viaType: text("via_type"),
    viaId: text("via_id"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("marketing_links_entity_uq").on(t.campaignId, t.entityType, t.entityId),
    index("marketing_links_campaign_idx").on(t.campaignId),
  ],
);

export const campaignApprovals = sqliteTable(
  "campaign_approvals",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id").notNull(),
    channelGoalId: text("channel_goal_id"),
    type: text("type").notNull(), // campaign_change | channel_goal | content | video | schedule | budget | automation
    title: text("title").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    status: text("status").notNull(), // pending | approved | rejected
    requestedBy: text("requested_by").notNull(),
    requestedAt: text("requested_at").notNull(),
    decidedBy: text("decided_by"),
    decidedAt: text("decided_at"),
    note: text("note").notNull().default(""),
  },
  (t) => [index("campaign_approvals_campaign_idx").on(t.campaignId)],
);

export const campaignResults = sqliteTable("campaign_results", {
  campaignId: text("campaign_id").primaryKey(),
  achievedValue: integer("achieved_value").notNull().default(0),
  leads: integer("leads").notNull().default(0),
  orders: integer("orders").notNull().default(0),
  revenue: integer("revenue").notNull().default(0),
  spent: integer("spent").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
  source: text("source").notNull().default("sample"), // sample | system
});

// Nhật ký hành động quan trọng của chiến dịch. idem_key chống thực hiện lặp do bấm nút nhiều lần.
export const campaignLogs = sqliteTable(
  "campaign_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    campaignId: text("campaign_id").notNull(),
    at: text("at").notNull(),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    detail: text("detail").notNull().default(""),
    idemKey: text("idem_key"),
  },
  (t) => [uniqueIndex("campaign_logs_idem_uq").on(t.idemKey), index("campaign_logs_campaign_idx").on(t.campaignId)],
);

// ---------------------------------------------------------------------------
// Cài đặt hệ thống = nguồn dữ liệu chuẩn: sản phẩm & bảng giá, nhân sự & phân quyền.
// AI và các phân hệ không tự đặt giá hay nghĩ ra người phụ trách; tất cả đọc từ đây.
// ---------------------------------------------------------------------------

export const products = sqliteTable("products", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  brand: text("brand").notNull().default(""),
  price: integer("price").notNull().default(0), // VND
  unit: text("unit").notNull().default(""),
  description: text("description").notNull().default(""),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  updatedAt: text("updated_at").notNull(),
});

export const people = sqliteTable("people", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull().default(""),
  email: text("email").notNull().default(""),
  permission: text("permission").notNull().default("staff"), // admin | manager | staff
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  passwordHash: text("password_hash"), // scrypt; null = chưa cấp quyền đăng nhập
  updatedAt: text("updated_at").notNull(),
});

// Video Studio: video do Agent dựng từ kịch bản (content_id); chỉ chuẩn bị, không tự đăng.
export const videos = sqliteTable("videos", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  contentId: text("content_id"),
  agent: text("agent").notNull().default("Agent Edit Video"),
  status: text("status").notNull(), // editing | review | needs_changes | pending_approval | approved
  platforms: text("platforms").notNull().default("[]"), // JSON string[]
  version: integer("version").notNull().default(1),
  note: text("note").notNull().default(""),
  updatedAt: text("updated_at").notNull(),
});

// ---------------------------------------------------------------------------
// Bộ định tuyến luật / AI và lớp kết nối nền tảng.
// ---------------------------------------------------------------------------

// Mọi quyết định của hệ thống: đi làn "rule" (có dữ liệu + công thức) hay làn "ai" (thiếu dữ liệu nguồn).
export const marketingDecisions = sqliteTable(
  "marketing_decisions",
  {
    id: text("id").primaryKey(),
    at: text("at").notNull(),
    lane: text("lane").notNull(), // rule | ai | human
    domain: text("domain").notNull(), // ads | reply | content | research | publish | sync
    subject: text("subject").notNull(), // mô tả ngắn việc cần quyết
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    campaignId: text("campaign_id"),
    outcome: text("outcome").notNull(), // kết luận ngắn
    reason: text("reason").notNull().default(""),
    confidence: integer("confidence"), // 0-100, chỉ với làn ai
    sources: text("sources").notNull().default("[]"), // JSON string[]: nguồn tra cứu
    needsApproval: integer("needs_approval", { mode: "boolean" }).notNull().default(false),
    aiCallId: text("ai_call_id"),
  },
  (t) => [index("marketing_decisions_at_idx").on(t.at)],
);

// Sổ chi phí AI: mọi lần gọi mô hình đều ghi lại để so với trần ngân sách trong Cài đặt.
export const aiCalls = sqliteTable("ai_calls", {
  id: text("id").primaryKey(),
  at: text("at").notNull(),
  purpose: text("purpose").notNull(),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  costVnd: integer("cost_vnd").notNull().default(0),
  ok: integer("ok", { mode: "boolean" }).notNull().default(true),
  error: text("error"),
});

// Nhật ký đồng bộ / đăng bài / webhook của từng kết nối.
export const syncRuns = sqliteTable(
  "sync_runs",
  {
    id: text("id").primaryKey(),
    integrationKey: text("integration_key").notNull(),
    kind: text("kind").notNull(), // check | metrics | publish | webhook | ads
    startedAt: text("started_at").notNull(),
    finishedAt: text("finished_at"),
    ok: integer("ok", { mode: "boolean" }).notNull().default(false),
    message: text("message").notNull().default(""),
    items: integer("items").notNull().default(0),
  },
  (t) => [index("sync_runs_started_idx").on(t.startedAt)],
);

// ---------------------------------------------------------------------------
// Đơn hàng: nguồn doanh thu thật cho chiến dịch và báo cáo. Mỗi đơn gắn lead, sản phẩm từ danh mục,
// và chiến dịch / mục tiêu kênh (kế thừa từ lead nếu không chỉ định).
// ---------------------------------------------------------------------------
export const orders = sqliteTable(
  "orders",
  {
    id: text("id").primaryKey(),
    leadId: text("lead_id"),
    leadName: text("lead_name").notNull().default(""),
    campaignId: text("campaign_id"),
    channelGoalId: text("channel_goal_id"),
    productId: text("product_id"),
    productName: text("product_name").notNull(),
    quantity: integer("quantity").notNull().default(1),
    unitPrice: integer("unit_price").notNull().default(0),
    total: integer("total").notNull().default(0),
    status: text("status").notNull(), // new | paid | cancelled
    note: text("note").notNull().default(""),
    createdBy: text("created_by").notNull().default(""),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("orders_campaign_idx").on(t.campaignId), index("orders_lead_idx").on(t.leadId)],
);
