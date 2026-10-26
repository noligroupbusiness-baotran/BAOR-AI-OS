// Nợ "lên lịch 2 lần riêng cùng Page ID có thể trùng bài": chống trùng phải tính theo TRANG đích (Page ID), không theo tên kênh.
// Trước đây chỉ bắt hai kênh cùng Page ID khi chọn chung MỘT lần lên lịch; lên lịch riêng từng lần (hoặc "Thử lại" bài lỗi cũ
// sau khi đã lên lịch bài thay thế) tạo hai bài cho cùng một trang. CSDL tạm; không gọi nền tảng (chỉ lên lịch, không chạy đăng).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { eq } from "drizzle-orm";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "baor-samepage-"));
process.env.DATA_DIR = tmp;
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.AUTH_SECRET = "test-secret-".padEnd(40, "x");
process.env.BAOR_VIDEO_WORKER = "off";

let db: typeof import("../src/db");
let pub: typeof import("../src/lib/publishing/video");
let config: typeof import("../src/lib/connectors/config");
let admin: typeof import("../src/lib/admin");

before(async () => {
  db = await import("../src/db");
  pub = await import("../src/lib/publishing/video");
  config = await import("../src/lib/connectors/config");
  admin = await import("../src/lib/admin");
  config.ensureFanpageRows();
  config.writeIntegrationConfig("facebook_page", { pageId: "111", pageToken: "tok-gia-1", appId: "222", userToken: "u-gia-1" });
  // Nhập nhầm: Fanpage 3 cũng là trang 111
  config.writeIntegrationConfig("facebook_page_3", { pageId: "111", pageToken: "tok-gia-3", appId: "222", userToken: "u-gia-3" });
});
after(() => {
  admin.setSetting("publishing.dryRun", "1");
  fs.rmSync(tmp, { recursive: true, force: true });
});

function seed(id: string) {
  const d = db.getDb();
  const now = new Date().toISOString();
  fs.mkdirSync(path.join(tmp, "uploads"), { recursive: true });
  const out = path.join(tmp, "uploads", `${id}.mp4`);
  spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=108x192:r=10:d=1", "-pix_fmt", "yuv420p", out]);
  d.insert(db.schema.uploads).values({ id: `up_${id}`, kind: "video", name: `${id}.mp4`, fileName: `${id}.mp4`, mime: "video/mp4", size: fs.statSync(out).size, meta: "{}", uploadedBy: "t", createdAt: now }).run();
  d.insert(db.schema.videos).values({ id, title: `Video ${id}`, contentId: null, agent: "t", status: "approved", platforms: "[]", version: 1, note: "", uploadId: `up_${id}`, updatedAt: now }).run();
}

const later = () => new Date(Date.now() + 3_600_000).toISOString();
const schedule = (videoId: string, platform: string) => pub.scheduleVideoPosts({ videoId, platforms: [platform], whenIso: later(), caption: "Bình luận bên dưới", by: "t" });
const errOf = (r: ReturnType<typeof schedule>) => (r.ok ? "" : r.error);
const pending = (videoId: string) => pub.videoPostsFor(videoId).filter((p) => p.status === "scheduled");

test("đăng thật: lên lịch RIÊNG hai lần lên hai kênh cùng Page ID → lần hai bị từ chối, nêu rõ cùng trang", () => {
  admin.setSetting("publishing.dryRun", "0");
  try {
    seed("v_two");
    assert.deepEqual(schedule("v_two", "facebook"), { ok: true, created: 1, mode: "live" });
    const r = schedule("v_two", "facebook_page_3");
    assert.equal(r.ok, false, "kênh khác nhưng cùng trang 111: không được tạo bài thứ hai");
    assert.match(errOf(r), /trùng/);
    assert.match(errOf(r), /111/);
    assert.equal(pub.videoPostsFor("v_two").length, 1);
    // Ngược chiều cũng vậy
    seed("v_two_b");
    assert.equal(schedule("v_two_b", "facebook_page_3").ok, true);
    assert.equal(schedule("v_two_b", "facebook").ok, false);
    // Sửa đúng Page ID cho Fanpage 3 → là trang khác, lên lịch được
    config.writeIntegrationConfig("facebook_page_3", { pageId: "444", pageToken: "tok-gia-3", appId: "222", userToken: "u-gia-3" });
    assert.equal(schedule("v_two", "facebook_page_3").ok, true, "trang 444 khác trang 111");
  } finally {
    config.writeIntegrationConfig("facebook_page_3", { pageId: "111", pageToken: "tok-gia-3", appId: "222", userToken: "u-gia-3" });
    admin.setSetting("publishing.dryRun", "1");
  }
});

test("đăng thật: bài lỗi cũ đã có bài thay thế → “Thử lại” bài cũ bị từ chối (không thành hai bài chờ cùng trang)", () => {
  admin.setSetting("publishing.dryRun", "0");
  try {
    seed("v_retry");
    assert.equal(schedule("v_retry", "facebook").ok, true);
    const first = pub.videoPostsFor("v_retry")[0];
    db.getDb().update(db.schema.scheduledPosts).set({ status: "failed", error: "Token hết hạn" }).where(eq(db.schema.scheduledPosts.id, first.id)).run();
    assert.equal(schedule("v_retry", "facebook").ok, true, "bài lỗi rõ ràng: lên lịch bài thay thế được");
    const r = pub.retryVideoPost(first.id);
    assert.equal(r.ok, false, "đã có bài thay thế đang chờ cùng trang");
    assert.match(r.error ?? "", /trùng/);
    assert.equal(pending("v_retry").length, 1);
    // Bài thay thế ở kênh khác nhưng cùng Page ID cũng chặn
    seed("v_retry_x");
    assert.equal(schedule("v_retry_x", "facebook").ok, true);
    const a = pub.videoPostsFor("v_retry_x")[0];
    db.getDb().update(db.schema.scheduledPosts).set({ status: "failed", error: "Token hết hạn" }).where(eq(db.schema.scheduledPosts.id, a.id)).run();
    assert.equal(schedule("v_retry_x", "facebook_page_4").ok, true, "Fanpage 4 chưa có Page ID: kênh riêng");
    config.writeIntegrationConfig("facebook_page_4", { pageId: "111", pageToken: "tok-gia-4", appId: "222", userToken: "u-gia-4" });
    assert.equal(pub.retryVideoPost(a.id).ok, false, "Fanpage 4 giờ cùng trang 111 với bài lỗi");
  } finally {
    config.writeIntegrationConfig("facebook_page_4", {});
    admin.setSetting("publishing.dryRun", "1");
  }
});

test("chế độ thử: lên lịch lại khi bài thử cùng trang còn đang chờ → từ chối có lý do (giống đăng thật); chạy xong / huỷ thì lên lịch lại được", async () => {
  assert.equal(pub.isDryRun(), true);
  seed("v_dry");
  assert.deepEqual(schedule("v_dry", "facebook"), { ok: true, created: 1, mode: "dry_run" });
  const again = schedule("v_dry", "facebook");
  assert.equal(again.ok, false, "cùng kênh, bài thử còn chờ");
  assert.match(errOf(again), /đang chờ/);
  assert.match(errOf(again), /Huỷ/);
  assert.equal(schedule("v_dry", "facebook_page_3").ok, false, "kênh khác cùng Page ID 111");
  assert.equal(pending("v_dry").length, 1);
  // Huỷ bài đang chờ → lên lịch lại được (đổi giờ / caption)
  assert.equal(pub.cancelVideoPost(pending("v_dry")[0].id).ok, true);
  assert.equal(schedule("v_dry", "facebook").ok, true);
  // Bài thử đã chạy xong (dry_run) không chặn lần thử sau
  db.getDb().update(db.schema.scheduledPosts).set({ scheduledFor: new Date(Date.now() - 60_000).toISOString() }).where(eq(db.schema.scheduledPosts.videoId, "v_dry")).run();
  await pub.publishDueVideoPosts();
  assert.equal(pending("v_dry").length, 0);
  assert.equal(schedule("v_dry", "facebook").ok, true);
  // Trang khác hẳn (Fanpage 2 chưa có Page ID) không bị chặn
  assert.equal(schedule("v_dry", "facebook_page_2").ok, true);
});

test("đăng thật: OWNER sửa Page ID kênh SAU khi đã đăng → chống trùng vẫn theo trang LÚC ĐĂNG (không đăng trùng lên trang cũ)", () => {
  admin.setSetting("publishing.dryRun", "0");
  try {
    seed("v_moved");
    assert.equal(schedule("v_moved", "facebook").ok, true);
    const first = pub.videoPostsFor("v_moved")[0];
    assert.equal(first.targetPageId, "111", "lên lịch: lưu Page ID đích vào bài");
    // Bài đã lên trang 111
    db.getDb().update(db.schema.scheduledPosts).set({ status: "published", externalId: "EXT_MOVED", permalink: "https://fb.example/1" }).where(eq(db.schema.scheduledPosts.id, first.id)).run();
    // Sau đó OWNER đổi Page ID kênh gốc sang 555 — bài cũ vẫn nằm trên trang 111
    config.writeIntegrationConfig("facebook_page", { pageId: "555", pageToken: "tok-gia-1", appId: "222", userToken: "u-gia-1" });
    const r = schedule("v_moved", "facebook_page_3");
    assert.equal(r.ok, false, "Fanpage 3 vẫn là trang 111, nơi video đã lên");
    assert.match(errOf(r), /trùng/);
    assert.match(errOf(r), /111/);
    // Cùng kênh gốc (giờ trang 555): luật một video một bài mỗi kênh vẫn giữ — báo lỗi rõ, không ném lỗi trùng khoá CSDL
    const same = schedule("v_moved", "facebook");
    assert.equal(same.ok, false);
    assert.match(errOf(same), /trùng/);
    assert.match(errOf(same), /EXT_MOVED/);
    assert.equal(pub.videoPostsFor("v_moved").length, 1);
  } finally {
    config.writeIntegrationConfig("facebook_page", { pageId: "111", pageToken: "tok-gia-1", appId: "222", userToken: "u-gia-1" });
    admin.setSetting("publishing.dryRun", "1");
  }
});

test("đăng thật: bài CÒN CHỜ đi theo Page ID kênh hiện tại (lúc đăng mới gửi) — sửa Page ID trước giờ đăng thì tính trang mới", () => {
  admin.setSetting("publishing.dryRun", "0");
  try {
    seed("v_wait");
    assert.equal(schedule("v_wait", "facebook").ok, true);
    config.writeIntegrationConfig("facebook_page", { pageId: "555", pageToken: "tok-gia-1", appId: "222", userToken: "u-gia-1" });
    // Bài chờ sẽ lên trang 555 → Fanpage 3 (111) là trang khác
    assert.equal(schedule("v_wait", "facebook_page_3").ok, true);
    // Fanpage 4 nhập 555 → trùng trang với bài chờ của kênh gốc
    config.writeIntegrationConfig("facebook_page_4", { pageId: "555", pageToken: "tok-gia-4", appId: "222", userToken: "u-gia-4" });
    const r = schedule("v_wait", "facebook_page_4");
    assert.equal(r.ok, false);
    assert.match(errOf(r), /555/);
  } finally {
    config.writeIntegrationConfig("facebook_page_4", {});
    config.writeIntegrationConfig("facebook_page", { pageId: "111", pageToken: "tok-gia-1", appId: "222", userToken: "u-gia-1" });
    admin.setSetting("publishing.dryRun", "1");
  }
});

test("bài cũ chưa lưu Page ID → dùng cấu hình kênh hiện tại như trước", () => {
  admin.setSetting("publishing.dryRun", "0");
  try {
    seed("v_legacy");
    assert.equal(schedule("v_legacy", "facebook").ok, true);
    const first = pub.videoPostsFor("v_legacy")[0];
    db.getDb().update(db.schema.scheduledPosts).set({ targetPageId: null }).where(eq(db.schema.scheduledPosts.id, first.id)).run();
    assert.equal(schedule("v_legacy", "facebook_page_3").ok, false, "kênh gốc hiện là 111 = Fanpage 3");
  } finally {
    admin.setSetting("publishing.dryRun", "1");
  }
});

test("lúc đăng: Page ID kênh đổi sau lúc lên lịch → KHÔNG gửi lên trang mới (kiểm lại kênh); bài cũ chưa lưu trang thì lưu trang lúc gửi (fetch giả)", async () => {
  const d = db.getDb();
  admin.setSetting("publishing.dryRun", "0");
  d.update(db.schema.integrations).set({ connected: true }).where(eq(db.schema.integrations.key, "facebook_page")).run();
  const real = globalThis.fetch;
  const calls: string[] = [];
  try {
    seed("v_pubnow");
    assert.equal(pub.scheduleVideoPosts({ videoId: "v_pubnow", platforms: ["facebook"], whenIso: new Date(Date.now() - 60_000).toISOString(), caption: "Bình luận bên dưới", by: "t" }).ok, true);
    const id = pub.videoPostsFor("v_pubnow")[0].id;
    assert.equal(pub.videoPostsFor("v_pubnow")[0].targetPageId, "111");
    // OWNER sửa Page ID giữa lúc lên lịch và lúc đăng (trước đây: bài lặng lẽ đăng lên trang 666)
    config.writeIntegrationConfig("facebook_page", { pageId: "666", pageToken: "tok-gia-1", appId: "222", userToken: "u-gia-1" });
    globalThis.fetch = (async (url: string) => {
      calls.push(String(url));
      throw new Error("mạng giả: không gọi nền tảng");
    }) as typeof fetch;
    await pub.publishDueVideoPosts();
    assert.equal(calls.length, 0, "không gửi lệnh đăng khi trang kênh khác trang lúc lên lịch");
    const p = pub.videoPostsFor("v_pubnow")[0];
    assert.equal(p.status, "failed");
    assert.match(p.error ?? "", /Page ID đã đổi/);
    // Bài cũ chưa lưu trang (trước khi có target_page_id) mà CSDL có dấu kênh từng ở trang khác (bài khác của kênh lưu trang 111):
    // không đoán trang — lỗi rõ, không gửi (missingPageReason; không mơ hồ thì đóng dấu trang rồi gửi: publishing-send-guard 7a)
    d.update(db.schema.scheduledPosts).set({ status: "scheduled", error: null, targetPageId: null }).where(eq(db.schema.scheduledPosts.id, id)).run();
    d.insert(db.schema.scheduledPosts).values({ id: "sp_pubnow_old", contentId: "", title: "cũ", platform: "facebook", scheduledFor: new Date(Date.now() - 86_400_000).toISOString(), status: "published", mode: "live", targetPageId: "111" }).run();
    await pub.publishDueVideoPosts();
    assert.equal(calls.length, 0, "bài chưa lưu trang, kênh từng là trang 111: không gửi lên 666");
    assert.match(pub.videoPostsFor("v_pubnow")[0].error ?? "", /chưa lưu trang đích.*111.*666/);
    // OWNER kiểm kênh rồi Đăng lại = trang hiện tại: đi tới bước gửi, lưu trang thật nhận lệnh đăng
    assert.equal(pub.retryVideoPost(id).ok, true);
    await pub.publishDueVideoPosts();
    assert.ok(calls.length > 0, "đã đi tới bước gửi lệnh đăng");
    assert.equal(pub.videoPostsFor("v_pubnow")[0].targetPageId, "666", "lúc đăng: lưu trang thật nhận lệnh đăng");
  } finally {
    globalThis.fetch = real;
    d.update(db.schema.integrations).set({ connected: false }).where(eq(db.schema.integrations.key, "facebook_page")).run();
    config.writeIntegrationConfig("facebook_page", { pageId: "111", pageToken: "tok-gia-1", appId: "222", userToken: "u-gia-1" });
    admin.setSetting("publishing.dryRun", "1");
  }
});
