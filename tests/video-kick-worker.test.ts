// Kiểm toán độc lập 26/10/2026 (mục 7): kickWorker lồng nhau. Thu hồi job máy dựng mất nhịp tim (recoverRemoteStale → failJob →
// kickWorker) xảy ra TRƯỚC khi đặt worker.running → lần lồng và lần ngoài cùng chọn job → hai bộ dựng chạy song song.
// CSDL + DATA_DIR tạm, bộ dựng giả (sh sleep) — dừng sạch ở cuối.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "baor-kick-"));
process.env.DATA_DIR = tmp;
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.AUTH_SECRET = "test-secret-".padEnd(40, "x");
process.env.BAOR_VIDEO_WORKER = "off";

let db: typeof import("../src/db");
let jobs: typeof import("../src/lib/video/jobs");
let admin: typeof import("../src/lib/admin");
const ids: string[] = [];

before(async () => {
  db = await import("../src/db");
  jobs = await import("../src/lib/video/jobs");
  admin = await import("../src/lib/admin");
  fs.mkdirSync(path.join(tmp, "uploads"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "uploads", "src.mp4"), "x");
  db.getDb().insert(db.schema.uploads).values({ id: "up_src", kind: "video", name: "src.mp4", fileName: "src.mp4", mime: "video/mp4", size: 1, meta: "{}", uploadedBy: "t", createdAt: new Date().toISOString() }).run();
});

after(() => {
  process.env.BAOR_VIDEO_WORKER = "off";
  for (const id of ids) jobs.stopVideoJob(id, "test");
});

test("thu hồi job máy dựng mất nhịp tim rồi dựng tại chỗ → chỉ MỘT bộ dựng chạy (kickWorker lồng nhau trả về ngay)", async () => {
  // A: máy dựng nhận rồi mất nhịp tim; B: chờ dựng. Sau đó OWNER chuyển về dựng tại máy chủ.
  admin.setSetting("video.renderMode", "remote");
  const a = jobs.createVideoFromSource({ title: "A", sourceUploadId: "up_src", cutSilence: false, by: "t", start: true });
  ids.push(a);
  assert.equal(jobs.claimRemoteJob("may-x")?.videoId, a);
  const fa = path.join(jobs.jobDir(a, 1), "job.json");
  const ja = JSON.parse(fs.readFileSync(fa, "utf8"));
  fs.writeFileSync(fa, JSON.stringify({ ...ja, heartbeatAt: new Date(Date.now() - jobs.REMOTE_STALE_MS - 60_000).toISOString() }));
  await new Promise((r) => setTimeout(r, 5));
  const b = jobs.createVideoFromSource({ title: "B", sourceUploadId: "up_src", cutSilence: false, by: "t", start: true });
  ids.push(b);
  admin.setSetting("video.renderMode", "local");

  const bin = path.join(tmp, "slow.sh");
  fs.writeFileSync(bin, "#!/bin/sh\nsleep 20\n");
  fs.chmodSync(bin, 0o755);
  process.env.PYTHON_BIN = bin;
  delete process.env.BAOR_VIDEO_WORKER;
  void jobs.kickWorker();
  await new Promise((r) => setTimeout(r, 400));
  process.env.BAOR_VIDEO_WORKER = "off";
  const running = [a, b].filter((v) => jobs.latestJob(v)!.job.status === "running");
  assert.equal(running.length, 1, `đang chạy: ${running.join(", ")}`);
  assert.equal(running[0], a, "job thu hồi (cũ nhất) dựng trước");
  assert.equal(jobs.latestJob(b)!.job.status, "queued");
});
