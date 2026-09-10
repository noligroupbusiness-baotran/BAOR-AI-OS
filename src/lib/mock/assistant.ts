// DỮ LIỆU MẪU cho Trợ lý BAOR AI (giao diện, chưa nối mô hình thật).
export const assistantGreeting = "Chào anh. Em là trợ lý BAOR AI. Anh cần em giúp gì cho công việc marketing hôm nay?";

export const assistantSuggestions = [
  "Tóm tắt việc cần xử lý hôm nay",
  "Đề xuất 5 ý tưởng nội dung tuần này",
  "Bài nào đang hiệu quả nhất?",
  "Kiểm tra lỗi đăng bài gần đây",
];

export interface AssistantMessage {
  id: string;
  from: "user" | "assistant";
  text: string;
  at: string;
}

export const assistantHistory: AssistantMessage[] = [
  { id: "m1", from: "user", text: "Hôm nay có bài nào chờ duyệt không?", at: "2026-09-10T08:45:00+07:00" },
  { id: "m2", from: "assistant", text: "Có 2 nội dung và 1 video đang chờ anh duyệt. Bài “3 cách kiểm tra hàng chính hãng” được chấm 87 điểm, nên duyệt trước để kịp giờ vàng 20:30.", at: "2026-09-10T08:45:10+07:00" },
];
