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

/** "Tiến trình B": mở CÙNG tệp CSDL, BEGIN IMMEDIATE, giành bài `id` ("publishing"), giữ khoá `holdMs` rồi COMMIT. */
function otherProcessClaims(id: string, holdMs: number): Promise<{ done: Promise<void> }> {
  const code = `
    const Database = require("better-sqlite3");
    const db = new Database(process.env.T_DB);
    db.exec("BEGIN IMMEDIATE");
    db.prepare("UPDATE scheduled_posts SET status = 'publishing', attempts = attempts + 1 WHERE id = ? AND status = 'scheduled'").run(process.env.T_ID);
    process.stdout.write("locked\\n");
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Number(process.env.T_HOLD));
    db.exec("COMMIT");
    db.close();`;
  const child = spawn(process.execPath, ["-e", code], { cwd: process.cwd(), env: { ...process.env, T_DB: process.env.DATABASE_PATH, T_ID: id, T_HOLD: String(holdMs) }, stdio: ["ignore", "pipe", "inherit"] });
  const done = new Promise<void>((res, rej) => child.on("exit", (c) => (c === 0 ? res() : rej(new Error(`tiến trình B thoát ${c}`)))));
  return new Promise((res, rej) => {
    child.stdout.on("data", (b: Buffer) => b.toString().includes("locked") && res({ done }));
    child.on("error", rej);
  });
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
