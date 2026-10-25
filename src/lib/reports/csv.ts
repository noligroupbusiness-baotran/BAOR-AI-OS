// Xuất báo cáo ra CSV mở được bằng Excel (BOM UTF-8, dấu phẩy, CRLF). Cùng nguồn số với trang Báo cáo.
import { campaignRows, channelRows, contentRows, costSummary, leadSummary, type ReportFilter } from "./data";
import { campaignStatusLabel } from "@/lib/campaigns/labels";
import { leadSourceLabel, leadStageLabel } from "@/lib/labels";

export type ReportCsvTab = "overview" | "channels" | "content" | "leads" | "costs";
export const REPORT_CSV_TABS: ReportCsvTab[] = ["overview", "channels", "content", "leads", "costs"];

const esc = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const table = (head: string[], rows: unknown[][]) => "﻿" + [head, ...rows].map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n";

export function reportCsv(tab: ReportCsvTab, f: ReportFilter): { name: string; csv: string } {
  const suffix = `${f.month ?? "tat-ca"}${f.campaignId ? `-${f.campaignId}` : ""}`;
  switch (tab) {
    case "overview": {
      const rows = campaignRows(f);
      return {
        name: `bao-cao-chien-dich-${suffix}.csv`,
        csv: table(
          ["Chiến dịch", "Trạng thái", "Mục tiêu", "Chỉ tiêu", "Đạt", "Tiến độ %", "Lead", "Chi phí", "Ngân sách", "CPL", "Nguồn số"],
          rows.map((r) => [r.name, campaignStatusLabel[r.status].label, r.objective, r.targetValue ?? "", r.achieved, r.progress, r.leads, r.spent, r.budget, r.cpl ?? "", r.sample ? "mẫu" : r.source]),
        ),
      };
    }
    case "channels": {
      const rows = channelRows(f);
      return { name: `bao-cao-kenh-${suffix}.csv`, csv: table(["Kênh", "Số mục tiêu", "Số chiến dịch", "Chỉ số", "Chỉ tiêu", "Thực tế", "Tiến độ %", "Ngân sách", "Đã chi"], rows.map((r) => [r.label, r.goals, r.campaigns, r.metricLabel, r.target, r.current, r.progress, r.budget, r.spent])) };
    }
    case "content": {
      const rows = contentRows(f);
      return { name: `bao-cao-noi-dung-${suffix}.csv`, csv: table(["Nội dung", "Kênh", "Số bài", "Tiếp cận", "Tương tác", "Tỷ lệ %"], rows.map((r) => [r.title, r.platforms.join(" "), r.posts, r.reach, r.engagement, r.rate ?? ""])) };
    }
    case "leads": {
      const s = leadSummary(f);
      const rows: unknown[][] = [
        ...s.byStage.map((x) => ["Giai đoạn", leadStageLabel[x.stage as keyof typeof leadStageLabel]?.label ?? x.stage, x.n]),
        ...s.bySource.map((x) => ["Nguồn", leadSourceLabel[x.source] ?? x.source, x.n]),
        ...s.byPlatform.map((x) => ["Kênh", x.platform, x.n]),
        ...s.byCampaign.map((x) => ["Chiến dịch", x.campaign, x.n, x.won]),
      ];
      return { name: `bao-cao-lead-${suffix}.csv`, csv: table(["Nhóm", "Giá trị", "Số lead", "Đã chuyển đổi"], rows) };
    }
    case "costs": {
      const s = costSummary(f);
      return { name: `bao-cao-chi-phi-${suffix}.csv`, csv: table(["Chiến dịch", "Ngân sách", "Đã chi", "Lead", "CPL", "Nguồn số"], s.byCampaign.map((x) => [x.name, x.budget, x.spent, x.leads, x.cpl ?? "", x.sample ? "mẫu" : "thật"])) };
    }
  }
}
