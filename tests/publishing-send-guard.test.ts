// "Trước khi bật đăng thật" (26/10): kiểm lại TRANG ngay lúc gửi (Page ID đổi / trang đã có bài), khoá giành quyền theo trang ở mức
// CSDL (hai TIẾN TRÌNH cùng tệp SQLite), bài "đang xác minh" không kẹt mãi, nhãn lỗi ngắn, một danh sách ID mẫu.
// CSDL tạm; fetch giả (không gọi Meta thật); token là chuỗi giả.
import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { eq } from "drizzle-orm";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "baor-sendguard-"));
process.env.DATA_DIR = tmp;
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.AUTH_SECRET = "test-secret-".padEnd(40, "x");
process.env.BAOR_VIDEO_WORKER = "off";

let db: typeof import("../src/db");
let pub: typeof import("../src/lib/publishing/video");
let text: typeof import("../src/lib/publishing/text");
let guards: typeof import("../src/lib/publishing/guards");
let sample: typeof import("../src/lib/sample");
let config: typeof import("../src/lib/connectors/config");
let admin: typeof import("../src/lib/admin");

const FAKE = { pageId: "111", pageToken: "tok-gia-1", appId: "222", userToken: "u-gia-1" };
const realFetch = globalThis.fetch;

before(async () => {
  db = await import("../src/db");
  pub = await import("../src/lib/publishing/video");
  text = await import("../src/lib/publishing/text");
  guards = await import("../src/lib/publishing/guards");
  sample = await import("../src/lib/sample");
  config = await import("../src/lib/connectors/config");
  admin = await import("../src/lib/admin");
  config.ensureFanpageRows();
});
beforeEach(() => {
  globalThis.fetch = realFetch;
  config.writeIntegrationConfig("facebook_page", FAKE);
  config.writeIntegrationConfig("facebook_page_3", { ...FAKE, pageToken: "tok-gia-3" });
  for (const key of ["facebook_page", "facebook_page_3"]) db.getDb().update(S().integrations).set({ connected: true }).where(eq(S().integrations.key, key)).run();
  admin.setSetting("publishing.dryRun", "0");
  admin.setSetting("automation.auto_publish", "1");
  // Bài "publishing" do "tiến trình B" của test trước để lại: dọn đi, kẻo recoverStuckPublishing ghi CSDL (chờ khoá) trước bước
  // giành quyền và che mất đúng tình huống chạy đua cần kiểm.
  db.getDb().update(S().scheduledPosts).set({ status: "cancelled", dedupeKey: null }).where(eq(S().scheduledPosts.status, "publishing")).run();
  // Cũng vậy: dọn trước bài quá hạn (bài mẫu hẹn 03/10) để lượt đăng trong test không ghi gì trước bước giành quyền — chạy riêng
  // một test (--test-name-pattern) cũng giữ đúng tình huống.
  guards.sweepOverduePosts();
});
after(() => {
  globalThis.fetch = realFetch;
  fs.rmSync(tmp, { recursive: true, force: true });
});

const S = () => db.schema;
const row = (id: string) => db.getDb().select().from(S().scheduledPosts).where(eq(S().scheduledPosts.id, id)).get()!;
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
const past = () => new Date(Date.now() - 60_000).toISOString();

/** Meta giả: đếm lệnh đăng video (/<page>/videos) và bài chữ (/<page>/feed). */
function fakeMeta() {
  const sends: string[] = [];
  globalThis.fetch = (async (url: string) => {
    const u = String(url);
    if (u.includes("/222/uploads")) return json({ id: "upload:S1" });
    if (u.endsWith("/upload:S1")) return json({ h: "H1" });
    if (/\/\d+\/videos$/.test(u)) return (sends.push(u), json({ id: `VID_${sends.length}` }));
    if (/\/\d+\/feed$/.test(u)) return (sends.push(u), json({ id: `111_${sends.length}` }));
    return json({ error: { message: "không biết" } }, 404);
  }) as typeof fetch;
  return sends;
}

function seedVideo(id: string) {
  const d = db.getDb();
  const now = new Date().toISOString();
  fs.mkdirSync(path.join(tmp, "uploads"), { recursive: true });
  const out = path.join(tmp, "uploads", `${id}.mp4`);
  spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=108x192:r=10:d=1", "-pix_fmt", "yuv420p", out]);
  d.insert(S().uploads).values({ id: `up_${id}`, kind: "video", name: `${id}.mp4`, fileName: `${id}.mp4`, mime: "video/mp4", size: fs.statSync(out).size, meta: "{}", uploadedBy: "t", createdAt: now }).run();
  d.insert(S().videos).values({ id, title: `Video ${id}`, contentId: null, agent: "t", status: "approved", platforms: "[]", version: 1, note: "", uploadId: `up_${id}`, updatedAt: now }).run();
}

function seedContent(id: string) {
  db.getDb().insert(S().contentItems).values({ id, title: `Bài ${id}`, format: "post", status: "approved", draft: `Nội dung thật ${id}`, createdAt: new Date().toISOString(), source: "manual" }).run();
}

/** Dòng trùng trang (dữ liệu cũ / hai tiến trình cùng lên lịch): chép một bài với id + kênh khác. */
function cloneAs(srcId: string, id: string, patch: Partial<typeof db.schema.scheduledPosts.$inferInsert>) {
  const src = row(srcId);
  db.getDb().insert(S().scheduledPosts).values({ ...src, id, dedupeKey: null, ...patch }).run();
}

/** "Tiến trình B" thật (node con, CÙNG tệp CSDL): BEGIN IMMEDIATE, chạy `sql` (tham số `id`), báo "locked", giữ khoá `holdMs` rồi
 *  COMMIT. `beatMs` > 0: sau commit còn sống `lifeMs` và đập nhịp claimed_at như holdClaim (rồi "chết" không nhả quyền). */
function otherProcess(sql: string, id: string, holdMs: number, opt: { beatMs?: number; lifeMs?: number } = {}): Promise<{ done: Promise<void> }> {
  const code = `
    const Database = require("better-sqlite3");
    const db = new Database(process.env.T_DB);
    const now = () => new Date().toISOString();
    db.exec("BEGIN IMMEDIATE");
    db.prepare(process.env.T_SQL).run({ id: process.env.T_ID, now: now(), owner: "proc-B" });
    process.stdout.write("locked\\n");
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Number(process.env.T_HOLD));
    db.exec("COMMIT");
    const beat = Number(process.env.T_BEAT), end = Date.now() + Number(process.env.T_LIFE);
    while (beat > 0 && Date.now() < end) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, beat);
      db.prepare("UPDATE scheduled_posts SET claimed_at = ? WHERE id = ? AND status = 'publishing' AND claimed_by = 'proc-B'").run(now(), process.env.T_ID);
    }
    db.close();`;
  const env = { ...process.env, T_DB: process.env.DATABASE_PATH, T_SQL: sql, T_ID: id, T_HOLD: String(holdMs), T_BEAT: String(opt.beatMs ?? 0), T_LIFE: String(opt.lifeMs ?? 0) };
  const child = spawn(process.execPath, ["-e", code], { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "inherit"] });
  const done = new Promise<void>((res, rej) => child.on("exit", (c) => (c === 0 ? res() : rej(new Error(`tiến trình B thoát ${c}`)))));
  return new Promise((res, rej) => {
    child.stdout.on("data", (b: Buffer) => b.toString().includes("locked") && res({ done }));
    child.on("error", rej);
  });
}

/** Tiến trình B giành bài `id` như claimForSend (status "publishing" + claimed_by / claimed_at của B), giữ khoá `holdMs` rồi COMMIT. */
const CLAIM_SQL = "UPDATE scheduled_posts SET status = 'publishing', attempts = attempts + 1, claimed_by = @owner, claimed_at = @now WHERE id = @id AND status = 'scheduled'";
function otherProcessClaims(id: string, holdMs: number, opt?: { beatMs?: number; lifeMs?: number }) {
  return otherProcess(CLAIM_SQL, id, holdMs, opt);
}

// ---- 1. Kiểm lại trang NGAY lúc gửi ----

test("1a video: Page ID kênh đổi giữa lúc lên lịch và lúc gửi → KHÔNG gửi, 'failed' nêu rõ Page ID đã đổi; Đăng lại = đăng lên trang hiện tại", async () => {
  seedVideo("v_moved");
  assert.equal(pub.scheduleVideoPosts({ videoId: "v_moved", platforms: ["facebook"], whenIso: past(), caption: "Bình luận bên dưới", by: "t" }).ok, true);
  const id = pub.videoPostsFor("v_moved")[0].id;
  assert.equal(row(id).targetPageId, "111");
  config.writeIntegrationConfig("facebook_page", { ...FAKE, pageId: "666" });
  const sends = fakeMeta();
  await pub.publishDueVideoPosts();
  assert.equal(sends.length, 0, "không gửi lệnh đăng lên trang 666 (lúc lên lịch là 111)");
  assert.equal(row(id).status, "failed");
  assert.match(row(id).error ?? "", /^Page ID đã đổi — kiểm lại kênh/);
  assert.match(row(id).error ?? "", /111/);
  assert.match(row(id).error ?? "", /666/);
  assert.equal(guards.needsPageCheck(row(id)), false, "chưa gửi gì: lỗi rõ ràng, Đăng lại / Huỷ được");
  // OWNER kiểm kênh, bấm Đăng lại → bài đi theo trang hiện tại 666
  assert.equal(pub.retryVideoPost(id).ok, true);
  assert.equal(row(id).targetPageId, "666");
  await pub.publishDueVideoPosts();
  assert.deepEqual(sends.map((u) => u.match(/\/(\d+)\/videos$/)?.[1]), ["666"]);
  assert.equal(row(id).status, "verifying");
});

test("1b video: Đăng lại bài lỗi KHÁC (token) khi kênh đã đổi trang → lúc gửi vẫn chặn, không lặng lẽ sang trang khác", async () => {
  seedVideo("v_tok");
  assert.equal(pub.scheduleVideoPosts({ videoId: "v_tok", platforms: ["facebook"], whenIso: past(), caption: "Bình luận bên dưới", by: "t" }).ok, true);
  const id = pub.videoPostsFor("v_tok")[0].id;
  db.getDb().update(S().scheduledPosts).set({ status: "failed", error: "Token hết hạn" }).where(eq(S().scheduledPosts.id, id)).run();
  config.writeIntegrationConfig("facebook_page", { ...FAKE, pageId: "777" });
  assert.equal(pub.retryVideoPost(id).ok, true);
  assert.equal(row(id).targetPageId, "111", "lỗi token: giữ trang lúc lên lịch");
  const sends = fakeMeta();
  await pub.publishDueVideoPosts();
  assert.equal(sends.length, 0);
  assert.match(row(id).error ?? "", /Page ID đã đổi/);
});

test("1c video: lúc gửi, trang đã có bài khác của cùng video (kênh khác cùng Page ID, đã đăng / đang xác minh) → huỷ, không gửi", async () => {
  seedVideo("v_twin");
  assert.equal(pub.scheduleVideoPosts({ videoId: "v_twin", platforms: ["facebook"], whenIso: past(), caption: "Bình luận bên dưới", by: "t" }).ok, true);
  const id = pub.videoPostsFor("v_twin")[0].id;
  // Bài trùng trang 111 ở Fanpage 3 (dữ liệu cũ / tiến trình khác) đã lên trang
  cloneAs(id, "sp_twin_b", { platform: "facebook_page_3", status: "verifying", externalId: "VID_OLD", publishedAt: past() });
  const sends = fakeMeta();
  await pub.publishDueVideoPosts();
  assert.equal(sends.length, 0, "trang 111 đã có video này");
  assert.equal(row(id).status, "cancelled");
  assert.match(row(id).error ?? "", /Trùng/);
  assert.match(row(id).error ?? "", /111/);
});

test("1d bài chữ: Page ID kênh đổi giữa lúc lên lịch và lúc gửi → KHÔNG gọi /feed, 'failed' Page ID đã đổi; Đăng lại theo trang hiện tại", async () => {
  seedContent("ct_moved");
  assert.equal(text.scheduleTextPosts({ contentId: "ct_moved", platforms: ["facebook"], whenIso: new Date().toISOString(), by: "t" }).ok, true);
  const id = db.getDb().select().from(S().scheduledPosts).where(eq(S().scheduledPosts.contentId, "ct_moved")).get()!.id;
  assert.equal(row(id).targetPageId, "111");
  config.writeIntegrationConfig("facebook_page", { ...FAKE, pageId: "888" });
  const sends = fakeMeta();
  await text.publishDueTextPosts();
  assert.equal(sends.length, 0);
  assert.equal(row(id).status, "failed");
  assert.match(row(id).error ?? "", /^Page ID đã đổi — kiểm lại kênh/);
  assert.equal(text.retryTextPost(id).ok, true);
  assert.equal(row(id).targetPageId, "888");
  await text.publishDueTextPosts();
  assert.deepEqual(sends.map((u) => u.match(/\/(\d+)\/feed$/)?.[1]), ["888"]);
});

// ---- 2. Khoá giành quyền theo TRANG ở mức CSDL (hai tiến trình) ----

test("2a claimForSend (đúng bước giành quyền): tiến trình B đang giữ khoá ghi, vừa giành bài cùng video cùng trang (chưa commit) → A chờ khoá NGAY ở claimForSend, đọc lại sau khi B commit, huỷ bài A", async () => {
  seedVideo("v_race");
  assert.equal(pub.scheduleVideoPosts({ videoId: "v_race", platforms: ["facebook"], whenIso: past(), caption: "Bình luận bên dưới", by: "t" }).ok, true);
  const a = pub.videoPostsFor("v_race")[0].id;
  // Bài B cùng trang 111 (Fanpage 3) — hai dòng cùng chờ: lần kiểm lúc lên lịch đã bị lọt (hai tiến trình cùng lên lịch / dữ liệu cũ)
  cloneAs(a, "sp_race_b", { platform: "facebook_page_3", dedupeKey: "facebook_page_3:v_race" });
  const b = await otherProcessClaims("sp_race_b", 1200);
  // Gọi thẳng bước giành quyền: không có lệnh ghi nào khác của A đứng trước để "chờ khoá hộ". Bản đột biến kiểm bài cùng trang
  // ngoài giao dịch → A thấy B còn "scheduled" và giành được (ok); behavior "deferred" → ảnh chụp cũ, ném "database is locked".
  const t0 = Date.now();
  const claim = pub.claimForSend(a);
  assert.ok(Date.now() - t0 >= 800, "A phải chờ khoá của B ở chính bước giành quyền");
  await b.done;
  assert.equal(claim.ok, false);
  assert.equal(claim.ok ? "" : claim.outcome, "cancelled");
  assert.equal(row("sp_race_b").status, "publishing", "B giữ quyền");
  assert.equal(row(a).status, "cancelled");
  assert.match(row(a).error ?? "", /Trùng/);
});

test("2b bài chữ, cả lượt đăng (chứng minh khoá đầu-cuối): tiến trình B đang giành bài cùng nội dung cùng trang → A không gọi /feed", async () => {
  seedContent("ct_race");
  const d = db.getDb();
  for (const id of ["sp_tr_a", "sp_tr_b"]) d.insert(S().scheduledPosts).values({ id, contentId: "ct_race", title: "Bài ct_race", platform: "facebook", scheduledFor: past(), status: "scheduled", mode: "live", targetPageId: "111" }).run();
  d.update(S().contentItems).set({ status: "scheduled" }).where(eq(S().contentItems.id, "ct_race")).run();
  const sends = fakeMeta();
  const b = await otherProcessClaims("sp_tr_b", 1200);
  await text.publishDueTextPosts();
  await b.done;
  assert.equal(sends.length, 0);
  assert.equal(row("sp_tr_b").status, "publishing");
  assert.equal(row("sp_tr_a").status, "cancelled");
});

test("2c (P3-4): khoá ghi bị giữ quá busy_timeout → SQLITE_BUSY ở bước giành quyền chỉ bỏ qua BÀI ĐÓ (vẫn chờ, chưa gửi), không ném ra khỏi lượt đăng", async () => {
  seedVideo("v_busy");
  assert.equal(pub.scheduleVideoPosts({ videoId: "v_busy", platforms: ["facebook"], whenIso: past(), caption: "Bình luận bên dưới", by: "t" }).ok, true);
  const a = pub.videoPostsFor("v_busy")[0].id;
  db.getDb().insert(S().scheduledPosts).values({ id: "sp_busy_other", contentId: "", title: "khác", platform: "tiktok", scheduledFor: new Date(Date.now() + 3_600_000).toISOString(), status: "scheduled", mode: "live" }).run();
  const sends = fakeMeta();
  const sqlite = db.getSqlite();
  sqlite.pragma("busy_timeout = 200");
  const b = await otherProcessClaims("sp_busy_other", 1500);
  try {
    const r = await pub.publishDueVideoPosts();
    assert.ok(r.skipped >= 1, "bài bận khoá tính là bỏ qua");
  } finally {
    sqlite.pragma("busy_timeout = 5000");
    await b.done;
  }
  assert.equal(sends.length, 0);
  assert.equal(row(a).status, "scheduled", "chưa gửi gì: lượt sau thử lại");
  // Lượt sau (khoá đã nhả): đăng bình thường
  await pub.publishDueVideoPosts();
  assert.equal(sends.length, 1);
  assert.equal(row(a).status, "verifying");
});

// ---- 3. "Đang xác minh" không kẹt mãi ----

test("3: bài 'verifying' mà kênh không còn connector / hàm đọc lại → sau 24 giờ ra 'cần kiểm trang'; chưa tới hạn thì còn chờ", async () => {
  seedVideo("v_ver");
  const d = db.getDb();
  const h = (n: number) => new Date(Date.now() - n * 3_600_000).toISOString();
  const base = { contentId: "", title: "Video v_ver", scheduledFor: h(26), status: "verifying", videoId: "v_ver", mode: "live" };
  d.insert(S().scheduledPosts).values([
    { ...base, id: "sp_ver_old", platform: "facebook_page_9", externalId: "VX1", publishedAt: h(25) }, // kênh đã gỡ khỏi hệ thống
    { ...base, id: "sp_ver_tt", platform: "tiktok", externalId: "VX2", publishedAt: h(25) }, // kênh chưa có hàm đọc lại
    { ...base, id: "sp_ver_new", platform: "facebook_page_9", externalId: "VX3", publishedAt: h(1) },
    { ...base, id: "sp_ver_noat", platform: "facebook_page_9", externalId: "VX4", publishedAt: null }, // bài cũ thiếu mốc gửi
  ]).run();
  globalThis.fetch = (async () => {
    throw new Error("mạng giả");
  }) as typeof fetch;
  const r = await pub.verifyPublishingPosts();
  for (const id of ["sp_ver_old", "sp_ver_tt", "sp_ver_noat"]) {
    assert.equal(row(id).status, "failed", id);
    assert.equal(guards.needsPageCheck(row(id)), true, `${id}: cần kiểm trang`);
    assert.match(row(id).error ?? "", /^Không xác minh được sau 24 giờ/);
  }
  assert.equal(row("sp_ver_new").status, "verifying", "chưa tới 24 giờ: còn chờ");
  assert.ok(r.pending >= 1);
});

test("3b (P3-2): bỏ cuộc xác minh 24 giờ mà bài THIẾU mã = lỗi mơ hồ: đăng lại chỉ OWNER kèm ghi chú; chặn bài anh em cùng trang", async () => {
  seedVideo("v_gu");
  db.getDb().insert(S().scheduledPosts).values({ id: "sp_gu", contentId: "", title: "Video v_gu", platform: "facebook", scheduledFor: new Date(Date.now() - 26 * 3_600_000).toISOString(), status: "verifying", videoId: "v_gu", mode: "live", targetPageId: "111", publishedAt: new Date(Date.now() - 25 * 3_600_000).toISOString() }).run();
  globalThis.fetch = (async () => {
    throw new Error("mạng giả");
  }) as typeof fetch;
  await pub.verifyPublishingPosts();
  const p = row("sp_gu");
  assert.equal(p.status, "failed");
  assert.equal(p.externalId, null);
  assert.equal(guards.needsPageCheck(p), true);
  assert.equal(guards.isAmbiguousFailure(p), true, "có thể đã lên trang");
  admin.setSetting("admin.email", "owner@baor.test");
  assert.match(pub.retryVideoPost("sp_gu").error ?? "", /chỉ OWNER/, "không ghi chú, không phải OWNER: không đăng lại");
  assert.match(pub.retryVideoPost("sp_gu", undefined, undefined, { email: "owner@baor.test" }).error ?? "", /kiểm tra trang/i, "OWNER thiếu ghi chú");
  // Bài anh em: lên lịch lại cùng video lên cùng trang (kể cả kênh khác cùng Page ID 111) bị chặn
  const again = pub.scheduleVideoPosts({ videoId: "v_gu", platforms: ["facebook_page_3"], whenIso: past(), caption: "Bình luận bên dưới", by: "t" });
  assert.equal(again.ok, false);
  assert.match(again.ok ? "" : again.error, /mơ hồ/);
  // Bài anh em đã có sẵn (dữ liệu cũ) tới giờ gửi: không gửi
  db.getDb().insert(S().scheduledPosts).values({ id: "sp_gu_sib", contentId: "", title: "Video v_gu", platform: "facebook_page_3", scheduledFor: past(), status: "scheduled", videoId: "v_gu", mode: "live", targetPageId: "111" }).run();
  const sends = fakeMeta();
  await pub.publishDueVideoPosts();
  assert.equal(sends.length, 0);
  assert.equal(row("sp_gu_sib").status, "cancelled");
  // OWNER kèm ghi chú: đăng lại được
  db.getDb().update(S().scheduledPosts).set({ status: "cancelled" }).where(eq(S().scheduledPosts.id, "sp_gu_sib")).run();
  assert.equal(pub.retryVideoPost("sp_gu", "Đã mở trang lúc 10:05, không thấy bài", undefined, { email: "owner@baor.test" }).ok, true);
});

// ---- 4. Nhãn lỗi ngắn ----

test("4: nhãn lỗi ngắn không treo dấu hai chấm (bài quá hạn)", () => {
  const short = (error: string, status = "overdue") => guards.postErrorShort({ status, error, externalId: null });
  assert.equal(short(`Quá giờ hẹn hơn ${guards.OVERDUE_AFTER_MS / 3_600_000} giờ: không tự đăng. Xếp lại giờ trước khi đăng.`), "Quá giờ hẹn hơn 6 giờ");
  assert.equal(short("Page ID đã đổi — kiểm lại kênh: lúc lên lịch là trang 111.", "failed"), "Page ID đã đổi — kiểm lại kênh");
  assert.equal(short("Token hết hạn. Kết nối lại.", "failed"), "Token hết hạn.");
  assert.equal(guards.postErrorShort({ status: "failed", error: `${guards.AMBIGUOUS_MARK} mất mạng`, externalId: null }), "Cần kiểm trang");
  assert.equal(guards.postErrorShort({ status: "failed", error: null, externalId: null }), null);
});

// ---- 5. Một danh sách ID mẫu ----

test("5: isSamplePost của cổng đăng bài là CÙNG hàm với src/lib/sample.ts (một danh sách ID mẫu)", () => {
  assert.equal(guards.isSamplePost, sample.isSamplePost);
  assert.equal(guards.isSamplePost({ id: "sp_md1" }), true);
  assert.equal(guards.isSamplePost({ id: "sp_x", contentId: "ct_md2" }), true);
  assert.equal(guards.isSamplePost({ id: "sp_x", videoId: "v_md1" }), true);
  assert.equal(guards.isSamplePost({ id: "sp_x", contentId: "ct_md2", videoId: "v_that" }), false, "video THẬT theo kịch bản mẫu");
});

// ---- 6. Bài kẹt "publishing" theo quyền gửi trong CSDL (claimed_by / claimed_at), không theo bộ nhớ từng tiến trình ----

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
function seedPublishing(id: string, claimedBy: string | null, claimedAt: string | null) {
  db.getDb().insert(S().scheduledPosts).values({ id, contentId: "", title: `Bài ${id}`, platform: "tiktok", scheduledFor: past(), status: "publishing", mode: "live", claimedBy, claimedAt }).run();
}

test("6a recoverStuckPublishing: quyền gửi còn sống của tiến trình KHÁC không bị báo kẹt; quyền quá hạn / của chính tiến trình mà không gửi / bài cũ không quyền → lỗi mơ hồ", () => {
  seedPublishing("sp_cl_live", "may-khac:42:abcd", ago(30_000)); // tiến trình khác đang gửi (nhịp 30 s trước)
  seedPublishing("sp_cl_dead", "may-khac:43:dead", ago(guards.CLAIM_STALE_MS + 60_000)); // tiến trình khác chết giữa lúc gửi
  seedPublishing("sp_cl_mine", guards.CLAIM_OWNER, ago(1_000)); // của tiến trình này nhưng không còn trong lượt gửi
  seedPublishing("sp_cl_legacy", null, null); // bài trước migration 0026
  seedPublishing("sp_cl_flight", guards.CLAIM_OWNER, ago(guards.CLAIM_STALE_MS * 3)); // tiến trình này đang gửi
  guards.inFlight.add("sp_cl_flight");
  try {
    assert.equal(guards.recoverStuckPublishing(), 3);
  } finally {
    guards.inFlight.delete("sp_cl_flight");
  }
  assert.equal(row("sp_cl_live").status, "publishing", "không báo động giả cho tiến trình khác đang gửi");
  assert.equal(row("sp_cl_flight").status, "publishing");
  for (const id of ["sp_cl_dead", "sp_cl_mine", "sp_cl_legacy"]) {
    assert.equal(row(id).status, "failed", id);
    assert.equal(guards.isAmbiguousFailure(row(id)), true, `${id}: lỗi mơ hồ, không tự đăng lại`);
  }
});

test("6b holdClaim đập nhịp claimed_at khi đang gửi; nhả xong thì bài còn 'publishing' của tiến trình này là kẹt", async () => {
  seedPublishing("sp_cl_beat", guards.CLAIM_OWNER, ago(guards.CLAIM_STALE_MS + 60_000));
  const before = row("sp_cl_beat").claimedAt!;
  const release = guards.holdClaim("sp_cl_beat", 30);
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(guards.recoverStuckPublishing(), 0, "đang gửi: không kẹt");
  assert.ok(row("sp_cl_beat").claimedAt! > before, "claimed_at được làm mới");
  release();
  assert.equal(guards.inFlight.has("sp_cl_beat"), false);
  assert.equal(guards.recoverStuckPublishing(), 1);
  assert.equal(row("sp_cl_beat").status, "failed");
});

test("6c HAI TIẾN TRÌNH: B giành bài + đập nhịp → lượt đăng của A không báo kẹt; B chết (hết nhịp) → quá hạn mới là lỗi mơ hồ", async () => {
  db.getDb().insert(S().scheduledPosts).values({ id: "sp_cl_b", contentId: "", title: "Bài B", platform: "tiktok", scheduledFor: new Date(Date.now() + 3_600_000).toISOString(), status: "scheduled", mode: "live" }).run();
  const b = await otherProcessClaims("sp_cl_b", 50, { beatMs: 100, lifeMs: 900 });
  await new Promise((r) => setTimeout(r, 400));
  const first = row("sp_cl_b").claimedAt!;
  assert.equal(row("sp_cl_b").claimedBy, "proc-B");
  await pub.publishDueVideoPosts(); // gọi recoverStuckPublishing — bản cũ (inFlight riêng tiến trình) đánh lỗi bài của B ở đây
  await text.publishDueTextPosts();
  assert.equal(row("sp_cl_b").status, "publishing", "B còn sống: không báo động giả");
  await b.done;
  assert.ok(row("sp_cl_b").claimedAt! > first, "B đã đập nhịp");
  assert.equal(guards.recoverStuckPublishing(), 0, "vừa hết nhịp: chưa quá hạn");
  assert.equal(guards.recoverStuckPublishing(Date.now() + guards.CLAIM_STALE_MS + 1_000), 1, "quá hạn nhịp → kẹt");
  assert.equal(guards.isAmbiguousFailure(row("sp_cl_b")), true);
});

test("6d HAI TIẾN TRÌNH: A thấy quyền của B quá hạn, nhưng B đang giữ khoá ghi và vừa đập nhịp → A chờ khoá, đọc lại trong khoá, KHÔNG đánh lỗi", async () => {
  seedPublishing("sp_cl_race", "proc-B", ago(guards.CLAIM_STALE_MS + 60_000));
  const b = await otherProcess("UPDATE scheduled_posts SET claimed_at = @now WHERE id = @id AND claimed_by = @owner", "sp_cl_race", 800);
  const t0 = Date.now();
  const n = guards.recoverStuckPublishing(); // đọc ngoài khoá thấy quá hạn → BEGIN IMMEDIATE chờ B → đọc lại: nhịp mới
  assert.ok(Date.now() - t0 >= 500, "A phải chờ khoá của B");
  await b.done;
  assert.equal(n, 0);
  assert.equal(row("sp_cl_race").status, "publishing");
});

// ---- 7. Bài chưa lưu trang đích (trước 0023 / kênh chưa có Page ID) lúc gửi ----

function seedLegacyVideoPost(videoId: string, id: string, platform: string) {
  seedVideo(videoId);
  db.getDb().insert(S().scheduledPosts).values({ id, contentId: "", title: `Video ${videoId}`, platform, scheduledFor: past(), status: "scheduled", videoId, mode: "live", dedupeKey: `${platform}:${videoId}`, targetPageId: null }).run();
}

test("7a bài chưa lưu trang, kênh có Page ID, không có dấu kênh từng đổi trang → đóng dấu trang hiện tại trong giao dịch giành quyền rồi gửi", async () => {
  config.writeIntegrationConfig("facebook_page_2", { ...FAKE, pageId: "202" });
  db.getDb().update(S().integrations).set({ connected: true }).where(eq(S().integrations.key, "facebook_page_2")).run();
  seedLegacyVideoPost("v_leg_ok", "sp_leg_ok", "facebook_page_2");
  const sends = fakeMeta();
  await pub.publishDueVideoPosts();
  assert.deepEqual(sends.map((u) => u.match(/\/(\d+)\/videos$/)?.[1]), ["202"]);
  assert.equal(row("sp_leg_ok").targetPageId, "202");
  assert.equal(row("sp_leg_ok").status, "verifying");
});

test("7b bài chưa lưu trang mà kênh TỪNG ở trang khác (bài khác cùng kênh lưu trang khác) → mơ hồ: không gửi, lỗi rõ; Đăng lại = trang hiện tại", async () => {
  config.writeIntegrationConfig("facebook_page_2", { ...FAKE, pageId: "203" }); // 7a để lại bài cùng kênh ở trang 202
  seedLegacyVideoPost("v_leg_amb", "sp_leg_amb", "facebook_page_2");
  const sends = fakeMeta();
  await pub.publishDueVideoPosts();
  assert.equal(sends.length, 0, "không đoán trang");
  assert.equal(row("sp_leg_amb").status, "failed");
  assert.match(row("sp_leg_amb").error ?? "", /^Page ID đã đổi — kiểm lại kênh/);
  assert.match(row("sp_leg_amb").error ?? "", /202/);
  assert.match(row("sp_leg_amb").error ?? "", /203/);
  assert.equal(guards.needsPageCheck(row("sp_leg_amb")), false, "chưa gửi gì");
  assert.equal(pub.retryVideoPost("sp_leg_amb").ok, true);
  assert.equal(row("sp_leg_amb").targetPageId, "203");
  await pub.publishDueVideoPosts();
  assert.deepEqual(sends.map((u) => u.match(/\/(\d+)\/videos$/)?.[1]), ["203"]);
});

test("7c bài chưa lưu trang, kênh Facebook chưa có Page ID → không gửi, lỗi rõ (nhập Page ID rồi Đăng lại)", async () => {
  config.writeIntegrationConfig("facebook_page_4", { ...FAKE, pageId: "" });
  db.getDb().update(S().integrations).set({ connected: true }).where(eq(S().integrations.key, "facebook_page_4")).run();
  seedLegacyVideoPost("v_leg_none", "sp_leg_none", "facebook_page_4");
  const sends = fakeMeta();
  await pub.publishDueVideoPosts();
  assert.equal(sends.length, 0);
  assert.equal(row("sp_leg_none").status, "failed");
  assert.match(row("sp_leg_none").error ?? "", /chưa có Page ID/);
  assert.equal(pub.missingPageReason({ id: "x", platform: "tiktok", targetPageId: null }), null, "kênh không phải Facebook: không có khái niệm trang");
});

// ---- 8. "Gỡ khoá kênh": bài đã lên trang nhập nhầm ----

test("8 Gỡ khoá kênh: chỉ OWNER, chỉ khi trang bài ≠ Page ID kênh hiện tại; bài giữ nguyên + ghi lý do + nhật ký; trang cũ vẫn chặn trùng", async () => {
  admin.setSetting("admin.email", "owner@baor.test");
  const owner = { email: "owner@baor.test", name: "OWNER" };
  seedVideo("v_lock");
  assert.equal(pub.scheduleVideoPosts({ videoId: "v_lock", platforms: ["facebook"], whenIso: past(), caption: "Bình luận bên dưới", by: "t" }).ok, true);
  const id = pub.videoPostsFor("v_lock")[0].id;
  // Đã lên trang 111 (Page ID nhập nhầm) và đã xác minh
  db.getDb().update(S().scheduledPosts).set({ status: "published", externalId: "VID_WRONG", permalink: "https://fb.test/x", verifiedAt: past() }).where(eq(S().scheduledPosts.id, id)).run();
  assert.match(pub.channelLockReleaseBlock(row(id)) ?? "", /đúng trang/, "kênh chưa sửa Page ID: khoá đúng, không gỡ");
  assert.equal(pub.releaseChannelLock(id, owner).ok, false);
  // OWNER sửa Page ID kênh thành trang đúng 999 → kênh vẫn bị khoá bởi bài trang nhầm
  config.writeIntegrationConfig("facebook_page", { ...FAKE, pageId: "999" });
  const blocked = pub.scheduleVideoPosts({ videoId: "v_lock", platforms: ["facebook"], whenIso: past(), caption: "Bình luận bên dưới", by: "t" });
  assert.equal(blocked.ok, false);
  assert.match(blocked.ok ? "" : blocked.error, /Mỗi kênh một bài/);
  assert.equal(pub.channelLockReleaseBlock(row(id)), null);
  assert.match(pub.releaseChannelLock(id, { email: "staff@baor.test" }).error ?? "", /Chỉ OWNER/);
  assert.equal(row(id).dedupeKey, "facebook:v_lock");
  assert.equal(pub.releaseChannelLock(id, owner).ok, true);
  const after = row(id);
  assert.equal(after.status, "published", "bài giữ nguyên");
  assert.equal(after.externalId, "VID_WRONG");
  assert.equal(after.dedupeKey, null);
  assert.match(after.lockReleasedNote ?? "", /111/);
  assert.match(after.lockReleasedNote ?? "", /999/);
  assert.match(after.lockReleasedNote ?? "", /OWNER/);
  const log = db.getDb().select().from(S().activity).all().filter((a) => /gỡ khoá kênh/.test(a.message));
  assert.ok(log.length >= 1, "ghi nhật ký");
  assert.equal(pub.releaseChannelLock(id, owner).ok, false, "gỡ lần hai: không còn khoá");
  // Trang cũ 111 (Fanpage 3) vẫn chặn đăng trùng; trang đúng 999 lên lịch được
  const old = pub.scheduleVideoPosts({ videoId: "v_lock", platforms: ["facebook_page_3"], whenIso: past(), caption: "Bình luận bên dưới", by: "t" });
  assert.equal(old.ok, false, "trang 111 đã có video này");
  assert.equal(pub.scheduleVideoPosts({ videoId: "v_lock", platforms: ["facebook"], whenIso: past(), caption: "Bình luận bên dưới", by: "t" }).ok, true);
  const fresh = pub.videoPostsFor("v_lock").find((p) => p.id !== id)!;
  assert.equal(fresh.targetPageId, "999");
  assert.equal(fresh.dedupeKey, "facebook:v_lock");
  // Bài đang chờ / bài thử không gỡ được
  assert.match(pub.channelLockReleaseBlock(fresh) ?? "", /chưa gửi xong/);
});

// ---- 9. Lên lịch nguyên tử giữa nhiều tiến trình ----

test("9 HAI TIẾN TRÌNH lên lịch: B đang giữ khoá, vừa chèn bài cùng nội dung cùng trang (chưa commit) → A kiểm LẠI trong khoá, không tạo bài trùng", async () => {
  seedContent("ct_sched_race");
  const insertB = "INSERT INTO scheduled_posts (id, content_id, title, platform, scheduled_for, status, attempts, mode, dedupe_key, target_page_id) VALUES (@id, 'ct_sched_race', 'Bài B', 'facebook_page_3', @now, 'scheduled', 0, 'live', 'facebook_page_3:ct:ct_sched_race', '111')";
  const b = await otherProcess(insertB, "sp_sched_b", 800);
  const r = text.scheduleTextPosts({ contentId: "ct_sched_race", platforms: ["facebook"], whenIso: new Date(Date.now() + 3_600_000).toISOString(), by: "t" });
  await b.done;
  assert.equal(r.ok, false, "bản kiểm ngoài khoá thấy trang trống; kiểm lại trong khoá thấy bài B");
  assert.match(r.ok ? "" : r.error, /Không đăng trùng/);
  const rows = db.getDb().select().from(S().scheduledPosts).where(eq(S().scheduledPosts.contentId, "ct_sched_race")).all();
  assert.deepEqual(rows.map((x) => x.id), ["sp_sched_b"]);
});

// ---- 10. Lỗi giữa giành quyền và gọi nền tảng (phản biện P1) ----

test("10 startRun lỗi SAU khi giành quyền (bài chữ + video): không gửi, không rò timer / inFlight, bài về 'chờ đăng' (không kẹt, không mơ hồ); lượt sau đăng được", async () => {
  seedContent("ct_leak");
  db.getDb().insert(S().scheduledPosts).values({ id: "sp_leak_t", contentId: "ct_leak", title: "Bài ct_leak", platform: "facebook", scheduledFor: past(), status: "scheduled", mode: "live", targetPageId: "111" }).run();
  seedVideo("v_leak");
  db.getDb().insert(S().scheduledPosts).values({ id: "sp_leak_v", contentId: "", title: "Video v_leak", platform: "facebook_page_3", scheduledFor: past(), status: "scheduled", videoId: "v_leak", mode: "live", dedupeKey: "facebook_page_3:v_leak", targetPageId: "111" }).run();
  const sends = fakeMeta();
  const timers = () => process.getActiveResourcesInfo().filter((r) => r === "Timeout").length;
  const t0 = timers();
  const sqlite = db.getSqlite();
  sqlite.exec("ALTER TABLE sync_runs RENAME TO sync_runs_hong"); // startRun ném "no such table"
  try {
    const rt = await text.publishDueTextPosts();
    const rv = await pub.publishDueVideoPosts();
    assert.ok(rt.skipped >= 1 && rv.skipped >= 1);
  } finally {
    sqlite.exec("ALTER TABLE sync_runs_hong RENAME TO sync_runs");
  }
  assert.equal(sends.length, 0, "chưa gửi gì");
  for (const id of ["sp_leak_t", "sp_leak_v"]) {
    assert.equal(row(id).status, "scheduled", `${id}: về chờ đăng`);
    assert.equal(row(id).attempts, 0, `${id}: hoàn số lần thử`);
    assert.equal(row(id).claimedBy, null);
    assert.match(row(id).error ?? "", /^Chưa gửi/);
    assert.equal(guards.inFlight.has(id), false);
  }
  assert.equal(timers(), t0, "không rò timer đập nhịp");
  assert.equal(guards.recoverStuckPublishing(Date.now() + guards.CLAIM_STALE_MS * 2), 0, "không bài nào kẹt");
  await text.publishDueTextPosts();
  await pub.publishDueVideoPosts();
  assert.equal(sends.length, 2, "lượt sau đăng bình thường");
  assert.equal(row("sp_leak_t").status, "verifying");
  assert.equal(row("sp_leak_v").status, "verifying");
});
