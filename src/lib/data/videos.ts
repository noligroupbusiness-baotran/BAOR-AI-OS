// DỮ LIỆU MẪU video của Video Studio. Phân hệ Video Studio chưa có bảng riêng;
// khi triển khai, thay danh sách này bằng truy vấn bảng videos và giữ nguyên id.
export type VideoStatus = "editing" | "review" | "needs_changes" | "pending_approval" | "approved";

export interface VideoItem {
  id: string;
  title: string;
  /** Kịch bản (content_id) mà video được dựng từ đó. */
  contentId: string | null;
  agent: string;
  status: VideoStatus;
  /** Phiên bản dành cho nền tảng nào. */
  platforms: string[];
  updatedAt: string;
}

export const videoStatusLabel: Record<VideoStatus, string> = {
  editing: "Đang dựng",
  review: "Chờ kiểm tra",
  needs_changes: "Cần chỉnh sửa",
  pending_approval: "Chờ phê duyệt",
  approved: "Đã phê duyệt",
};

export const videos: VideoItem[] = [
  { id: "v_md1", title: "Gội dưỡng sinh 39K: 45 phút nhắm mắt sau giờ làm", contentId: "ct_md1", agent: "Agent Edit Video", status: "editing", platforms: ["tiktok", "facebook"], updatedAt: "2026-09-10T08:30:00+07:00" },
  { id: "v_md2", title: "Khách văn phòng Bến Tre nói gì sau lượt gội đầu tiên", contentId: "ct_md3", agent: "Agent Edit Video", status: "pending_approval", platforms: ["tiktok"], updatedAt: "2026-09-10T08:10:00+07:00" },
  { id: "v_rec1", title: "Một ngày của Seller Noli Sales", contentId: "ct_rec1", agent: "Agent Edit Video", status: "editing", platforms: ["tiktok", "youtube"], updatedAt: "2026-09-09T16:00:00+07:00" },
  { id: "v1", title: "Khách thật test serum 7 ngày (bản dựng 2)", contentId: "ct3", agent: "Agent Edit Video", status: "pending_approval", platforms: ["tiktok", "facebook"], updatedAt: "2026-09-10T08:10:00+07:00" },
];
