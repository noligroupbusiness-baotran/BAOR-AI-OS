import type { AutomationSetting, Integration } from "@/lib/types";

export const integrations: Integration[] = [
  {
    key: "facebook_page",
    name: "Facebook Page",
    description: "Đăng bài, đọc insights, quản lý bình luận và Messenger.",
    connected: true,
    account: "Fanpage của bạn",
    scopes: ["pages_manage_posts", "pages_read_engagement", "pages_messaging"],
  },
  {
    key: "meta_ads",
    name: "Meta Ads (Marketing API)",
    description: "Tạo và tối ưu chiến dịch quảng cáo Facebook/Instagram.",
    connected: true,
    account: "Ad account act_xxxx",
    scopes: ["ads_management", "ads_read"],
  },
  {
    key: "instagram",
    name: "Instagram Business",
    description: "Đăng Reels, carousel, story qua Page liên kết.",
    connected: false,
  },
  {
    key: "tiktok",
    name: "TikTok for Business",
    description: "Đăng video và đọc số liệu kênh.",
    connected: false,
  },
  {
    key: "zalo_oa",
    name: "Zalo Official Account",
    description: "Broadcast và chăm sóc khách cũ.",
    connected: false,
  },
  {
    key: "email_provider",
    name: "Nhà cung cấp email",
    description: "SMTP / Resend / SendGrid / Mailchimp để gửi email marketing.",
    connected: true,
    account: "SMTP: mail.example.com",
  },
  {
    key: "claude",
    name: "Claude API (Anthropic)",
    description: "Bộ não AI cho research, insight, viết nội dung và trả lời khách.",
    connected: true,
    account: "Model: claude-opus-5",
  },
];

export const automationSettings: AutomationSetting[] = [
  {
    key: "auto_research",
    label: "Tự research hằng tuần",
    description: "Thứ 2 hằng tuần, AI quét xu hướng và đối thủ rồi cập nhật báo cáo.",
    enabled: true,
  },
  {
    key: "auto_insights",
    label: "Tự cập nhật insight",
    description: "Phân tích bình luận, inbox, CRM mỗi ngày để làm mới insight.",
    enabled: true,
  },
  {
    key: "auto_content_proposal",
    label: "Tự đề xuất nội dung",
    description: "Mỗi sáng AI đề xuất 3–5 ý tưởng kèm bản nháp. Bạn luôn là người duyệt cuối.",
    enabled: true,
    requiresApproval: true,
  },
  {
    key: "auto_publish",
    label: "Tự động đăng bài đã duyệt",
    description: "Chỉ đăng nội dung ở trạng thái 'Đã duyệt' vào giờ vàng.",
    enabled: true,
  },
  {
    key: "auto_ads",
    label: "Tự đề xuất & chạy quảng cáo",
    description: "Bài vượt ngưỡng tương tác sẽ được đề xuất chạy ads. Cần bạn duyệt trước khi tiêu tiền.",
    enabled: true,
    requiresApproval: true,
  },
  {
    key: "auto_reply",
    label: "Tự trả lời comment & inbox",
    description: "AI trả lời theo quy tắc, chuyển người xử lý khi khiếu nại hoặc cần chốt đơn.",
    enabled: true,
  },
  {
    key: "auto_email",
    label: "Tự chạy chuỗi email",
    description: "Gửi email theo kịch bản khi lead đạt điều kiện.",
    enabled: true,
  },
];
