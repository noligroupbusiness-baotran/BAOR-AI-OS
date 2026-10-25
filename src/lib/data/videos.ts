// DỮ LIỆU MẪU nạp lần đầu vào bảng videos (Video Studio). Agent Edit Video thật sẽ ghi vào bảng này.
export type VideoStatus = "editing" | "review" | "needs_changes" | "pending_approval" | "approved";

export interface VideoSeed {
  id: string;
  title: string;
  /** Kịch bản (content_id) mà video được dựng từ đó. */
  contentId: string | null;
  agent: string;
  status: VideoStatus;
  /** Phiên bản dành cho nền tảng nào. */
  platforms: string[];
  version: number;
  note: string;
  updatedAt: string;
}

export const videoStatusLabel: Record<VideoStatus, { label: string; tone: "neutral" | "amber" | "jade" | "brick" }> = {
  editing: { label: "Đang dựng", tone: "neutral" },
  review: { label: "Chờ kiểm tra", tone: "amber" },
  needs_changes: { label: "Cần chỉnh sửa", tone: "brick" },
  pending_approval: { label: "Chờ phê duyệt", tone: "amber" },
  approved: { label: "Đã phê duyệt", tone: "jade" },
};

export const videos: VideoSeed[] = [
  { id: "v_md1", title: "Gội dưỡng sinh 39K: 45 phút nhắm mắt sau giờ làm", contentId: "ct_md1", agent: "Agent Edit Video", status: "editing", platforms: ["tiktok", "facebook"], version: 1, note: "Đang dựng bản 1 từ kịch bản, dự kiến xong trong ngày.", updatedAt: "2026-09-10T08:30:00+07:00" },
  { id: "v_md2", title: "Khách văn phòng Bến Tre nói gì sau lượt gội đầu tiên", contentId: "ct_md3", agent: "Agent Edit Video", status: "pending_approval", platforms: ["tiktok"], version: 1, note: "Bản dựng 1: 42 giây, phụ đề tiếng Việt, nhạc nền từ kho nhạc.", updatedAt: "2026-09-10T08:10:00+07:00" },
  { id: "v_rec1", title: "Một ngày của Seller Noli Sales", contentId: "ct_rec1", agent: "Agent Edit Video", status: "editing", platforms: ["tiktok", "youtube"], version: 1, note: "", updatedAt: "2026-09-09T16:00:00+07:00" },
  { id: "v1", title: "Khách thật test serum 7 ngày", contentId: "ct3", agent: "Agent Edit Video", status: "pending_approval", platforms: ["tiktok", "facebook"], version: 2, note: "Bản dựng 2: đã sửa hook theo góp ý, thêm cảnh ngày 7.", updatedAt: "2026-09-10T08:10:00+07:00" },
  { id: "v2", title: "Sự thật về serum giá rẻ trên sàn", contentId: "ct5", agent: "Agent Edit Video", status: "review", platforms: ["tiktok"], version: 1, note: "Bản dựng 1 chờ anh kiểm tra trước khi gửi duyệt.", updatedAt: "2026-09-09T19:00:00+07:00" },
];
