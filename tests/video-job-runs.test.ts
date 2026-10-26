// Kiểm toán độc lập 26/10/2026 (F8, F9 + mục 1, 7): lần chạy (sync_runs) của bộ dựng video.
// Thử lại tự động / khởi động lại / OWNER bấm Dừng KHÔNG phải lỗi; lỗi thật mở đúng video; liên kết chiến dịch theo trạng thái;
// yêu cầu chỉnh sửa không nhảy số bản; khởi động lại có giới hạn số lần. CSDL + DATA_DIR tạm, bộ dựng giả (sh).
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { and, eq } from "drizzle-orm";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "baor-video-runs-"));
process.env.DATA_DIR = tmp;
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.AUTH_SECRET = "test-secret-".padEnd(40, "x");
process.env.BAOR_VIDEO_WORKER = "off";

let db: typeof import("../src/db");
let jobs: typeof import("../src/lib/video/jobs");
let dash: typeof import("../src/lib/dashboard-data");
let admin: typeof import("../src/lib/admin");
let transition: typeof import("../src/lib/videos/transition");

before(async () => {
  db = await import("../src/db");
  jobs = await import("../src/lib/video/jobs");
  dash = await import("../src/lib/dashboard-data");
  admin = await import("../src/lib/admin");
  transition = await import("../src/lib/videos/transition");
  fs.mkdirSync(path.join(tmp, "uploads"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "uploads", "src.mp4"), "x");
  db.getDb().insert(db.schema.uploads).values({ id: "up_src", kind: "video", name: "src.mp4", fileName: "src.mp4", mime: "video/mp4", size: 1, meta: "{}", uploadedBy: "t", createdAt: new Date().toISOString() }).run();
});

const runsOf = (title: string) => db.getDb().select().from(db.schema.syncRuns).where(and(eq(db.schema.syncRuns.integrationKey, "video_auto_edit"), eq(db.schema.syncRuns.kind, title))).all();
const workflow = () => dash.getPending().filter((p) => p.kind === "workflow");
const newVideo = (title: string) => jobs.createVideoFromSource({ title, sourceUploadId: "up_src", cutSilence: false, by: "t", start: true });

function fakePython(name: string, body: string): string {
  const p = path.join(tmp, name);
  fs.writeFileSync(p, `#!/bin/sh\n${body}\n`);
  fs.chmodSync(p, 0o755);
  return p;
}

async function withPython<T>(bin: string, fn: () => Promise<T>): Promise<T> {
  const prev = process.env.PYTHON_BIN;
  process.env.PYTHON_BIN = bin;
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.PYTHON_BIN;
    else process.env.PYTHON_BIN = prev;
  }
}

test("F8: lỗi tạm → tự thử lại THÀNH CÔNG → không có run lỗi, Việc cần làm sạch, liên kết chiến dịch theo 'review'", async () => {
  const d = db.getDb();
  const vid = newVideo("Nguồn 1011");
  const camp = d.select().from(db.schema.campaigns).get();
  assert.ok(camp, "seed có chiến dịch");
  d.insert(db.schema.marketingLinks).values({ id: "ml_t", campaignId: camp!.id, channelGoalId: null, entityType: "video", entityId: vid, status: "editing", ownerId: null, viaType: null, viaId: null, createdAt: new Date().toISOString() }).run();
  const counter = path.join(tmp, "n1");
  const bin = fakePython("flaky.sh", `for a in "$@"; do case "$a" in --job-dir=*) DIR="\${a#--job-dir=}";; esac; done
if [ ! -f "${counter}" ]; then touch "${counter}"; echo "LỖI: ffmpeg Cannot allocate memory" >&2; exit 1; fi
echo '{"output":{"seconds":10},"captions":{"units":3},"emphasis":[],"blockers":[],"failed":[]}' > "$DIR/report.json"
echo x > "$DIR/master.mp4"
exit 0`);
  await withPython(bin, async () => {
    await jobs.runJob(jobs.latestJob(vid)!.job);
    assert.equal(jobs.latestJob(vid)!.job.status, "queued", "lỗi tạm → tự xếp lại");
    assert.equal(runsOf("Nguồn 1011").filter((r) => r.finishedAt && !r.ok).length, 0, "lần thử lại không ghi run lỗi");
    await jobs.runJob(jobs.latestJob(vid)!.job);
  });
  assert.equal(jobs.latestJob(vid)!.job.status, "done");
  const runs = runsOf("Nguồn 1011");
  assert.equal(runs.length, 1, "lần thử lại dùng tiếp CÙNG một run");
  assert.equal(runs[0].ok, true);
  assert.deepEqual(workflow().map((p) => p.title), []);
  assert.equal(d.select().from(db.schema.videos).where(eq(db.schema.videos.id, vid)).get()!.status, "review");
  assert.equal(d.select().from(db.schema.marketingLinks).where(eq(db.schema.marketingLinks.id, "ml_t")).get()!.status, "review", "finishJob đồng bộ liên kết chiến dịch");
});

test("mục 1: lỗi THẬT (hết lượt thử lại) → MỘT run lỗi, nhãn 'Dựng video …', 'Xem và xử lý' mở đúng video trong Studio", async () => {
  const vid = newVideo("Nguồn hỏng");
  const bin = fakePython("bad.sh", `echo "LỖI: 'float' object is not subscriptable" >&2; exit 1`);
  await withPython(bin, async () => {
    await jobs.runJob(jobs.latestJob(vid)!.job);
    await jobs.runJob(jobs.latestJob(vid)!.job);
  });
  assert.equal(jobs.latestJob(vid)!.job.status, "error");
  const failed = runsOf("Nguồn hỏng").filter((r) => !r.ok);
  assert.equal(failed.length, 1);
  const item = workflow().find((p) => p.title.includes("Nguồn hỏng"))!;
  assert.match(item.title, /^Dựng video “Nguồn hỏng” lỗi: 'float' object is not subscriptable \(đã tự thử lại 1 lần\)$/);
  assert.equal(item.moduleHref, `/video-studio?open=${vid}`);
  assert.equal(item.module, "Video Studio");
});

test("F9: OWNER bấm Dừng (bộ dựng đang chạy) → không phải lỗi: run đóng ok, không vào Việc cần làm, không cảnh báo 'Dựng video lỗi'", async () => {
  const d = db.getDb();
  d.delete(db.schema.activity).run();
  const vid = newVideo("Nguồn dừng");
  const bin = fakePython("slow.sh", "sleep 30");
  await withPython(bin, async () => {
    const p = jobs.runJob(jobs.latestJob(vid)!.job);
    await new Promise((r) => setTimeout(r, 400));
    assert.equal(jobs.stopVideoJob(vid, "OWNER").ok, true);
    await p;
  });
  const j = jobs.latestJob(vid)!.job;
  assert.equal(jobs.isStoppedJob(j), true);
  assert.match(j.error ?? "", /^Đã dừng theo yêu cầu của OWNER/);
  const runs = runsOf("Nguồn dừng");
  assert.equal(runs.length, 1);
  assert.equal(runs[0].ok, true, "dừng không phải lỗi");
  assert.ok(runs[0].finishedAt);
  assert.ok(!workflow().some((p) => p.title.includes("Nguồn dừng")));
  assert.ok(!d.select().from(db.schema.activity).all().some((a) => a.message.includes("Dựng video lỗi")), "không gửi cảnh báo lỗi");
});

test("mục 1: Dừng job của MÁY DỰNG từ xa → run được đóng (không treo 'đang chạy'), nhịp tim sau đó bị từ chối", () => {
  admin.setSetting("video.renderMode", "remote");
  try {
    const vid = newVideo("Nguồn từ xa");
    const spec = jobs.claimRemoteJob("may-bao");
    assert.equal(spec?.videoId, vid);
    assert.equal(jobs.stopVideoJob(vid, "OWNER").ok, true);
    const runs = runsOf("Nguồn từ xa");
    assert.equal(runs.length, 1);
    assert.ok(runs[0].finishedAt, "run đã đóng");
    assert.equal(runs[0].ok, true);
    assert.equal(jobs.heartbeatRemote(vid, 1, "may-bao", null), false);
    assert.ok(!workflow().some((p) => p.title.includes("Nguồn từ xa")));
  } finally {
    admin.setSetting("video.renderMode", "local");
  }
});

test("mục 7: khởi động lại giữa lúc dựng → xếp lại có TĂNG số lần (không vòng lặp vô hạn), không ghi run lỗi lần đầu", () => {
  const vid = newVideo("Nguồn sập");
  const file = path.join(jobs.jobDir(vid, 1), "job.json");
  const asRunning = () => {
    const j = JSON.parse(fs.readFileSync(file, "utf8"));
    const runId = j.runId ?? (() => {
      const id = `run_t${Date.now()}`;
      db.getDb().insert(db.schema.syncRuns).values({ id, integrationKey: "video_auto_edit", kind: "Nguồn sập", startedAt: new Date().toISOString(), ok: false, message: "đang chạy", items: 0 }).run();
      return id;
    })();
    fs.writeFileSync(file, JSON.stringify({ ...j, status: "running", startedAt: new Date().toISOString(), runId }));
  };
  asRunning();
  jobs.recoverStale(true);
  let j = jobs.latestJob(vid)!.job;
  assert.equal(j.status, "queued");
  assert.equal(j.attempt, 1, "lần khởi động lại được đếm");
  assert.equal(runsOf("Nguồn sập").filter((r) => r.finishedAt && !r.ok).length, 0, "khởi động lại không phải lỗi");
  asRunning();
  jobs.recoverStale(true);
  j = jobs.latestJob(vid)!.job;
  assert.equal(j.status, "error", "nguồn làm sập lặp lại → dừng xếp lại, báo lỗi thật");
  assert.equal(runsOf("Nguồn sập").filter((r) => !r.ok).length, 1);
});

test("mục 7: yêu cầu chỉnh sửa KHÔNG tăng số bản (chỉ bản dựng mới mới tăng)", () => {
  db.getDb().insert(db.schema.videos).values({ id: "v_rc", title: "Video sửa", contentId: null, agent: "t", status: "review", platforms: "[]", version: 2, note: "", uploadId: "up_src", updatedAt: new Date().toISOString() }).run();
  const r = transition.runVideoTransition({ id: "v_rc", kind: "request_changes", note: "Cắt khoảng lặng đầu", by: "OWNER", canApprove: true });
  assert.equal(r.ok, true);
  const v = db.getDb().select().from(db.schema.videos).where(eq(db.schema.videos.id, "v_rc")).get()!;
  assert.equal(v.status, "needs_changes");
  assert.equal(v.version, 2);
});

test("phản biện P2-1: lỗi thật v1 → dựng lại v2 → OWNER Dừng v2 → lỗi v1 VẪN là việc cần làm (run 'đã dừng' không đóng lỗi thật)", async () => {
  const vid = newVideo("Nguồn S1");
  const bad = fakePython("bad-s1.sh", `echo "LỖI: hỏng thật" >&2; exit 1`);
  await withPython(bad, async () => {
    await jobs.runJob(jobs.latestJob(vid)!.job);
    await jobs.runJob(jobs.latestJob(vid)!.job);
  });
  assert.equal(workflow().filter((p) => p.title.includes("Nguồn S1")).length, 1);
  assert.ok(jobs.rerenderVideo(vid, "OWNER").ok);
  const slow = fakePython("slow-s1.sh", "sleep 30");
  await withPython(slow, async () => {
    const p = jobs.runJob(jobs.latestJob(vid)!.job);
    await new Promise((r) => setTimeout(r, 400));
    assert.equal(jobs.stopVideoJob(vid, "OWNER").ok, true);
    await p;
  });
  assert.equal(workflow().filter((p) => p.title.includes("Nguồn S1")).length, 1, "Dừng v2 không xoá lỗi thật của v1");
});

test("phản biện P2-2: video lỗi thật rồi bị XOÁ → lỗi của nó không còn tính (ánh xạ run → video giữ sau khi chuyển thư mục dựng)", async () => {
  const vid = newVideo("Nguồn S2");
  const bad = fakePython("bad-s2.sh", `echo "LỖI: hỏng S2" >&2; exit 1`);
  await withPython(bad, async () => {
    await jobs.runJob(jobs.latestJob(vid)!.job);
    await jobs.runJob(jobs.latestJob(vid)!.job);
  });
  assert.equal(workflow().filter((p) => p.title.includes("Nguồn S2")).length, 1);
  assert.equal(jobs.deleteVideo(vid, "OWNER").ok, true);
  assert.deepEqual(workflow().filter((p) => p.title.includes("Nguồn S2")), [], "video đã xoá: không còn gì để xử lý");
  assert.ok(Object.values(jobs.removedRunIndex()).includes(vid));
});
