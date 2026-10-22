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

export interface MonthSpentDetail {
  /** Tổng dùng cho cổng chi tiêu = đo được + ước tính. */
  total: number;
  /** Cộng chi tiêu theo ngày đọc từ Meta (Insights). */
  measured: number;
  /** Ước cho ngày thiếu số liệu của quảng cáo đang chạy (ngân sách ngày × số ngày thiếu). */
  estimated: number;
  estimatedAds: { id: string; name: string; days: number; vnd: number }[];
}

function dayRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = new Date(`${from}T00:00:00Z`); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10));
  return out;
}

/**
 * Đã chi trong tháng, không bao giờ tính THIẾU: cộng chi tiêu theo ngày đọc từ Meta; quảng cáo đang chạy mà có ngày chưa có số liệu
 * (Insights lỗi / chưa đồng bộ) thì ước những ngày đó theo ngân sách ngày; quảng cáo chưa có số liệu theo ngày thì lấy
 * max(tổng đã chi ghi nhận, ngân sách ngày × số ngày chạy trong tháng).
 */
export function monthSpentDetail(today = vnDate()): MonthSpentDetail {
  const db = getDb();
  const from = `${today.slice(0, 7)}-01`;
  const rows = db.select().from(schema.adSpendDaily).where(and(gte(schema.adSpendDaily.date, from), lte(schema.adSpendDaily.date, today))).all();
  const withDaily = new Set(db.select({ id: schema.adSpendDaily.adId }).from(schema.adSpendDaily).all().map((r) => r.id));
  const ads = db.select().from(schema.adCampaigns).all().filter((a) => !isSampleAd(a.id));
  const measured = rows.filter((r) => !isSampleAd(r.adId)).reduce((n, r) => n + r.spend, 0);
  let estimated = 0;
  const estimatedAds: MonthSpentDetail["estimatedAds"] = [];
  for (const a of ads) {
    // Chỉ ước khi biết ngày bắt đầu chạy (startedAt ghi lúc bật, hoặc startAt của lịch); không biết thì giữ số đã ghi nhận.
    const startIso = a.startedAt ?? a.startAt;
    const start = startIso ? startIso.slice(0, 10) : null;
    const runDays = a.status === "active" && start ? dayRange(start > from ? start : from, today) : [];
    if (withDaily.has(a.id)) {
      const have = new Set(rows.filter((r) => r.adId === a.id).map((r) => r.date));
      const missing = runDays.filter((d) => !have.has(d)).length;
      if (missing > 0) {
        estimated += missing * a.dailyBudget;
        estimatedAds.push({ id: a.id, name: a.name, days: missing, vnd: missing * a.dailyBudget });
      }
    } else {
      const est = runDays.length * a.dailyBudget;
      if (est > a.spent) {
        estimated += est;
        estimatedAds.push({ id: a.id, name: a.name, days: runDays.length, vnd: est });
      } else estimated += a.spent;
    }
  }
  return { total: measured + estimated, measured, estimated, estimatedAds };
}

export function monthSpent(today = vnDate()): number {
  return monthSpentDetail(today).total;
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
