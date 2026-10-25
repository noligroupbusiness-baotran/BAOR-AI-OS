// Xoá video ở Kho (OWNER 25/10: "phải cho phép xoá video ở phần kho video") + khôi phục kế hoạch AI trước (plan.prev-*).
// CSDL + thư mục dữ liệu tạm, bộ dựng tắt.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "baor-video-delete-"));
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

function seedVideo(id: string, status: string) {
  const now = new Date().toISOString();
  db.getDb().insert(db.schema.videos).values({ id, title: `Video ${id}`, contentId: null, agent: "t", status, platforms: "[]", version: 1, note: "", uploadId: null, updatedAt: now }).run();
  const dir = path.join(tmp, "video-jobs", id, "v1");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "job.json"), JSON.stringify({ videoId: id, version: 1, status: "done", sourceUploadId: "up_src", cutSilence: false, aspect: "9:16", prompt: "", createdAt: now, by: "t" }));
}

function addPost(videoId: string, id: string, status: string, extra: { externalId?: string; error?: string; mode?: string } = {}) {
  db.getDb()
    .insert(db.schema.scheduledPosts)
    .values({ id, contentId: "", title: "bài", platform: "facebook", scheduledFor: new Date().toISOString(), status, videoId, externalId: extra.externalId ?? null, error: extra.error ?? null, mode: extra.mode ?? "live" })
    .run();
}

const setPost = (id: string, status: string) => db.getDb().update(db.schema.scheduledPosts).set({ status }).where(eq(db.schema.scheduledPosts.id, id)).run();
const videoExists = (id: string) => !!db.getDb().select().from(db.schema.videos).where(eq(db.schema.videos.id, id)).get();

test("đánh dấu bài lỗi chưa rõ ở bộ xoá trùng với bộ đăng bài (không import để tránh vòng)", async () => {
  const pub = await import("../src/lib/publishing/video");
  assert.equal(jobs.POST_AMBIGUOUS_MARK, pub.AMBIGUOUS_MARK);
});

test("Kho video: video đã duyệt có bài đang lên lịch → chặn, nói rõ số bài và phải huỷ lịch; huỷ xong thì xoá được (lưu trữ, bài đã huỷ ghi vào records)", () => {
  seedVideo("v_ok", "approved");
  addPost("v_ok", "p_sched", "scheduled");
  addPost("v_ok", "p_dry", "dry_run", { mode: "dry_run" });

  const blocked = jobs.deleteVideo("v_ok", "OWNER", { canDeleteApproved: true });
  assert.equal(blocked.ok, false);
  assert.match(!blocked.ok ? blocked.error : "", /đang có 1 bài lên lịch — huỷ lịch trước/);
  assert.equal(jobs.videoDeleteBlock("v_ok", true), !blocked.ok ? blocked.error : "", "nút ở Kho và bộ xoá dùng cùng một lý do");
  assert.ok(videoExists("v_ok"), "bị chặn thì không đụng gì");
  assert.ok(fs.existsSync(path.join(tmp, "video-jobs", "v_ok")));

  setPost("p_sched", "cancelled");
  assert.match(jobs.videoDeleteBlock("v_ok", false) ?? "", /quyền phê duyệt/, "người không có quyền phê duyệt không xoá được video đã duyệt");
  assert.equal(jobs.deleteVideo("v_ok", "Nhân viên").ok, false);
  assert.equal(jobs.videoDeleteBlock("v_ok", true), null, "chỉ còn bài đã huỷ + bài chế độ thử → xoá được");

  const r = jobs.deleteVideo("v_ok", "OWNER", { canDeleteApproved: true });
  assert.equal(r.ok, true);
  assert.equal(videoExists("v_ok"), false);
  assert.equal(db.getDb().select().from(db.schema.scheduledPosts).where(eq(db.schema.scheduledPosts.videoId, "v_ok")).all().length, 0, "không để lại bài trỏ tới video đã xoá");
  const arch = fs.readdirSync(path.join(tmp, "removed")).find((x) => x.startsWith("v_ok-"))!;
  assert.ok(arch, "chuyển vào lưu trữ, không xoá vĩnh viễn");
  assert.ok(fs.existsSync(path.join(tmp, "removed", arch, "video-jobs", "v1", "job.json")));
  const rec = JSON.parse(fs.readFileSync(path.join(tmp, "removed", arch, "records.json"), "utf8"));
  assert.equal(rec.video.status, "approved");
  assert.deepEqual(rec.posts.map((p: { id: string }) => p.id).sort(), ["p_dry", "p_sched"]);
});

test("Kho video: video đã đăng thật (đã đăng / có mã bài / lỗi chưa rõ đã lên trang) → không xoá; video chờ phê duyệt → không xoá", () => {
  seedVideo("v_pub", "approved");
  addPost("v_pub", "p_pub", "published");
  assert.match(jobs.videoDeleteBlock("v_pub", true) ?? "", /đã đăng thật 1 bài/);
  assert.equal(jobs.deleteVideo("v_pub", "OWNER", { canDeleteApproved: true }).ok, false);
  assert.ok(videoExists("v_pub"));

  seedVideo("v_amb", "approved");
  addPost("v_amb", "p_amb", "failed", { error: `${jobs.POST_AMBIGUOUS_MARK} Máy chủ dừng giữa lúc đăng.` });
  assert.match(jobs.videoDeleteBlock("v_amb", true) ?? "", /đã đăng thật/, "lỗi chưa rõ có thể đã lên trang");
  seedVideo("v_ext", "approved");
  addPost("v_ext", "p_ext", "failed", { externalId: "123_456", error: "Không xác minh được" });
  assert.match(jobs.videoDeleteBlock("v_ext", true) ?? "", /đã đăng thật/, "có mã bài trên nền tảng");
  seedVideo("v_fail", "approved");
  addPost("v_fail", "p_fail", "failed", { error: "Thiếu token" });
  assert.equal(jobs.videoDeleteBlock("v_fail", true), null, "lỗi rõ ràng, chưa gọi lên trang → xoá được");

  seedVideo("v_wait", "pending_approval");
  assert.match(jobs.videoDeleteBlock("v_wait", true) ?? "", /chờ phê duyệt/);
  assert.equal(jobs.deleteVideo("v_wait", "OWNER", { canDeleteApproved: true }).ok, false);
});

test("khôi phục kế hoạch AI trước: đổi tệp plan rồi dựng lại; kế hoạch đang dùng được cất (không xoá); không dựng lại được thì không đổi tệp", () => {
  seedVideo("v_plan", "review");
  const d = path.join(tmp, "video-jobs", "v_plan");
  const human = { by: "Biên tập: OWNER", emphasis: [{ t: 1, text: "NGƯỜI" }], diagrams: [], broll: [] };
  const ai = { by: "Biên tập AI tại máy (qwen)", emphasis: [{ t: 2, text: "AI" }], diagrams: [], broll: [] };
  fs.writeFileSync(path.join(d, "plan.json"), JSON.stringify(ai));
  assert.deepEqual(jobs.planBackups("v_plan"), []);
  const none = jobs.restorePrevPlan("v_plan", "OWNER");
  assert.equal(none.ok, false, "không có bản cất thì báo, không làm gì");

  fs.writeFileSync(path.join(d, "plan.prev-2026-10-20T10-00-00-000Z.json"), JSON.stringify({ ...human, by: "cũ hơn" }));
  fs.writeFileSync(path.join(d, "plan.prev-2026-10-24T10-00-00-000Z.json"), JSON.stringify(human));
  assert.equal(jobs.planBackups("v_plan")[0], "plan.prev-2026-10-24T10-00-00-000Z.json", "mới nhất trước");

  // Chờ phê duyệt: không dựng lại được → tệp giữ nguyên
  db.getDb().update(db.schema.videos).set({ status: "pending_approval" }).where(eq(db.schema.videos.id, "v_plan")).run();
  assert.equal(jobs.restorePrevPlan("v_plan", "OWNER").ok, false);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(d, "plan.json"), "utf8")), ai, "kế hoạch đang dùng không bị đổi");
  assert.equal(jobs.planBackups("v_plan").length, 2);
  db.getDb().update(db.schema.videos).set({ status: "review" }).where(eq(db.schema.videos.id, "v_plan")).run();

  const r = jobs.restorePrevPlan("v_plan", "OWNER");
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.version, 2);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(d, "plan.json"), "utf8")), human, "kế hoạch cất gần nhất thành kế hoạch video");
  const backups = jobs.planBackups("v_plan");
  assert.equal(backups.length, 2, "bản vừa khôi phục rời kho cất, kế hoạch AI vào kho cất");
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(d, backups[0]), "utf8")), ai, "kế hoạch AI vừa thay được cất, khôi phục lần nữa = quay lại");
  const j2 = jobs.readJob("v_plan", 2)!;
  assert.equal(j2.status, "queued", "dựng lại bằng rerenderVideo");
  assert.equal(j2.aiPlan, undefined, "không yêu cầu AI lập lại kế hoạch (giữ kế hoạch vừa khôi phục)");
  assert.equal(db.getDb().select().from(db.schema.videos).where(eq(db.schema.videos.id, "v_plan")).get()!.status, "editing");
});

test("xoá video: góp ý theo mốc (video_comments), lịch sử phản hồi và liên kết chiến dịch được ghi vào records.json rồi gỡ khỏi bảng — không để dòng mồ côi", () => {
  seedVideo("v_cm", "review");
  const now = new Date().toISOString();
  const d = db.getDb();
  d.insert(db.schema.videoComments).values([
    { id: "vc_1", videoId: "v_cm", version: 1, t: 1.5, srcT: 1.5, text: "Chữ nhấn lệch", status: "open", by: "OWNER", at: now },
    { id: "vc_2", videoId: "v_cm", version: 1, t: 4, srcT: 4.2, text: "Bỏ nhạc đoạn này", status: "resolved", by: "OWNER", at: now },
  ]).run();
  d.insert(db.schema.videoComments).values({ id: "vc_other", videoId: "v_keep", version: 1, t: 0, srcT: 0, text: "video khác", by: "OWNER", at: now }).run();
  d.insert(db.schema.videoFeedback).values({ id: "vf_cm", videoId: "v_cm", version: 1, kind: "send_review", note: "", by: "OWNER", at: now }).run();
  d.insert(db.schema.marketingLinks).values({ id: "ml_cm", campaignId: "cp_x", entityType: "video", entityId: "v_cm", status: "review", createdAt: now }).run();

  const r = jobs.deleteVideo("v_cm", "OWNER");
  assert.equal(r.ok, true);
  assert.equal(d.select().from(db.schema.videoComments).where(eq(db.schema.videoComments.videoId, "v_cm")).all().length, 0, "không để lại góp ý trỏ tới video đã xoá");
  assert.equal(d.select().from(db.schema.videoComments).where(eq(db.schema.videoComments.videoId, "v_keep")).all().length, 1, "góp ý video khác giữ nguyên");
  assert.equal(d.select().from(db.schema.videoFeedback).where(eq(db.schema.videoFeedback.videoId, "v_cm")).all().length, 0);
  assert.equal(d.select().from(db.schema.marketingLinks).where(eq(db.schema.marketingLinks.entityId, "v_cm")).all().length, 0);
  const arch = fs.readdirSync(path.join(tmp, "removed")).find((x) => x.startsWith("v_cm-"))!;
  const rec = JSON.parse(fs.readFileSync(path.join(tmp, "removed", arch, "records.json"), "utf8"));
  assert.deepEqual(rec.comments.map((c: { id: string }) => c.id).sort(), ["vc_1", "vc_2"], "góp ý lưu trữ, khôi phục được");
  assert.equal(rec.comments.find((c: { id: string }) => c.id === "vc_1").text, "Chữ nhấn lệch");
  assert.deepEqual(rec.feedback.map((f: { id: string }) => f.id), ["vf_cm"]);
  assert.deepEqual(rec.links.map((l: { campaignId: string }) => l.campaignId), ["cp_x"], "liên kết chiến dịch cũng lưu trữ trước khi gỡ");
});

test("xoá video: liên kết chiến dịch của BÀI ĐĂNG đã huỷ (kế thừa lúc lên lịch) cũng lưu trữ rồi gỡ — phản biện 25/10 P2-1", () => {
  seedVideo("v_pl", "approved");
  const now = new Date().toISOString();
  const d = db.getDb();
  d.insert(db.schema.scheduledPosts).values({ id: "sp_pl", contentId: "", title: "b", platform: "facebook", scheduledFor: now, status: "cancelled", videoId: "v_pl", mode: "live" }).run();
  d.insert(db.schema.marketingLinks).values({ id: "ml_pl", campaignId: "cp_pl", entityType: "publication", entityId: "sp_pl", status: "scheduled", createdAt: now, viaType: "video", viaId: "v_pl" }).run();
  d.insert(db.schema.marketingLinks).values({ id: "ml_pl_other", campaignId: "cp_pl", entityType: "publication", entityId: "sp_khac", status: "scheduled", createdAt: now }).run();
  assert.equal(jobs.deleteVideo("v_pl", "OWNER", { canDeleteApproved: true }).ok, true);
  assert.deepEqual(d.select().from(db.schema.marketingLinks).where(eq(db.schema.marketingLinks.campaignId, "cp_pl")).all().map((l) => l.id), ["ml_pl_other"], "chỉ gỡ liên kết của bài thuộc video bị xoá");
  const arch = fs.readdirSync(path.join(tmp, "removed")).find((x) => x.startsWith("v_pl-"))!;
  const rec = JSON.parse(fs.readFileSync(path.join(tmp, "removed", arch, "records.json"), "utf8"));
  assert.deepEqual(rec.postLinks.map((l: { id: string }) => l.id), ["ml_pl"]);
});
