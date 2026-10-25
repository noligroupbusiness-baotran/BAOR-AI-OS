// Thêm video gốc (OWNER 25/10/2026): chọn Khung (9:16 · 16:9) + Chất lượng (1080p · 4K) → video mới mang đúng khung, job.json có
// `quality`; mặc định 9:16 + 1080; "Bắt đầu dựng" giữ chất lượng đã chọn. CSDL + thư mục dữ liệu tạm; bộ dựng tắt.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "baor-quality-"));
process.env.DATA_DIR = tmp;
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.AUTH_SECRET = "test-secret-".padEnd(40, "x");
process.env.BAOR_VIDEO_WORKER = "off";

let db: typeof import("../src/db");
let jobs: typeof import("../src/lib/video/jobs");
let types: typeof import("../src/lib/video/job-types");
let intake: typeof import("../src/lib/video/source-intake");
let uploads: typeof import("../src/lib/uploads");

before(async () => {
  db = await import("../src/db");
  jobs = await import("../src/lib/video/jobs");
  types = await import("../src/lib/video/job-types");
  intake = await import("../src/lib/video/source-intake");
  uploads = await import("../src/lib/uploads");
});

const jobJson = (videoId: string) => JSON.parse(fs.readFileSync(path.join(tmp, "video-jobs", videoId, "v1", "job.json"), "utf8"));

function upload(params: { aspect?: string | null; quality?: string | null }) {
  const id = intake.newUploadId();
  const p = path.join(uploads.uploadsDir(), `${id}.mp4`);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, "v");
  return intake.registerSource({ tmpPath: p, uploadId: id, original: "nguon.mp4", ext: ".mp4", size: 1, params: { cut: false, contentId: null, final: false, ...params }, by: { name: "OWNER", email: "owner@example.test" } }).videoId;
}

test("parseQuality: chỉ nhận 4k (không phân biệt hoa thường), còn lại 1080", () => {
  assert.equal(types.parseQuality("4k"), "4k");
  assert.equal(types.parseQuality("4K"), "4k");
  assert.equal(types.parseQuality("1080"), "1080");
  assert.equal(types.parseQuality(null), "1080");
  assert.equal(types.parseQuality("8k"), "1080");
});

test("tải lên chọn 16:9 + 4K → job.json khung 16:9, quality 4k; lịch sử ghi rõ; chờ chọn khung với đúng khung đã chọn", () => {
  const vid = upload({ aspect: "16:9", quality: "4k" });
  const j = jobJson(vid);
  assert.equal(j.aspect, "16:9");
  assert.equal(j.quality, "4k");
  assert.equal(j.status, "setup");
  assert.equal(jobs.latestJob(vid)!.job.quality, "4k");
  const fb = db.getDb().select().from(db.schema.videoFeedback).where(eq(db.schema.videoFeedback.videoId, vid)).all();
  assert.match(fb[0].note, /khung 16:9 · 4K/);
  // "Bắt đầu dựng" (đổi khung) vẫn giữ chất lượng đã chọn
  assert.deepEqual(jobs.startVideoJob(vid, "OWNER", { aspect: "9:16", cutSilence: false }), { ok: true });
  assert.equal(jobJson(vid).quality, "4k");
  assert.equal(jobJson(vid).aspect, "9:16");
});

test("không chọn / giá trị lạ → mặc định 9:16 + 1080; startVideoJob đổi được chất lượng", () => {
  const vid = upload({ aspect: null, quality: "abc" });
  assert.equal(jobJson(vid).aspect, "9:16");
  assert.equal(jobJson(vid).quality, "1080");
  assert.deepEqual(jobs.startVideoJob(vid, "OWNER", { aspect: "16:9", cutSilence: true, quality: "4k" }), { ok: true });
  assert.equal(jobJson(vid).quality, "4k");
  const direct = jobs.createVideoFromSource({ title: "x", sourceUploadId: "up_x", cutSilence: false, by: "OWNER", start: false });
  assert.equal(jobJson(direct).quality, "1080", "đường cũ (hộp thư tự dựng…) không truyền chất lượng → 1080");
});
