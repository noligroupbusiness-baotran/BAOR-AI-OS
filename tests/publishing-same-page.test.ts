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
