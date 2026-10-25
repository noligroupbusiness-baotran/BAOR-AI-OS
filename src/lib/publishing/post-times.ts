// Gợi ý giờ đăng (OWNER 25/10/2026: "chỗ chọn thời gian này hãy gợi ý thời gian đăng"). Nguồn: "Giờ vàng" của kênh ở
// Insights › Kênh phù hợp (bảng platform_research.best_posting_times). Giờ theo múi Việt Nam (UTC+7, không đổi giờ mùa hè).
import { listResearch } from "@/lib/queries";

const VN_OFFSET_MS = 7 * 3_600_000;
export const DEFAULT_GOLDEN_HOURS = ["07:30", "12:00", "20:30"];

export interface TimeSuggestion {
  /** Giá trị cho ô datetime-local (giờ Việt Nam): YYYY-MM-DDTHH:MM */
  value: string;
  /** Nhãn nút: "Hôm nay 20:30", "Mai 07:30", "27/10 12:00" */
  label: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Giờ vàng của một kênh (Insights › Kênh phù hợp); không có dữ liệu thì dùng khung mặc định. */
export function goldenHours(platform = "facebook"): { hours: string[]; source: string } {
  const key = platform.startsWith("facebook") ? "facebook" : platform.replace(/_.*$/, "");
  const row = listResearch().find((r) => r.platform === key);
  const hours = (row?.bestPostingTimes ?? []).filter((h) => /^\d{1,2}:\d{2}$/.test(h));
  return hours.length ? { hours, source: `Giờ vàng ${row!.name} (Insights › Kênh phù hợp)` } : { hours: DEFAULT_GOLDEN_HOURS, source: "Khung giờ mặc định" };
}

/** `count` khung giờ vàng sắp tới (bỏ giờ đã qua và giờ quá sát — cần ít nhất `leadMin` phút để chuẩn bị). */
export function suggestPostTimes(hours: string[], now: Date = new Date(), count = 3, leadMin = 15): TimeSuggestion[] {
  const slots = [...new Set(hours.filter((h) => /^\d{1,2}:\d{2}$/.test(h)))]
    .map((h) => h.split(":").map(Number) as [number, number])
    .filter(([h, m]) => h < 24 && m < 60)
    .sort((a, b) => a[0] * 60 + a[1] - (b[0] * 60 + b[1]));
  if (!slots.length) return [];
  const vnNow = new Date(now.getTime() + VN_OFFSET_MS); // đọc bằng getUTC* = giờ Việt Nam
  const earliest = now.getTime() + leadMin * 60_000;
  const out: TimeSuggestion[] = [];
  for (let d = 0; d < 8 && out.length < count; d++) {
    for (const [h, m] of slots) {
      const at = Date.UTC(vnNow.getUTCFullYear(), vnNow.getUTCMonth(), vnNow.getUTCDate() + d, h, m) - VN_OFFSET_MS;
      if (at < earliest) continue;
      const local = new Date(at + VN_OFFSET_MS);
      const hm = `${pad(h)}:${pad(m)}`;
      out.push({
        value: `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}T${hm}`,
        label: d === 0 ? `Hôm nay ${hm}` : d === 1 ? `Mai ${hm}` : `${pad(local.getUTCDate())}/${pad(local.getUTCMonth() + 1)} ${hm}`,
      });
      if (out.length >= count) break;
    }
  }
  return out;
}
