// DỮ LIỆU MẪU cho Trung tâm thông báo. Thay bằng API ở giai đoạn sau.
export type NotificationGroup = "approval" | "due" | "error" | "activity";

export interface NotificationItem {
  id: string;
  group: NotificationGroup;
  type: string; // nhãn ngắn: Nội dung, Video, Lịch đăng, Automation, Hệ thống
  text: string;
  at: string; // ISO
  read: boolean;
  href: string;
}

export const notificationGroups: { key: NotificationGroup; label: string }[] = [
  { key: "approval", label: "Chờ phê duyệt" },
  { key: "due", label: "Việc sắp đến hạn" },
  { key: "error", label: "Lỗi hệ thống" },
  { key: "activity", label: "Hoạt động gần đây" },
];

export const notifications: NotificationItem[] = [
  { id: "n1", group: "approval", type: "Nội dung", text: "Agent viết nội dung gửi duyệt “3 cách kiểm tra hàng chính hãng”.", at: "2026-09-10T08:40:00+07:00", read: false, href: "/content?tab=mine" },
  { id: "n2", group: "approval", type: "Video", text: "Video “Khách thật test serum 7 ngày” đã dựng xong, chờ anh phê duyệt.", at: "2026-09-10T08:10:00+07:00", read: false, href: "/video-studio" },
  { id: "n3", group: "approval", type: "Quảng cáo", text: "Đề xuất chạy ads cho bài “5 sai lầm mùa hanh khô”, 150.000 ₫/ngày.", at: "2026-09-09T22:10:00+07:00", read: true, href: "/publishing" },
  { id: "n4", group: "due", type: "Lịch đăng", text: "Bài “Review thật: 30 ngày dùng serum” sẽ đăng lúc 20:30 hôm nay.", at: "2026-09-10T07:00:00+07:00", read: false, href: "/publishing" },
  { id: "n5", group: "due", type: "Chiến dịch", text: "Chiến dịch “Sale 9.9” kết thúc trong 2 ngày. Cần chốt báo cáo.", at: "2026-09-10T06:30:00+07:00", read: true, href: "/campaigns" },
  { id: "n6", group: "error", type: "Hệ thống", text: "Token Facebook Page hết hạn. Bài lúc 20:30 hôm qua đăng lỗi.", at: "2026-09-09T20:31:00+07:00", read: false, href: "/settings" },
  { id: "n7", group: "error", type: "Automation", text: "Quy trình “Trả lời inbox tự động” dừng do quá giới hạn API.", at: "2026-09-09T18:05:00+07:00", read: true, href: "/automation" },
  { id: "n8", group: "activity", type: "Agent", text: "Agent phân tích hiệu quả đã cập nhật báo cáo tuần.", at: "2026-09-10T06:00:00+07:00", read: true, href: "/reports" },
  { id: "n9", group: "activity", type: "Nội dung", text: "Anh đã duyệt “Review thật: 30 ngày dùng serum”.", at: "2026-09-09T18:30:00+07:00", read: true, href: "/content?tab=done" },
];
