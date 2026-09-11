// Kiểu dữ liệu dùng chung cho toàn bộ trang quản trị.
// Hiện tại dữ liệu là mẫu (mock) nằm trong src/lib/data; khi nối backend thật
// chỉ cần thay các hàm trong src/lib/data mà không đổi giao diện.

export type PipelineStepKey =
  | "research"
  | "insights"
  | "content"
  | "creator"
  | "publishing"
  | "ads"
  | "customers"
  | "email";

export type StepStatus = "idle" | "running" | "waiting_approval" | "done" | "error";

export interface PipelineStep {
  key: PipelineStepKey;
  order: number;
  title: string;
  description: string;
  owner: "ai" | "human" | "auto";
  status: StepStatus;
  lastRunAt?: string;
  pendingCount?: number;
  href: string;
}

export interface Kpi {
  label: string;
  value: string;
  delta: number; // % so với kỳ trước
  hint?: string;
}

export interface ActivityItem {
  id: string;
  at: string;
  actor: "ai" | "human" | "system";
  message: string;
  step: PipelineStepKey;
}

export type Platform = "facebook" | "instagram" | "tiktok" | "threads" | "youtube" | "zalo";

export interface PlatformResearch {
  id: string;
  platform: Platform;
  name: string;
  updatedAt: string;
  audienceFit: number; // 0-100
  trendingTopics: string[];
  bestPostingTimes: string[];
  contentFormats: string[];
  summary: string;
}

export interface Competitor {
  id: string;
  name: string;
  platform: Platform;
  followers: string;
  postsPerWeek: number;
  avgEngagement: string;
  strengths: string;
}

export interface Persona {
  id: string;
  name: string;
  ageRange: string;
  occupation: string;
  location: string;
  goals: string[];
  painPoints: string[];
  objections: string[];
  channels: Platform[];
  share: number; // % trong tập khách hàng
}

export interface Insight {
  id: string;
  title: string;
  detail: string;
  confidence: number; // 0-100
  source: string;
  personaId: string;
  createdAt: string;
  usedInContent: number;
}

export type ContentStatus =
  | "proposed"
  | "in_progress"
  | "review"
  | "approved"
  | "scheduled"
  | "published";

export type ContentFormat = "post" | "reel" | "carousel" | "story" | "article" | "script" | "caption" | "image";

export interface ContentItem {
  id: string;
  title: string;
  format: ContentFormat;
  status: ContentStatus;
  insightId: string;
  pillar: string;
  hook: string;
  outline: string[];
  draft?: string;
  assignee: "ai" | "human";
  scheduledFor?: string;
  createdAt: string;
  score?: number; // điểm AI dự đoán hiệu quả
}

export type PostStatus = "scheduled" | "publishing" | "published" | "failed";

export interface ScheduledPost {
  id: string;
  contentId: string;
  title: string;
  platform: Platform;
  scheduledFor: string;
  status: PostStatus;
  reach?: number;
  engagement?: number;
  error?: string;
}

export type AdStatus = "proposed" | "pending_approval" | "active" | "paused" | "ended";

export interface AdCampaign {
  id: string;
  name: string;
  objective: "reach" | "engagement" | "leads" | "messages" | "conversions";
  status: AdStatus;
  dailyBudget: number;
  spent: number;
  impressions: number;
  clicks: number;
  leads: number;
  audience: string;
  contentId?: string;
  startedAt?: string;
  aiNote?: string;
}

export type LeadStage = "new" | "contacted" | "qualified" | "won" | "lost";

export interface Lead {
  id: string;
  name: string;
  source: "comment" | "inbox" | "ads" | "email" | "manual";
  platform: Platform;
  stage: LeadStage;
  lastMessage: string;
  lastMessageAt: string;
  phone?: string;
  email?: string;
  tags: string[];
  autoReplied: boolean;
}

export interface Conversation {
  id: string;
  leadId: string;
  leadName: string;
  platform: Platform;
  messages: { from: "customer" | "ai" | "human"; text: string; at: string }[];
  needsHuman: boolean;
}

export interface AutoReplyRule {
  id: string;
  trigger: string;
  action: string;
  enabled: boolean;
  hits: number;
}

export interface EmailSequence {
  id: string;
  name: string;
  trigger: string;
  steps: number;
  active: boolean;
  subscribers: number;
  openRate: number;
  clickRate: number;
}

export interface EmailCampaign {
  id: string;
  subject: string;
  sentAt?: string;
  status: "draft" | "scheduled" | "sent";
  recipients: number;
  openRate?: number;
  clickRate?: number;
}

export interface Integration {
  key: string;
  name: string;
  description: string;
  connected: boolean;
  account?: string;
  scopes?: string[];
}

export interface AutomationSetting {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
  requiresApproval?: boolean;
}
