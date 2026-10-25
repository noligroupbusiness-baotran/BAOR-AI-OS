// Tổng kho video ngắn (Personal Brand System bước 5): Chưa đăng / Đã đăng / gỡ tệp sau khi đăng thật quá hạn; video OWNER tự edit vào
// thẳng kho. CSDL + DATA_DIR tạm; không gọi nền tảng nào.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "baor-video-library-"));
process.env.DATA_DIR = tmp;
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.AUTH_SECRET = "test-secret-".padEnd(40, "x");
process.env.BAOR_VIDEO_WORKER = "off";
process.env.ADMIN_EMAIL = "owner@example.test";

let db: typeof import("../src/db");
let lib: typeof import("../src/lib/videos/library");
let intake: typeof import("../src/lib/video/source-intake");
let uploads: typeof import("../src/lib/uploads");
let admin: typeof import("../src/lib/admin");

before(async () => {
  db = await import("../src/db");
  lib = await import("../src/lib/videos/library");
  intake = await import("../src/lib/video/source-intake");
  uploads = await import("../src/lib/uploads");
  admin = await import("../src/lib/admin");
  admin.setSetting("admin.email", "owner@example.test");
});

const now = Date.parse("2026-10-25T10:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();

function video(id: string, status = "approved") {
  const d = db.getDb();
  const up = `up_${id}`;
  fs.writeFileSync(path.join(uploads.uploadsDir(), `${up}.mp4`), "x".repeat(1000));
  d.insert(db.schema.uploads).values({ id: up, kind: "video", name: `${id}.mp4`, fileName: `${up}.mp4`, size: 1000, createdAt: iso(now) }).run();
  d.insert(db.schema.videos).values({ id, title: `Video ${id}`, status, uploadId: up, updatedAt: iso(now) }).run();
  const jd = path.join(tmp, "video-jobs", id, "v1");
  fs.mkdirSync(jd, { recursive: true });
  fs.writeFileSync(path.join(jd, "preview.mp4"), "p".repeat(500));
  fs.writeFileSync(path.join(jd, "report.json"), "{}");
  const raw = `raw_${id}`;
  fs.writeFileSync(path.join(uploads.uploadsDir(), `${raw}.mov`), "r".repeat(3000));
  d.insert(db.schema.uploads).values({ id: raw, kind: "video", name: `${id}.mov`, fileName: `${raw}.mov`, size: 3000, createdAt: iso(now) }).run();
  fs.writeFileSync(path.join(jd, "job.json"), JSON.stringify({ masterUploadId: up, sourceUploadId: raw }));
  return { up, jd };
}

function post(videoId: string, status: string, mode: string, publishedAt: string | null) {
  db.getDb()
    .insert(db.schema.scheduledPosts)
    .values({ id: `p_${videoId}_${status}_${mode}`, contentId: "", title: "bài", platform: "facebook", scheduledFor: iso(now), status, mode, videoId, publishedAt, permalink: status === "published" ? "https://facebook.com/x" : null } as typeof db.schema.scheduledPosts.$inferInsert)
    .run();
}

test("mốc bật tự gỡ đặt từ lần đầu (không áp về trước)", () => {
  admin.setSetting("video.purgeSince", iso(now - 30 * 24 * 3_600_000));
  assert.equal(lib.purgeSince(), iso(now - 30 * 24 * 3_600_000));
});

test("kho chỉ gồm video đã duyệt; bài chế độ thử KHÔNG tính là đã đăng", () => {
  video("v_a");
  video("v_b", "review");
  post("v_a", "dry_run", "dry_run", null);
  const rows = lib.libraryRows();
  assert.deepEqual(rows.map((r) => r.id), ["v_a"]);
  assert.equal(rows[0].state, "unposted");
});

test("đăng thật → Đã đăng (mục xoá), hạn gỡ = lúc đăng + 24 giờ; chưa tới hạn thì không gỡ", () => {
  const { up, jd } = video("v_c");
  post("v_c", "published", "live", iso(now - 2 * 3_600_000));
  const r = lib.libraryRows().find((x) => x.id === "v_c")!;
  assert.equal(r.state, "posted");
  assert.equal(r.purgeDueAt, iso(now + 22 * 3_600_000));
  assert.deepEqual(lib.purgePostedVideos(now), { videos: 0, bytes: 0 });
  assert.ok(fs.existsSync(path.join(uploads.uploadsDir(), `${up}.mp4`)));
  assert.ok(fs.existsSync(path.join(jd, "preview.mp4")));
});

test("quá hạn → gỡ tệp video (bản chính + bản dựng), GIỮ báo cáo / bản ghi / link bài; chạy lại không gỡ lần nữa", () => {
  const { up, jd } = video("v_d");
  post("v_d", "published", "live", iso(now - 25 * 3_600_000));
  const r = lib.purgePostedVideos(now);
  assert.equal(r.videos, 1);
  assert.equal(r.bytes, 1500);
  assert.equal(fs.existsSync(path.join(uploads.uploadsDir(), `${up}.mp4`)), false);
  assert.equal(fs.existsSync(path.join(jd, "preview.mp4")), false);
  assert.ok(fs.existsSync(path.join(jd, "report.json")));
  assert.ok(fs.existsSync(path.join(uploads.uploadsDir(), "raw_v_d.mov")), "tệp quay gốc (RAW) giữ lại để dựng lại");
  const row = lib.libraryRows().find((x) => x.id === "v_d")!;
  assert.equal(row.state, "purged");
  assert.equal(row.posts[0].permalink, "https://facebook.com/x");
  assert.equal(lib.purgePostedVideos(now).videos, 0);
  assert.ok(fs.existsSync(path.join(uploads.uploadsDir(), "up_v_c.mp4")), "video chưa tới hạn không bị đụng");
});

test("tắt tự gỡ tệp (video.purgePosted = 0) → không gỡ", () => {
  const { up } = video("v_e");
  post("v_e", "published", "live", iso(now - 48 * 3_600_000));
  admin.setSetting("video.purgePosted", "0");
  assert.equal(lib.purgePostedVideos(now).videos, 0);
  assert.ok(fs.existsSync(path.join(uploads.uploadsDir(), `${up}.mp4`)));
  admin.setSetting("video.purgePosted", "1");
});

test("video tự edit: OWNER tải lên → vào thẳng kho (Tự edit); người khác tải → Chờ kiểm tra", () => {
  const mk = (name: string) => {
    const id = intake.newUploadId();
    const p = path.join(uploads.uploadsDir(), `${id}.mp4`);
    fs.writeFileSync(p, "v");
    return { tmpPath: p, uploadId: id, original: name, ext: ".mp4", size: 1, params: { cut: false, contentId: null, final: true } };
  };
  const a = intake.registerSource({ ...mk("tu-edit.mp4"), by: { name: "OWNER", email: "Owner@example.test" } });
  const b = intake.registerSource({ ...mk("nhan-su.mp4"), by: { name: "Nhân sự", email: "staff@example.test" } });
  const va = db.getDb().select().from(db.schema.videos).where(eq(db.schema.videos.id, a.videoId)).get()!;
  const vb = db.getDb().select().from(db.schema.videos).where(eq(db.schema.videos.id, b.videoId)).get()!;
  assert.equal(va.status, "approved");
  assert.equal(va.origin, "self_edit");
  assert.equal(vb.status, "review");
  const row = lib.libraryRows().find((x) => x.id === a.videoId)!;
  assert.equal(row.origin, "self_edit");
  assert.equal(row.state, "unposted");
});

test("video còn bài khác cần tệp (đang chờ đăng kênh khác / lỗi chưa lên nền tảng) → KHÔNG gỡ (phản biện P2-1)", () => {
  const { up } = video("v_f");
  post("v_f", "published", "live", iso(now - 48 * 3_600_000));
  db.getDb().insert(db.schema.scheduledPosts).values({ id: "p_v_f_tiktok", contentId: "", title: "bài", platform: "tiktok", scheduledFor: iso(now + 3_600_000), status: "scheduled", mode: "live", videoId: "v_f" } as typeof db.schema.scheduledPosts.$inferInsert).run();
  assert.equal(lib.libraryRows().find((x) => x.id === "v_f")!.purgeDueAt, null);
  lib.purgePostedVideos(now);
  assert.ok(fs.existsSync(path.join(uploads.uploadsDir(), `${up}.mp4`)));
});

test("video đăng TRƯỚC mốc bật tính năng → không gỡ (không áp về trước khi lên production)", () => {
  const { up } = video("v_g");
  post("v_g", "published", "live", iso(now - 40 * 24 * 3_600_000));
  assert.equal(lib.libraryRows().find((x) => x.id === "v_g")!.purgeDueAt, null);
  lib.purgePostedVideos(now);
  assert.ok(fs.existsSync(path.join(uploads.uploadsDir(), `${up}.mp4`)));
});
