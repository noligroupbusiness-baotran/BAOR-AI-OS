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

before(async () => {
  db = await import("../src/db");
  auth = await import("../src/lib/ads/authorization");
  mm = await import("../src/lib/ads/meta-marketing");
  engine = await import("../src/lib/ads/engine");
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

function fakeMarketing(failAt?: string) {
  const calls: { path: string; params: URLSearchParams }[] = [];
  let n = 0;
  const f = (async (url: string, init?: RequestInit) => {
    const u = new URL(String(url));
    const params = init?.body instanceof URLSearchParams ? init.body : u.searchParams;
    const p = u.pathname.replace("/v26.0/", "");
    calls.push({ path: p, params });
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
    if (failAt && p.endsWith(failAt)) return json({ error: { message: "lỗi thử" } }, 400);
    if (p.endsWith("/insights")) return json({ data: [{ date_start: "2026-10-20", spend: "120000", impressions: "5000", clicks: "60", actions: [{ action_type: "lead", value: "3" }], video_thruplay_watched_actions: [{ action_type: "video_view", value: "900" }] }] });
    return json({ id: `ID${++n}`, success: true });
  }) as typeof fetch;
  return { calls, f };
}

const spec = { name: "Video B1", dailyBudgetVnd: 150_000, audience: { countries: ["VN"], ageMin: 22, ageMax: 45, genders: [] }, startAt: "2026-10-22T00:00:00Z", endAt: "2026-10-29T00:00:00Z", pageId: "PAGE", videoExternalId: "VID", thumbnailUrl: "https://x/t.jpg", message: "msg" };
const ctx = (f: typeof fetch) => ({ config: { adAccountId: "act_1", accessToken: "token-gia" }, fetch: f });

test("Meta: nháp tạo đủ 4 tầng, tất cả PAUSED, special_ad_categories, ngân sách VND; lỗi giữa chừng giữ phần đã tạo để thử lại không trùng", async () => {
  const { calls, f } = fakeMarketing();
  const r = await mm.createPausedDraft(ctx(f), spec);
  assert.equal(r.ok, true);
  assert.deepEqual(calls.map((c) => c.path), ["act_1/campaigns", "act_1/adsets", "act_1/adcreatives", "act_1/ads"]);
  for (const c of calls) if (c.params.has("status")) assert.equal(c.params.get("status"), "PAUSED");
  assert.equal(calls[0].params.get("special_ad_categories"), "[]");
  assert.equal(calls[0].params.get("objective"), "OUTCOME_ENGAGEMENT");
  assert.equal(calls[1].params.get("daily_budget"), "150000");
  assert.deepEqual(JSON.parse(calls[1].params.get("targeting")!).geo_locations.countries, ["VN"]);
  assert.equal(JSON.parse(calls[2].params.get("object_story_spec")!).video_data.video_id, "VID");

  const bad = fakeMarketing("act_1/adcreatives");
  const p = await mm.createPausedDraft(ctx(bad.f), spec);
  assert.equal(p.ok, false);
  assert.ok(p.ids.campaignId && p.ids.adsetId && !p.ids.creativeId);
  const again = fakeMarketing();
  const r2 = await mm.createPausedDraft(ctx(again.f), spec, p.ids);
  assert.equal(r2.ok, true);
  assert.deepEqual(again.calls.map((c) => c.path), ["act_1/adcreatives", "act_1/ads"], "không tạo lại chiến dịch / nhóm");
});

test("Meta: dừng từ chiến dịch vào trong, bật từ quảng cáo ra ngoài; đọc chi phí theo ngày", async () => {
  const { calls, f } = fakeMarketing();
  await mm.setDeliveryStatus(ctx(f), { campaignId: "C", adsetId: "S", adId: "A" }, "PAUSED");
  await mm.setDeliveryStatus(ctx(f), { campaignId: "C", adsetId: "S", adId: "A" }, "ACTIVE");
  assert.deepEqual(calls.map((c) => `${c.path}:${c.params.get("status")}`), ["C:PAUSED", "S:PAUSED", "A:PAUSED", "A:ACTIVE", "S:ACTIVE", "C:ACTIVE"]);
  const rows = await mm.fetchDailyInsights(ctx(fakeMarketing().f), "C", "2026-10-20", "2026-10-21");
  assert.deepEqual(rows, [{ date: "2026-10-20", spend: 120000, impressions: 5000, clicks: 60, leads: 3, thruplays: 900 }]);
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
