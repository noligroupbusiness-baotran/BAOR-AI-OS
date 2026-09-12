import type { AdStatus, ContentStatus, LeadStage, PostStatus } from "@/lib/types";
import type { Tone } from "@/components/ui/pill";

export const contentStatusLabel: Record<ContentStatus, { label: string; tone: Tone }> = {
  proposed: { label: "AI đề xuất", tone: "violet" },
  in_progress: { label: "Bạn đang làm", tone: "amber" },
  review: { label: "Chờ duyệt", tone: "amber" },
  approved: { label: "Đã duyệt", tone: "jade" },
  scheduled: { label: "Đã lên lịch", tone: "sky" },
  published: { label: "Đã đăng", tone: "jade" },
};

export const contentFormatLabel: Record<string, string> = {
  post: "Bài viết",
  reel: "Reel",
  carousel: "Carousel",
  story: "Story",
  article: "Bài dài",
  script: "Kịch bản video",
  caption: "Caption",
  image: "Hình ảnh",
};

export const postStatusLabel: Record<PostStatus, { label: string; tone: Tone }> = {
  scheduled: { label: "Chờ đăng", tone: "sky" },
  publishing: { label: "Đang đăng", tone: "amber" },
  published: { label: "Đã đăng", tone: "jade" },
  failed: { label: "Lỗi", tone: "brick" },
};

export const adStatusLabel: Record<AdStatus, { label: string; tone: Tone }> = {
  proposed: { label: "AI đề xuất", tone: "violet" },
  pending_approval: { label: "Chờ bạn duyệt", tone: "amber" },
  active: { label: "Đang chạy", tone: "jade" },
  paused: { label: "Tạm dừng", tone: "brick" },
  ended: { label: "Kết thúc", tone: "neutral" },
};

export const leadStageLabel: Record<LeadStage, { label: string; tone: Tone }> = {
  new: { label: "Mới", tone: "violet" },
  contacted: { label: "Đã liên hệ", tone: "sky" },
  qualified: { label: "Tiềm năng", tone: "amber" },
  won: { label: "Đã mua", tone: "jade" },
  lost: { label: "Không mua", tone: "neutral" },
};

export const leadSourceLabel: Record<string, string> = {
  comment: "Bình luận",
  inbox: "Inbox",
  ads: "Quảng cáo",
  email: "Email",
  manual: "Thủ công",
};
