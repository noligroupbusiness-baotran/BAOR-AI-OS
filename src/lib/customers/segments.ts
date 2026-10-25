// Phân Data: chia lead thành nhóm theo luật (giai đoạn, thời gian im lặng, kênh, thẻ). Chỉ marketing — không đơn hàng / doanh thu.
// Hoàn toàn theo công thức, không gọi AI. Dùng để chăm sóc lại, gắn thẻ hàng loạt, xuất CSV, nhắm chiến dịch.
import { platformLabel } from "@/components/ui/platform";
import type { Platform } from "@/lib/types";

// Dạng lead tối thiểu mà bộ phân nhóm cần; khớp cả bản ghi thô từ CSDL (listLeads) lẫn kiểu Lead đầy đủ.
export interface Lead {
  id: string;
  name: string;
  source: string;
  platform: string;
  stage: string;
  lastMessage: string;
  lastMessageAt: string;
  phone?: string | null;
  email?: string | null;
  tags: string[];
}

export interface SegmentDef {
  key: string;
  label: string;
  /** Giải thích luật bằng lời để người dùng hiểu vì sao khách vào nhóm. */
  rule: string;
  /** Gợi ý hành động chăm sóc. */
  action: string;
  group: "care" | "sales" | "channel" | "tag";
  tone?: "amber" | "brick" | "jade";
}

export interface SegmentResult extends SegmentDef {
  leads: Lead[];
}

export const QUIET_DAYS = 7;
export const COLD_DAYS = 30;

const daysSince = (iso: string, now: number) => Math.floor((now - Date.parse(iso)) / 86_400_000);


// Các nhóm cố định theo hành trình chăm sóc lead.
export function fixedSegments(leads: Lead[], now = Date.now()): SegmentResult[] {
  const active = (l: Lead) => l.stage === "contacted" || l.stage === "qualified";
  const defs: (SegmentDef & { pick: (l: Lead) => boolean })[] = [
    { key: "new", label: "Lead mới chưa liên hệ", rule: "Giai đoạn “Mới”.", action: "Liên hệ trong 24 giờ, xác nhận nhu cầu.", group: "care", tone: "amber", pick: (l) => l.stage === "new" },
    { key: "hot", label: "Đang chăm sóc, còn tương tác", rule: `Đã liên hệ hoặc đủ điều kiện, tin cuối trong ${QUIET_DAYS} ngày.`, action: "Hẹn gọi tư vấn hoặc gửi nội dung phù hợp.", group: "care", tone: "jade", pick: (l) => active(l) && daysSince(l.lastMessageAt, now) <= QUIET_DAYS },
    { key: "quiet", label: `Im lặng ${QUIET_DAYS}–${COLD_DAYS} ngày`, rule: `Đã liên hệ hoặc đủ điều kiện, tin cuối cách ${QUIET_DAYS + 1}–${COLD_DAYS} ngày.`, action: "Nhắn lại bằng câu hỏi mở hoặc nội dung hữu ích, không chào bán ngay.", group: "care", tone: "amber", pick: (l) => active(l) && daysSince(l.lastMessageAt, now) > QUIET_DAYS && daysSince(l.lastMessageAt, now) <= COLD_DAYS },
    { key: "cold", label: `Nguội trên ${COLD_DAYS} ngày`, rule: `Đã liên hệ hoặc đủ điều kiện, tin cuối cách hơn ${COLD_DAYS} ngày.`, action: "Đưa vào chuỗi email hoặc quảng cáo tiếp thị lại; cân nhắc chuyển “Mất”.", group: "care", tone: "brick", pick: (l) => active(l) && daysSince(l.lastMessageAt, now) > COLD_DAYS },
    { key: "won", label: "Đã chuyển đổi", rule: "Giai đoạn “Đã chuyển đổi”.", action: "Xin cảm nhận, mời giới thiệu bạn bè, mời theo dõi kênh.", group: "sales", tone: "jade", pick: (l) => l.stage === "won" },
    { key: "lost", label: "Mất", rule: "Giai đoạn “Mất”.", action: "Không chăm sóc chủ động; chỉ giữ trong danh sách tiếp thị lại dài hạn.", group: "sales", pick: (l) => l.stage === "lost" },
  ];
  return defs.map(({ pick, ...d }) => {
    const ls = leads.filter(pick);
    return { ...d, leads: ls };
  });
}

// Nhóm động theo kênh và theo thẻ: chỉ hiện nhóm có ít nhất một khách.
export function dynamicSegments(leads: Lead[]): SegmentResult[] {
  const out: SegmentResult[] = [];
  const byPlatform = new Map<string, Lead[]>();
  for (const l of leads) byPlatform.set(l.platform, [...(byPlatform.get(l.platform) ?? []), l]);
  for (const [p, ls] of [...byPlatform].sort((a, b) => b[1].length - a[1].length)) {
    out.push({ key: `platform:${p}`, label: `Kênh ${platformLabel(p as Platform)}`, rule: `Khách đến từ ${platformLabel(p as Platform)}.`, action: "So sánh chất lượng lead giữa các kênh để phân bổ ngân sách.", group: "channel", leads: ls });
  }
  const byTag = new Map<string, Lead[]>();
  for (const l of leads) for (const t of l.tags) byTag.set(t, [...(byTag.get(t) ?? []), l]);
  for (const [t, ls] of [...byTag].sort((a, b) => b[1].length - a[1].length)) {
    out.push({ key: `tag:${t}`, label: `Thẻ #${t}`, rule: `Khách được gắn thẻ “${t}”.`, action: "Nhắm nội dung hoặc ưu đãi theo đúng mối quan tâm của thẻ.", group: "tag", leads: ls });
  }
  return out;
}

export function allSegments(leads: Lead[], now = Date.now()): SegmentResult[] {
  return [...fixedSegments(leads, now), ...dynamicSegments(leads)];
}

export function findSegment(key: string, leads: Lead[], now = Date.now()): SegmentResult | undefined {
  return allSegments(leads, now).find((s) => s.key === key);
}

/** CSV cho Excel (BOM UTF-8, dấu phẩy, xuống dòng CRLF). */
export function leadsToCsv(leads: Lead[]): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ["Tên", "Điện thoại", "Email", "Kênh", "Nguồn", "Giai đoạn", "Thẻ", "Tin nhắn cuối", "Thời điểm cuối"];
  const rows = leads.map((l) => [l.name, l.phone, l.email, platformLabel(l.platform as Platform), l.source, l.stage, l.tags.join(" "), l.lastMessage, l.lastMessageAt].map(esc).join(","));
  return "﻿" + [head.join(","), ...rows].join("\r\n") + "\r\n";
}
