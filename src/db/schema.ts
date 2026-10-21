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
  /** Ảnh đính kèm (uploads.id) cho định dạng hình ảnh hoặc ảnh minh họa bài. */
  assetUploadId: text("asset_upload_id"),
});

export const scheduledPosts = sqliteTable("scheduled_posts", {
  id: text("id").primaryKey(),
  contentId: text("content_id").notNull(),
  title: text("title").notNull(),
  platform: text("platform").notNull(),
  scheduledFor: text("scheduled_for").notNull(),
  status: text("status").notNull(), // scheduled | publishing | verifying | published | failed | dry_run
  reach: integer("reach"),
  engagement: integer("engagement"),
  error: text("error"),
  // CP04: đăng video đã duyệt. PUBLISHED chỉ khi nền tảng trả mã bài VÀ đọc lại được bài (verifiedAt, permalink).
  videoId: text("video_id"),
  caption: text("caption"),
  thumbnailUploadId: text("thumbnail_upload_id"),
  externalId: text("external_id"),
  permalink: text("permalink"),
  attempts: integer("attempts").notNull().default(0),
  publishedAt: text("published_at"),
  verifiedAt: text("verified_at"),
  views: integer("views"),
  metricsAt: text("metrics_at"),
  /** "live" đăng thật; "dry_run" chế độ thử: dựng đủ yêu cầu nhưng không gọi nền tảng. */
  mode: text("mode").notNull().default("live"),
  /** Chống đăng trùng: một video chỉ một bài trên mỗi kênh (vd "facebook:v_abc"). */
  dedupeKey: text("dedupe_key").unique(),
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
  // CP05: nháp chiến dịch Meta từ video đã đăng. Mọi thứ tạo trên Meta ở trạng thái PAUSED; bật chỉ qua cổng ủy quyền ngân sách.
  videoId: text("video_id"),
  postId: text("post_id"), // scheduled_posts.id của bài video đã đăng (creative)
  audienceJson: text("audience_json"), // JSON { countries[], ageMin, ageMax, genders[] }
  startAt: text("start_at"),
  endAt: text("end_at"),
  metaCampaignId: text("meta_campaign_id"),
  metaAdsetId: text("meta_adset_id"),
  metaCreativeId: text("meta_creative_id"),
  metaAdId: text("meta_ad_id"),
  insightsAt: text("insights_at"),
  createdBy: text("created_by"),
});

// CP05: chi tiêu theo ngày đọc từ Meta Insights, để tính đúng chi tiêu trong tháng cho cổng ủy quyền ngân sách.
export const adSpendDaily = sqliteTable(
  "ad_spend_daily",
  {
    adId: text("ad_id").notNull(),
    date: text("date").notNull(), // YYYY-MM-DD
    spend: integer("spend").notNull().default(0),
    impressions: integer("impressions").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    leads: integer("leads").notNull().default(0),
    thruplays: integer("thruplays").notNull().default(0),
  },
  (t) => [uniqueIndex("ad_spend_daily_ad_date_idx").on(t.adId, t.date)],
);

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
  status: text("status").notNull().default("approved"), // proposed (AI rút ra, chờ duyệt) | approved | rejected
  origin: text("origin").notNull().default("seed"), // seed | ai | manual
  evidence: text("evidence").notNull().default("[]"), // JSON string[]: trích dẫn / nguồn cụ thể
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

// Đối thủ: theo dõi thủ công (tên, kênh, định vị, giá, điểm mạnh / yếu). So sánh giá tính theo luật với danh mục sản phẩm.
export const competitors = sqliteTable("competitors", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** Thương hiệu của mình mà đối thủ này cạnh tranh (khớp products.brand), rỗng = chung. */
  brand: text("brand").notNull().default(""),
  positioning: text("positioning").notNull().default(""),
  channels: text("channels").notNull().default("[]"), // JSON [{platform, url, followers}]
  offers: text("offers").notNull().default("[]"), // JSON [{name, price, unit}]
  strengths: text("strengths").notNull().default("[]"), // JSON string[]
  weaknesses: text("weaknesses").notNull().default("[]"), // JSON string[]
  note: text("note").notNull().default(""),
  lastCheckedAt: text("last_checked_at"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  updatedAt: text("updated_at").notNull(),
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
  uploadId: text("upload_id"), // tệp video trong bảng uploads (khi tải lên tay hoặc Agent gửi)
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

// ---------------------------------------------------------------------------
// Automation: quy tắc "khi X thì Y" chạy trên bộ định tuyến, và kho câu trả lời chuẩn (FAQ).
// ---------------------------------------------------------------------------
export const faqs = sqliteTable("faqs", {
  id: text("id").primaryKey(),
  question: text("question").notNull(),
  keywords: text("keywords").notNull().default("[]"), // JSON string[] đã bỏ dấu, viết thường
  answer: text("answer").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  hits: integer("hits").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
});

export const automationRules = sqliteTable("automation_rules", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  trigger: text("trigger").notNull(), // message_received | lead_created | lead_stale | post_engagement_high | campaign_behind | ad_cpl_high
  condition: text("condition").notNull().default("{}"), // JSON theo trigger
  action: text("action").notNull(), // reply_faq | reply_price | mark_needs_human | set_stage | tag_lead | notify | propose_ad | pause_ad | request_approval
  params: text("params").notNull().default("{}"), // JSON theo action
  priority: integer("priority").notNull().default(100), // nhỏ chạy trước
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  requiresApproval: integer("requires_approval", { mode: "boolean" }).notNull().default(false),
  campaignId: text("campaign_id"),
  status: text("status").notNull().default("draft"), // draft | active | paused | error
  runs: integer("runs").notNull().default(0),
  lastRunAt: text("last_run_at"),
  lastError: text("last_error"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const automationRuns = sqliteTable(
  "automation_runs",
  {
    id: text("id").primaryKey(),
    ruleId: text("rule_id").notNull(),
    at: text("at").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    ok: integer("ok", { mode: "boolean" }).notNull().default(true),
    message: text("message").notNull().default(""),
    decisionId: text("decision_id"),
  },
  (t) => [index("automation_runs_rule_idx").on(t.ruleId), index("automation_runs_at_idx").on(t.at)],
);

// ---------------------------------------------------------------------------
// Tệp tải lên (logo, nhạc, video) lưu trong DATA_DIR/uploads; bảng này là danh mục.
// ---------------------------------------------------------------------------
export const uploads = sqliteTable("uploads", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(), // logo | music | video | image
  name: text("name").notNull(), // tên gốc
  fileName: text("file_name").notNull(), // tên trên đĩa
  mime: text("mime").notNull().default(""),
  size: integer("size").notNull().default(0),
  meta: text("meta").notNull().default("{}"), // JSON: mood, durationSec...
  uploadedBy: text("uploaded_by").notNull().default(""),
  createdAt: text("created_at").notNull(),
});

// ---------------------------------------------------------------------------
// Bảo mật tài khoản: xác thực hai lớp (TOTP), mã dự phòng, phiên bản phiên (đăng xuất mọi thiết bị),
// lần đăng nhập gần nhất; và nhật ký sự kiện bảo mật riêng (không lẫn với nhật ký hoạt động).
// ---------------------------------------------------------------------------

export const securityAccounts = sqliteTable("security_accounts", {
  email: text("email").primaryKey(),
  totpSecret: text("totp_secret"), // mã hóa AES-GCM (src/lib/secrets.ts); null = chưa thiết lập
  totpEnabled: integer("totp_enabled", { mode: "boolean" }).notNull().default(false),
  backupCodes: text("backup_codes").notNull().default("[]"), // JSON mảng scrypt hash, mỗi mã dùng một lần
  sessionVersion: integer("session_version").notNull().default(1), // tăng lên = mọi phiên cũ hết hiệu lực
  lastLoginAt: text("last_login_at"),
  lastLoginIp: text("last_login_ip").notNull().default(""),
  updatedAt: text("updated_at").notNull(),
});

export const securityEvents = sqliteTable(
  "security_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    at: text("at").notNull(),
    email: text("email").notNull().default(""),
    ip: text("ip").notNull().default(""),
    // login_ok | login_fail | login_locked | mfa_fail | logout | password_changed | mfa_enabled | mfa_disabled
    // | backup_codes_regenerated | sessions_revoked | permission_changed | rate_limited
    kind: text("kind").notNull(),
    detail: text("detail").notNull().default(""),
  },
  (t) => [index("security_events_email_at_idx").on(t.email, t.at), index("security_events_at_idx").on(t.at)],
);

// ---------------------------------------------------------------------------
// Động cơ thương hiệu — CP01. Second Brain: Notion là NGUỒN CHUẨN; bảng dưới chỉ là chỉ mục truy xuất (đọc lại từ Notion,
// không sửa trong hệ thống). Kèm hồ sơ nghiên cứu nguồn ngoài và Content Brief kết hợp hai nguồn.
// ---------------------------------------------------------------------------

export const knowledgeIndex = sqliteTable(
  "knowledge_index",
  {
    id: text("id").primaryKey(), // id trang Notion (32 ký tự hex)
    title: text("title").notNull(),
    url: text("url").notNull(),
    section: text("section").notNull().default(""), // 00 | 01 KIẾN THỨC | 02 SKILL | 03 QUYẾT ĐỊNH OWNER …
    area: text("area").notNull().default(""), // N1 Đào tạo | N2 Bán hàng… | N3 Edit video | …
    kind: text("kind").notNull().default(""), // Principle | SOP | Framework | Skill | Decision …
    status: text("status").notNull().default("DRAFT"), // ACTIVE | VERIFIED | DRAFT | ARCHIVED
    labels: text("labels").notNull().default("[]"), // JSON: ["[OWNER]", "[NGHIÊN CỨU]", "[AI SUY LUẬN]"]
    sourceGrade: text("source_grade").notNull().default(""),
    notionEditedAt: text("notion_edited_at"),
    body: text("body").notNull().default(""),
    bodyHash: text("body_hash").notNull().default(""),
    origin: text("origin").notNull().default("notion_sync"), // notion_sync | snapshot
    syncedAt: text("synced_at").notNull(),
  },
  (t) => [index("knowledge_index_status_idx").on(t.status)],
);

export const researchTasks = sqliteTable(
  "research_tasks",
  {
    id: text("id").primaryKey(),
    question: text("question").notNull(),
    purposeKind: text("purpose_kind").notNull(), // content | audience | verify | trend | gap | result
    purpose: text("purpose").notNull().default(""),
    contentId: text("content_id"),
    campaignId: text("campaign_id"),
    status: text("status").notNull().default("draft"), // draft | running | done | error
    runner: text("runner").notNull().default("ai"), // ai | import
    model: text("model"),
    searchCount: integer("search_count").notNull().default(0),
    costVnd: integer("cost_vnd").notNull().default(0),
    summary: text("summary").notNull().default(""),
    error: text("error"),
    createdBy: text("created_by").notNull().default(""),
    createdAt: text("created_at").notNull(),
    finishedAt: text("finished_at"),
  },
  (t) => [index("research_tasks_created_idx").on(t.createdAt)],
);

export const researchSources = sqliteTable(
  "research_sources",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id").notNull(),
    url: text("url").notNull(),
    title: text("title").notNull(),
    author: text("author").notNull().default(""), // tác giả hoặc tổ chức; trống = chưa xác định
    publisher: text("publisher").notNull().default(""),
    publishedAt: text("published_at"), // không đoán: null khi trang không ghi
    sourceType: text("source_type").notNull().default("other"), // official | research | news | blog | social | other
    grade: text("grade").notNull().default("C"), // A | B | C | D
    excerpt: text("excerpt").notNull().default(""), // trích ngắn ≤ 300 ký tự
    limits: text("limits").notNull().default(""),
    accessedAt: text("accessed_at").notNull(),
  },
  (t) => [index("research_sources_task_idx").on(t.taskId)],
);

export const researchFindings = sqliteTable(
  "research_findings",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id").notNull(),
    statement: text("statement").notNull(),
    classification: text("classification").notNull(), // FACT | OWNER_VIEW | HYPOTHESIS | OBSERVATION | BUSINESS_DECISION | PROCEDURE
    sourceIds: text("source_ids").notNull().default("[]"), // JSON id research_sources
    knowledgeIds: text("knowledge_ids").notNull().default("[]"), // JSON id trang Notion
    counterView: text("counter_view").notNull().default(""),
    limits: text("limits").notNull().default(""),
    application: text("application").notNull().default(""),
    contentTopics: text("content_topics").notNull().default("[]"),
    confidence: text("confidence").notNull().default("medium"), // high | medium | low
    verifyOk: integer("verify_ok", { mode: "boolean" }).notNull().default(false),
    verifyNotes: text("verify_notes").notNull().default("[]"),
  },
  (t) => [index("research_findings_task_idx").on(t.taskId)],
);

export const contentBriefs = sqliteTable("content_briefs", {
  id: text("id").primaryKey(),
  taskId: text("task_id"),
  contentId: text("content_id"),
  topic: text("topic").notNull(),
  goal: text("goal").notNull().default(""),
  audience: text("audience").notNull().default(""),
  keyMessage: text("key_message").notNull().default(""),
  angle: text("angle").notNull().default(""),
  points: text("points").notNull().default("[]"), // JSON BriefPoint[]
  gaps: text("gaps").notNull().default("[]"),
  qa: text("qa").notNull().default("{}"), // JSON { ok, issues[] }
  status: text("status").notNull().default("draft"), // draft | ready | used
  createdBy: text("created_by").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// CP02: mỗi lần nội dung đổi chữ (lưu nháp, gửi duyệt, AI viết lại, khôi phục) giữ một phiên bản. Không ghi đè, không xoá.
export const contentVersions = sqliteTable(
  "content_versions",
  {
    id: text("id").primaryKey(),
    contentId: text("content_id").notNull(),
    version: integer("version").notNull(),
    hook: text("hook").notNull().default(""),
    draft: text("draft").notNull().default(""),
    reason: text("reason").notNull().default(""), // save | submit | ai | restore | brief
    by: text("by").notNull().default(""),
    at: text("at").notNull(),
  },
  (t) => [uniqueIndex("content_versions_content_version_idx").on(t.contentId, t.version)],
);

// CP03: lịch sử phản hồi của một video theo từng bản dựng (gửi kiểm tra, yêu cầu sửa, dựng lại, phê duyệt).
export const videoFeedback = sqliteTable(
  "video_feedback",
  {
    id: text("id").primaryKey(),
    videoId: text("video_id").notNull(),
    version: integer("version").notNull(),
    kind: text("kind").notNull(), // send_review | send_approval | request_changes | approve | rerender | upload
    note: text("note").notNull().default(""),
    by: text("by").notNull().default(""),
    at: text("at").notNull(),
  },
  (t) => [index("video_feedback_video_idx").on(t.videoId)],
);

// CP06: đề xuất cải tiến từ số liệu thật (nội dung, video, quảng cáo, kiến thức, skill dựng video).
// Mọi đề xuất là GIẢ THUYẾT kèm căn cứ và cỡ mẫu cho tới khi OWNER chấp nhận. Không tự sửa Second Brain hay skill.
export const improvementProposals = sqliteTable(
  "improvement_proposals",
  {
    id: text("id").primaryKey(),
    /** Khoá chống trùng: cùng phát hiện thì cập nhật căn cứ, không tạo đề xuất mới. */
    key: text("key").notNull(),
    target: text("target").notNull(), // content | second_brain | video_skill | ads
    title: text("title").notNull(),
    detail: text("detail").notNull().default(""),
    evidence: text("evidence").notNull().default("[]"), // JSON string[]
    sampleSize: integer("sample_size").notNull().default(0),
    confidence: text("confidence").notNull().default("low"), // low | medium | high
    status: text("status").notNull().default("proposed"), // proposed | accepted | rejected | exported
    decidedBy: text("decided_by"),
    decidedAt: text("decided_at"),
    note: text("note").notNull().default(""),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [uniqueIndex("improvement_proposals_key_idx").on(t.key)],
);
