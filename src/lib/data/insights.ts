import type { Insight, Persona } from "@/lib/types";

export const personas: Persona[] = [
  {
    id: "p1",
    name: "Chị Lan – mẹ bỉm bận rộn",
    ageRange: "28–38",
    occupation: "Nhân viên văn phòng, có con nhỏ",
    location: "TP.HCM, Hà Nội",
    goals: ["Da khỏe nhanh, ít bước", "Mua một lần dùng lâu", "Được tư vấn đúng loại da"],
    painPoints: ["Không có thời gian", "Sợ mua phải hàng giả", "Từng dùng sai sản phẩm gây kích ứng"],
    objections: ["Giá cao hơn chợ", "Không biết có hợp da không"],
    channels: ["facebook", "zalo"],
    share: 46,
  },
  {
    id: "p2",
    name: "Minh Anh – sinh viên/GenZ",
    ageRange: "18–24",
    occupation: "Sinh viên, mới đi làm",
    location: "Toàn quốc",
    goals: ["Trị mụn, thâm", "Sản phẩm giá hợp lý", "Bắt trend"],
    painPoints: ["Ngân sách hạn chế", "Bị ngợp bởi quá nhiều review", "Da dầu mụn khó trị"],
    objections: ["Chờ sale mới mua", "Thích mua trên TikTok Shop hơn"],
    channels: ["tiktok", "instagram", "facebook"],
    share: 34,
  },
  {
    id: "p3",
    name: "Cô Hương – khách trung niên",
    ageRange: "40–55",
    occupation: "Kinh doanh tự do, nội trợ",
    location: "Tỉnh thành",
    goals: ["Chống lão hóa", "Sản phẩm an toàn, có nguồn gốc", "Được chăm sóc tận tình"],
    painPoints: ["Không rành công nghệ", "Sợ bị lừa online", "Cần người tư vấn trực tiếp"],
    objections: ["Muốn xem hàng trước", "Không tin quảng cáo"],
    channels: ["facebook", "zalo"],
    share: 20,
  },
];

export const insights: Insight[] = [
  {
    id: "i1",
    title: "Sợ mua phải hàng giả",
    detail:
      "62% bình luận và inbox tháng qua hỏi về tem chống giả, hóa đơn, nguồn gốc. Nội dung chứng minh nguồn gốc có tỷ lệ inbox cao gấp 2,3 lần.",
    confidence: 91,
    source: "Phân tích 1.240 bình luận + 380 inbox",
    personaId: "p1",
    createdAt: "2026-09-09T06:20:00+07:00",
    usedInContent: 3,
  },
  {
    id: "i2",
    title: "Muốn quy trình ít bước",
    detail:
      "Khách mẹ bỉm phản hồi tích cực với combo 3 bước. Từ khóa 'đơn giản', 'nhanh', 'lười' xuất hiện nhiều trong tin nhắn.",
    confidence: 84,
    source: "Inbox + khảo sát sau mua",
    personaId: "p1",
    createdAt: "2026-09-09T06:20:00+07:00",
    usedInContent: 2,
  },
  {
    id: "i3",
    title: "GenZ tin review thật hơn quảng cáo",
    detail:
      "Video test 7 ngày từ khách thật có tỷ lệ xem hết 58%, so với 21% của video giới thiệu sản phẩm.",
    confidence: 88,
    source: "TikTok analytics + Facebook insights",
    personaId: "p2",
    createdAt: "2026-09-09T06:20:00+07:00",
    usedInContent: 4,
  },
  {
    id: "i4",
    title: "Khách trung niên cần tư vấn qua điện thoại",
    detail:
      "41% lead từ 40 tuổi trở lên để lại số điện thoại thay vì chat. Tỷ lệ chốt cao khi gọi lại trong 30 phút.",
    confidence: 79,
    source: "CRM 90 ngày",
    personaId: "p3",
    createdAt: "2026-09-09T06:20:00+07:00",
    usedInContent: 1,
  },
  {
    id: "i5",
    title: "Giờ vàng inbox: 20:00–22:30",
    detail: "58% inbox đến trong khung này. Bài đăng 20:30 có reach cao hơn 35% so với trung bình.",
    confidence: 93,
    source: "Facebook insights 60 ngày",
    personaId: "p1",
    createdAt: "2026-09-09T06:20:00+07:00",
    usedInContent: 0,
  },
];
