// DỮ LIỆU MẪU: quy tắc Automation mặc định và kho câu trả lời chuẩn. Nạp lần đầu, sửa trong giao diện.
import type { RuleInput } from "@/lib/automation/repository";

export const defaultRules: (RuleInput & { id: string; enabled: boolean })[] = [
  { id: "ar_complaint", name: "Khiếu nại → chuyển người ngay", description: "Không trả lời tự động khi khách bức xúc, đưa vào Chờ tôi xử lý.", trigger: "message_received", condition: { match: "complaint" }, action: "mark_needs_human", params: {}, priority: 10, requiresApproval: false, campaignId: null, enabled: true },
  { id: "ar_phone", name: "Có số điện thoại → lead Đã liên hệ, gọi lại trong 30 phút", description: "Tạo/đổi lead sang “Đã liên hệ” và báo người phụ trách gọi lại.", trigger: "message_received", condition: { match: "phone" }, action: "set_stage", params: { stage: "contacted" }, priority: 20, requiresApproval: false, campaignId: null, enabled: true },
  { id: "ar_faq", name: "Khớp câu chuẩn → trả lời từ kho FAQ", description: "Giờ mở cửa, địa chỉ, chính sách… trả lời ngay bằng câu đã duyệt trong Cài đặt.", trigger: "message_received", condition: { match: "faq" }, action: "reply_faq", params: {}, priority: 30, requiresApproval: false, campaignId: null, enabled: true },
  { id: "ar_price", name: "Hỏi giá → trả lời bảng giá", description: "Giá lấy từ Cài đặt › Sản phẩm, kèm lời mời để lại số điện thoại.", trigger: "message_received", condition: { match: "price" }, action: "reply_price", params: {}, priority: 40, requiresApproval: false, campaignId: null, enabled: true },
  { id: "ar_lead_new_tag", name: "Lead mới từ form → gắn nhãn “form website”", description: "", trigger: "lead_created", condition: { stages: ["new", "contacted"] }, action: "tag_lead", params: { tag: "form website" }, priority: 50, requiresApproval: false, campaignId: null, enabled: false },
  { id: "ar_lead_stale", name: "Lead 24 giờ không tương tác → nhắc chăm sóc", description: "Gắn nhãn “cần chăm sóc” và tạo thông báo cho người phụ trách.", trigger: "lead_stale", condition: { hours: 24, stages: ["new", "contacted"] }, action: "tag_lead", params: { tag: "cần chăm sóc" }, priority: 60, requiresApproval: false, campaignId: null, enabled: false },
  { id: "ar_engagement_ad", name: "Bài đạt 3% tương tác → đề xuất chạy quảng cáo", description: "Tạo quảng cáo chờ duyệt 150.000 ₫/ngày. Không tự chi tiền.", trigger: "post_engagement_high", condition: { engagementRate: 3 }, action: "propose_ad", params: { dailyBudget: 150000 }, priority: 70, requiresApproval: true, campaignId: null, enabled: true },
  { id: "ar_campaign_behind", name: "Mục tiêu kênh chậm hơn tiến độ 20% → báo người quản lý", description: "", trigger: "campaign_behind", condition: { behindPct: 20 }, action: "notify", params: { message: "Xem lại ngân sách hoặc nội dung của kênh này." }, priority: 80, requiresApproval: false, campaignId: null, enabled: true },
  { id: "ar_cpl", name: "CPL vượt hạn mức → tạm dừng quảng cáo", description: "Ngưỡng lấy từ Đăng bài & Quảng cáo › Hạn mức ngân sách.", trigger: "ad_cpl_high", condition: {}, action: "pause_ad", params: {}, priority: 90, requiresApproval: false, campaignId: null, enabled: true },
];

export const defaultFaqs: { id: string; question: string; keywords: string[]; answer: string }[] = [
  { id: "faq_hours", question: "Giờ mở cửa", keywords: ["mấy giờ", "mở cửa"], answer: "Dạ bên em mở cửa 9:00–21:00 tất cả các ngày trong tuần ạ. Anh/chị muốn đặt lịch khung giờ nào để em giữ chỗ?" },
  { id: "faq_address", question: "Địa chỉ", keywords: ["địa chỉ"], answer: "Dạ địa chỉ bên em có trong phần giới thiệu trang. Anh/chị cho em xin số điện thoại, em gửi vị trí và hướng dẫn đường đi ạ." },
  { id: "faq_booking", question: "Đặt lịch", keywords: ["đặt lịch"], answer: "Dạ em nhận đặt lịch qua đây ạ. Anh/chị cho em xin tên, số điện thoại và khung giờ mong muốn, em xác nhận ngay." },
  { id: "faq_ship", question: "Phí ship / giao hàng", keywords: ["ship"], answer: "Dạ đơn từ 500.000 ₫ được miễn phí giao hàng toàn quốc, dưới mức này phí ship 25.000 ₫ ạ. Anh/chị cho em xin địa chỉ để báo thời gian giao nhé." },
];
