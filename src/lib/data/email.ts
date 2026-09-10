import type { EmailCampaign, EmailSequence } from "@/lib/types";

export const emailStats = {
  subscribers: 3860,
  newThisWeek: 142,
  avgOpenRate: 41.2,
  avgClickRate: 6.8,
  unsubscribeRate: 0.4,
};

export const emailSequences: EmailSequence[] = [
  {
    id: "es1",
    name: "Chào mừng khách mới",
    trigger: "Khi lead để lại email lần đầu",
    steps: 4,
    active: true,
    subscribers: 1240,
    openRate: 52.3,
    clickRate: 9.1,
  },
  {
    id: "es2",
    name: "Nuôi dưỡng: hỏi giá chưa mua",
    trigger: "Lead ở giai đoạn 'Đã liên hệ' quá 3 ngày",
    steps: 5,
    active: true,
    subscribers: 680,
    openRate: 38.7,
    clickRate: 5.4,
  },
  {
    id: "es3",
    name: "Sau mua: hướng dẫn & nhắc mua lại",
    trigger: "Đơn hàng hoàn tất",
    steps: 6,
    active: true,
    subscribers: 1520,
    openRate: 44.9,
    clickRate: 7.8,
  },
  {
    id: "es4",
    name: "Khách ngủ đông 60 ngày",
    trigger: "Không mở email 60 ngày",
    steps: 3,
    active: false,
    subscribers: 420,
    openRate: 18.2,
    clickRate: 2.1,
  },
];

export const emailCampaigns: EmailCampaign[] = [
  {
    id: "ec1",
    subject: "Sale 9.9: combo 3 bước giảm 25% cho thành viên",
    sentAt: "2026-09-09T09:00:00+07:00",
    status: "sent",
    recipients: 3710,
    openRate: 46.1,
    clickRate: 8.9,
  },
  {
    id: "ec2",
    subject: "Livestream tư vấn da miễn phí tối thứ 6",
    status: "scheduled",
    sentAt: "2026-09-12T10:00:00+07:00",
    recipients: 3860,
  },
  {
    id: "ec3",
    subject: "[AI đề xuất] 3 cách kiểm tra hàng chính hãng",
    status: "draft",
    recipients: 3860,
  },
  {
    id: "ec4",
    subject: "Mùa hanh khô: 5 sai lầm cần tránh",
    sentAt: "2026-09-02T09:00:00+07:00",
    status: "sent",
    recipients: 3590,
    openRate: 39.4,
    clickRate: 6.2,
  },
];
