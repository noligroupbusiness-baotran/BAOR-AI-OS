import type {
  AdStatus,
  ContentFormat,
  ContentStatus,
  LeadStage,
  PostStatus,
  StepStatus,
} from "@/lib/types";
import type { Tone } from "@/components/ui/pill";

export const stepStatusLabel: Record<StepStatus, { label: string; tone: Tone }> = {
  idle: { label: "Chờ", tone: "neutral" },
  running: { label: "Đang chạy", tone: "green" },
  waiting_approval: { label: "Chờ bạn duyệt", tone: "gold" },
  done: { label: "Đã xong", tone: "blue" },
  error: { label: "Lỗi", tone: "red" },
};

export const contentStatusLabel: Record<ContentStatus, { label: string; tone: Tone; emoji: string }> = {
  proposed: { label: "AI đề xuất", tone: "purple", emoji: "💡" },
  in_progress: { label: "Bạn đang làm", tone: "gold", emoji: "✍️" },
  review: { label: "Chờ duyệt", tone: "orange", emoji: "👀" },
  approved: { label: "Đã duyệt", tone: "green", emoji: "✅" },
  scheduled: { label: "Đã lên lịch", tone: "blue", emoji: "📅" },
  published: { label: "Đã đăng", tone: "teal", emoji: "🚀" },
};

export const contentFormatLabel: Record<ContentFormat, { label: string; emoji: string }> = {
  post: { label: "Bài viết", emoji: "📝" },
  reel: { label: "Reel / video", emoji: "🎬" },
  carousel: { label: "Carousel", emoji: "🖼️" },
  story: { label: "Story", emoji: "⏱️" },
  article: { label: "Bài dài", emoji: "📰" },
};

export const postStatusLabel: Record<PostStatus, { label: string; tone: Tone }> = {
  scheduled: { label: "Chờ đăng", tone: "blue" },
  publishing: { label: "Đang đăng", tone: "gold" },
  published: { label: "Đã đăng", tone: "green" },
  failed: { label: "Lỗi", tone: "red" },
};

export const adStatusLabel: Record<AdStatus, { label: string; tone: Tone }> = {
  proposed: { label: "AI đề xuất", tone: "purple" },
  pending_approval: { label: "Chờ bạn duyệt", tone: "gold" },
  active: { label: "Đang chạy", tone: "green" },
  paused: { label: "Tạm dừng", tone: "red" },
  ended: { label: "Kết thúc", tone: "neutral" },
};

export const adObjectiveLabel: Record<string, string> = {
  reach: "Tiếp cận",
  engagement: "Tương tác",
  leads: "Thu lead",
  messages: "Tin nhắn",
  conversions: "Chuyển đổi",
};

export const leadStageLabel: Record<LeadStage, { label: string; tone: Tone }> = {
  new: { label: "Mới", tone: "purple" },
  contacted: { label: "Đã liên hệ", tone: "blue" },
  qualified: { label: "Tiềm năng", tone: "gold" },
  won: { label: "Đã mua", tone: "green" },
  lost: { label: "Không mua", tone: "neutral" },
};

export const leadSourceLabel: Record<string, string> = {
  comment: "Bình luận",
  inbox: "Inbox",
  ads: "Quảng cáo",
  email: "Email",
  manual: "Thủ công",
};

export const ownerLabel: Record<"ai" | "human" | "auto", { label: string; tone: Tone; emoji: string }> = {
  ai: { label: "AI", tone: "purple", emoji: "🤖" },
  human: { label: "Bạn", tone: "gold", emoji: "🙋" },
  auto: { label: "Tự động", tone: "teal", emoji: "⚡" },
};
