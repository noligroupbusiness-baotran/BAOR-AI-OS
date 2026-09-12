// DỮ LIỆU MẪU phân hệ Chiến dịch. Mọi liên kết là ID thật: mục tiêu kênh trỏ campaign_id,
// insight / nội dung / video / bài đăng / quảng cáo / lead trỏ campaign_id + channel_goal_id.
// Các bản ghi ở "linkedRows" được nạp vào bảng của phân hệ tương ứng (content_items, insights,
// scheduled_posts, ad_campaigns, leads) để chiến dịch có hoạt động thật để hiển thị.
import type { Campaign, CampaignApproval, CampaignResult, ChannelGoal, LinkedMarketingItem } from "@/lib/campaigns/types";
import type { AdCampaign, ContentItem, Insight, Lead, ScheduledPost } from "@/lib/types";

const SEED_USER = "admin";

export const campaigns: Campaign[] = [
  {
    id: "cp_mocdiep_t10",
    name: "Thu hút khách mới cho Mộc Diệp Spa",
    description: "Dùng gội dưỡng sinh 39.000 đồng làm sản phẩm đầu vào để khách trải nghiệm, thu lead bằng Facebook Ads, chăm sóc qua Zalo OA rồi bán thêm thẻ thành viên.",
    objective: "Có 300 khách đăng ký trải nghiệm gội dưỡng sinh",
    targetMetric: "khách đăng ký",
    targetValue: 300,
    productIds: ["pr_md_goi", "pr_md_the"],
    audience: "Nữ 25–35 tuổi, nhân viên văn phòng hoặc kinh doanh",
    location: "Bến Tre",
    startDate: "2026-10-01",
    endDate: "2026-10-31",
    totalBudget: 30000000,
    budgetNote: "Ưu tiên Facebook Ads. TikTok, Zalo và website chủ yếu là chi phí sản xuất nội dung.",
    ownerId: "u_thu",
    status: "active",
    createdBy: SEED_USER,
    createdAt: "2026-09-05T09:00:00+07:00",
    updatedAt: "2026-09-10T08:00:00+07:00",
    approvedBy: SEED_USER,
    approvedAt: "2026-09-06T10:30:00+07:00",
  },
  {
    id: "cp_noli_tuyendung_hcm",
    name: "Tuyển dụng Noli Sales TP.HCM",
    description: "Tuyển Seller cho văn phòng TP.HCM, nhấn mạnh lộ trình Seller → Closer → Leader và thu nhập theo năng lực.",
    objective: "Tuyển 30 Seller mới nhận việc tại văn phòng TP.HCM",
    targetMetric: "ứng viên nhận việc",
    targetValue: 30,
    productIds: ["pr_noli_seller"],
    audience: "Nam nữ 20–30 tuổi, muốn thu nhập theo năng lực, sẵn sàng làm việc tại TP.HCM",
    location: "TP.HCM",
    startDate: "2026-09-15",
    endDate: "2026-10-15",
    totalBudget: 20000000,
    budgetNote: "Facebook Ads thu hồ sơ là chi phí chính. Video TikTok tận dụng Agent Edit Video.",
    ownerId: "u_lam",
    status: "pending_approval",
    createdBy: SEED_USER,
    createdAt: "2026-09-09T14:00:00+07:00",
    updatedAt: "2026-09-09T16:30:00+07:00",
    approvedBy: null,
    approvedAt: null,
  },
  {
    id: "cp_noli_chamsoc",
    name: "Chăm sóc khách hàng cũ Noli Sales",
    description: "Nhắc mua lại và ưu đãi thành viên cho khách đã mua trong 12 tháng qua, chủ yếu qua Zalo OA và email.",
    objective: "Đưa 400 khách cũ quay lại mua trong quý 4",
    targetMetric: "khách mua lại",
    targetValue: 400,
    productIds: ["pr_noli_care"],
    audience: "Khách đã mua trong 12 tháng qua",
    location: "Toàn quốc",
    startDate: "2026-10-01",
    endDate: "2026-12-31",
    totalBudget: 8000000,
    budgetNote: "Không chạy quảng cáo. Chi phí là phí tin nhắn Zalo OA và nhà cung cấp email.",
    ownerId: "u_vy",
    status: "approved",
    createdBy: SEED_USER,
    createdAt: "2026-09-04T10:00:00+07:00",
    updatedAt: "2026-09-08T09:00:00+07:00",
    approvedBy: SEED_USER,
    approvedAt: "2026-09-08T09:00:00+07:00",
  },
  {
    id: "cp_sale99",
    name: "Sale 9.9 BAOR Skincare",
    description: "Tuần khuyến mãi 9.9: đẩy combo 3 bước cho khách đã tương tác với fanpage.",
    objective: "Bán 500 combo 3 bước trong tuần Sale 9.9",
    targetMetric: "đơn hàng",
    targetValue: 500,
    productIds: ["pr_combo3", "pr_serum"],
    audience: "Nữ 25–40 tuổi, đã tương tác với fanpage hoặc từng inbox",
    location: "TP.HCM, Hà Nội",
    startDate: "2026-09-01",
    endDate: "2026-09-09",
    totalBudget: 12000000,
    budgetNote: "",
    ownerId: "u_thu",
    status: "ended",
    createdBy: SEED_USER,
    createdAt: "2026-08-25T09:00:00+07:00",
    updatedAt: "2026-09-10T06:00:00+07:00",
    approvedBy: SEED_USER,
    approvedAt: "2026-08-27T15:00:00+07:00",
  },
];

const goal = (g: Omit<ChannelGoal, "createdAt" | "updatedAt" | "spent" | "currentValue"> & Partial<Pick<ChannelGoal, "spent" | "currentValue" | "createdAt" | "updatedAt">>): ChannelGoal => ({
  spent: 0,
  currentValue: 0,
  createdAt: "2026-09-05T09:00:00+07:00",
  updatedAt: "2026-09-10T08:00:00+07:00",
  ...g,
});

export const channelGoals: ChannelGoal[] = [
  // Mộc Diệp Spa
  goal({ id: "g_md_fbads", campaignId: "cp_mocdiep_t10", channel: "facebook_ads", accountId: "meta_ads", executionType: "lead_gen", objective: "Thu 200 lead đăng ký gội trải nghiệm", primaryMetric: "leads", targetValue: 200, currentValue: 64, budget: 15000000, spent: 4120000, ownerId: "u_han", status: "active", startDate: "2026-10-01", endDate: "2026-10-31" }),
  goal({ id: "g_md_page", campaignId: "cp_mocdiep_t10", channel: "facebook_page", accountId: "facebook_page", executionType: "organic", objective: "Đăng 20 bài và đạt 100.000 lượt tiếp cận", primaryMetric: "reach", targetValue: 100000, currentValue: 31200, budget: 3000000, spent: 600000, ownerId: "u_khoa", status: "active", startDate: "2026-10-01", endDate: "2026-10-31" }),
  goal({ id: "g_md_tiktok", campaignId: "cp_mocdiep_t10", channel: "tiktok", accountId: "tiktok", executionType: "organic", objective: "Đăng 15 video và đạt 300.000 lượt xem", primaryMetric: "views", targetValue: 300000, currentValue: 86000, budget: 5000000, spent: 900000, ownerId: "u_dung", status: "active", startDate: "2026-10-01", endDate: "2026-10-31" }),
  goal({ id: "g_md_zalo", campaignId: "cp_mocdiep_t10", channel: "zalo_oa", accountId: "zalo_oa", executionType: "nurture", objective: "Chăm sóc 150 lead sau khi đăng ký", primaryMetric: "contacts", targetValue: 150, currentValue: 48, budget: 2000000, spent: 180000, ownerId: "u_vy", status: "active", startDate: "2026-10-01", endDate: "2026-10-31" }),
  goal({ id: "g_md_web", campaignId: "cp_mocdiep_t10", channel: "website_seo", accountId: "website", executionType: "lead_gen", objective: "2.000 lượt truy cập và 100 lượt điền form", primaryMetric: "forms", targetValue: 100, currentValue: 17, budget: 3000000, spent: 100000, ownerId: "u_khoa", status: "active", startDate: "2026-10-01", endDate: "2026-10-31" }),
  goal({ id: "g_md_email", campaignId: "cp_mocdiep_t10", channel: "email", accountId: "email_provider", executionType: "nurture", objective: "Gửi 1.000 email cho khách cũ, tỷ lệ mở 30%", primaryMetric: "open_rate", targetValue: 30, currentValue: 0, budget: 500000, ownerId: "u_vy", status: "planned", startDate: "2026-10-10", endDate: "2026-10-31" }),
  // Tuyển dụng Noli Sales TP.HCM
  goal({ id: "g_rec_fbads", campaignId: "cp_noli_tuyendung_hcm", channel: "facebook_ads", accountId: "meta_ads", executionType: "lead_gen", objective: "Thu 300 hồ sơ ứng viên", primaryMetric: "leads", targetValue: 300, budget: 12000000, ownerId: "u_han", status: "planned", startDate: "2026-09-15", endDate: "2026-10-15", createdAt: "2026-09-09T14:10:00+07:00", updatedAt: "2026-09-09T14:10:00+07:00" }),
  goal({ id: "g_rec_page", campaignId: "cp_noli_tuyendung_hcm", channel: "facebook_page", accountId: "facebook_page", executionType: "organic", objective: "Đăng 12 bài về văn hóa đội ngũ và thu nhập", primaryMetric: "posts", targetValue: 12, budget: 1000000, ownerId: "u_khoa", status: "planned", startDate: "2026-09-15", endDate: "2026-10-15", createdAt: "2026-09-09T14:10:00+07:00", updatedAt: "2026-09-09T14:10:00+07:00" }),
  goal({ id: "g_rec_tiktok", campaignId: "cp_noli_tuyendung_hcm", channel: "tiktok", accountId: "tiktok", executionType: "organic", objective: "10 video “Một ngày của Seller” đạt 150.000 lượt xem", primaryMetric: "views", targetValue: 150000, budget: 4000000, ownerId: "u_dung", status: "planned", startDate: "2026-09-15", endDate: "2026-10-15", createdAt: "2026-09-09T14:10:00+07:00", updatedAt: "2026-09-09T14:10:00+07:00" }),
  goal({ id: "g_rec_web", campaignId: "cp_noli_tuyendung_hcm", channel: "website_seo", accountId: "website", executionType: "lead_gen", objective: "Trang tuyển dụng đạt 80 form ứng tuyển", primaryMetric: "forms", targetValue: 80, budget: 2000000, ownerId: "u_lam", status: "planned", startDate: "2026-09-15", endDate: "2026-10-15", createdAt: "2026-09-09T14:10:00+07:00", updatedAt: "2026-09-09T14:10:00+07:00" }),
  // Chăm sóc khách hàng cũ Noli Sales
  goal({ id: "g_care_zalo", campaignId: "cp_noli_chamsoc", channel: "zalo_oa", accountId: "zalo_oa", executionType: "nurture", objective: "Nhắn 1.200 khách cũ qua Zalo OA", primaryMetric: "contacts", targetValue: 1200, budget: 3000000, ownerId: "u_vy", status: "planned", startDate: "2026-10-01", endDate: "2026-12-31", createdAt: "2026-09-04T10:00:00+07:00", updatedAt: "2026-09-08T09:00:00+07:00" }),
  goal({ id: "g_care_email", campaignId: "cp_noli_chamsoc", channel: "email", accountId: "email_provider", executionType: "nurture", objective: "Chuỗi 4 email nhắc mua lại, tỷ lệ mở 30%", primaryMetric: "open_rate", targetValue: 30, budget: 1000000, ownerId: "u_vy", status: "planned", startDate: "2026-10-01", endDate: "2026-12-31", createdAt: "2026-09-04T10:00:00+07:00", updatedAt: "2026-09-08T09:00:00+07:00" }),
  goal({ id: "g_care_page", campaignId: "cp_noli_chamsoc", channel: "facebook_page", accountId: "facebook_page", executionType: "nurture", objective: "8 bài ưu đãi thành viên trên fanpage", primaryMetric: "posts", targetValue: 8, budget: 1000000, ownerId: "u_khoa", status: "planned", startDate: "2026-10-01", endDate: "2026-12-31", createdAt: "2026-09-04T10:00:00+07:00", updatedAt: "2026-09-08T09:00:00+07:00" }),
  // Sale 9.9
  goal({ id: "g_s99_fbads", campaignId: "cp_sale99", channel: "facebook_ads", accountId: "meta_ads", executionType: "paid", objective: "Đẩy bài routine 3 bước, thu 300 lead inbox", primaryMetric: "leads", targetValue: 300, currentValue: 95, budget: 8000000, spent: 1420000, ownerId: "u_han", status: "done", startDate: "2026-09-01", endDate: "2026-09-09", createdAt: "2026-08-25T09:00:00+07:00", updatedAt: "2026-09-10T06:00:00+07:00" }),
  goal({ id: "g_s99_page", campaignId: "cp_sale99", channel: "facebook_page", accountId: "facebook_page", executionType: "organic", objective: "6 bài, 120.000 lượt tiếp cận", primaryMetric: "reach", targetValue: 120000, currentValue: 40500, budget: 1000000, spent: 1000000, ownerId: "u_khoa", status: "done", startDate: "2026-09-01", endDate: "2026-09-09", createdAt: "2026-08-25T09:00:00+07:00", updatedAt: "2026-09-10T06:00:00+07:00" }),
  goal({ id: "g_s99_email", campaignId: "cp_sale99", channel: "email", accountId: "email_provider", executionType: "nurture", objective: "Gửi 3.710 email thành viên, tỷ lệ mở 40%", primaryMetric: "open_rate", targetValue: 40, currentValue: 46, budget: 300000, spent: 300000, ownerId: "u_vy", status: "done", startDate: "2026-09-01", endDate: "2026-09-09", createdAt: "2026-08-25T09:00:00+07:00", updatedAt: "2026-09-10T06:00:00+07:00" }),
];

// Bản ghi thuộc các phân hệ khác nhưng được sinh ra để phục vụ chiến dịch mẫu.
export const linkedRows: {
  insights: Insight[];
  content: ContentItem[];
  posts: ScheduledPost[];
  ads: AdCampaign[];
  leads: Lead[];
} = {
  insights: [
    { id: "i_md1", title: "Dân văn phòng Bến Tre muốn thư giãn nhanh, giá dưới 50.000 đồng", detail: "Khảo sát tại quầy: 71% khách chọn dịch vụ dưới 45 phút sau giờ làm. Mức giá 39.000 đồng được nhắc đến như “rẻ hơn ly trà sữa”.", confidence: 82, source: "Khảo sát 120 khách tại quầy + bình luận fanpage", personaId: "", createdAt: "2026-09-08T09:00:00+07:00", usedInContent: 2 },
    { id: "i_rec1", title: "Ứng viên trẻ quan tâm lộ trình thăng tiến hơn lương cứng", detail: "18/25 ứng viên phỏng vấn tháng 8 hỏi về lộ trình Seller → Closer → Leader trước khi hỏi lương cứng.", confidence: 76, source: "Phỏng vấn 25 ứng viên tháng 8", personaId: "", createdAt: "2026-09-09T10:00:00+07:00", usedInContent: 1 },
  ],
  content: [
    { id: "ct_md1", title: "Gội dưỡng sinh 39K: 45 phút nhắm mắt sau giờ làm", format: "reel", status: "in_progress", insightId: "i_md1", pillar: "Trải nghiệm", hook: "45 phút nhắm mắt, 39.000 đồng, hết mỏi vai gáy.", outline: ["Cảnh khách bước vào sau giờ làm", "Quy trình gội 5 bước", "Khách thở phào", "CTA đặt lịch"], draft: "Kịch bản: mở đầu bằng cảnh tan làm 17:30, khách ghé spa...", assignee: "human", createdAt: "2026-09-08T10:00:00+07:00", score: 84 },
    { id: "ct_md2", title: "Gội dưỡng sinh 39K: vì sao rẻ mà không ẩu", format: "post", status: "review", insightId: "i_md1", pillar: "Niềm tin", hook: "Rẻ không có nghĩa là làm cho xong.", outline: ["Vì sao chọn giá 39K", "Quy trình chuẩn 5 bước", "Cam kết thời gian tối thiểu 40 phút"], draft: "Nhiều chị hỏi vì sao gội dưỡng sinh ở Mộc Diệp chỉ 39.000 đồng...", assignee: "human", createdAt: "2026-09-09T09:00:00+07:00", score: 79 },
    { id: "ct_md3", title: "Khách văn phòng Bến Tre nói gì sau lượt gội đầu tiên", format: "reel", status: "approved", insightId: "i_md1", pillar: "Bằng chứng", hook: "Không kịch bản. Chỉ hỏi một câu: chị thấy sao?", outline: ["3 khách trả lời sau khi gội", "Cảnh quầy lễ tân", "CTA đăng ký 39K"], draft: "Phỏng vấn ngắn 3 khách...", assignee: "human", scheduledFor: "2026-10-03T19:00:00+07:00", createdAt: "2026-09-07T09:00:00+07:00", score: 88 },
    { id: "ct_rec1", title: "Một ngày của Seller Noli Sales", format: "reel", status: "proposed", insightId: "i_rec1", pillar: "Văn hóa đội ngũ", hook: "8h sáng đến 6h chiều của một Seller, không cắt ghép.", outline: ["Sáng: họp nhóm", "Trưa: gọi khách", "Chiều: chốt đơn đầu tiên", "Lộ trình lên Closer"], assignee: "ai", createdAt: "2026-09-09T15:00:00+07:00", score: 80 },
    { id: "ct_care1", title: "Email 1: Cảm ơn và ưu đãi quay lại", format: "article", status: "in_progress", insightId: "", pillar: "Chăm sóc", hook: "Cảm ơn chị đã đồng hành cùng Noli Sales.", outline: ["Cảm ơn", "Ưu đãi thành viên", "Nút đặt lại"], draft: "Chào chị, cảm ơn chị đã tin tưởng...", assignee: "human", createdAt: "2026-09-08T11:00:00+07:00", score: 70 },
  ],
  posts: [
    { id: "sp_md1", contentId: "ct_md3", title: "Khách văn phòng Bến Tre nói gì sau lượt gội đầu tiên", platform: "tiktok", scheduledFor: "2026-10-03T19:00:00+07:00", status: "scheduled" },
    { id: "sp_md2", contentId: "ct_md3", title: "Khách văn phòng Bến Tre nói gì sau lượt gội đầu tiên", platform: "facebook", scheduledFor: "2026-10-03T20:30:00+07:00", status: "scheduled" },
  ],
  ads: [
    { id: "ad_md1", name: "Gội dưỡng sinh 39K – đăng ký trải nghiệm", objective: "leads", status: "pending_approval", dailyBudget: 500000, spent: 0, impressions: 0, clicks: 0, leads: 0, audience: "Nữ 25–35, bán kính 10 km quanh Mộc Diệp Spa, Bến Tre", contentId: "ct_md3", aiNote: "Đề xuất từ mục tiêu kênh Facebook Ads của chiến dịch Mộc Diệp. Chỉ chạy khi anh duyệt." },
  ],
  leads: [
    { id: "l_md1", name: "Trần Ngọc Bích", source: "ads", platform: "facebook", stage: "new", lastMessage: "Mình muốn đặt lịch gội thứ 7 tuần này", lastMessageAt: "2026-09-10T09:10:00+07:00", phone: "09xx xxx 781", tags: ["gội 39K", "văn phòng"], autoReplied: true },
    { id: "l_md2", name: "Lê Hoài Thương", source: "inbox", platform: "zalo", stage: "contacted", lastMessage: "Có nhận khách sau 18h không?", lastMessageAt: "2026-09-10T08:20:00+07:00", phone: "09xx xxx 214", tags: ["gội 39K"], autoReplied: false },
    { id: "l_md3", name: "Phan Mỹ Duyên", source: "ads", platform: "facebook", stage: "qualified", lastMessage: "Đăng ký cho 2 người bạn nữa được không?", lastMessageAt: "2026-09-09T20:40:00+07:00", phone: "09xx xxx 903", tags: ["gội 39K", "nhóm"], autoReplied: true },
    { id: "l_care1", name: "Võ Thanh Trúc", source: "email", platform: "facebook", stage: "contacted", lastMessage: "Ưu đãi thành viên áp dụng đến khi nào?", lastMessageAt: "2026-09-09T11:00:00+07:00", email: "truc.vo@example.com", tags: ["khách cũ"], autoReplied: false },
    { id: "l_care2", name: "Đặng Kim Ngân", source: "manual", platform: "zalo", stage: "won", lastMessage: "Đặt lại combo như lần trước nhé", lastMessageAt: "2026-09-08T15:30:00+07:00", phone: "09xx xxx 552", tags: ["khách cũ", "mua lại"], autoReplied: false },
  ],
};

const link = (l: Omit<LinkedMarketingItem, "createdAt" | "viaType" | "viaId" | "ownerId"> & Partial<Pick<LinkedMarketingItem, "viaType" | "viaId" | "ownerId" | "createdAt">>): LinkedMarketingItem => ({
  ownerId: null,
  viaType: null,
  viaId: null,
  createdAt: "2026-09-10T08:00:00+07:00",
  ...l,
});

export const marketingLinks: LinkedMarketingItem[] = [
  // Mộc Diệp Spa: insight → nội dung → video → bài đăng → quảng cáo → lead
  link({ id: "ml_md_i1", campaignId: "cp_mocdiep_t10", channelGoalId: null, entityType: "insight", entityId: "i_md1", status: "active" }),
  link({ id: "ml_md_c1", campaignId: "cp_mocdiep_t10", channelGoalId: "g_md_tiktok", entityType: "content", entityId: "ct_md1", status: "in_progress", ownerId: "u_khoa", viaType: "insight", viaId: "i_md1" }),
  link({ id: "ml_md_c2", campaignId: "cp_mocdiep_t10", channelGoalId: "g_md_page", entityType: "content", entityId: "ct_md2", status: "review", ownerId: "u_khoa", viaType: "insight", viaId: "i_md1" }),
  link({ id: "ml_md_c3", campaignId: "cp_mocdiep_t10", channelGoalId: "g_md_tiktok", entityType: "content", entityId: "ct_md3", status: "approved", ownerId: "u_khoa", viaType: "insight", viaId: "i_md1" }),
  link({ id: "ml_md_v1", campaignId: "cp_mocdiep_t10", channelGoalId: "g_md_tiktok", entityType: "video", entityId: "v_md1", status: "editing", ownerId: "u_dung", viaType: "content", viaId: "ct_md1" }),
  link({ id: "ml_md_v2", campaignId: "cp_mocdiep_t10", channelGoalId: "g_md_tiktok", entityType: "video", entityId: "v_md2", status: "pending_approval", ownerId: "u_dung", viaType: "content", viaId: "ct_md3" }),
  link({ id: "ml_md_p1", campaignId: "cp_mocdiep_t10", channelGoalId: "g_md_tiktok", entityType: "publication", entityId: "sp_md1", status: "scheduled", ownerId: "u_khoa", viaType: "content", viaId: "ct_md3" }),
  link({ id: "ml_md_p2", campaignId: "cp_mocdiep_t10", channelGoalId: "g_md_page", entityType: "publication", entityId: "sp_md2", status: "scheduled", ownerId: "u_khoa", viaType: "content", viaId: "ct_md3" }),
  link({ id: "ml_md_a1", campaignId: "cp_mocdiep_t10", channelGoalId: "g_md_fbads", entityType: "ad", entityId: "ad_md1", status: "pending_approval", ownerId: "u_han", viaType: "content", viaId: "ct_md3" }),
  link({ id: "ml_md_l1", campaignId: "cp_mocdiep_t10", channelGoalId: "g_md_fbads", entityType: "lead", entityId: "l_md1", status: "new", ownerId: "u_vy", viaType: "ad", viaId: "ad_md1" }),
  link({ id: "ml_md_l2", campaignId: "cp_mocdiep_t10", channelGoalId: "g_md_zalo", entityType: "lead", entityId: "l_md2", status: "contacted", ownerId: "u_vy" }),
  link({ id: "ml_md_l3", campaignId: "cp_mocdiep_t10", channelGoalId: "g_md_fbads", entityType: "lead", entityId: "l_md3", status: "qualified", ownerId: "u_vy", viaType: "ad", viaId: "ad_md1" }),
  // Tuyển dụng Noli Sales
  link({ id: "ml_rec_i1", campaignId: "cp_noli_tuyendung_hcm", channelGoalId: null, entityType: "insight", entityId: "i_rec1", status: "active", createdAt: "2026-09-09T15:00:00+07:00" }),
  link({ id: "ml_rec_c1", campaignId: "cp_noli_tuyendung_hcm", channelGoalId: "g_rec_tiktok", entityType: "content", entityId: "ct_rec1", status: "proposed", ownerId: "u_khoa", viaType: "insight", viaId: "i_rec1", createdAt: "2026-09-09T15:00:00+07:00" }),
  link({ id: "ml_rec_v1", campaignId: "cp_noli_tuyendung_hcm", channelGoalId: "g_rec_tiktok", entityType: "video", entityId: "v_rec1", status: "editing", ownerId: "u_dung", viaType: "content", viaId: "ct_rec1", createdAt: "2026-09-09T16:00:00+07:00" }),
  // Chăm sóc khách cũ
  link({ id: "ml_care_c1", campaignId: "cp_noli_chamsoc", channelGoalId: "g_care_email", entityType: "content", entityId: "ct_care1", status: "in_progress", ownerId: "u_vy" }),
  link({ id: "ml_care_l1", campaignId: "cp_noli_chamsoc", channelGoalId: "g_care_email", entityType: "lead", entityId: "l_care1", status: "contacted", ownerId: "u_vy" }),
  link({ id: "ml_care_l2", campaignId: "cp_noli_chamsoc", channelGoalId: "g_care_zalo", entityType: "lead", entityId: "l_care2", status: "won", ownerId: "u_vy" }),
  // Sale 9.9: liên kết vào dữ liệu fanpage đã có sẵn
  link({ id: "ml_s99_i2", campaignId: "cp_sale99", channelGoalId: null, entityType: "insight", entityId: "i2", status: "active", createdAt: "2026-08-25T09:00:00+07:00" }),
  link({ id: "ml_s99_c2", campaignId: "cp_sale99", channelGoalId: "g_s99_page", entityType: "content", entityId: "ct2", status: "proposed", ownerId: "u_khoa", viaType: "insight", viaId: "i2", createdAt: "2026-08-28T09:00:00+07:00" }),
  link({ id: "ml_s99_c9", campaignId: "cp_sale99", channelGoalId: "g_s99_page", entityType: "content", entityId: "ct9", status: "published", ownerId: "u_khoa", viaType: "insight", viaId: "i2", createdAt: "2026-09-01T09:00:00+07:00" }),
  link({ id: "ml_s99_p8", campaignId: "cp_sale99", channelGoalId: "g_s99_page", entityType: "publication", entityId: "sp8", status: "published", ownerId: "u_khoa", viaType: "content", viaId: "ct2", createdAt: "2026-09-08T07:30:00+07:00" }),
  link({ id: "ml_s99_p1", campaignId: "cp_sale99", channelGoalId: "g_s99_page", entityType: "publication", entityId: "sp1", status: "published", ownerId: "u_khoa", viaType: "content", viaId: "ct9", createdAt: "2026-09-10T09:00:00+07:00" }),
  link({ id: "ml_s99_ad1", campaignId: "cp_sale99", channelGoalId: "g_s99_fbads", entityType: "ad", entityId: "ad1", status: "active", ownerId: "u_han", viaType: "content", viaId: "ct2", createdAt: "2026-09-03T00:00:00+07:00" }),
  link({ id: "ml_s99_l1", campaignId: "cp_sale99", channelGoalId: "g_s99_fbads", entityType: "lead", entityId: "l1", status: "qualified", ownerId: "u_vy", viaType: "ad", viaId: "ad1", createdAt: "2026-09-10T08:52:00+07:00" }),
  link({ id: "ml_s99_l4", campaignId: "cp_sale99", channelGoalId: "g_s99_email", entityType: "lead", entityId: "l4", status: "won", ownerId: "u_vy", createdAt: "2026-09-09T21:30:00+07:00" }),
  link({ id: "ml_s99_l5", campaignId: "cp_sale99", channelGoalId: "g_s99_fbads", entityType: "lead", entityId: "l5", status: "new", ownerId: "u_vy", viaType: "publication", viaId: "sp8", createdAt: "2026-09-09T20:05:00+07:00" }),
];

export const campaignApprovals: CampaignApproval[] = [
  { id: "ap_md1", campaignId: "cp_mocdiep_t10", channelGoalId: "g_md_page", type: "content", title: "Duyệt bài “Gội dưỡng sinh 39K: vì sao rẻ mà không ẩu”", entityType: "content", entityId: "ct_md2", status: "pending", requestedBy: "Agent viết nội dung", requestedAt: "2026-09-09T09:30:00+07:00", decidedBy: null, decidedAt: null, note: "" },
  { id: "ap_md2", campaignId: "cp_mocdiep_t10", channelGoalId: "g_md_tiktok", type: "video", title: "Video “Khách văn phòng Bến Tre nói gì sau lượt gội đầu tiên” (bản dựng 1)", entityType: "video", entityId: "v_md2", status: "pending", requestedBy: "Agent Edit Video", requestedAt: "2026-09-10T08:10:00+07:00", decidedBy: null, decidedAt: null, note: "" },
  { id: "ap_md3", campaignId: "cp_mocdiep_t10", channelGoalId: "g_md_fbads", type: "budget", title: "Quảng cáo “Gội dưỡng sinh 39K – đăng ký trải nghiệm” 500.000 ₫/ngày", entityType: "ad", entityId: "ad_md1", status: "pending", requestedBy: "Agent quảng cáo", requestedAt: "2026-09-10T07:40:00+07:00", decidedBy: null, decidedAt: null, note: "Trong hạn mức ngân sách kênh 15.000.000 ₫." },
  { id: "ap_md4", campaignId: "cp_mocdiep_t10", channelGoalId: "g_md_tiktok", type: "schedule", title: "Lịch đăng 03/10 19:00 trên TikTok và 20:30 trên Fanpage", entityType: "publication", entityId: "sp_md1", status: "approved", requestedBy: "Agent đăng bài", requestedAt: "2026-09-09T17:00:00+07:00", decidedBy: SEED_USER, decidedAt: "2026-09-09T18:20:00+07:00", note: "" },
  { id: "ap_md5", campaignId: "cp_mocdiep_t10", channelGoalId: "g_md_zalo", type: "automation", title: "Bật quy trình “Nhắc lịch gội qua Zalo” cho lead mới", entityType: "automation_run", entityId: "wf_zalo_remind", status: "pending", requestedBy: "Hệ thống", requestedAt: "2026-09-10T06:00:00+07:00", decidedBy: null, decidedAt: null, note: "Gửi tin nhắn Zalo 1 ngày trước lịch hẹn." },
  { id: "ap_md6", campaignId: "cp_mocdiep_t10", channelGoalId: "g_md_email", type: "channel_goal", title: "Thêm mục tiêu kênh Email cho khách cũ", entityType: null, entityId: null, status: "approved", requestedBy: "Thảo Vy", requestedAt: "2026-09-08T10:00:00+07:00", decidedBy: SEED_USER, decidedAt: "2026-09-08T11:00:00+07:00", note: "" },
  { id: "ap_rec1", campaignId: "cp_noli_tuyendung_hcm", channelGoalId: null, type: "campaign_change", title: "Phê duyệt chiến dịch “Tuyển dụng Noli Sales TP.HCM”", entityType: null, entityId: null, status: "pending", requestedBy: "Hoàng Lâm", requestedAt: "2026-09-09T16:30:00+07:00", decidedBy: null, decidedAt: null, note: "Ngân sách 20.000.000 ₫, 4 mục tiêu kênh." },
  { id: "ap_care1", campaignId: "cp_noli_chamsoc", channelGoalId: null, type: "campaign_change", title: "Phê duyệt chiến dịch “Chăm sóc khách hàng cũ Noli Sales”", entityType: null, entityId: null, status: "approved", requestedBy: "Thảo Vy", requestedAt: "2026-09-07T09:00:00+07:00", decidedBy: SEED_USER, decidedAt: "2026-09-08T09:00:00+07:00", note: "" },
  { id: "ap_s99_1", campaignId: "cp_sale99", channelGoalId: null, type: "campaign_change", title: "Phê duyệt chiến dịch “Sale 9.9 BAOR Skincare”", entityType: null, entityId: null, status: "approved", requestedBy: "Anh Thư", requestedAt: "2026-08-26T09:00:00+07:00", decidedBy: SEED_USER, decidedAt: "2026-08-27T15:00:00+07:00", note: "" },
  { id: "ap_s99_2", campaignId: "cp_sale99", channelGoalId: "g_s99_fbads", type: "budget", title: "Quảng cáo “Đẩy bài: Routine 3 bước mẹ bỉm” 200.000 ₫/ngày", entityType: "ad", entityId: "ad1", status: "approved", requestedBy: "Agent quảng cáo", requestedAt: "2026-09-02T20:00:00+07:00", decidedBy: SEED_USER, decidedAt: "2026-09-02T21:10:00+07:00", note: "" },
];

export const campaignResults: CampaignResult[] = [
  { campaignId: "cp_mocdiep_t10", achievedValue: 64, leads: 64, orders: 41, revenue: 5799000, spent: 5900000, updatedAt: "2026-09-10T08:00:00+07:00", source: "sample" },
  { campaignId: "cp_sale99", achievedValue: 212, leads: 95, orders: 212, revenue: 146280000, spent: 2720000, updatedAt: "2026-09-10T06:00:00+07:00", source: "sample" },
];

// Đơn hàng mẫu: gắn lead và chiến dịch bằng ID thật để tab Kết quả và Báo cáo có doanh thu.
export const sampleOrders: { id: string; leadId: string; campaignId: string; channelGoalId: string | null; productId: string; quantity: number; status: "new" | "paid" | "cancelled"; note: string; createdAt: string }[] = [
  { id: "od_s99_1", leadId: "l4", campaignId: "cp_sale99", channelGoalId: "g_s99_email", productId: "pr_combo3", quantity: 1, status: "paid", note: "Đặt qua inbox sau email Sale 9.9", createdAt: "2026-09-08T10:15:00+07:00" },
  { id: "od_s99_2", leadId: "l1", campaignId: "cp_sale99", channelGoalId: "g_s99_fbads", productId: "pr_combo3", quantity: 2, status: "paid", note: "Mua tặng bạn", createdAt: "2026-09-09T20:00:00+07:00" },
  { id: "od_s99_3", leadId: "l5", campaignId: "cp_sale99", channelGoalId: "g_s99_fbads", productId: "pr_serum", quantity: 1, status: "new", note: "Chờ chuyển khoản", createdAt: "2026-09-10T08:30:00+07:00" },
  { id: "od_md_1", leadId: "l_md3", campaignId: "cp_mocdiep_t10", channelGoalId: "g_md_fbads", productId: "pr_md_goi", quantity: 3, status: "paid", note: "Đăng ký cho 3 người", createdAt: "2026-09-10T09:00:00+07:00" },
  { id: "od_care_1", leadId: "l_care2", campaignId: "cp_noli_chamsoc", channelGoalId: "g_care_zalo", productId: "pr_noli_care", quantity: 1, status: "new", note: "Đặt lại combo", createdAt: "2026-09-08T15:40:00+07:00" },
];

export const campaignLogs: { campaignId: string; at: string; actor: string; action: string; detail: string }[] = [
  { campaignId: "cp_mocdiep_t10", at: "2026-09-05T09:00:00+07:00", actor: "Anh Thư", action: "Tạo chiến dịch", detail: "Bản nháp với 5 mục tiêu kênh." },
  { campaignId: "cp_mocdiep_t10", at: "2026-09-05T16:00:00+07:00", actor: "Anh Thư", action: "Gửi phê duyệt", detail: "" },
  { campaignId: "cp_mocdiep_t10", at: "2026-09-06T10:30:00+07:00", actor: SEED_USER, action: "Phê duyệt", detail: "" },
  { campaignId: "cp_mocdiep_t10", at: "2026-09-06T10:35:00+07:00", actor: SEED_USER, action: "Kích hoạt", detail: "Bắt đầu chuẩn bị nội dung trước ngày 01/10." },
  { campaignId: "cp_mocdiep_t10", at: "2026-09-08T11:00:00+07:00", actor: SEED_USER, action: "Thêm mục tiêu kênh", detail: "Email cho khách cũ, ngân sách 500.000 ₫." },
  { campaignId: "cp_noli_tuyendung_hcm", at: "2026-09-09T14:00:00+07:00", actor: "Hoàng Lâm", action: "Tạo chiến dịch", detail: "Bản nháp với 4 mục tiêu kênh." },
  { campaignId: "cp_noli_tuyendung_hcm", at: "2026-09-09T16:30:00+07:00", actor: "Hoàng Lâm", action: "Gửi phê duyệt", detail: "" },
  { campaignId: "cp_noli_chamsoc", at: "2026-09-04T10:00:00+07:00", actor: "Thảo Vy", action: "Tạo chiến dịch", detail: "" },
  { campaignId: "cp_noli_chamsoc", at: "2026-09-08T09:00:00+07:00", actor: SEED_USER, action: "Phê duyệt", detail: "Chờ kích hoạt ngày 01/10." },
  { campaignId: "cp_sale99", at: "2026-08-27T15:00:00+07:00", actor: SEED_USER, action: "Phê duyệt", detail: "" },
  { campaignId: "cp_sale99", at: "2026-09-01T08:00:00+07:00", actor: SEED_USER, action: "Kích hoạt", detail: "" },
  { campaignId: "cp_sale99", at: "2026-09-10T06:00:00+07:00", actor: "Agent phân tích hiệu quả", action: "Kết thúc", detail: "Hết thời gian chạy, đã chốt kết quả." },
];
