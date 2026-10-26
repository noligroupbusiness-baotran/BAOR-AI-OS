// CP05: Meta Ads trong ủy quyền ngân sách của OWNER. CSDL tạm, fetch giả (không gọi Meta thật, không tiêu tiền).
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "baor-ads-"));
process.env.DATA_DIR = tmp;
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.AUTH_SECRET = "test-secret-".padEnd(40, "x");
process.env.BAOR_VIDEO_WORKER = "off";

let db: typeof import("../src/db");
let auth: typeof import("../src/lib/ads/authorization");
let mm: typeof import("../src/lib/ads/meta-marketing");
let engine: typeof import("../src/lib/ads/engine");
let config: typeof import("../src/lib/connectors/config");

before(async () => {
  db = await import("../src/db");
  auth = await import("../src/lib/ads/authorization");
  mm = await import("../src/lib/ads/meta-marketing");
  engine = await import("../src/lib/ads/engine");
  config = await import("../src/lib/connectors/config");
});

const A = (over: Partial<import("../src/lib/ads/authorization").AdAuthorization> = {}) => ({ monthlyCapVnd: 3_000_000, dailyCapVnd: 200_000, validUntil: "2099-12-31", adAccountId: "act_1", autoPauseCplAbove: 50_000, allowAutoScale: false, authorizedBy: "OWNER", authorizedAt: "", note: "", ...over });

test("cổng chi tiêu: không có / hết hạn ủy quyền thì chặn; vượt trần ngày, trần tháng (tính theo ngày còn lại), sai tài khoản thì chặn", () => {
  const base = { dailyBudget: 100_000, currentDaily: 0, otherActiveDaily: 0, monthSpent: 0, daysLeft: 10, today: "2026-10-21" };
  assert.match(auth.spendGate({ ...base, auth: null }).reason, /chưa ủy quyền/);
  assert.match(auth.spendGate({ ...base, auth: A({ validUntil: "2026-10-20" }) }).reason, /hết hạn/);
  assert.equal(auth.spendGate({ ...base, auth: A() }).ok, true);
  assert.match(auth.spendGate({ ...base, auth: A(), dailyBudget: 250_000 }).reason, /vượt trần/);
  assert.equal(auth.spendGate({ ...base, auth: A(), monthSpent: 2_500_000, otherActiveDaily: 0 }).ok, false, "2,5tr + 100k×10 ngày > 3tr");
  assert.equal(auth.spendGate({ ...base, auth: A(), otherActiveDaily: 150_000, daysLeft: 12 }).ok, true, "(150k+100k)×12 = 3tr đúng trần");
  assert.match(auth.spendGate({ ...base, auth: A(), adAccountId: "act_KHAC" }).reason, /không nằm trong ủy quyền/);
  assert.equal(auth.daysLeftInMonth("2026-10-21"), 11);
  assert.equal(auth.daysLeftInMonth("2026-02-28"), 1);
});

function fakeMarketing(failAt?: string, pages = false) {
  const calls: { path: string; params: URLSearchParams }[] = [];
  let n = 0;
  const f = (async (url: string, init?: RequestInit) => {
    const u = new URL(String(url));
    const params = init?.body instanceof URLSearchParams ? init.body : u.searchParams;
    const p = u.pathname.replace("/v26.0/", "");
    calls.push({ path: p, params });
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
    if (failAt && p.endsWith(failAt)) return json({ error: { message: "lỗi thử" } }, 400);
    if (p.endsWith("/adimages")) return json({ images: { "b.jpg": { hash: "HASH1" } } });
    if (p.endsWith("/insights") && u.searchParams.get("date_preset") === "maximum") return json({ data: [{ reach: "6100" }] });
    if (p.endsWith("/insights") && u.searchParams.get("after") === "CUR2") return json({ data: [{ date_start: "2026-10-21", spend: "80000", impressions: "3000", clicks: "30", actions: [] }] });
    if (p.endsWith("/insights") && pages) return json({ data: [{ date_start: "2026-10-20", spend: "120000", impressions: "5000", clicks: "60", actions: [{ action_type: "lead", value: "3" }] }], paging: { cursors: { after: "CUR2" }, next: "https://graph.facebook.com/next" } });
    if (p.endsWith("/insights")) return json({ data: [{ date_start: "2026-10-20", spend: "120000", impressions: "5000", reach: "4200", clicks: "60", actions: [{ action_type: "lead", value: "3" }], video_thruplay_watched_actions: [{ action_type: "video_view", value: "900" }] }] });
    return json({ id: `ID${++n}`, success: true });
  }) as typeof fetch;
  return { calls, f };
}

const thumb = path.join(tmp, "b.jpg");
fs.writeFileSync(thumb, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
const spec = { name: "Video B1", dailyBudgetVnd: 150_000, audience: { countries: ["VN"], ageMin: 22, ageMax: 45, genders: [] }, startAt: "2026-10-22T00:00:00Z", endAt: "2026-10-29T00:00:00Z", pageId: "PAGE", videoExternalId: "VID", thumbnailPath: thumb, message: "msg" };
const ctx = (f: typeof fetch) => ({ config: { adAccountId: "act_1", accessToken: "token-gia" }, fetch: f });

test("Meta: nháp tạo đủ 4 tầng, tất cả PAUSED, special_ad_categories, ngân sách VND; lỗi giữa chừng giữ phần đã tạo để thử lại không trùng", async () => {
  const { calls, f } = fakeMarketing();
  const r = await mm.createPausedDraft(ctx(f), spec);
  assert.equal(r.ok, true);
  assert.deepEqual(calls.map((c) => c.path), ["act_1/campaigns", "act_1/adsets", "act_1/adimages", "act_1/adcreatives", "act_1/ads"]);
  for (const c of calls) if (c.params.has("status")) assert.equal(c.params.get("status"), "PAUSED");
  assert.equal(calls[0].params.get("special_ad_categories"), "[]");
  assert.equal(calls[0].params.get("objective"), "OUTCOME_ENGAGEMENT");
  assert.equal(calls[1].params.get("daily_budget"), "150000");
  assert.deepEqual(JSON.parse(calls[1].params.get("targeting")!).geo_locations.countries, ["VN"]);
  const story = JSON.parse(calls[3].params.get("object_story_spec")!);
  assert.equal(story.video_data.video_id, "VID");
  assert.equal(story.video_data.image_hash, "HASH1", "ảnh bìa gửi bằng image_hash, không cần đường dẫn công khai");

  const bad = fakeMarketing("act_1/adcreatives");
  const p = await mm.createPausedDraft(ctx(bad.f), spec);
  assert.equal(p.ok, false);
  assert.ok(p.ids.campaignId && p.ids.adsetId && !p.ids.creativeId);
  const again = fakeMarketing();
  const r2 = await mm.createPausedDraft(ctx(again.f), spec, p.ids);
  assert.equal(r2.ok, true);
  assert.deepEqual(again.calls.map((c) => c.path), ["act_1/adimages", "act_1/adcreatives", "act_1/ads"], "không tạo lại chiến dịch / nhóm");
});

test("Meta: dừng từ chiến dịch vào trong, bật từ quảng cáo ra ngoài; đọc chi phí theo ngày", async () => {
  const { calls, f } = fakeMarketing();
  await mm.setDeliveryStatus(ctx(f), { campaignId: "C", adsetId: "S", adId: "A" }, "PAUSED");
  await mm.setDeliveryStatus(ctx(f), { campaignId: "C", adsetId: "S", adId: "A" }, "ACTIVE");
  assert.deepEqual(calls.map((c) => `${c.path}:${c.params.get("status")}`), ["C:PAUSED", "S:PAUSED", "A:PAUSED", "A:ACTIVE", "S:ACTIVE", "C:ACTIVE"]);
  const rows = await mm.fetchDailyInsights(ctx(fakeMarketing().f), "C", "2026-10-20", "2026-10-21");
  assert.deepEqual(rows, [{ date: "2026-10-20", spend: 120000, impressions: 5000, clicks: 60, leads: 3, thruplays: 900, reach: 4200 }]);
  const paged = await mm.fetchDailyInsights(ctx(fakeMarketing(undefined, true).f), "C", "2026-10-01", "2026-10-21");
  assert.deepEqual(paged.map((r) => r.date), ["2026-10-20", "2026-10-21"], "đi hết các trang kết quả");
});

test("đề xuất tối ưu theo luật có căn cứ số liệu", () => {
  const o = { cplTarget: 50_000, dailyCap: 200_000, days: 3 };
  assert.equal(engine.adSuggestions({ status: "active", dailyBudget: 100_000, spent: 10_000, impressions: 500, clicks: 5, leads: 0 }, o)[0].kind, "wait");
  assert.ok(engine.adSuggestions({ status: "active", dailyBudget: 100_000, spent: 900_000, impressions: 20_000, clicks: 300, leads: 10 }, o).some((s) => s.kind === "pause"));
  const scale = engine.adSuggestions({ status: "active", dailyBudget: 100_000, spent: 300_000, impressions: 20_000, clicks: 400, leads: 12 }, o).find((s) => s.kind === "scale")!;
  assert.equal(scale.budget, 120_000);
  assert.equal(engine.adSuggestions({ status: "active", dailyBudget: 200_000, spent: 300_000, impressions: 20_000, clicks: 400, leads: 12 }, o).some((s) => s.kind === "scale"), false, "đã ở trần thì không đề xuất tăng");
});

test("bộ máy: không ủy quyền thì không bật; giảm ngân sách luôn được; tăng vượt trần bị chặn; AI không tự tăng khi OWNER chưa cho", async () => {
  const d = db.getDb();
  d.insert(db.schema.adCampaigns).values({ id: "ad_t", name: "Thử", objective: "video_views", status: "pending_approval", dailyBudget: 100_000, spent: 0, impressions: 0, clicks: 0, leads: 0, audience: "" }).run();
  auth.revokeAuthorization();
  const r1 = await engine.activateAd("ad_t", "OWNER");
  assert.equal(r1.ok, false);
  assert.match((r1 as { error: string }).error, /chưa ủy quyền/);
  auth.saveAuthorization(A());
  const r2 = await engine.activateAd("ad_t", "OWNER");
  assert.equal(r2.ok, true, JSON.stringify(r2));
  assert.equal(d.select().from(db.schema.adCampaigns).where(eq(db.schema.adCampaigns.id, "ad_t")).get()!.status, "active");
  assert.equal((await engine.changeDailyBudget("ad_t", 250_000, "OWNER")).ok, false, "tăng vượt trần ngày");
  auth.revokeAuthorization();
  assert.equal((await engine.changeDailyBudget("ad_t", 80_000, "OWNER")).ok, true, "giảm luôn được, kể cả hết ủy quyền");
  assert.equal((await engine.changeDailyBudget("ad_t", 90_000, "OWNER")).ok, false, "tăng khi hết ủy quyền bị chặn");
  // Hiệu quả tốt nhưng OWNER chưa cho tự tăng → AI không tăng
  auth.saveAuthorization(A({ allowAutoScale: false }));
  d.update(db.schema.adCampaigns).set({ spent: 300_000, impressions: 20_000, clicks: 400, leads: 12, startedAt: new Date(Date.now() - 3 * 86_400_000).toISOString() }).where(eq(db.schema.adCampaigns.id, "ad_t")).run();
  assert.deepEqual(await engine.autoOptimize(), { paused: 0, scaled: 0 });
  auth.saveAuthorization(A({ allowAutoScale: true }));
  assert.deepEqual(await engine.autoOptimize(), { paused: 0, scaled: 1 });
  assert.equal(d.select().from(db.schema.adCampaigns).where(eq(db.schema.adCampaigns.id, "ad_t")).get()!.dailyBudget, 96_000, "tăng 20% trong trần");
  // CPL cao → tự dừng (giảm chi tiêu luôn được)
  d.update(db.schema.adCampaigns).set({ spent: 900_000, leads: 10 }).where(eq(db.schema.adCampaigns.id, "ad_t")).run();
  assert.equal((await engine.autoOptimize()).paused, 1);
  assert.equal(d.select().from(db.schema.adCampaigns).where(eq(db.schema.adCampaigns.id, "ad_t")).get()!.status, "paused");
});

test("quảng cáo trên Meta: mất kết nối thì KHÔNG báo đã dừng / đã đổi ngân sách; nháp dở dang không bật được", async () => {
  const d = db.getDb();
  auth.saveAuthorization(A());
  d.insert(db.schema.adCampaigns).values({ id: "ad_meta", name: "Trên Meta", objective: "video_views", status: "active", dailyBudget: 100_000, spent: 0, impressions: 0, clicks: 0, leads: 0, audience: "", metaCampaignId: "C1", metaAdsetId: "S1", metaAdId: "A1" }).run();
  const p = await engine.pauseAd("ad_meta", "OWNER");
  assert.equal(p.ok, false);
  assert.equal(d.select().from(db.schema.adCampaigns).where(eq(db.schema.adCampaigns.id, "ad_meta")).get()!.status, "active", "không đánh dấu dừng giả");
  assert.equal((await engine.changeDailyBudget("ad_meta", 50_000, "OWNER")).ok, false);
  d.insert(db.schema.adCampaigns).values({ id: "ad_half", name: "Dở dang", objective: "video_views", status: "pending_approval", dailyBudget: 100_000, spent: 0, impressions: 0, clicks: 0, leads: 0, audience: "", metaCampaignId: "C2" }).run();
  assert.match((await engine.activateAd("ad_half", "OWNER") as { error: string }).error, /dở dang/);
});

test("giữ chi tiêu trong ủy quyền khi đang chạy: hết hạn thì dừng hết; vượt trần tháng thì dừng quảng cáo lớn nhất; quá ngày kết thúc thì dừng", async () => {
  const d = db.getDb();
  d.delete(db.schema.adCampaigns).run();
  const mk = (id: string, daily: number, extra: Record<string, unknown> = {}) => d.insert(db.schema.adCampaigns).values({ id, name: id, objective: "video_views", status: "active", dailyBudget: daily, spent: 0, impressions: 0, clicks: 0, leads: 0, audience: "", ...extra }).run();
  mk("ad_big", 300_000);
  mk("ad_small", 50_000);
  mk("ad_old", 10_000, { endAt: "2020-01-01T00:00:00Z" });
  auth.saveAuthorization(A({ monthlyCapVnd: 100_000 * auth.daysLeftInMonth(), dailyCapVnd: 300_000 }));
  const r = await engine.enforceAuthorization();
  const st = (id: string) => d.select().from(db.schema.adCampaigns).where(eq(db.schema.adCampaigns.id, id)).get()!.status;
  assert.equal(st("ad_old"), "paused", "quá ngày kết thúc");
  assert.equal(st("ad_big"), "paused", "dừng quảng cáo lớn nhất để về trong trần tháng");
  assert.equal(st("ad_small"), "active");
  assert.equal(r.paused, 2);
  auth.saveAuthorization(A({ validUntil: "2020-01-01" }));
  await engine.enforceAuthorization();
  assert.equal(st("ad_small"), "paused", "ủy quyền hết hạn thì dừng mọi quảng cáo đang chạy");
});

test("P2-3: dừng hỏng (mất kết nối Meta) vẫn tính là đang tiêu → dừng thêm quảng cáo khác cho tới khi dự chi về trong trần", async () => {
  const d = db.getDb();
  d.delete(db.schema.adCampaigns).run();
  const mk = (id: string, daily: number, extra: Record<string, unknown> = {}) => d.insert(db.schema.adCampaigns).values({ id, name: id, objective: "video_views", status: "active", dailyBudget: daily, spent: 0, impressions: 0, clicks: 0, leads: 0, audience: "", ...extra }).run();
  // Quảng cáo lớn nằm trên Meta, Meta mất kết nối → không dừng được, vẫn tiêu 300k/ngày
  mk("ad_meta_big", 300_000, { metaCampaignId: "C9", metaAdsetId: "S9", metaAdId: "A9" });
  mk("ad_mid", 200_000);
  mk("ad_small", 50_000);
  auth.saveAuthorization(A({ monthlyCapVnd: 100_000 * auth.daysLeftInMonth(), dailyCapVnd: 300_000 }));
  const r = await engine.enforceAuthorization();
  const st = (id: string) => d.select().from(db.schema.adCampaigns).where(eq(db.schema.adCampaigns.id, id)).get()!.status;
  assert.equal(st("ad_meta_big"), "active", "không đánh dấu dừng giả");
  assert.equal(r.failed.length, 1);
  assert.equal(st("ad_mid"), "paused");
  assert.equal(st("ad_small"), "paused", "quảng cáo không dừng được vẫn tiêu 300k/ngày > trần → phải dừng cả quảng cáo nhỏ");
});

test("P2-4: chi tiêu tháng không bị tính thiếu khi Insights chưa đồng bộ — ngày thiếu số liệu ước theo ngân sách ngày, có báo ước tính", () => {
  const d = db.getDb();
  d.delete(db.schema.adCampaigns).run();
  d.delete(db.schema.adSpendDaily).run();
  d.insert(db.schema.adCampaigns).values({ id: "ad_stale", name: "Insights cũ", objective: "video_views", status: "active", dailyBudget: 100_000, spent: 90_000, impressions: 0, clicks: 0, leads: 0, audience: "", metaCampaignId: "C1", metaAdsetId: "S1", metaAdId: "A1", startAt: "2026-10-01T00:00:00+07:00" }).run();
  d.insert(db.schema.adSpendDaily).values({ adId: "ad_stale", date: "2026-10-01", spend: 90_000, impressions: 1000, clicks: 10, leads: 1, thruplays: 100 }).run();
  const det = auth.monthSpentDetail("2026-10-21");
  assert.equal(det.measured, 90_000);
  // Chưa đồng bộ thành công lần nào: ngày 01 thiếu 10k so với ngân sách, 02→20/10 thiếu trọn; hôm nay (21) nằm trong phần dự chi
  assert.equal(det.estimated, 10_000 + 100_000 * 19, "ngày đã qua chưa có số liệu, ước theo ngân sách ngày");
  assert.equal(det.total, 90_000 + 1_910_000);
  assert.equal(auth.monthSpent("2026-10-21"), det.total);
  assert.equal(det.estimatedAds[0].days, 20);
  // Có đủ số liệu thì không ước
  for (let day = 2; day <= 21; day++) d.insert(db.schema.adSpendDaily).values({ adId: "ad_stale", date: `2026-10-${String(day).padStart(2, "0")}`, spend: 80_000, impressions: 0, clicks: 0, leads: 0, thruplays: 0 }).run();
  d.update(db.schema.adCampaigns).set({ insightsAt: "2026-10-21T05:00:00Z" }).where(eq(db.schema.adCampaigns.id, "ad_stale")).run();
  const full = auth.monthSpentDetail("2026-10-21");
  assert.equal(full.estimated, 0);
  assert.equal(full.total, 90_000 + 80_000 * 20);
});

test("P2-4 (phản biện): không ước trùng hôm nay, không ước ngày đã được đồng bộ phủ; vừa bật xong thì không bị tự dừng", async () => {
  const d = db.getDb();
  d.delete(db.schema.adCampaigns).run();
  d.delete(db.schema.adSpendDaily).run();
  const base = { objective: "video_views", dailyBudget: 100_000, spent: 0, impressions: 0, clicks: 0, leads: 0, audience: "" };
  // a) Hôm nay chưa có số liệu: không ước (đã nằm trong ngân sách × ngày còn lại); ngày bật theo giờ VN, không theo UTC
  d.insert(db.schema.adCampaigns).values({ ...base, id: "ad_new", name: "Mới bật", status: "active", startedAt: "2026-10-20T18:30:00Z" }).run(); // 01:30 ngày 21 giờ VN
  let det = auth.monthSpentDetail("2026-10-21");
  assert.equal(det.estimated, 0, "bật lúc 01:30 sáng 21/10 giờ VN, hôm nay 21/10 → không có ngày đã qua để ước");
  // Hôm nay đã chi 60k: "Đã chi" hiện 60k, nhưng nền dự chi trừ phần này vì ngân sách hôm nay đã nằm trong dự chi
  d.insert(db.schema.adSpendDaily).values({ adId: "ad_new", date: "2026-10-21", spend: 60_000, impressions: 0, clicks: 0, leads: 0, thruplays: 0 }).run();
  det = auth.monthSpentDetail("2026-10-21");
  assert.equal(det.total, 60_000);
  assert.equal(det.projectionBase, 0);

  // b) Bật 01/10, chạy 01–02, tạm dừng, bật lại hôm nay; đồng bộ Insights thành công lúc 10:00 ngày 21 → chỉ ngày 21 chưa phủ trọn
  d.delete(db.schema.adCampaigns).run();
  d.delete(db.schema.adSpendDaily).run();
  d.insert(db.schema.adCampaigns).values({ ...base, id: "ad_resume", name: "Bật lại", status: "active", startedAt: "2026-10-01T02:00:00Z", insightsAt: "2026-10-21T03:00:00Z", metaCampaignId: "C1", metaAdsetId: "S1", metaAdId: "A1" }).run();
  for (const day of ["01", "02"]) d.insert(db.schema.adSpendDaily).values({ adId: "ad_resume", date: `2026-10-${day}`, spend: 100_000, impressions: 0, clicks: 0, leads: 0, thruplays: 0 }).run();
  det = auth.monthSpentDetail("2026-10-22");
  assert.equal(det.measured, 200_000);
  assert.equal(det.estimated, 100_000, "chỉ ước ngày 21 (đồng bộ giữa ngày); 18 ngày dừng đã được đồng bộ phủ → 0 ₫, không ước 2 triệu");
  d.update(db.schema.adCampaigns).set({ insightsAt: "2026-10-22T01:00:00Z" }).where(eq(db.schema.adCampaigns.id, "ad_resume")).run();
  assert.equal(auth.monthSpentDetail("2026-10-22").estimated, 0, "đồng bộ hôm nay thành công → hết ước tính");

  // c) Cổng cho bật ở đúng trần, rồi bộ giữ trần chạy ngay: không tự dừng quảng cáo vừa bật
  d.delete(db.schema.adCampaigns).run();
  d.delete(db.schema.adSpendDaily).run();
  auth.saveAuthorization(A({ monthlyCapVnd: 100_000 * auth.daysLeftInMonth(), dailyCapVnd: 300_000 }));
  d.insert(db.schema.adCampaigns).values({ ...base, id: "ad_edge", name: "Đúng trần", status: "active", startedAt: new Date().toISOString() }).run();
  assert.equal(auth.gateForAd("ad_edge", 100_000).ok, true);
  const r = await engine.enforceAuthorization();
  assert.equal(r.paused, 0, "vừa được cổng cho bật thì bộ giữ trần không tự dừng");
  assert.equal(d.select().from(db.schema.adCampaigns).where(eq(db.schema.adCampaigns.id, "ad_edge")).get()!.status, "active");
});

test("P2-4 (phản biện vòng 2): tự dừng giữ phần đã tiêu hôm nay của quảng cáo vừa dừng; quảng cáo đã dừng vẫn được ước ngày chưa đo", async () => {
  const d = db.getDb();
  d.delete(db.schema.adCampaigns).run();
  d.delete(db.schema.adSpendDaily).run();
  const base = { objective: "video_views", spent: 0, impressions: 0, clicks: 0, leads: 0, audience: "" };
  const today = auth.vnDate();
  const days = auth.daysLeftInMonth();
  // A tiêu 150k hôm nay rồi bị dừng: 150k đó vẫn là tiền thật → C (100k/ngày) cũng phải dừng
  d.insert(db.schema.adCampaigns).values({ ...base, id: "ad_A", name: "A", status: "active", dailyBudget: 200_000, startedAt: new Date().toISOString(), insightsAt: new Date().toISOString() }).run();
  d.insert(db.schema.adCampaigns).values({ ...base, id: "ad_C", name: "C", status: "active", dailyBudget: 100_000, startedAt: new Date().toISOString(), insightsAt: new Date().toISOString() }).run();
  d.insert(db.schema.adSpendDaily).values({ adId: "ad_A", date: today, spend: 150_000, impressions: 0, clicks: 0, leads: 0, thruplays: 0 }).run();
  auth.saveAuthorization(A({ monthlyCapVnd: 100_000 * days + 75_000, dailyCapVnd: 300_000 }));
  await engine.enforceAuthorization();
  const st = (id: string) => d.select().from(db.schema.adCampaigns).where(eq(db.schema.adCampaigns.id, id)).get()!.status;
  assert.equal(st("ad_A"), "paused");
  assert.equal(st("ad_C"), "paused", "150k đã tiêu hôm nay + 100k × ngày còn lại > trần → dừng cả C");

  // Quảng cáo đã dừng, Insights lỗi từ 18/10: ngày 18–20 và hôm nay (21) vẫn ước, không về 0 khi chuyển sang paused
  d.delete(db.schema.adCampaigns).run();
  d.delete(db.schema.adSpendDaily).run();
  d.insert(db.schema.adCampaigns).values({ ...base, id: "ad_P", name: "P", status: "paused", dailyBudget: 1_000_000, startedAt: "2026-10-10T02:00:00Z", insightsAt: "2026-10-18T03:00:00Z", metaCampaignId: "C1", metaAdsetId: "S1", metaAdId: "A1" }).run();
  const det = auth.monthSpentDetail("2026-10-21");
  assert.equal(det.estimated, 4_000_000, "18, 19, 20 và hôm nay (đồng bộ cuối đã cũ) — dừng không xoá tiền đã tiêu");
  // Quảng cáo chưa từng chạy (nháp / chờ duyệt) không bị ước
  d.update(db.schema.adCampaigns).set({ status: "pending_approval", startedAt: null }).where(eq(db.schema.adCampaigns.id, "ad_P")).run();
  assert.equal(auth.monthSpentDetail("2026-10-21").estimated, 0);
});

test("P2-4 (vòng 3): quảng cáo chỉ có trong app không bị ước; quảng cáo Meta vừa tự dừng khi Insights cũ vẫn giữ phần hôm nay chưa đo", async () => {
  const d = db.getDb();
  d.delete(db.schema.adCampaigns).run();
  d.delete(db.schema.adSpendDaily).run();
  const base = { objective: "video_views", spent: 0, impressions: 0, clicks: 0, leads: 0, audience: "" };
  d.insert(db.schema.adCampaigns).values({ ...base, id: "ad_local", name: "Nội bộ", status: "paused", dailyBudget: 500_000, startedAt: "2026-10-01T02:00:00Z" }).run();
  assert.equal(auth.monthSpentDetail("2026-10-21").estimated, 0, "không nằm trên Meta → không tiêu tiền thật");
  // M (Meta, Insights cũ 5 giờ, 300k/ngày) bị dừng vì vượt trần; phần hôm nay chưa đo (300k) + L 100k × ngày còn lại vượt trần → dừng cả L
  d.delete(db.schema.adCampaigns).run();
  const stale = new Date(Date.now() - 5 * 3_600_000).toISOString();
  d.insert(db.schema.adCampaigns).values({ ...base, id: "ad_M", name: "M", status: "active", dailyBudget: 300_000, startedAt: stale, insightsAt: stale, metaCampaignId: "C1", metaAdsetId: "S1", metaAdId: "A1" }).run();
  d.insert(db.schema.adCampaigns).values({ ...base, id: "ad_L", name: "L", status: "active", dailyBudget: 100_000, startedAt: new Date().toISOString() }).run();
  config.writeIntegrationConfig("meta_ads", { accessToken: "token-gia", adAccountId: "act_1" });
  d.update(db.schema.integrations).set({ connected: true }).where(eq(db.schema.integrations.key, "meta_ads")).run();
  auth.saveAuthorization(A({ monthlyCapVnd: 100_000 * auth.daysLeftInMonth() + 150_000, dailyCapVnd: 300_000 }));
  const real = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ success: true }), { status: 200, headers: { "Content-Type": "application/json" } })) as typeof fetch;
  try {
    await engine.enforceAuthorization();
  } finally {
    globalThis.fetch = real;
    d.update(db.schema.integrations).set({ connected: false }).where(eq(db.schema.integrations.key, "meta_ads")).run();
  }
  const st = (id: string) => d.select().from(db.schema.adCampaigns).where(eq(db.schema.adCampaigns.id, id)).get()!.status;
  assert.equal(st("ad_M"), "paused");
  assert.equal(st("ad_L"), "paused", "300k có thể đã tiêu hôm nay trước khi dừng → vẫn vượt trần");
});

test("Insights: reach trọn đời đọc riêng (không cộng theo ngày), CPM / CTR / tần suất tính từ số đã đồng bộ; chưa có lượt hiển thị thì không hiện số giả", async () => {
  const metrics = await import("../src/lib/ads/metrics");
  const d = db.getDb();
  d.delete(db.schema.adCampaigns).run();
  d.delete(db.schema.adSpendDaily).run();
  d.insert(db.schema.adCampaigns).values({ id: "ad_r", name: "R", objective: "video_views", status: "active", dailyBudget: 100_000, spent: 0, impressions: 0, clicks: 0, leads: 0, audience: "", startedAt: new Date().toISOString(), metaCampaignId: "C1", metaAdsetId: "S1", metaAdId: "A1" }).run();
  config.writeIntegrationConfig("meta_ads", { accessToken: "token-gia", adAccountId: "act_1" });
  d.update(db.schema.integrations).set({ connected: true }).where(eq(db.schema.integrations.key, "meta_ads")).run();
  const real = globalThis.fetch;
  globalThis.fetch = fakeMarketing().f;
  try {
    const r = await engine.syncAdInsights();
    assert.equal(r.updated, 1, r.errors.join("; "));
  } finally {
    globalThis.fetch = real;
    d.update(db.schema.integrations).set({ connected: false }).where(eq(db.schema.integrations.key, "meta_ads")).run();
  }
  const ad = d.select().from(db.schema.adCampaigns).where(eq(db.schema.adCampaigns.id, "ad_r")).get()!;
  assert.equal(ad.reach, 6100, "reach trọn đời từ lời gọi riêng, không phải 4200 của một ngày");
  assert.equal(d.select().from(db.schema.adSpendDaily).all()[0].reach, 4200);
  const m = metrics.adMetrics(ad);
  assert.equal(m.cpm, 24_000, "120.000 ₫ / 5.000 lượt × 1.000");
  assert.equal(m.ctr, 0.012);
  assert.equal(m.frequency, null, "reach trọn đời (6.100) > lượt hiển thị đã đồng bộ (5.000): khác khung thời gian → không hiện");
  assert.equal(metrics.adMetrics({ spent: 100, impressions: 5000, clicks: 10, reach: 4000 }).frequency, 1.25);
  assert.equal(m.cpc, 2_000);
  assert.equal(metrics.pct(m.ctr), "1,20%");
  assert.deepEqual(metrics.adMetrics({ spent: 0, impressions: 0, clicks: 0, reach: 0 }), { cpm: null, ctr: null, frequency: null, cpc: null });
});

test("Insights: đọc reach lỗi KHÔNG chặn ghi chi phí theo ngày (số của cổng ngân sách)", async () => {
  const d = db.getDb();
  d.delete(db.schema.adCampaigns).run();
  d.delete(db.schema.adSpendDaily).run();
  d.insert(db.schema.adCampaigns).values({ id: "ad_r2", name: "R2", objective: "video_views", status: "active", dailyBudget: 100_000, spent: 0, impressions: 0, clicks: 0, leads: 0, audience: "", reach: 50, startedAt: new Date().toISOString(), metaCampaignId: "C1", metaAdsetId: "S1", metaAdId: "A1" }).run();
  d.update(db.schema.integrations).set({ connected: true }).where(eq(db.schema.integrations.key, "meta_ads")).run();
  const real = globalThis.fetch;
  const base = fakeMarketing().f;
  globalThis.fetch = (async (url: string, init?: RequestInit) => (new URL(String(url)).searchParams.get("date_preset") === "maximum" ? new Response(JSON.stringify({ error: { message: "reach tạm lỗi", code: 2 } }), { status: 500 }) : base(url, init))) as typeof fetch;
  try {
    const r = await engine.syncAdInsights();
    assert.equal(r.updated, 1, "vẫn tính là đã đồng bộ chi phí");
    assert.match(r.errors.join(";"), /đọc reach lỗi/);
  } finally {
    globalThis.fetch = real;
    d.update(db.schema.integrations).set({ connected: false }).where(eq(db.schema.integrations.key, "meta_ads")).run();
  }
  const ad = d.select().from(db.schema.adCampaigns).where(eq(db.schema.adCampaigns.id, "ad_r2")).get()!;
  assert.equal(ad.spent, 120_000, "chi phí theo ngày đã ghi");
  assert.equal(ad.reach, 50, "giữ reach cũ khi đọc lỗi");
});

test("kiểm toán 26/10: tự tăng ngân sách có thời gian chờ 24 giờ giữa hai lần ('Chạy ngay' lặp lại không tăng dồn)", async () => {
  const d = db.getDb();
  const admin = await import("../src/lib/admin");
  d.insert(db.schema.adCampaigns).values({ id: "ad_cd", name: "Chờ", objective: "video_views", status: "active", dailyBudget: 100_000, spent: 300_000, impressions: 20_000, clicks: 400, leads: 12, audience: "", startedAt: new Date(Date.now() - 3 * 86_400_000).toISOString() }).run();
  auth.saveAuthorization(A({ allowAutoScale: true }));
  const budget = () => d.select().from(db.schema.adCampaigns).where(eq(db.schema.adCampaigns.id, "ad_cd")).get()!.dailyBudget;
  const others = d.select().from(db.schema.adCampaigns).where(eq(db.schema.adCampaigns.status, "active")).all().filter((a) => a.id !== "ad_cd");
  for (const a of others) d.update(db.schema.adCampaigns).set({ status: "paused" }).where(eq(db.schema.adCampaigns.id, a.id)).run();
  assert.equal((await engine.autoOptimize()).scaled, 1);
  assert.equal(budget(), 120_000);
  // Lượt chạy kế tiếp ngay sau đó (vd "Chạy ngay" đặt lại mốc mỗi giờ): vẫn đủ điều kiện tăng nhưng đang trong thời gian chờ
  assert.equal((await engine.autoOptimize()).scaled, 0);
  assert.equal(budget(), 120_000);
  assert.equal(engine.autoScaleCoolingDown("ad_cd"), true);
  assert.equal(engine.AUTO_SCALE_COOLDOWN_MS, 24 * 60 * 60 * 1000);
  // Qua 24 giờ → được tăng tiếp (vẫn trong trần ngày 200.000 ₫)
  admin.setSetting("ads.lastBudgetIncreaseAt.ad_cd", new Date(Date.now() - 25 * 3_600_000).toISOString());
  assert.equal((await engine.autoOptimize()).scaled, 1);
  assert.equal(budget(), 144_000);
  // OWNER tăng tay cũng tính mốc; giảm thì không
  admin.setSetting("ads.lastBudgetIncreaseAt.ad_cd", "");
  assert.equal((await engine.changeDailyBudget("ad_cd", 100_000, "OWNER")).ok, true);
  assert.equal(engine.autoScaleCoolingDown("ad_cd"), false, "giảm không đặt thời gian chờ");
  assert.equal((await engine.changeDailyBudget("ad_cd", 110_000, "OWNER")).ok, true);
  assert.equal(engine.autoScaleCoolingDown("ad_cd"), true);
  d.update(db.schema.adCampaigns).set({ status: "paused" }).where(eq(db.schema.adCampaigns.id, "ad_cd")).run();
});
