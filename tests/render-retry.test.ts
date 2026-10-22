// S5: tự thử lại khi dựng lỗi tạm thời (một lần), không thử lại lỗi người dùng / mất nguồn / quá giờ. CSDL tạm, python giả.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "baor-retry-"));
process.env.DATA_DIR = tmp;
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.AUTH_SECRET = "test-secret-".padEnd(40, "x");
process.env.BAOR_VIDEO_WORKER = "off";

let db: typeof import("../src/db");
let jobs: typeof import("../src/lib/video/jobs");

before(async () => {
  db = await import("../src/db");
  jobs = await import("../src/lib/video/jobs");
});

test("phân loại lỗi: tạm thời thì thử lại; dừng tay / mất nguồn / quá giờ thì không", () => {
  assert.equal(jobs.isRetryableRenderError("ffmpeg: Cannot allocate memory"), true);
  assert.equal(jobs.isRetryableRenderError("Bộ dựng không tạo ra bản chính"), true);
  assert.equal(jobs.isRetryableRenderError("Đã dừng theo yêu cầu"), false);
  assert.equal(jobs.isRetryableRenderError("Không tìm thấy tệp nguồn trong kho tải lên"), false);
  assert.equal(jobs.isRetryableRenderError("Dựng quá 90 phút, đã dừng"), false);
  assert.equal(jobs.isRetryableRenderError("Thiếu font Times New Roman Italic.ttf"), false, "lỗi cấu hình chắc chắn lặp lại");
});

test("bộ dựng sập (python giả) → tự xếp hàng thử lại đúng 1 lần, lần 2 vẫn lỗi thì báo lỗi kèm số lần đã thử", async () => {
  const d = db.getDb();
  fs.mkdirSync(path.join(tmp, "uploads"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "uploads", "src.mp4"), "x");
  d.insert(db.schema.uploads).values({ id: "up_src", kind: "video", name: "src.mp4", fileName: "src.mp4", mime: "video/mp4", size: 1, meta: "{}", uploadedBy: "t", createdAt: new Date().toISOString() }).run();
  const vid = jobs.createVideoFromSource({ title: "Nguồn", sourceUploadId: "up_src", cutSilence: false, by: "t", start: true });
  const fake = path.join(tmp, "fake-python.sh");
  fs.writeFileSync(fake, `#!/bin/sh\necho "LỖI: ffmpeg Cannot allocate memory" >&2\nexit 1\n`);
  fs.chmodSync(fake, 0o755);
  const prev = process.env.PYTHON_BIN;
  process.env.PYTHON_BIN = fake;
  try {
    await jobs.runJob(jobs.latestJob(vid)!.job);
    let job = jobs.latestJob(vid)!.job;
    assert.equal(job.status, "queued", "lỗi tạm thời → xếp hàng lại");
    assert.equal(job.attempt, 1);
    assert.match(job.lastError ?? "", /allocate memory/);
    assert.match(d.select().from(db.schema.videos).where(eq(db.schema.videos.id, vid)).get()!.note, /tự thử lại lần 1/);
    await jobs.runJob(job);
    job = jobs.latestJob(vid)!.job;
    assert.equal(job.status, "error", "hết lượt thử lại → báo lỗi");
    assert.match(d.select().from(db.schema.videos).where(eq(db.schema.videos.id, vid)).get()!.note, /đã tự thử lại 1 lần/);
  } finally {
    process.env.PYTHON_BIN = prev;
  }
});

test("mất tệp nguồn → báo lỗi ngay, không thử lại", async () => {
  const vid = jobs.createVideoFromSource({ title: "Nguồn mất", sourceUploadId: "up_khong_co", cutSilence: false, by: "t", start: true });
  await jobs.runJob(jobs.latestJob(vid)!.job);
  const job = jobs.latestJob(vid)!.job;
  assert.equal(job.status, "error");
  assert.equal(job.attempt, undefined);
});
