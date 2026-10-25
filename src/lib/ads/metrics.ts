// Chỉ số quảng cáo từ số liệu Meta Insights đã đồng bộ (thuần, dùng chung cho bảng Quảng cáo / Báo cáo / test).
// Không đủ số liệu (0 lượt hiển thị) → null, KHÔNG hiện 0 giả.
export interface AdMetrics {
  /** Chi phí cho 1.000 lượt hiển thị (₫). */
  cpm: number | null;
  /** Tỷ lệ bấm = lượt bấm / lượt hiển thị (0–1). */
  ctr: number | null;
  /** Tần suất = lượt hiển thị / người duy nhất. */
  frequency: number | null;
  /** Chi phí mỗi lượt bấm (₫). */
  cpc: number | null;
}

export function adMetrics(a: { spent: number; impressions: number; clicks: number; reach: number }): AdMetrics {
  const imp = a.impressions > 0 ? a.impressions : 0;
  return {
    cpm: imp ? Math.round((a.spent / imp) * 1000) : null,
    ctr: imp ? a.clicks / imp : null,
    // reach là trọn đời trên Meta, lượt hiển thị là tổng các ngày đã đồng bộ: reach > lượt hiển thị nghĩa là hai số khác
    // khung thời gian (quảng cáo chạy trước khi app đồng bộ) → không hiện tần suất sai (< 1)
    frequency: imp && a.reach > 0 && a.reach <= imp ? Math.round((imp / a.reach) * 100) / 100 : null,
    cpc: a.clicks > 0 ? Math.round(a.spent / a.clicks) : null,
  };
}

export const pct = (x: number | null, digits = 2) => (x === null ? "—" : `${(x * 100).toFixed(digits).replace(".", ",")}%`);
