// S5: tải video gốc NỐI TIẾP được — khúc đúng vị trí, mất kết nối giữa khúc không để byte rác, tải lại trang tìm lại phiên,
// đủ byte thì thành video. CSDL + thư mục dữ liệu tạm; bộ dựng tắt.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "baor-resum-"));
process.env.DATA_DIR = tmp;
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.AUTH_SECRET = "test-secret-".padEnd(40, "x");
process.env.BAOR_VIDEO_WORKER = "off";

let db: typeof import("../src/db");
let rs: typeof import("../src/lib/video/resumable");

before(async () => {
  db = await import("../src/db");
  rs = await import("../src/lib/video/resumable");
});

const ME = { name: "OWNER", email: "owner@baor.test" };
const params = { cut: true, contentId: null, final: false };
const stream = (bytes: Uint8Array) => new ReadableStream<Uint8Array>({ start(c) { c.enqueue(bytes); c.close(); } });
/** Luồng gửi được một phần rồi đứt (mất mạng giữa khúc). */
const broken = (bytes: Uint8Array) => new ReadableStream<Uint8Array>({ start(c) { c.enqueue(bytes); c.error(new Error("mất kết nối")); } });

test("tải nối tiếp: khúc đúng vị trí, đứt giữa khúc không để byte rác, sai vị trí bị từ chối kèm vị trí đúng, tải lại trang tìm lại phiên, đủ byte thành video", async () => {
  const data = new Uint8Array(3000).map((_, i) => i % 251);
  const o = rs.openSession({ original: "quay-tho.mp4", size: data.length, key: "quay-tho.mp4|3000|1729", params, by: ME });
  assert.ok(o.ok);
  const sid = (o as { sid: string }).sid;
  assert.deepEqual(await rs.appendChunk(sid, 0, stream(data.slice(0, 1000)), ME), { ok: true, offset: 1000, done: false });
  // mất kết nối giữa khúc 2 (đã gửi 400 byte) → cắt về 1000, không để byte dở
  const b = await rs.appendChunk(sid, 1000, broken(data.slice(1000, 1400)), ME);
  assert.equal(b.ok, false);
  assert.equal(rs.received(sid), 1000, "không để byte rác của khúc đứt");
  // gửi lặp khúc 1 (sai vị trí) → 409 kèm vị trí đúng
  const dup = await rs.appendChunk(sid, 0, stream(data.slice(0, 1000)), ME);
  assert.equal(dup.ok, false);
  assert.equal((dup as { status: number; offset: number }).status, 409);
  assert.equal((dup as { offset: number }).offset, 1000);
  // người khác không gửi vào phiên của mình
  assert.equal(((await rs.appendChunk(sid, 1000, stream(data.slice(1000, 2000)), { email: "khac@baor.test" })) as { status: number }).status, 403);
  // tải lại trang: mở lại với cùng dấu vân tay → cùng phiên, tiếp từ 1000
  const again = rs.openSession({ original: "quay-tho.mp4", size: data.length, key: "quay-tho.mp4|3000|1729", params, by: ME });
  assert.deepEqual(again, { ok: true, sid, offset: 1000, resumed: true });
  assert.deepEqual(rs.sessionInfo(sid, ME), { ok: true, offset: 1000, size: 3000 });
  // khúc vượt phần còn lại của tệp bị từ chối
  assert.equal((await rs.appendChunk(sid, 1000, stream(new Uint8Array(2500)), ME)).ok, false);
  assert.equal(rs.received(sid), 1000);
  assert.deepEqual(await rs.appendChunk(sid, 1000, stream(data.slice(1000, 2000)), ME), { ok: true, offset: 2000, done: false });
  const last = await rs.appendChunk(sid, 2000, stream(data.slice(2000)), ME);
  assert.equal(last.ok && last.done, true);
  const videoId = (last as { videoId: string }).videoId;
  const v = db.getDb().select().from(db.schema.videos).where(eq(db.schema.videos.id, videoId)).get()!;
  const up = db.getDb().select().from(db.schema.uploads).all().find((u) => u.name === "quay-tho.mp4")!;
  assert.equal(up.size, 3000);
  assert.deepEqual(new Uint8Array(fs.readFileSync(path.join(tmp, "uploads", up.fileName))), data, "tệp ghép lại đúng từng byte");
  assert.equal(v.title, "quay tho");
  assert.deepEqual(rs.sessionInfo(sid, ME), { ok: true, offset: 3000, size: 3000, done: true, videoId }, "hỏi lại sau khi xong → biết chắc đã tạo video");
});

test("tải nối tiếp: chặn định dạng lạ, cỡ sai, tệp > 8 GB; phiên quá 48 giờ bị dọn", () => {
  assert.equal((rs.openSession({ original: "x.exe", size: 10, key: "", params, by: ME }) as { status: number }).status, 415);
  assert.equal((rs.openSession({ original: "x.mp4", size: 0, key: "", params, by: ME }) as { status: number }).status, 400);
  assert.equal((rs.openSession({ original: "x.mp4", size: 9 * 1024 ** 3, key: "", params, by: ME }) as { status: number }).status, 413);
  const o = rs.openSession({ original: "cu.mp4", size: 10, key: "cu", params, by: ME }) as { sid: string };
  assert.equal(rs.sweepSessions(Date.now() + 49 * 3_600_000) >= 1, true);
  assert.equal(rs.sessionInfo(o.sid, ME).ok, false);
});

test("phản biện: hoàn tất để lại dấu 'đã xong' (hỏi lại / gửi lại khúc cuối không tạo trùng); không dọn phiên vừa ghi dù mở đã lâu", async () => {
  const data = new Uint8Array(500).fill(9);
  const o = rs.openSession({ original: "xong.mp4", size: 500, key: "xong|500|1", params, by: ME }) as { sid: string };
  const r = await rs.appendChunk(o.sid, 0, stream(data), ME);
  assert.equal(r.ok && r.done, true);
  const vid = (r as { videoId: string }).videoId;
  assert.deepEqual(rs.sessionInfo(o.sid, ME), { ok: true, offset: 500, size: 500, done: true, videoId: vid });
  const again = await rs.appendChunk(o.sid, 0, stream(data), ME);
  assert.deepEqual(again, { ok: true, offset: 500, done: true, videoId: vid }, "gửi lại khúc cuối → trả lại video cũ, không tạo trùng");
  assert.equal(db.getDb().select().from(db.schema.uploads).all().filter((u) => u.name === "xong.mp4").length, 1);
  // phiên mở 49 giờ trước nhưng vừa ghi khúc → không bị dọn
  const p2 = rs.openSession({ original: "lau.mp4", size: 1000, key: "lau|1000|1", params, by: ME }) as { sid: string };
  await rs.appendChunk(p2.sid, 0, stream(new Uint8Array(100)), ME);
  const meta = path.join(tmp, "uploads", ".partial", `${p2.sid}.json`);
  const m = JSON.parse(fs.readFileSync(meta, "utf8"));
  fs.writeFileSync(meta, JSON.stringify({ ...m, createdAt: new Date(Date.now() - 49 * 3_600_000).toISOString() }));
  rs.sweepSessions();
  assert.equal(rs.sessionInfo(p2.sid, ME).ok, true, "tính hạn theo lần ghi cuối, không theo lúc mở");
});
