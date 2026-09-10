import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
  config: text("config").notNull().default("{}"), // JSON: token, ids... (không hiển thị ra ngoài)
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
