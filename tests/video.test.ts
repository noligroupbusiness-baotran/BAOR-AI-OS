// CP03: tải nguồn dạng luồng, hàng đợi dựng, phiên bản, lịch sử phản hồi, thư viện B-roll. CSDL tạm, không chạy bộ dựng thật.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "baor-video-"));
process.env.DATA_DIR = tmp;
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.AUTH_SECRET = "test-secret-".padEnd(40, "x");
process.env.BAOR_VIDEO_WORKER = "off";

let jobs: typeof import("../src/lib/video/jobs");
let types: typeof import("../src/lib/video/job-types");
let feedback: typeof import("../src/lib/video/feedback");
let stream: typeof import("../src/lib/video/stream-to-file");
let db: typeof import("../src/db");

before(async () => {
  db = await import("../src/db");
  jobs = await import("../src/lib/video/jobs");
  types = await import("../src/lib/video/job-types");
  feedback = await import("../src/lib/video/feedback");
  stream = await import("../src/lib/video/stream-to-file");
});

function bodyOf(bytes: number, chunk = 1024 * 1024): ReadableStream<Uint8Array> {
  let sent = 0;
  return new ReadableStream({
    pull(ctl) {
      if (sent >= bytes) return ctl.close();
      const n = Math.min(chunk, bytes - sent);
      ctl.enqueue(new Uint8Array(n).fill(sent % 251));
      sent += n;
    },
  });
}

test("tải dạng luồng: tệp 30 MB ghi đủ byte (không bị cắt ở 10 MB); vượt giới hạn và tệp rỗng bị loại, không để lại tệp", async () => {
  const f = path.join(tmp, "big.bin");
  const r = await stream.streamToFile(bodyOf(30 * 1024 * 1024), f, 64 * 1024 * 1024);
  assert.deepEqual(r, { ok: true, size: 30 * 1024 * 1024 });
  assert.equal(fs.statSync(f).size, 30 * 1024 * 1024);
  const g = path.join(tmp, "over.bin");
  const over = await stream.streamToFile(bodyOf(5 * 1024 * 1024), g, 2 * 1024 * 1024, "quá lớn");
  assert.equal(over.ok, false);
  assert.equal(fs.existsSync(g), false, "tệp dở bị xoá");
  const e = await stream.streamToFile(bodyOf(0), path.join(tmp, "empty.bin"), 10);
  assert.equal(e.ok, false);
});

test("proxy không đệm đường tải lớn nhưng vẫn gác các trang khác", async () => {
  const { config } = await import("../src/proxy");
  const re = new RegExp(`^${config.matcher[0]}$`);
  assert.equal(re.test("/api/video-sources"), false);
  assert.equal(re.test("/api/video-assets/broll"), false);
  assert.equal(re.test("/dashboard"), true);
  assert.equal(re.test("/video-studio"), true);
});

test("hàng đợi dựng: video từ kịch bản kế thừa kịch bản, ghi lịch sử; dựng lại tạo bản mới, không cho khi đang dựng", () => {
  const d = db.getDb();
  const now = new Date().toISOString();
  d.insert(db.schema.contentItems).values({ id: "ct_b1", title: "B1 Chào hỏi", format: "script", status: "approved", pillar: "Giáo dục", hook: "", outline: "[]", draft: "1. HOOK (0–3s)\nLời thoại: Xin chào các bạn [K1]\n", assignee: "human", createdAt: now, source: "manual" }).run();
  d.insert(db.schema.uploads).values({ id: "up_raw", kind: "video", name: "raw.mp4", fileName: "up_raw.mp4", mime: "video/mp4", size: 1, meta: "{}", uploadedBy: "t", createdAt: now }).run();
  const vid = jobs.createVideoFromSource({ title: "raw", sourceUploadId: "up_raw", cutSilence: false, by: "OWNER", contentId: "ct_b1" });
  const v = d.select().from(db.schema.videos).all().find((x) => x.id === vid)!;
  assert.equal(v.contentId, "ct_b1");
  assert.equal(v.title, "B1 Chào hỏi", "video lấy tên kịch bản");
  assert.equal(v.status, "editing");
  const job = jobs.readJob(vid, 1)!;
  assert.equal(job.status, "queued");
  assert.equal(job.prompt, "Xin chào các bạn", "lời thoại kịch bản giúp nhận lời, bỏ thẻ căn cứ");
  assert.deepEqual(feedback.listVideoFeedback(vid).map((f) => f.kind), ["upload"]);

  assert.equal(jobs.rerenderVideo(vid, "OWNER").ok, false, "đang chờ dựng thì không dựng lại");
  const jf = path.join(jobs.jobDir(vid, 1), "job.json");
  fs.writeFileSync(jf, JSON.stringify({ ...job, status: "done" }));
  const r = jobs.rerenderVideo(vid, "OWNER", true);
  assert.deepEqual(r, { ok: true, version: 2 });
  assert.equal(jobs.readJob(vid, 2)!.cutSilence, true);
  assert.equal(jobs.readJob(vid, 1)!.status, "done", "bản cũ giữ nguyên");
  assert.deepEqual(jobs.jobVersions(vid), [2, 1]);
  assert.ok(feedback.listVideoFeedback(vid).some((f) => f.kind === "rerender" && f.version === 2));
});

test("chặn đường dẫn lạ khi phục vụ tệp kết quả", () => {
  assert.throws(() => jobs.jobDir("../etc", 1));
  assert.throws(() => jobs.jobDir("v_ok", 0));
  assert.equal(types.isJobFile("preview.mp4"), true);
  assert.equal(types.isJobFile("snapshots/001.jpg"), true);
  assert.equal(types.isJobFile("../baor.db"), false);
  assert.equal(types.isJobFile("master.mp4"), false, "bản chính đi qua kho tải lên có kiểm quyền, không phục vụ trực tiếp");
  assert.equal(types.isJobFile("words_main.json"), false);
});

test("thư viện B-roll: clip thiếu giấy phép, thiếu từ khoá hoặc thiếu tệp được đánh dấu", () => {
  const dir = jobs.brollDir();
  fs.writeFileSync(path.join(dir, "a.mp4"), "x");
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify([
    { file: "a.mp4", keywords: ["gọi điện"], license: "OWNER tự quay" },
    { file: "b.mp4", keywords: ["x"], license: "CC0" },
    { file: "a.mp4", keywords: ["y"], license: "" },
  ]));
  const lib = jobs.brollLibrary();
  assert.deepEqual(lib.map((b) => [b.exists, !!b.license, b.keywords.length > 0]), [[true, true, true], [false, true, true], [true, false, true]]);
});

test("cổng duyệt video: điểm chặn lấy từ bản dựng gắn với tệp hiện tại; bản dựng lại lỗi không làm mất yêu cầu ghi chú", async () => {
  const approval = await import("../src/lib/video/approval");
  const d = db.getDb();
  const now = new Date().toISOString();
  d.insert(db.schema.uploads).values({ id: "up_raw2", kind: "video", name: "raw2.mp4", fileName: "up_raw2.mp4", mime: "video/mp4", size: 1, meta: "{}", uploadedBy: "t", createdAt: now }).run();
  const vid = jobs.createVideoFromSource({ title: "raw2", sourceUploadId: "up_raw2", cutSilence: false, by: "OWNER" });
  // v1 dựng xong, có 2 điểm chặn
  const dir1 = jobs.jobDir(vid, 1);
  fs.writeFileSync(path.join(dir1, "report.json"), JSON.stringify({ blockers: ["Font chưa có giấy phép", "Logo lố vùng"], qa: [], failed: [] }));
  fs.writeFileSync(path.join(dir1, "job.json"), JSON.stringify({ ...jobs.readJob(vid, 1), status: "done", masterUploadId: "up_master1" }));
  d.update(db.schema.videos).set({ uploadId: "up_master1", status: "pending_approval" }).where(eq(db.schema.videos.id, vid)).run();
  let v = d.select().from(db.schema.videos).all().find((x) => x.id === vid)!;
  assert.deepEqual(approval.blockersForVideo(v), ["Font chưa có giấy phép", "Logo lố vùng"]);
  assert.match(approval.transitionBlock(v, "approve", "") ?? "", /2 điểm chặn/);
  assert.equal(approval.transitionBlock(v, "approve", "Đã mua giấy phép font, logo giữ 420"), null);
  // v2 dựng lại lỗi, không có báo cáo
  fs.mkdirSync(jobs.jobDir(vid, 2), { recursive: true });
  fs.writeFileSync(path.join(jobs.jobDir(vid, 2), "job.json"), JSON.stringify({ ...jobs.readJob(vid, 1), version: 2, status: "error", masterUploadId: undefined }));
  v = d.select().from(db.schema.videos).all().find((x) => x.id === vid)!;
  assert.match(approval.transitionBlock(v, "approve", "x".repeat(20)) ?? "", /lỗi/, "bản mới nhất lỗi thì không chuyển bước");
  assert.deepEqual(approval.blockersForVideo(v), ["Font chưa có giấy phép", "Logo lố vùng"], "vẫn lấy điểm chặn của bản đang gắn tệp");
  // Video không có tệp / dựng ngoài hệ thống
  assert.match(approval.transitionBlock({ id: "v_none", status: "review", uploadId: null }, "send_approval", "") ?? "", /chưa có tệp/);
  assert.match(approval.blockersForVideo({ id: "v_ext", status: "pending_approval", uploadId: "up_x" })[0], /không qua bảng kiểm/);
  // Dựng lại không kéo video đã gửi phê duyệt về "Đang dựng"
  assert.equal(jobs.rerenderVideo(vid, "OWNER").ok, false);
});

test("hộp thư vào: tệp đang chép (kích thước chưa ổn định) chưa nhận; tệp ổn định được nhận, bản ghi có trước khi chuyển tệp", async () => {
  const inbox = await import("../src/lib/video/auto-edit");
  const dir = inbox.inboxDir();
  const f = path.join(dir, "clip moi.mp4");
  fs.writeFileSync(f, Buffer.alloc(1024, 1));
  const old = new Date(Date.now() - 60_000);
  fs.utimesSync(f, old, old);
  assert.equal(inbox.ingestInbox(), 0, "lần quét đầu chỉ ghi nhận kích thước");
  assert.ok(fs.existsSync(f));
  assert.equal(inbox.ingestInbox(), 1, "kích thước không đổi: nhận");
  assert.equal(fs.existsSync(f), false);
  const up = db.getDb().select().from(db.schema.uploads).all().find((u) => u.name === "clip moi.mp4")!;
  assert.equal(fs.statSync(path.join(tmp, "uploads", up.fileName)).size, 1024, "tệp gốc đủ dung lượng trong kho");
});

test("khung hình: tỷ lệ / khung cắt từ form được chặn giá trị lạ; chờ chọn khung → Bắt đầu dựng; dừng và xoá video (tệp vào lưu trữ)", async () => {
  const types = await import("../src/lib/video/job-types");
  assert.equal(types.parseAspect("16:9"), "16:9");
  assert.equal(types.parseAspect("21:9"), "9:16", "tỷ lệ lạ về mặc định");
  assert.deepEqual(types.parseFraming("0.4", "2", "9"), { x: 0.4, y: 1, zoom: 3 }, "kẹp trong khoảng");
  assert.equal(types.parseFraming("", "", "1"), undefined, "không chỉnh gì = tự động theo mặt");

  const d = db.getDb();
  fs.mkdirSync(path.join(tmp, "uploads"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "uploads", "up_fr.mp4"), Buffer.alloc(64, 1));
  d.insert(db.schema.uploads).values({ id: "up_fr", kind: "video", name: "fr.mp4", fileName: "up_fr.mp4", mime: "video/mp4", size: 64, meta: "{}", uploadedBy: "t", createdAt: new Date().toISOString() }).run();
  const vid = jobs.createVideoFromSource({ title: "fr", sourceUploadId: "up_fr", cutSilence: true, by: "OWNER", start: false });
  assert.equal(jobs.readJob(vid, 1)!.status, "setup", "tải lên xong chưa dựng, chờ chọn khung");
  assert.equal(jobs.rerenderVideo(vid, "OWNER").ok, false, "đang chờ chọn khung thì không dựng lại (phải Bắt đầu dựng)");
  const st = jobs.startVideoJob(vid, "OWNER", { aspect: "1:1", framing: { x: 0.3, zoom: 1.2 }, cutSilence: false });
  assert.equal(st.ok, true);
  const j = jobs.readJob(vid, 1)!;
  assert.equal(j.status, "queued");
  assert.equal(j.aspect, "1:1");
  assert.deepEqual(j.framing, { x: 0.3, zoom: 1.2 });
  assert.equal(jobs.startVideoJob(vid, "OWNER", { aspect: "9:16", cutSilence: true }).ok, false, "chỉ bắt đầu được một lần");

  const del = jobs.deleteVideo(vid, "OWNER");
  assert.equal(del.ok, true);
  assert.equal(d.select().from(db.schema.videos).all().find((x) => x.id === vid), undefined);
  assert.equal(fs.existsSync(path.join(tmp, "uploads", "up_fr.mp4")), false, "tệp nguồn rời kho tải lên");
  const arch = fs.readdirSync(path.join(tmp, "removed")).find((x) => x.startsWith(vid))!;
  assert.ok(fs.existsSync(path.join(tmp, "removed", arch, "up_fr.mp4")), "tệp nằm trong lưu trữ, khôi phục được");
  assert.ok(fs.existsSync(path.join(tmp, "removed", arch, "records.json")));
});
