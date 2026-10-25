// CP05: ủy quyền ngân sách quảng cáo của OWNER. Không có ủy quyền còn hiệu lực = không bật / không tăng chi tiêu được,
// dù ai bấm. Tạm dừng và giảm ngân sách luôn được phép. AI chỉ tự tăng ngân sách khi OWNER bật allowAutoScale, và vẫn trong trần.
import { and, eq, gte, lte } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getSetting, isAdminEmail, setSetting } from "@/lib/admin";
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

/** Đặt ủy quyền từ giao diện: CHỈ OWNER (tài khoản quản trị chính) — nhân sự quyền Quản trị không đặt được (§7: không tự đặt ủy quyền). */
export function saveAuthorizationAs(actor: { email: string }, a: AdAuthorization): { ok: true } | { ok: false; error: string } {
  if (!isAdminEmail(actor.email)) return { ok: false, error: "Chỉ OWNER (tài khoản quản trị chính) đặt được ủy quyền ngân sách." };
  saveAuthorization(a);
  return { ok: true };
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
  /** Đã chi trong tháng = đo được + ước tính (hiển thị "Đã chi"). */
  total: number;
  /** Cộng chi tiêu theo ngày đọc từ Meta (Insights), cộng số đã ghi nhận của quảng cáo chưa có số liệu theo ngày. */
  measured: number;
  /** Ước cho ngày đã qua mà Insights chưa phủ của quảng cáo đang chạy (ngân sách ngày − số đo được của ngày đó). */
  estimated: number;
  estimatedAds: { id: string; name: string; days: number; vnd: number }[];
  /** Chi tiêu đo được HÔM NAY theo quảng cáo (để trừ phần đã nằm trong dự chi, xem projectionBase). */
  todayByAd: Record<string, number>;
  /**
   * Nền dự chi khi tập quảng cáo đang chạy là các quảng cáo đang active: total trừ phần hôm nay của chúng đã nằm trong
   * "ngân sách ngày × số ngày còn lại" (daysLeftInMonth tính cả hôm nay). Tập khác (vd sau khi tự dừng) → projectionBaseFor.
   */
  projectionBase: number;
}

/**
 * Nền dự chi cho một TẬP quảng cáo sẽ còn chạy (id → ngân sách ngày dùng trong dự chi): chỉ quảng cáo trong tập mới được trừ
 * phần hôm nay (tối đa ngân sách của nó). Quảng cáo đã dừng giữ nguyên số đã tiêu hôm nay.
 */
/** Đồng bộ Insights thành công cuối đã cũ (> 2 giờ): phần hôm nay của quảng cáo chưa đo được đầy đủ. */
export function insightsStale(a: { insightsAt: string | null; startedAt: string | null }, now = Date.now()): boolean {
  const at = a.insightsAt ?? a.startedAt;
  return !at || now - Date.parse(at) > 2 * 3_600_000;
}

export function projectionBaseFor(d: Pick<MonthSpentDetail, "total" | "todayByAd">, running: Map<string, number>): number {
  let base = d.total;
  for (const [id, budget] of running) base -= Math.min(d.todayByAd[id] ?? 0, budget);
  return base;
}

function dayRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = new Date(`${from}T00:00:00Z`); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10));
  return out;
}

function prevDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Đã chi trong tháng, không bao giờ tính THIẾU nhưng cũng không ước bừa:
 * - Đo được: chi tiêu theo ngày đọc từ Meta.
 * - Ước tính: chỉ cho NGÀY ĐÃ QUA (tới hôm qua; hôm nay đã nằm trong phần dự chi) mà lần đồng bộ Insights thành công cuối
 *   chưa phủ tới. Đồng bộ thành công (insightsAt) đọc cả tháng nên mọi ngày TRƯỚC ngày đồng bộ là đã biết (không có dòng
 *   = không phân phối = 0 ₫); ngày đồng bộ và sau đó tới hôm qua mới thiếu số liệu thật. Chưa từng đồng bộ thì tính từ ngày
 *   bật (startedAt) / ngày lịch (startAt), theo giờ Việt Nam. Ngày thiếu ước = max(0, ngân sách ngày − số đo được ngày đó).
 * - Chỉ ước cho quảng cáo đang chạy và biết ngày bắt đầu.
 */
export function monthSpentDetail(today = vnDate()): MonthSpentDetail {
  const db = getDb();
  const from = `${today.slice(0, 7)}-01`;
  const yesterday = prevDay(today);
  const rows = db.select().from(schema.adSpendDaily).where(and(gte(schema.adSpendDaily.date, from), lte(schema.adSpendDaily.date, today))).all().filter((r) => !isSampleAd(r.adId));
  const withDaily = new Set(db.select({ id: schema.adSpendDaily.adId }).from(schema.adSpendDaily).all().map((r) => r.id));
  const ads = db.select().from(schema.adCampaigns).all().filter((a) => !isSampleAd(a.id));
  let measured = rows.reduce((n, r) => n + r.spend, 0);
  let estimated = 0;
  const estimatedAds: MonthSpentDetail["estimatedAds"] = [];
  for (const a of ads) {
    // Số đã ghi nhận nhưng không có dòng theo ngày (nhập tay / dữ liệu cũ): giữ nguyên, tính là đo được, không phải ước.
    if (!withDaily.has(a.id) && a.spent > 0) measured += a.spent;
    // Đang chạy, hoặc đã từng chạy rồi tạm dừng: ngày đã chạy mà Insights chưa phủ vẫn phải ước (dừng không xoá tiền đã tiêu).
    // Chỉ quảng cáo nằm trên Meta mới tiêu tiền thật (quảng cáo chỉ có trong app không có chi tiêu để ước).
    const ran = !!a.metaCampaignId && (a.status === "active" || (a.status === "paused" && !!a.startedAt));
    if (!ran) continue;
    const coverIso = a.insightsAt ?? a.startedAt ?? a.startAt;
    if (!coverIso) continue;
    const cover = vnDate(new Date(coverIso));
    const days = dayRange(cover > from ? cover : from, yesterday);
    // Quảng cáo đã dừng không nằm trong dự chi → hôm nay cũng phải ước nếu lần đồng bộ thành công cuối đã cũ (> 2 giờ):
    // có thể nó đã tiêu trong hôm nay trước khi dừng mà chưa đo được.
    if (a.status !== "active" && cover <= today && insightsStale({ insightsAt: a.insightsAt, startedAt: coverIso })) days.push(today);
    let vnd = 0;
    let n = 0;
    for (const d of days) {
      const got = rows.filter((r) => r.adId === a.id && r.date === d).reduce((x, r) => x + r.spend, 0);
      const gap = Math.max(0, a.dailyBudget - got);
      if (gap > 0) {
        vnd += gap;
        n++;
      }
    }
    if (vnd > 0) {
      estimated += vnd;
      estimatedAds.push({ id: a.id, name: a.name, days: n, vnd });
    }
  }
  const todayByAd: Record<string, number> = {};
  for (const r of rows) if (r.date === today) todayByAd[r.adId] = (todayByAd[r.adId] ?? 0) + r.spend;
  const total = measured + estimated;
  const active = new Map(ads.filter((a) => a.status === "active").map((a) => [a.id, a.dailyBudget]));
  return { total, measured, estimated, estimatedAds, todayByAd, projectionBase: projectionBaseFor({ total, todayByAd }, active) };
}

export function monthSpent(today = vnDate()): number {
  return monthSpentDetail(today).total;
}

/** Nền cho phép dự chi "đã chi + ngân sách ngày × số ngày còn lại (kể cả hôm nay)". */
export function monthSpentForProjection(today = vnDate()): number {
  return monthSpentDetail(today).projectionBase;
}

/** Cổng cho một quảng cáo cụ thể, lấy số liệu từ CSDL. */
export function gateForAd(adId: string, dailyBudget: number): { ok: boolean; reason: string } {
  const db = getDb();
  const ad = db.select().from(schema.adCampaigns).where(eq(schema.adCampaigns.id, adId)).get();
  const active = db.select().from(schema.adCampaigns).where(eq(schema.adCampaigns.status, "active")).all().filter((a) => !isSampleAd(a.id));
  const auth = getAuthorization();
  const others = active.filter((a) => a.id !== adId);
  // Tập sẽ chạy: các quảng cáo đang chạy khác + quảng cáo này với ngân sách mới
  const running = new Map([...others.map((a) => [a.id, a.dailyBudget] as [string, number]), [adId, dailyBudget]]);
  return spendGate({
    auth,
    dailyBudget,
    currentDaily: ad?.status === "active" ? ad.dailyBudget : 0,
    otherActiveDaily: others.reduce((n, a) => n + a.dailyBudget, 0),
    monthSpent: projectionBaseFor(monthSpentDetail(), running),
    daysLeft: daysLeftInMonth(),
    // Quảng cáo đã nằm trên Meta: tài khoản đang kết nối phải đúng tài khoản OWNER ủy quyền.
    adAccountId: ad?.metaCampaignId ? readIntegrationConfig("meta_ads").adAccountId || "?" : undefined,
  });
}
