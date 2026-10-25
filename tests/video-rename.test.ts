// Đổi tên video (Video Studio, OWNER 25/10/2026): tên rỗng / quá dài bị từ chối; tên hợp lệ lưu đúng, ghi lịch sử phản hồi.
// CSDL + thư mục dữ liệu tạm.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "baor-rename-"));
process.env.DATA_DIR = tmp;
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.AUTH_SECRET = "test-secret-".padEnd(40, "x");
process.env.BAOR_VIDEO_WORKER = "off";

let db: typeof import("../src/db");
let rename: typeof import("../src/lib/videos/rename");

before(async () => {
  db = await import("../src/db");
  rename = await import("../src/lib/videos/rename");
  const now = new Date().toISOString();
  db.getDb().insert(db.schema.videos).values({ id: "v_rn", title: "Tên cũ", contentId: null, agent: "Agent Edit Video", status: "approved", platforms: "[]", version: 3, note: "", uploadId: null, updatedAt: now }).run();
});

const title = () => db.getDb().select().from(db.schema.videos).where(eq(db.schema.videos.id, "v_rn")).get()!.title;
const feedback = () => db.getDb().select().from(db.schema.videoFeedback).where(eq(db.schema.videoFeedback.videoId, "v_rn")).all();

test("đổi tên video: rỗng / quá dài / không tồn tại bị từ chối, tên không đổi", () => {
  assert.deepEqual(rename.renameVideo("v_rn", "   ", "OWNER"), { ok: false, error: "Tên video không được để trống" });
  const long = rename.renameVideo("v_rn", "x".repeat(rename.VIDEO_TITLE_MAX + 1), "OWNER");
  assert.equal(long.ok, false);
  assert.match((long as { error: string }).error, /tối đa 120/);
  assert.equal(rename.renameVideo("v_khong_co", "Tên mới", "OWNER").ok, false);
  assert.equal(title(), "Tên cũ");
  assert.equal(feedback().length, 0, "từ chối thì không ghi lịch sử");
});

test("đổi tên video: tên hợp lệ (gộp khoảng trắng, đúng 120 ký tự có dấu) lưu đúng và ghi lịch sử “Đổi tên”", () => {
  assert.deepEqual(rename.renameVideo("v_rn", "  Chào hỏi   phá băng  ", "OWNER"), { ok: true, title: "Chào hỏi phá băng", changed: true });
  assert.equal(title(), "Chào hỏi phá băng");
  const fb = feedback();
  assert.equal(fb.length, 1);
  assert.equal(fb[0].kind, "rename");
  assert.equal(fb[0].version, 3);
  assert.equal(fb[0].note, "“Tên cũ” → “Chào hỏi phá băng”");
  // Giới hạn tính theo ký tự (tiếng Việt có dấu), không theo byte
  const max = "ệ".repeat(rename.VIDEO_TITLE_MAX);
  assert.equal(rename.renameVideo("v_rn", max, "OWNER").ok, true);
  assert.equal(title(), max);
  // Tên giống hệt: không ghi thêm lịch sử
  assert.deepEqual(rename.renameVideo("v_rn", max, "OWNER"), { ok: true, title: max, changed: false });
  assert.equal(feedback().length, 2);
});
