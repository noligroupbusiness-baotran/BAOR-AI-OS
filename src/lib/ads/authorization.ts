// CP05: ủy quyền ngân sách quảng cáo của OWNER. Không có ủy quyền còn hiệu lực = không bật / không tăng chi tiêu được,
// dù ai bấm. Tạm dừng và giảm ngân sách luôn được phép. AI chỉ tự tăng ngân sách khi OWNER bật allowAutoScale, và vẫn trong trần.
import { and, eq, gte, lte } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getSetting, setSetting } from "@/lib/admin";
import { readIntegrationConfig } from "@/lib/connectors/config";
import { adCampaigns as seedAds } from "@/lib/data/ads";
import { linkedRows } from "@/lib/data/campaigns";

/** Quảng cáo mẫu (dữ liệu demo nạp ban đầu) không tiêu tiền thật: không tính vào chi tiêu và ngân sách đang chạy. */
const SAMPLE_ADS = new Set([...seedAds, ...linkedRows.ads].map((a) => a.id));
export const isSampleAd = (id: string) => SAMPLE_ADS.has(id);

export interface AdAuthorization {
  monthlyCapVnd: number;
  dailyCapVnd: number;
  /** YYYY-MM-DD (hết ngày này, giờ VN). */
  validUntil: string;
  /** act_... chỉ được chi trên tài khoản này. */
  adAccountId: string;
  autoPauseCplAbove: number;
  allowAutoScale: boolean;
  authorizedBy: string;
  authorizedAt: string;
  note: string;
}

const KEY = "ads.authorization";
const TZ = "Asia/Ho_Chi_Minh";

export function getAuthorization(): AdAuthorization | null {
  try {
    const raw = getSetting(KEY);
    return raw ? (JSON.parse(raw) as AdAuthorization) : null;
  } catch {
    return null;
  }
}

export function saveAuthorization(a: AdAuthorization) {
  setSetting(KEY, JSON.stringify(a));
}

export function revokeAuthorization() {
  setSetting(KEY, "");
}

export const vnDate = (d = new Date()) => new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(d);

export function authorizationStatus(a: AdAuthorization | null, today = vnDate()): { active: boolean; reason: string } {
  if (!a) return { active: false, reason: "OWNER chưa ủy quyền ngân sách quảng cáo" };
  if (!(a.monthlyCapVnd > 0) || !(a.dailyCapVnd > 0)) return { active: false, reason: "Ủy quyền chưa có trần ngân sách hợp lệ" };
  if (a.validUntil < today) return { active: false, reason: `Ủy quyền đã hết hạn ngày ${a.validUntil}` };
  return { active: true, reason: `Ủy quyền tới ${a.validUntil}: tối đa ${a.dailyCapVnd.toLocaleString("vi-VN")} ₫/ngày mỗi quảng cáo, ${a.monthlyCapVnd.toLocaleString("vi-VN")} ₫/tháng` };
}

export interface SpendGateInput {
  auth: AdAuthorization | null;
  /** Ngân sách ngày đề nghị cho quảng cáo này. */
  dailyBudget: number;
  /** Ngân sách ngày hiện tại của quảng cáo này nếu đang chạy (0 nếu chưa chạy). */
  currentDaily: number;
  /** Tổng ngân sách ngày của các quảng cáo khác đang chạy. */
  otherActiveDaily: number;
  /** Đã chi trong tháng (VND). */
  monthSpent: number;
  /** Số ngày còn lại trong tháng tính cả hôm nay. */
  daysLeft: number;
  /** act_... của tài khoản sẽ chi (để trống nếu chưa đẩy lên Meta). */
  adAccountId?: string;
  today?: string;
}

/** Cổng chi tiêu thuần: dùng khi bật quảng cáo hoặc tăng ngân sách. Giảm / dừng không qua cổng này. */
export function spendGate(i: SpendGateInput): { ok: boolean; reason: string } {
  const st = authorizationStatus(i.auth, i.today);
  if (!st.active) return { ok: false, reason: st.reason };
  const a = i.auth!;
  if (i.adAccountId && a.adAccountId && i.adAccountId !== a.adAccountId) return { ok: false, reason: `Tài khoản quảng cáo ${i.adAccountId} không nằm trong ủy quyền (${a.adAccountId})` };
  if (!(i.dailyBudget > 0)) return { ok: false, reason: "Ngân sách ngày không hợp lệ" };
  if (i.dailyBudget > a.dailyCapVnd) return { ok: false, reason: `Ngân sách ${i.dailyBudget.toLocaleString("vi-VN")} ₫/ngày vượt trần ${a.dailyCapVnd.toLocaleString("vi-VN")} ₫/ngày` };
  const projected = i.monthSpent + (i.otherActiveDaily + i.dailyBudget) * Math.max(1, i.daysLeft);
  if (projected > a.monthlyCapVnd) {
    return { ok: false, reason: `Đã chi ${i.monthSpent.toLocaleString("vi-VN")} ₫ trong tháng; nếu chạy ${(i.otherActiveDaily + i.dailyBudget).toLocaleString("vi-VN")} ₫/ngày thêm ${i.daysLeft} ngày sẽ thành ${projected.toLocaleString("vi-VN")} ₫, vượt trần tháng ${a.monthlyCapVnd.toLocaleString("vi-VN")} ₫` };
  }
  return { ok: true, reason: `Trong ủy quyền: dự chi tháng ${projected.toLocaleString("vi-VN")} / ${a.monthlyCapVnd.toLocaleString("vi-VN")} ₫` };
}

export function daysLeftInMonth(today = vnDate()): number {
  const [y, m, d] = today.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return last - d + 1;
}

/**
 * Đã chi trong tháng: cộng chi tiêu theo ngày đọc từ Meta; quảng cáo chưa có số liệu theo ngày thì cộng tổng đã chi
 * ghi nhận (chặt hơn, không lỏng hơn).
 */
export function monthSpent(today = vnDate()): number {
  const db = getDb();
  const from = `${today.slice(0, 7)}-01`;
  const rows = db.select().from(schema.adSpendDaily).where(and(gte(schema.adSpendDaily.date, from), lte(schema.adSpendDaily.date, today))).all();
  const withDaily = new Set(db.select({ id: schema.adSpendDaily.adId }).from(schema.adSpendDaily).all().map((r) => r.id));
  const daily = rows.reduce((n, r) => n + r.spend, 0);
  const legacy = db.select().from(schema.adCampaigns).all().filter((a) => !withDaily.has(a.id) && !isSampleAd(a.id)).reduce((n, a) => n + a.spent, 0);
  return daily + legacy;
}

/** Cổng cho một quảng cáo cụ thể, lấy số liệu từ CSDL. */
export function gateForAd(adId: string, dailyBudget: number): { ok: boolean; reason: string } {
  const db = getDb();
  const ad = db.select().from(schema.adCampaigns).where(eq(schema.adCampaigns.id, adId)).get();
  const active = db.select().from(schema.adCampaigns).where(eq(schema.adCampaigns.status, "active")).all().filter((a) => !isSampleAd(a.id));
  const auth = getAuthorization();
  return spendGate({
    auth,
    dailyBudget,
    currentDaily: ad?.status === "active" ? ad.dailyBudget : 0,
    otherActiveDaily: active.filter((a) => a.id !== adId).reduce((n, a) => n + a.dailyBudget, 0),
    monthSpent: monthSpent(),
    daysLeft: daysLeftInMonth(),
    // Quảng cáo đã nằm trên Meta: tài khoản đang kết nối phải đúng tài khoản OWNER ủy quyền.
    adAccountId: ad?.metaCampaignId ? readIntegrationConfig("meta_ads").adAccountId || "?" : undefined,
  });
}
