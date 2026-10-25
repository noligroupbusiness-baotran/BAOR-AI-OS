// Kiểm toán 26/10 (F1–F3, F5 + quá hạn / bài mẫu): bài CHỮ đi qua cùng cổng với bài video. CSDL tạm, fetch giả (không gọi Meta thật).
import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { and, eq } from "drizzle-orm";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "baor-pubtext-"));
process.env.DATA_DIR = tmp;
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.AUTH_SECRET = "test-secret-".padEnd(40, "x");
process.env.BAOR_VIDEO_WORKER = "off";

let db: typeof import("../src/db");
let sync: typeof import("../src/lib/connectors/sync");
let pub: typeof import("../src/lib/publishing/video");
let text: typeof import("../src/lib/publishing/text");
let guards: typeof import("../src/lib/publishing/guards");
let config: typeof import("../src/lib/connectors/config");
let admin: typeof import("../src/lib/admin");
let meta: typeof import("../src/lib/connectors/meta");

const FAKE = { pageId: "111", pageToken: "page-token-gia", appId: "222", userToken: "user-token-gia" };
const realFetch = globalThis.fetch;

before(async () => {
  db = await import("../src/db");
  sync = await import("../src/lib/connectors/sync");
  pub = await import("../src/lib/publishing/video");
  text = await import("../src/lib/publishing/text");
  guards = await import("../src/lib/publishing/guards");
  config = await import("../src/lib/connectors/config");
  admin = await import("../src/lib/admin");
  meta = await import("../src/lib/connectors/meta");
});

beforeEach(() => {
  globalThis.fetch = realFetch;
  admin.setSetting("publishing.dryRun", "1");
  admin.setSetting("automation.auto_publish", "1");
});

const S = () => db.schema;
const post = (id: string) => db.getDb().select().from(S().scheduledPosts).where(eq(S().scheduledPosts.id, id)).get()!;
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });

function connectFb(connected = true) {
  config.writeIntegrationConfig("facebook_page", FAKE);
  db.getDb().update(S().integrations).set({ connected }).where(eq(S().integrations.key, "facebook_page")).run();
}

/** Bài chữ chờ đăng (chèn thẳng như dữ liệu cũ: mode mặc định "live", không dedupe_key). */
function seedTextPost(id: string, opts: { minutesAgo?: number; contentStatus?: string; format?: string } = {}) {
  const d = db.getDb();
  d.insert(S().contentItems).values({ id: `ct_${id}`, title: `Bài ${id}`, format: opts.format ?? "post", status: opts.contentStatus ?? "scheduled", draft: `Nội dung thử ${id}`, createdAt: new Date().toISOString(), source: "manual" }).onConflictDoNothing().run();
  d.insert(S().scheduledPosts).values({ id, contentId: `ct_${id}`, title: `Bài ${id}`, platform: "facebook", scheduledFor: new Date(Date.now() - (opts.minutesAgo ?? 1) * 60_000).toISOString(), status: "scheduled" }).run();
}

function onlyPosts(ids: string[]) {
  // Bỏ mọi bài khác (kể cả bài mẫu) khỏi lượt đăng của test này
  for (const p of db.getDb().select().from(S().scheduledPosts).all()) if (!ids.includes(p.id) && p.status === "scheduled") db.getDb().update(S().scheduledPosts).set({ status: "cancelled", dedupeKey: null }).where(eq(S().scheduledPosts.id, p.id)).run();
}

test("quá hạn: bài chờ quá 6 giờ (kể cả bài mẫu tháng 9–10) chuyển 'Quá hạn, cần xếp lại', KHÔNG đăng khi vừa nối Facebook", async () => {
  connectFb();
  admin.setSetting("publishing.dryRun", "0");
  // Bài mẫu đã nạp (sp_md1/sp_md2 hẹn 03/10) + một bài thật hẹn 7 giờ trước + video hẹn 7 giờ trước
  assert.equal(post("sp_md2").status, "scheduled", "bài mẫu đang chờ trong dữ liệu nạp ban đầu");
  seedTextPost("sp_old", { minutesAgo: 7 * 60 });
  let calls = 0;
  globalThis.fetch = (async () => (calls++, json({ id: "111_OLD" }))) as typeof fetch;
  await sync.publishDuePosts();
  await pub.publishDueVideoPosts();
  assert.equal(calls, 0, "không gọi nền tảng");
  for (const id of ["sp_md1", "sp_md2", "sp_old"]) {
    assert.equal(post(id).status, "overdue", id);
    assert.equal(post(id).dedupeKey, null);
  }
  assert.equal(guards.OVERDUE_AFTER_MS, 6 * 60 * 60 * 1000);
  // Nội dung về "Đã duyệt" để lên lịch lại; "Xếp lại" phải CHỌN giờ mới (không đăng ngay), giờ đã qua bị từ chối
  assert.equal(db.getDb().select().from(S().contentItems).where(eq(S().contentItems.id, "ct_sp_old")).get()!.status, "approved");
  assert.match(text.retryTextPost("sp_old").error ?? "", /Chọn giờ/);
  assert.match(text.retryTextPost("sp_old", undefined, new Date(Date.now() - 3_600_000).toISOString()).error ?? "", /đã qua/);
  const later = new Date(Date.now() + 2 * 3_600_000).toISOString();
  assert.equal(text.retryTextPost("sp_old", undefined, later).ok, true);
  assert.equal(post("sp_old").status, "scheduled");
  assert.equal(post("sp_old").scheduledFor, later);
  assert.equal(post("sp_old").dedupeKey, "facebook:ct:ct_sp_old");
  // Bài mẫu không bao giờ xếp lại / đăng được
  assert.equal(text.retryTextPost("sp_md2").ok, false);
});

test("F1: chế độ thử (mặc định) — bài chữ KHÔNG gọi /feed, không thành 'đã đăng'; bài lên lịch khi chế độ thử thành bài thử", async () => {
  connectFb();
  assert.equal(pub.isDryRun(), true);
  seedTextPost("sp_f1");
  onlyPosts(["sp_f1"]);
  const calls: string[] = [];
  globalThis.fetch = (async (u: string) => (calls.push(String(u)), json({ id: "111_X" }))) as typeof fetch;
  await sync.publishDuePosts();
  assert.equal(calls.length, 0, "không gọi nền tảng");
  assert.equal(post("sp_f1").status, "scheduled", "bài thật cũ được giữ lại");
  assert.match(post("sp_f1").error ?? "", /Chế độ thử/);

  // Lên lịch mới khi chế độ thử: mode dry_run, đến giờ → "dry_run", không bao giờ "published"
  db.getDb().insert(S().contentItems).values({ id: "ct_new1", title: "Bài mới", format: "post", status: "approved", draft: "Xin chào", createdAt: new Date().toISOString(), source: "manual" }).run();
  const r = text.scheduleTextPosts({ contentId: "ct_new1", platforms: ["facebook"], whenIso: new Date().toISOString(), by: "t" });
  assert.deepEqual(r, { ok: true, created: 1, mode: "dry_run" });
  const p = db.getDb().select().from(S().scheduledPosts).where(eq(S().scheduledPosts.contentId, "ct_new1")).get()!;
  assert.equal(p.mode, "dry_run");
  assert.equal(p.dedupeKey, null);
  const out = await sync.publishDuePosts();
  assert.equal(out.tested, 1);
  assert.equal(post(p.id).status, "dry_run");
  assert.equal(calls.length, 0);
  assert.equal(db.getDb().select().from(S().contentItems).where(eq(S().contentItems.id, "ct_new1")).get()!.status, "approved", "chạy thử xong: nội dung về Đã duyệt để lên lịch thật sau");
});

test("F1: đăng thật — có mã bài chỉ là 'đang xác minh'; 'đã đăng' khi đọc lại được bài (permalink)", async () => {
  connectFb();
  admin.setSetting("publishing.dryRun", "0");
  db.getDb().insert(S().contentItems).values({ id: "ct_live1", title: "Bài thật", format: "post", status: "approved", draft: "Nội dung thật", createdAt: new Date().toISOString(), source: "manual" }).run();
  const r = text.scheduleTextPosts({ contentId: "ct_live1", platforms: ["facebook"], whenIso: new Date().toISOString(), by: "t" });
  assert.deepEqual(r, { ok: true, created: 1, mode: "live" });
  const id = db.getDb().select().from(S().scheduledPosts).where(eq(S().scheduledPosts.contentId, "ct_live1")).get()!.id;
  onlyPosts([id]);
  assert.equal(post(id).dedupeKey, "facebook:ct:ct_live1");
  // Lên lịch lần hai cùng trang → chống trùng
  assert.match((text.scheduleTextPosts({ contentId: "ct_live1", platforms: ["facebook"], whenIso: new Date().toISOString(), by: "t" }) as { error: string }).error, /trùng/);
  const calls: string[] = [];
  let permalink = false;
  globalThis.fetch = (async (u: string, init?: RequestInit) => {
    calls.push(String(u));
    if (String(u).endsWith("/111/feed")) {
      assert.equal((init?.body as URLSearchParams).get("message"), "Nội dung thật");
      assert.ok(init?.signal, "lệnh đăng có hạn chờ");
      return json({ id: "111_P1" });
    }
    if (String(u).includes("/111_P1?")) return json(permalink ? { id: "111_P1", permalink_url: "https://www.facebook.com/111/posts/P1", created_time: "2026-10-26T01:00:00+0000", is_published: true } : { id: "111_P1" });
    return json({ error: { message: "?" } }, 404);
  }) as typeof fetch;
  await sync.publishDuePosts();
  assert.equal(post(id).status, "verifying");
  assert.equal(post(id).externalId, "111_P1");
  await pub.verifyPublishingPosts();
  assert.equal(post(id).status, "verifying", "chưa đọc lại được bài thì chưa là đã đăng");
  permalink = true;
  await pub.verifyPublishingPosts();
  assert.equal(post(id).status, "published");
  assert.equal(post(id).permalink, "https://www.facebook.com/111/posts/P1");
  assert.equal(db.getDb().select().from(S().contentItems).where(eq(S().contentItems.id, "ct_live1")).get()!.status, "published");
  assert.equal(calls.filter((c) => c.endsWith("/111/feed")).length, 1);
});

test("F1: lỗi mơ hồ ở /feed (mất mạng, 5xx, 200 không mã) → đánh dấu cần kiểm trang, không tự đăng lại; 4xx rõ ràng thì không", async () => {
  connectFb();
  admin.setSetting("publishing.dryRun", "0");
  const run = async (id: string, respond: () => Response | Promise<Response>) => {
    seedTextPost(id);
    onlyPosts([id]);
    globalThis.fetch = (async () => respond()) as typeof fetch;
    await sync.publishDuePosts();
    return post(id);
  };
  for (const [id, f] of [
    ["sp_amb_net", () => Promise.reject(new Error("socket hang up"))],
    ["sp_amb_5xx", () => json({ error: { message: "An unknown error has occurred.", code: 1, is_transient: true } }, 500)],
    ["sp_amb_noid", () => json({ success: true })],
  ] as const) {
    const p = await run(id, f);
    assert.equal(p.status, "failed", id);
    assert.equal(guards.isAmbiguousFailure(p), true, id);
  }
  const clear = await run("sp_400", () => json({ error: { message: "Invalid parameter", code: 100 } }, 400));
  assert.equal(clear.status, "failed");
  assert.equal(guards.isAmbiguousFailure(clear), false);
  // "Đăng lại": lỗi mơ hồ chỉ OWNER, kèm ghi đã kiểm tra trang; lỗi rõ ràng thì được
  admin.setSetting("admin.email", "owner@baor.test");
  const owner = { email: "owner@baor.test", name: "OWNER" };
  assert.match(text.retryTextPost("sp_amb_net", "Đã mở trang lúc 10:05, không thấy bài", undefined, { email: "quanly@baor.test" }).error ?? "", /chỉ OWNER/);
  assert.match(text.retryTextPost("sp_amb_net", undefined, undefined, owner).error ?? "", /kiểm tra trang/);
  assert.equal(text.retryTextPost("sp_amb_net", "Đã mở trang lúc 10:05, không thấy bài", undefined, owner).ok, true);
  assert.equal(post("sp_amb_net").status, "scheduled");
  assert.equal(text.retryTextPost("sp_400").ok, true);
  // Nền tảng đã nhận bài (có mã) → không đăng lại
  db.getDb().update(S().scheduledPosts).set({ status: "failed", externalId: "111_Z" }).where(eq(S().scheduledPosts.id, "sp_amb_5xx")).run();
  assert.equal(text.retryTextPost("sp_amb_5xx", "Đã mở trang lúc 10:05, không thấy bài").ok, false);
});

test("F2: hai lượt publishDuePosts chồng nhau không đăng trùng (giành quyền nguyên tử)", async () => {
  connectFb();
  admin.setSetting("publishing.dryRun", "0");
  seedTextPost("sp_A");
  seedTextPost("sp_B");
  onlyPosts(["sp_A", "sp_B"]);
  const feed: string[] = [];
  let n = 0;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    if (!String(url).endsWith("/feed")) return json({});
    feed.push(String((init?.body as URLSearchParams).get("message")));
    n++;
    await new Promise((r) => setTimeout(r, n === 1 ? 50 : 1));
    return json({ id: `111_${n}` });
  }) as typeof fetch;
  const p1 = sync.publishDuePosts();
  await new Promise((r) => setTimeout(r, 5));
  const p2 = sync.publishDuePosts();
  const [a, b] = await Promise.all([p1, p2]);
  assert.equal(a.published + b.published, 2, "2 bài, 2 lần đăng");
  assert.equal(feed.length, 2);
  assert.deepEqual([...feed].sort(), ["Nội dung thử sp_A", "Nội dung thử sp_B"]);
});

test("F2: bài chữ cũ trùng (cùng nội dung, cùng trang, trước khi có dedupe_key) → chỉ đăng một", async () => {
  connectFb();
  admin.setSetting("publishing.dryRun", "0");
  seedTextPost("sp_dup1");
  db.getDb().insert(S().scheduledPosts).values({ id: "sp_dup2", contentId: "ct_sp_dup1", title: "Bài sp_dup1", platform: "facebook", scheduledFor: new Date(Date.now() - 60_000).toISOString(), status: "scheduled" }).run();
  onlyPosts(["sp_dup1", "sp_dup2"]);
  let feeds = 0;
  globalThis.fetch = (async (u: string) => (String(u).endsWith("/feed") ? (feeds++, json({ id: `111_D${feeds}` })) : json({}))) as typeof fetch;
  await sync.publishDuePosts();
  assert.equal(feeds, 1);
  assert.deepEqual([post("sp_dup1").status, post("sp_dup2").status].sort(), ["cancelled", "verifying"]);
});

test("F3: bài chữ kẹt 'publishing' (máy chủ dừng giữa chừng) → lỗi mơ hồ, không tự đăng lại", async () => {
  seedTextPost("sp_stuck");
  db.getDb().update(S().scheduledPosts).set({ status: "publishing" }).where(eq(S().scheduledPosts.id, "sp_stuck")).run();
  await sync.publishDuePosts();
  const p = post("sp_stuck");
  assert.equal(p.status, "failed");
  assert.equal(guards.isAmbiguousFailure(p), true);
  assert.equal(text.retryTextPost("sp_stuck").ok, false, "phải ghi đã kiểm tra trang");
});

test("bài mẫu: đến giờ (chưa quá hạn) vẫn KHÔNG đăng; nội dung mẫu không lên lịch được", async () => {
  connectFb();
  admin.setSetting("publishing.dryRun", "0");
  onlyPosts([]);
  db.getDb().update(S().scheduledPosts).set({ status: "scheduled", scheduledFor: new Date(Date.now() - 60_000).toISOString() }).where(eq(S().scheduledPosts.id, "sp_md2")).run();
  let calls = 0;
  globalThis.fetch = (async () => (calls++, json({ id: "111_S" }))) as typeof fetch;
  const out = await sync.publishDuePosts();
  assert.equal(calls, 0);
  assert.equal(out.skipped, 1);
  assert.equal(post("sp_md2").status, "scheduled");
  assert.equal(post("sp_md2").error, guards.SAMPLE_NOTE);
  assert.equal(guards.isSamplePost({ id: "sp_x", contentId: "ct_md2" }), true, "bài chữ từ nội dung mẫu");
  assert.equal(guards.isSamplePost({ id: "sp_x", contentId: "ct_live1" }), false);
  db.getDb().update(S().contentItems).set({ status: "approved" }).where(eq(S().contentItems.id, "ct_md2")).run();
  assert.match((text.scheduleTextPosts({ contentId: "ct_md2", platforms: ["facebook"], whenIso: new Date().toISOString(), by: "t" }) as { error: string }).error, /mẫu/);
  db.getDb().update(S().scheduledPosts).set({ status: "cancelled" }).where(eq(S().scheduledPosts.id, "sp_md2")).run();
});

test("chưa kết nối kênh: không ghi marketing_decision mỗi phút — chỉ khi lý do đổi", async () => {
  connectFb(false);
  admin.setSetting("publishing.dryRun", "0");
  seedTextPost("sp_wait");
  onlyPosts(["sp_wait"]);
  const count = () => db.getDb().select().from(S().marketingDecisions).where(and(eq(S().marketingDecisions.entityId, "sp_wait"))).all().length;
  for (let i = 0; i < 3; i++) await sync.publishDuePosts();
  assert.equal(count(), 1, "3 lượt chạy, 1 quyết định");
  assert.match(post("sp_wait").error ?? "", /chưa kết nối/);
  assert.equal(post("sp_wait").status, "scheduled");
  db.getDb().update(S().scheduledPosts).set({ status: "cancelled", dedupeKey: null }).where(eq(S().scheduledPosts.id, "sp_wait")).run();
});

test("lên lịch bài chữ: chặn giờ đã qua, kịch bản Reel / ảnh, kênh chỉ nhận video", () => {
  const d = db.getDb();
  const now = new Date().toISOString();
  d.insert(S().contentItems).values([
    { id: "ct_sch_post", title: "Bài", format: "post", status: "approved", draft: "x", createdAt: now, source: "manual" },
    { id: "ct_sch_reel", title: "Reel", format: "reel", status: "approved", draft: "x", createdAt: now, source: "manual" },
    { id: "ct_sch_img", title: "Ảnh", format: "image", status: "approved", draft: "x", createdAt: now, source: "manual" },
  ]).run();
  const err = (r: import("../src/lib/publishing/text").TextScheduleResult) => (r.ok ? "" : r.error);
  assert.match(err(text.scheduleTextPosts({ contentId: "ct_sch_post", platforms: ["facebook"], whenIso: new Date(Date.now() - 3_600_000).toISOString(), by: "t" })), /đã qua/);
  assert.match(err(text.scheduleTextPosts({ contentId: "ct_sch_reel", platforms: ["facebook"], whenIso: now, by: "t" })), /Kịch bản video/);
  assert.match(err(text.scheduleTextPosts({ contentId: "ct_sch_img", platforms: ["facebook"], whenIso: now, by: "t" })), /ảnh/);
  for (const p of ["tiktok", "youtube", "instagram"]) assert.match(err(text.scheduleTextPosts({ contentId: "ct_sch_post", platforms: [p], whenIso: now, by: "t" })), /không đăng lên kênh này/, p);
  // Zalo OA nhận bài chữ nhưng chưa có connector đăng → không chọn được, lên lịch bị chặn ngay (không chờ rồi quá hạn)
  assert.deepEqual(text.textPlatforms().map(([k]) => k), ["facebook"]);
  assert.match(err(text.scheduleTextPosts({ contentId: "ct_sch_post", platforms: ["zalo"], whenIso: now, by: "t" })), /chưa có kết nối đăng bài/);
  assert.equal(d.select().from(S().scheduledPosts).where(eq(S().scheduledPosts.contentId, "ct_sch_post")).all().length, 0, "không tạo bài nào khi bị chặn");
});

test("Graph: mọi lời gọi có hạn chờ (timeout)", async () => {
  let signal: AbortSignal | null | undefined;
  const f = (async (_u: string, init?: RequestInit) => ((signal = init?.signal), json({ id: "111", name: "Trang" }))) as typeof fetch;
  await meta.facebookPageConnector.check({ config: FAKE, fetch: f });
  assert.ok(signal instanceof AbortSignal);
  assert.equal(meta.GRAPH_TIMEOUT_MS, 30_000);
  // Yêu cầu treo bị huỷ khi hết hạn chờ → lệnh đăng bài chữ coi là mơ hồ (đã gửi), không treo bộ chạy nền
  const hang = (async (_u: string, init?: RequestInit) => new Promise<Response>((_r, rej) => init?.signal?.addEventListener("abort", () => rej(new Error("timeout"))))) as typeof fetch;
  const ac = new AbortController();
  setTimeout(() => ac.abort(), 20);
  const r = await meta.publishPagePost({ config: FAKE, fetch: ((u: string, init?: RequestInit) => hang(u, { ...init, signal: AbortSignal.any([init!.signal!, ac.signal]) })) as typeof fetch }, { postId: "p", contentId: "c", title: "t", message: "m", platform: "facebook" });
  assert.equal(r.ok, false);
  assert.equal(r.ambiguous, true);
});

function seedVideo(id: string) {
  const d = db.getDb();
  const now = new Date().toISOString();
  const fileName = `${id}.mp4`;
  fs.mkdirSync(path.join(tmp, "uploads"), { recursive: true });
  const out = path.join(tmp, "uploads", fileName);
  spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=108x192:r=10:d=1", "-pix_fmt", "yuv420p", out]);
  d.insert(S().uploads).values({ id: `up_${id}`, kind: "video", name: fileName, fileName, mime: "video/mp4", size: fs.statSync(out).size, meta: "{}", uploadedBy: "t", createdAt: now }).run();
  d.insert(S().videos).values({ id, title: `Video ${id}`, contentId: null, agent: "t", status: "approved", platforms: "[]", version: 1, note: "", uploadId: `up_${id}`, updatedAt: now }).run();
}

test("F5: Cài đặt › Tự động 'Tự động đăng bài đã duyệt' TẮT → không đăng cả bài video", async () => {
  connectFb();
  admin.setSetting("publishing.dryRun", "0");
  seedVideo("v_ap");
  const r = pub.scheduleVideoPosts({ videoId: "v_ap", platforms: ["facebook"], whenIso: new Date(Date.now() - 60_000).toISOString(), caption: "c", by: "t" });
  assert.equal(r.ok, true);
  admin.setSetting("automation.auto_publish", "0");
  let calls = 0;
  globalThis.fetch = (async () => (calls++, json({}))) as typeof fetch;
  const out = await pub.publishDueVideoPosts();
  assert.equal(out.published, 0);
  assert.equal(calls, 0);
  assert.equal(pub.videoPostsFor("v_ap")[0].status, "scheduled");
  const t = await sync.publishDuePosts();
  assert.deepEqual(t, { published: 0, tested: 0, failed: 0, skipped: 0 });
});

test("P1-2 bài chữ quá hạn có lối ra: Huỷ được; lên lịch mới cùng nội dung + trang thì dòng quá hạn cũ chuyển 'cancelled'", async () => {
  connectFb();
  admin.setSetting("publishing.dryRun", "0");
  seedTextPost("sp_od_a", { minutesAgo: 8 * 60 });
  seedTextPost("sp_od_b", { minutesAgo: 8 * 60 });
  await sync.publishDuePosts();
  assert.equal(post("sp_od_a").status, "overdue");
  assert.equal(post("sp_od_b").status, "overdue");
  // Huỷ
  assert.equal(text.cancelTextPost("sp_od_a").ok, true);
  assert.equal(post("sp_od_a").status, "cancelled");
  // Lên lịch mới cho cùng nội dung → dòng quá hạn cũ không treo nữa
  const r = text.scheduleTextPosts({ contentId: "ct_sp_od_b", platforms: ["facebook"], whenIso: new Date(Date.now() + 3_600_000).toISOString(), by: "t" });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(post("sp_od_b").status, "cancelled");
  const att = await import("../src/lib/attention");
  assert.equal(att.postProblems().overdue.filter((p) => p.id.startsWith("sp_od_")).length, 0);
  // Kênh không còn nhận bài chữ → không xếp lại được
  db.getDb().update(S().scheduledPosts).set({ status: "overdue", platform: "tiktok", dedupeKey: null }).where(eq(S().scheduledPosts.id, "sp_od_a")).run();
  assert.match(text.retryTextPost("sp_od_a", undefined, new Date(Date.now() + 3_600_000).toISOString()).error ?? "", /TikTok/);
});

test("P1-2 bài video quá hạn: Huỷ / Xếp lại (chọn giờ) được; lên lịch mới thì dòng cũ huỷ; mục 'bài quá hạn' tự hết", async () => {
  connectFb();
  admin.setSetting("publishing.dryRun", "0");
  const att = await import("../src/lib/attention");
  const overdueOf = (vid: string) => att.postProblems().overdue.filter((p) => p.videoId === vid).length;
  for (const vid of ["v_od1", "v_od2", "v_od3"]) {
    seedVideo(vid);
    assert.equal(pub.scheduleVideoPosts({ videoId: vid, platforms: ["facebook"], whenIso: new Date(Date.now() - 7 * 3_600_000).toISOString(), caption: "c", by: "t" }).ok, true);
  }
  globalThis.fetch = (async () => json({})) as typeof fetch;
  await pub.publishDueVideoPosts();
  const p1 = pub.videoPostsFor("v_od1")[0];
  assert.equal(p1.status, "overdue");
  // Huỷ
  assert.equal(pub.cancelVideoPost(p1.id).ok, true);
  assert.equal(overdueOf("v_od1"), 0);
  // Xếp lại: phải chọn giờ, không đăng ngay
  const p2 = pub.videoPostsFor("v_od2")[0];
  assert.equal(pub.retryVideoPost(p2.id).ok, false);
  const later = new Date(Date.now() + 3_600_000).toISOString();
  assert.equal(pub.retryVideoPost(p2.id, undefined, later).ok, true);
  assert.equal(pub.videoPostsFor("v_od2")[0].scheduledFor, later);
  assert.equal(pub.videoPostsFor("v_od2")[0].dedupeKey, "facebook:v_od2");
  // Lên lịch mới cùng video + trang → dòng quá hạn cũ chuyển cancelled
  const p3 = pub.videoPostsFor("v_od3")[0];
  assert.equal(pub.scheduleVideoPosts({ videoId: "v_od3", platforms: ["facebook"], whenIso: later, caption: "c", by: "t" }).ok, true);
  assert.equal(post(p3.id).status, "cancelled");
  assert.equal(overdueOf("v_od3"), 0);
  for (const v of ["v_od2", "v_od3"]) for (const p of pub.videoPostsFor(v)) if (p.status === "scheduled") pub.cancelVideoPost(p.id);
});

test("'Đã kiểm trang': chỉ OWNER; có bài → Đã đăng (verifiedAt); không thấy → bỏ dấu mơ hồ để thử lại / huỷ; mục cần kiểm trang tự hết", async () => {
  const perm = await import("../src/lib/permissions");
  const catalog = await import("../src/lib/catalog/repository");
  const att = await import("../src/lib/attention");
  admin.setSetting("admin.email", "owner@baor.test");
  catalog.catalogRepo.savePerson({ name: "QT", role: "", email: "qt@baor.test", permission: "admin" });
  const owner = perm.actorFor("owner@baor.test");
  const staff = perm.actorFor("qt@baor.test");
  seedTextPost("sp_pc_found");
  seedTextPost("sp_pc_none");
  db.getDb().update(S().scheduledPosts).set({ status: "failed", error: `${guards.AMBIGUOUS_MARK} Mất mạng sau khi gửi lệnh đăng.` }).where(eq(S().scheduledPosts.id, "sp_pc_found")).run();
  db.getDb().update(S().scheduledPosts).set({ status: "failed", externalId: "111_PC", error: "Không xác minh được sau 24 giờ: chưa có permalink." }).where(eq(S().scheduledPosts.id, "sp_pc_none")).run();
  const checks = () => att.postProblems().pageCheck.filter((p) => p.id.startsWith("sp_pc_")).length;
  assert.equal(checks(), 2);
  assert.equal(pub.cancelVideoPost("sp_pc_found").ok, false, "không phải bài video");
  assert.equal(text.cancelTextPost("sp_pc_none").ok, false, "có mã bài: chưa kiểm trang thì chưa huỷ được");
  assert.equal(pub.confirmPageChecked("sp_pc_found", staff, true).ok, false, "nhân sự quyền Quản trị không xác nhận được");
  assert.equal(post("sp_pc_found").status, "failed");
  assert.equal(pub.confirmPageChecked("sp_pc_found", owner, true).ok, true);
  assert.equal(post("sp_pc_found").status, "published");
  assert.ok(post("sp_pc_found").verifiedAt);
  assert.match(post("sp_pc_found").error ?? "", /OWNER xác nhận trên trang/);
  assert.equal(pub.confirmPageChecked("sp_pc_none", owner, false).ok, true);
  assert.equal(post("sp_pc_none").externalId, null);
  assert.equal(guards.needsPageCheck(post("sp_pc_none")), false);
  assert.equal(checks(), 0, "mục cần kiểm trang tự hết");
  assert.equal(text.cancelTextPost("sp_pc_none").ok, true, "không thấy bài → huỷ được");
});

test("Nghiên cứu: danh sách chủ đề tự thu hồi nhiệm vụ 'đang chạy' bị bỏ dở", async () => {
  const topic = await import("../src/lib/research/topic");
  // Nhiệm vụ "running" không có mốc bắt đầu, không thuộc lượt đang chạy = bị bỏ dở (máy chủ dừng giữa chừng)
  const id = "rt_stale_t";
  db.getDb().insert(S().researchTasks).values({ id, question: "Chủ đề", purposeKind: "content", status: "running", createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString() }).run();
  topic.listTopics();
  const row = db.getDb().select().from(S().researchTasks).where(eq(S().researchTasks.id, id)).get()!;
  assert.equal(row.status, "error");
});

test("lỗi mơ hồ chưa có mã bài: quản lý Huỷ được (ghi nhật ký), không đăng lại được; 'Không thấy bài' giữ mã bài cũ trong ghi chú + nhật ký, kể cả khi đăng lại", async () => {
  const perm = await import("../src/lib/permissions");
  admin.setSetting("admin.email", "owner@baor.test");
  const owner = perm.actorFor("owner@baor.test");
  const manager = { email: "quanly@baor.test", name: "Quản lý" };
  const log = () => db.getDb().select().from(S().activity).all().map((a) => a.message);
  // 1) Lỗi mơ hồ, chưa có mã bài → Huỷ được, có nhật ký
  seedTextPost("sp_amb_cancel");
  db.getDb().update(S().scheduledPosts).set({ status: "failed", error: `${guards.AMBIGUOUS_MARK} Mất mạng sau khi gửi lệnh đăng.` }).where(eq(S().scheduledPosts.id, "sp_amb_cancel")).run();
  assert.match(text.retryTextPost("sp_amb_cancel", "Đã mở trang lúc 10:05, không thấy bài", undefined, manager).error ?? "", /chỉ OWNER/);
  assert.equal(post("sp_amb_cancel").status, "failed");
  assert.equal(text.cancelTextPost("sp_amb_cancel", manager).ok, true);
  assert.equal(post("sp_amb_cancel").status, "cancelled");
  assert.ok(log().some((m) => m.includes("Quản lý huỷ bài lỗi mơ hồ") && m.includes("Bài sp_amb_cancel")));
  // Có mã bài (nền tảng đã nhận) → không huỷ được trước khi kiểm trang
  seedTextPost("sp_code");
  db.getDb().update(S().scheduledPosts).set({ status: "failed", externalId: "fb_111_OLD", error: "Không xác minh được sau 24 giờ: chưa có permalink." }).where(eq(S().scheduledPosts.id, "sp_code")).run();
  assert.equal(text.cancelTextPost("sp_code", manager).ok, false);
  // 2) OWNER kiểm "Không thấy bài" → mã cũ còn trong ghi chú và nhật ký
  assert.equal(pub.confirmPageChecked("sp_code", owner, false).ok, true);
  assert.equal(post("sp_code").externalId, null);
  assert.match(post("sp_code").error ?? "", /mã cũ fb_111_OLD/);
  assert.ok(log().some((m) => m.includes("không thấy bài") && m.includes("fb_111_OLD")));
  // 3) Đăng lại → ghi chú bài và nhật ký vẫn giữ mã bài cũ (để tra / xoá bài thứ nhất nếu nhìn nhầm)
  assert.equal(guards.previousExternalId(post("sp_code")), "fb_111_OLD");
  assert.equal(text.retryTextPost("sp_code", undefined, undefined, manager).ok, true, "đã bỏ dấu mơ hồ: quản lý đăng lại được");
  assert.equal(post("sp_code").status, "scheduled");
  assert.match(post("sp_code").error ?? "", /mã bài cũ fb_111_OLD/);
  assert.ok(log().some((m) => m.includes("đăng lại bài lỗi") && m.includes("fb_111_OLD")));
  text.cancelTextPost("sp_code", manager);
});
