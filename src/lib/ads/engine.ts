// CP05: bộ máy quảng cáo Meta. Video đã đăng + xác minh → đề xuất / nháp → OWNER duyệt → bật trong ủy quyền ngân sách
// → đọc chi phí theo ngày → đề xuất tối ưu. Không bao giờ tự tiêu tiền để thử; không đổi quyền tài khoản quảng cáo.
import { and, eq, isNotNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getSetting, setSetting } from "@/lib/admin";
import { logActivity } from "@/lib/activity";
import { sendAlert } from "@/lib/alerts";
import { campaignRepo } from "@/lib/campaigns/repository";
import { connectorContext, readIntegrationConfig } from "@/lib/connectors/config";
import { getUpload, uploadPath } from "@/lib/uploads";
import { authorizationStatus, daysLeftInMonth, gateForAd, getAuthorization, insightsStale, isSampleAd, monthSpentDetail, projectionBaseFor, vnDate } from "./authorization";
import { createPausedDraft, fetchDailyInsights, fetchReachTotal, setDailyBudget, setDeliveryStatus, setObjectStatus, type Audience } from "./meta-marketing";

const nowIso = () => new Date().toISOString();
const newId = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
export const DEFAULT_AUDIENCE: Audience = { countries: ["VN"], ageMin: 22, ageMax: 45, genders: [] };

export function parseAudience(s: string | null): Audience {
  try {
    const a = JSON.parse(s ?? "") as Partial<Audience>;
    return { countries: a.countries?.length ? a.countries : ["VN"], ageMin: Number(a.ageMin) || 18, ageMax: Number(a.ageMax) || 65, genders: Array.isArray(a.genders) ? a.genders.map(Number).filter((g) => g === 1 || g === 2) : [] };
  } catch {
    return DEFAULT_AUDIENCE;
  }
}

function metaConnected(): boolean {
  return !!getDb().select().from(schema.integrations).where(eq(schema.integrations.key, "meta_ads")).get()?.connected;
}

type Result = { ok: true; message: string } | { ok: false; error: string };

/** Nháp quảng cáo từ một bài video đã đăng và xác minh. Không tiêu tiền. */
export function createDraftFromPost(input: { postId: string; dailyBudget: number; days: number; audience: Audience; by: string; aiNote?: string; status?: "proposed" | "pending_approval" }): Result & { adId?: string } {
  const db = getDb();
  const post = db.select().from(schema.scheduledPosts).where(eq(schema.scheduledPosts.id, input.postId)).get();
  if (!post?.videoId) return { ok: false, error: "Không tìm thấy bài video" };
  if (post.status !== "published" || !post.verifiedAt || post.mode !== "live") return { ok: false, error: "Chỉ quảng cáo bài video đã đăng thật và đã xác minh" };
  if (db.select().from(schema.adCampaigns).where(and(eq(schema.adCampaigns.postId, post.id))).all().some((a) => !["rejected", "ended"].includes(a.status))) return { ok: false, error: "Bài này đã có quảng cáo" };
  if (!(input.dailyBudget > 0) || !(input.days >= 1 && input.days <= 90)) return { ok: false, error: "Ngân sách hoặc số ngày không hợp lệ" };
  const start = new Date(Date.now() + 60 * 60 * 1000);
  const end = new Date(start.getTime() + input.days * 24 * 60 * 60 * 1000);
  const adId = newId("ad");
  db.insert(schema.adCampaigns)
    .values({
      id: adId,
      name: `Video: ${post.title}`.slice(0, 120),
      objective: "video_views",
      status: input.status ?? "pending_approval",
      dailyBudget: Math.round(input.dailyBudget),
      audience: `${input.audience.countries.join(", ")} · ${input.audience.ageMin}–${input.audience.ageMax} tuổi`,
      audienceJson: JSON.stringify(input.audience),
      contentId: post.contentId || null,
      videoId: post.videoId,
      postId: post.id,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      aiNote: input.aiNote ?? null,
      createdBy: input.by,
    })
    .run();
  campaignRepo.inheritLinks("publication", post.id, "ad", adId, input.status ?? "pending_approval");
  logActivity(input.status === "proposed" ? "ai" : "human", `${input.by} tạo nháp quảng cáo cho “${post.title}” (${input.dailyBudget.toLocaleString("vi-VN")} ₫/ngày, ${input.days} ngày). Chưa tiêu tiền.`, "ads");
  return { ok: true, message: "Đã tạo nháp quảng cáo, chờ duyệt", adId };
}

/** Đề xuất theo luật: bài video thật đã xác minh có lượt xem từ ngưỡng trở lên và chưa có quảng cáo. */
export function proposeFromVideoPosts(): number {
  const db = getDb();
  const minViews = Number(getSetting("ads.proposeMinViews") ?? 300);
  const auth = getAuthorization();
  const budget = Math.min(auth?.dailyCapVnd ?? 100_000, 100_000);
  let n = 0;
  const posts = db.select().from(schema.scheduledPosts).where(and(eq(schema.scheduledPosts.status, "published"), eq(schema.scheduledPosts.mode, "live"), isNotNull(schema.scheduledPosts.verifiedAt))).all();
  for (const p of posts) {
    if (!p.videoId || (p.views ?? 0) < minViews) continue;
    const r = createDraftFromPost({ postId: p.id, dailyBudget: budget, days: 7, audience: DEFAULT_AUDIENCE, by: "AI đề xuất", status: "proposed", aiNote: `Đề xuất theo luật: ${p.views} lượt xem tự nhiên (ngưỡng ${minViews}). Ngân sách gợi ý ${budget.toLocaleString("vi-VN")} ₫/ngày trong 7 ngày; cần OWNER duyệt.` });
    if (r.ok) n++;
  }
  return n;
}

/** Đẩy nháp lên Meta, mọi tầng ở PAUSED (không tiêu tiền). */
export async function pushDraftToMeta(adId: string): Promise<Result> {
  const db = getDb();
  const ad = db.select().from(schema.adCampaigns).where(eq(schema.adCampaigns.id, adId)).get();
  if (!ad?.postId) return { ok: false, error: "Quảng cáo này không gắn bài video" };
  if (ad.status !== "proposed" && ad.status !== "pending_approval") return { ok: false, error: "Chỉ đẩy lên Meta nháp đang đề xuất hoặc chờ duyệt" };
  if (!metaConnected()) return { ok: false, error: "Chưa kết nối Meta Ads: nháp giữ trong hệ thống" };
  const auth = getAuthorization();
  const cfg = readIntegrationConfig("meta_ads");
  if (auth?.adAccountId && cfg.adAccountId !== auth.adAccountId) return { ok: false, error: `Tài khoản quảng cáo đang kết nối (${cfg.adAccountId}) khác tài khoản OWNER ủy quyền (${auth.adAccountId})` };
  const post = db.select().from(schema.scheduledPosts).where(eq(schema.scheduledPosts.id, ad.postId)).get();
  // Quảng cáo chạy dưới đúng trang đã đăng bài: Fanpage 2–4 (platform facebook_page_<n>) dùng Page ID của chính trang đó
  const pageKey = post?.platform && /^facebook_page_\d+$/.test(post.platform) ? post.platform : "facebook_page";
  const pageId = readIntegrationConfig(pageKey).pageId;
  if (!post?.externalId || !pageId) return { ok: false, error: "Thiếu mã video Facebook hoặc Page ID" };
  // Ảnh bìa gửi thẳng lên Meta (image_hash): đường dẫn tệp của hệ thống cần đăng nhập nên Meta không tải được.
  const thumb = post.thumbnailUploadId ? getUpload(post.thumbnailUploadId) : undefined;
  const thumbPath = thumb ? uploadPath(thumb) : null;
  if (!thumbPath) return { ok: false, error: "Bài video chưa có ảnh bìa" };
  const r = await createPausedDraft(
    connectorContext("meta_ads"),
    { name: ad.name, dailyBudgetVnd: ad.dailyBudget, audience: parseAudience(ad.audienceJson), startAt: ad.startAt ?? nowIso(), endAt: ad.endAt ?? nowIso(), pageId, videoExternalId: post.externalId, thumbnailPath: thumbPath, message: post.caption ?? "" },
    { campaignId: ad.metaCampaignId ?? undefined, adsetId: ad.metaAdsetId ?? undefined, creativeId: ad.metaCreativeId ?? undefined, adId: ad.metaAdId ?? undefined },
  );
  db.update(schema.adCampaigns).set({ metaCampaignId: r.ids.campaignId ?? null, metaAdsetId: r.ids.adsetId ?? null, metaCreativeId: r.ids.creativeId ?? null, metaAdId: r.ids.adId ?? null }).where(eq(schema.adCampaigns.id, adId)).run();
  if (!r.ok) return { ok: false, error: `Đẩy lên Meta dở dang: ${r.error}` };
  logActivity("system", `Đã tạo nháp “${ad.name}” trên Meta (tạm dừng, chưa tiêu tiền).`, "ads");
  return { ok: true, message: "Đã tạo trên Meta ở trạng thái tạm dừng" };
}

/** Bật quảng cáo: chỉ sau duyệt và trong ủy quyền ngân sách. */
export async function activateAd(adId: string, by: string): Promise<Result> {
  const db = getDb();
  const ad = db.select().from(schema.adCampaigns).where(eq(schema.adCampaigns.id, adId)).get();
  if (!ad) return { ok: false, error: "Không tìm thấy quảng cáo" };
  if (ad.status !== "pending_approval" && ad.status !== "paused") return { ok: false, error: "Chỉ bật được quảng cáo đang chờ duyệt hoặc tạm dừng" };
  const onMeta = !!(ad.metaCampaignId || ad.metaAdsetId || ad.metaAdId);
  if (onMeta && !(ad.metaCampaignId && ad.metaAdsetId && ad.metaAdId)) return { ok: false, error: "Nháp trên Meta còn dở dang: bấm Tạo trên Meta để hoàn tất trước khi bật" };
  if (!onMeta && ad.postId && metaConnected()) return { ok: false, error: "Quảng cáo chưa nằm trên Meta: bấm Tạo trên Meta (tạm dừng) trước, rồi mới bật" };
  const gate = gateForAd(adId, ad.dailyBudget);
  if (!gate.ok) return { ok: false, error: gate.reason };
  if (ad.metaCampaignId && ad.metaAdsetId && ad.metaAdId) {
    if (!metaConnected()) return { ok: false, error: "Mất kết nối Meta Ads" };
    try {
      await setDeliveryStatus(connectorContext("meta_ads"), { campaignId: ad.metaCampaignId, adsetId: ad.metaAdsetId, adId: ad.metaAdId }, "ACTIVE");
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Không bật được trên Meta" };
    }
  }
  db.update(schema.adCampaigns).set({ status: "active", startedAt: ad.startedAt ?? nowIso() }).where(eq(schema.adCampaigns.id, adId)).run();
  campaignRepo.syncEntityStatus("ad", adId, "active");
  logActivity("human", `${by} bật quảng cáo “${ad.name}” (${ad.dailyBudget.toLocaleString("vi-VN")} ₫/ngày). ${gate.reason}.${ad.metaCampaignId ? "" : " Quảng cáo chưa nằm trên Meta nên chưa tiêu tiền thật."}`, "ads");
  return { ok: true, message: ad.metaCampaignId ? "Đã bật trên Meta" : "Đã bật trong hệ thống (chưa đẩy lên Meta, không tiêu tiền)" };
}

/** Tạm dừng: luôn được phép, kể cả khi hết ủy quyền. */
export async function pauseAd(adId: string, by: string, reason = ""): Promise<Result> {
  const db = getDb();
  const ad = db.select().from(schema.adCampaigns).where(eq(schema.adCampaigns.id, adId)).get();
  if (!ad) return { ok: false, error: "Không tìm thấy quảng cáo" };
  // Có đối tượng trên Meta thì PHẢI dừng được trên Meta; không thì báo lỗi, không đánh dấu "đã dừng" giả.
  if (ad.metaCampaignId || ad.metaAdsetId || ad.metaAdId) {
    if (!metaConnected()) return { ok: false, error: "Mất kết nối Meta Ads: chưa dừng được trên Meta. Dừng tay trong Trình quản lý quảng cáo." };
    try {
      const ids = [ad.metaCampaignId, ad.metaAdsetId, ad.metaAdId].filter((x): x is string => !!x);
      if (ad.metaCampaignId && ad.metaAdsetId && ad.metaAdId) await setDeliveryStatus(connectorContext("meta_ads"), { campaignId: ad.metaCampaignId, adsetId: ad.metaAdsetId, adId: ad.metaAdId }, "PAUSED");
      else for (const id of ids) await setObjectStatus(connectorContext("meta_ads"), id, "PAUSED");
    } catch (e) {
      return { ok: false, error: `Chưa dừng được trên Meta: ${e instanceof Error ? e.message : ""}. Dừng tay trong Trình quản lý quảng cáo.` };
    }
  }
  db.update(schema.adCampaigns).set({ status: "paused", ...(reason ? { aiNote: reason } : {}) }).where(eq(schema.adCampaigns.id, adId)).run();
  campaignRepo.syncEntityStatus("ad", adId, "paused");
  logActivity(by === "Hệ thống" ? "system" : "human", `${by} tạm dừng quảng cáo “${ad.name}”${reason ? `: ${reason}` : ""}.`, "ads");
  return { ok: true, message: "Đã tạm dừng" };
}

/** Đổi ngân sách ngày: giảm luôn được; tăng phải qua cổng ủy quyền. */
export async function changeDailyBudget(adId: string, vnd: number, by: string): Promise<Result> {
  const db = getDb();
  const ad = db.select().from(schema.adCampaigns).where(eq(schema.adCampaigns.id, adId)).get();
  if (!ad) return { ok: false, error: "Không tìm thấy quảng cáo" };
  if (!(vnd > 0)) return { ok: false, error: "Ngân sách không hợp lệ" };
  if (vnd > ad.dailyBudget && (ad.status === "active" || ad.status === "pending_approval" || ad.status === "paused")) {
    const gate = gateForAd(adId, vnd);
    if (!gate.ok) return { ok: false, error: gate.reason };
  }
  if (ad.metaAdsetId) {
    if (!metaConnected()) return { ok: false, error: "Mất kết nối Meta Ads: chưa đổi được ngân sách trên Meta" };
    try {
      await setDailyBudget(connectorContext("meta_ads"), ad.metaAdsetId, vnd);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Không đổi được ngân sách trên Meta" };
    }
  }
  db.update(schema.adCampaigns).set({ dailyBudget: Math.round(vnd) }).where(eq(schema.adCampaigns.id, adId)).run();
  logActivity(by.startsWith("AI") ? "ai" : "human", `${by} đổi ngân sách “${ad.name}” từ ${ad.dailyBudget.toLocaleString("vi-VN")} thành ${Math.round(vnd).toLocaleString("vi-VN")} ₫/ngày.`, "ads");
  return { ok: true, message: "Đã đổi ngân sách" };
}

/** Đọc chi phí theo ngày từ Meta cho quảng cáo đã nằm trên Meta (mỗi giờ). */
export async function syncAdInsights(): Promise<{ updated: number; errors: string[] }> {
  const out = { updated: 0, errors: [] as string[] };
  if (!metaConnected()) {
    // Không đọc được Insights: ghi lý do để bảng giải thích phần ước tính (nếu có quảng cáo trên Meta đang chạy)
    const onMeta = getDb().select().from(schema.adCampaigns).where(isNotNull(schema.adCampaigns.metaCampaignId)).all().some((a) => a.status === "active");
    setSetting("ads.insightsError", onMeta ? JSON.stringify({ at: nowIso(), errors: ["Mất kết nối Meta Ads: không đọc được chi phí"] }) : "");
    return out;
  }
  const db = getDb();
  const today = vnDate();
  for (const ad of db.select().from(schema.adCampaigns).where(isNotNull(schema.adCampaigns.metaCampaignId)).all()) {
    if (ad.status !== "active" && ad.status !== "paused") continue;
    try {
      // Đọc cả tháng hiện tại mỗi lần (bù được ngày lần trước lỗi); đồng bộ thành công → insightsAt = mốc phủ cho monthSpentDetail.
      const since = `${today.slice(0, 7)}-01`;
      const rows = await fetchDailyInsights(connectorContext("meta_ads"), ad.metaCampaignId!, since, today);
      // Reach trọn đời đọc riêng (người duy nhất không cộng được từ các ngày). Lỗi reach KHÔNG được chặn việc ghi chi phí
      // (chi phí theo ngày là số của cổng ngân sách): lỗi thì giữ reach cũ.
      let reach = ad.reach;
      try {
        reach = await fetchReachTotal(connectorContext("meta_ads"), ad.metaCampaignId!);
      } catch (e) {
        out.errors.push(`${ad.name}: đọc reach lỗi (${e instanceof Error ? e.message : e}), chi phí vẫn đồng bộ`);
      }
      db.transaction((tx) => {
        for (const r of rows) {
          tx.insert(schema.adSpendDaily).values({ adId: ad.id, ...r }).onConflictDoUpdate({ target: [schema.adSpendDaily.adId, schema.adSpendDaily.date], set: { spend: r.spend, impressions: r.impressions, clicks: r.clicks, leads: r.leads, thruplays: r.thruplays, reach: r.reach } }).run();
        }
        const all = tx.select().from(schema.adSpendDaily).where(eq(schema.adSpendDaily.adId, ad.id)).all();
        tx.update(schema.adCampaigns).set({ spent: all.reduce((n, r) => n + r.spend, 0), impressions: all.reduce((n, r) => n + r.impressions, 0), clicks: all.reduce((n, r) => n + r.clicks, 0), leads: all.reduce((n, r) => n + r.leads, 0), reach, insightsAt: nowIso() }).where(eq(schema.adCampaigns.id, ad.id)).run();
      });
      out.updated++;
    } catch (e) {
      out.errors.push(`${ad.name}: ${e instanceof Error ? e.message : e}`);
    }
  }
  // Báo lỗi Insights để OWNER biết chi tiêu tháng đang có phần ước tính (monthSpentDetail)
  const prevErr = getSetting("ads.insightsError");
  setSetting("ads.insightsError", out.errors.length ? JSON.stringify({ at: nowIso(), errors: out.errors.slice(0, 5) }) : "");
  // Chỉ cảnh báo khi lỗi mới xuất hiện / đổi nội dung (đồng bộ mỗi giờ, không gửi lặp)
  const sameErr = (() => { try { return JSON.stringify((JSON.parse(prevErr || "null") as { errors?: string[] } | null)?.errors) === JSON.stringify(out.errors.slice(0, 5)); } catch { return false; } })();
  if (out.errors.length && !sameErr) void sendAlert({ level: "warn", title: "Đồng bộ chi phí quảng cáo lỗi", text: out.errors.join("; ").slice(0, 400), href: "/publishing#ads" });
  return out;
}

export interface Suggestion {
  kind: "pause" | "scale" | "creative" | "audience" | "pacing" | "wait";
  text: string;
  /** Ngân sách đề nghị (chỉ với "scale"), vẫn phải qua cổng ủy quyền. */
  budget?: number;
}

/** Đề xuất tối ưu theo luật (không AI sinh chữ). Mỗi đề xuất có căn cứ số liệu. */
export function adSuggestions(ad: { status: string; dailyBudget: number; spent: number; impressions: number; clicks: number; leads: number }, opts: { cplTarget: number; dailyCap: number; days: number }): Suggestion[] {
  const out: Suggestion[] = [];
  if (ad.status !== "active" && ad.status !== "paused") return out;
  if (ad.impressions < 1000) return [{ kind: "wait", text: `Mới ${ad.impressions.toLocaleString("vi-VN")} lượt hiển thị: chưa đủ dữ liệu, chờ thêm trước khi đổi.` }];
  const ctr = ad.clicks / ad.impressions;
  const cpl = ad.leads ? ad.spent / ad.leads : null;
  if (cpl !== null && cpl > opts.cplTarget) out.push({ kind: "pause", text: `Chi phí mỗi lead ${Math.round(cpl).toLocaleString("vi-VN")} ₫ vượt mục tiêu ${opts.cplTarget.toLocaleString("vi-VN")} ₫: nên tạm dừng hoặc đổi nội dung.` });
  if (ctr < 0.008) out.push({ kind: "creative", text: `Tỷ lệ bấm ${(ctr * 100).toFixed(2)}% (dưới 0,8%): thử video khác hoặc câu mở đầu khác.` });
  if (ad.leads === 0 && ad.spent > opts.cplTarget * 2) out.push({ kind: "pause", text: `Đã chi ${ad.spent.toLocaleString("vi-VN")} ₫ chưa có lead nào: nên tạm dừng.` });
  const expected = ad.dailyBudget * Math.max(1, opts.days);
  if (ad.status === "active" && opts.days >= 2 && ad.spent < expected * 0.5) out.push({ kind: "pacing", text: `Mới chi ${Math.round((ad.spent / expected) * 100)}% ngân sách dự kiến: đối tượng có thể quá hẹp.` });
  if (ad.status === "active" && cpl !== null && cpl <= opts.cplTarget * 0.7 && ad.leads >= 10) {
    const budget = Math.min(Math.round(ad.dailyBudget * 1.2), opts.dailyCap);
    if (budget > ad.dailyBudget) out.push({ kind: "scale", text: `Chi phí mỗi lead ${Math.round(cpl).toLocaleString("vi-VN")} ₫ tốt hơn mục tiêu 30% với ${ad.leads} lead: có thể tăng lên ${budget.toLocaleString("vi-VN")} ₫/ngày (trong trần).`, budget });
  }
  return out;
}

export function suggestionsFor(adId: string): Suggestion[] {
  const db = getDb();
  const ad = db.select().from(schema.adCampaigns).where(eq(schema.adCampaigns.id, adId)).get();
  if (!ad) return [];
  const auth = getAuthorization();
  const days = ad.startedAt ? Math.max(1, Math.ceil((Date.now() - Date.parse(ad.startedAt)) / 86_400_000)) : 1;
  return adSuggestions(ad, { cplTarget: auth?.autoPauseCplAbove ?? Number(getSetting("ads.autoPauseCplAbove") ?? 60000), dailyCap: auth?.dailyCapVnd ?? 0, days });
}

/** Mỗi giờ: tự dừng khi CPL vượt ngưỡng (giảm chi tiêu luôn được); tự tăng ngân sách CHỈ khi OWNER bật và trong trần. */
export async function autoOptimize(): Promise<{ paused: number; scaled: number }> {
  const db = getDb();
  const auth = getAuthorization();
  const out = { paused: 0, scaled: 0 };
  for (const ad of db.select().from(schema.adCampaigns).where(eq(schema.adCampaigns.status, "active")).all()) {
    if (isSampleAd(ad.id)) continue; // dữ liệu mẫu không tiêu tiền thật
    const s = suggestionsFor(ad.id);
    const stop = s.find((x) => x.kind === "pause" && ad.leads >= 10);
    if (stop) {
      if ((await pauseAd(ad.id, "Hệ thống", `Tự tạm dừng: ${stop.text}`)).ok) out.paused++;
      continue;
    }
    const scale = s.find((x) => x.kind === "scale");
    if (scale?.budget && auth?.allowAutoScale && authorizationStatus(auth).active) {
      if ((await changeDailyBudget(ad.id, scale.budget, "AI (trong ủy quyền)")).ok) out.scaled++;
    }
  }
  return out;
}

/**
 * Mỗi giờ: giữ chi tiêu ĐANG CHẠY trong ủy quyền (không chỉ lúc bật).
 * - Ủy quyền hết hạn / bị xoá → dừng mọi quảng cáo thật đang chạy.
 * - Chạy quá ngày kết thúc → dừng.
 * - Dự chi tháng vượt trần → dừng quảng cáo ngân sách lớn nhất trước cho tới khi về trong trần.
 */
export async function enforceAuthorization(): Promise<{ paused: number; failed: string[] }> {
  const db = getDb();
  const out = { paused: 0, failed: [] as string[] };
  const auth = getAuthorization();
  const st = authorizationStatus(auth);
  const active = db.select().from(schema.adCampaigns).where(eq(schema.adCampaigns.status, "active")).all().filter((a) => !isSampleAd(a.id));
  const stop = async (id: string, reason: string): Promise<boolean> => {
    const r = await pauseAd(id, "Hệ thống", reason);
    if (r.ok) out.paused++;
    else out.failed.push(r.error);
    return r.ok;
  };
  if (!st.active) {
    for (const a of active) await stop(a.id, `Tự dừng: ${st.reason}`);
    return out;
  }
  const now = Date.now();
  let running = active;
  for (const a of active) {
    // Chỉ bỏ khỏi phép dự chi khi đã dừng THẬT; dừng hỏng nghĩa là vẫn đang tiêu tiền.
    if (a.endAt && Date.parse(a.endAt) < now && (await stop(a.id, "Tự dừng: đã qua ngày kết thúc"))) running = running.filter((x) => x.id !== a.id);
  }
  const detail = monthSpentDetail();
  const days = daysLeftInMonth();
  // Tính lại nền theo tập còn chạy sau mỗi lần dừng: quảng cáo đã dừng giữ nguyên phần đã tiêu hôm nay.
  // Quảng cáo trên Meta vừa dừng trong lượt này khi Insights đã cũ: phần hôm nay chưa đo (tới mức ngân sách) vẫn tính.
  const unmeasuredToday = () =>
    active.filter((a) => a.metaCampaignId && !running.includes(a) && insightsStale(a)).reduce((n, a) => n + Math.max(0, a.dailyBudget - (detail.todayByAd[a.id] ?? 0)), 0);
  const projected = () => projectionBaseFor(detail, new Map(running.map((a) => [a.id, a.dailyBudget]))) + unmeasuredToday() + running.reduce((n, a) => n + a.dailyBudget, 0) * days;
  for (const a of [...running].sort((x, y) => y.dailyBudget - x.dailyBudget)) {
    if (projected() <= auth!.monthlyCapVnd) break;
    // Dừng hỏng (vd mất kết nối Meta): quảng cáo vẫn tiêu → giữ trong dự chi và dừng tiếp quảng cáo khác.
    if (await stop(a.id, `Tự dừng: dự chi tháng vượt trần ${auth!.monthlyCapVnd.toLocaleString("vi-VN")} ₫`)) running = running.filter((x) => x.id !== a.id);
  }
  if (out.failed.length) void sendAlert({ level: "error", title: "Không dừng được quảng cáo vượt ủy quyền", text: out.failed.join("; ").slice(0, 500), href: "/publishing#ads" });
  return out;
}
