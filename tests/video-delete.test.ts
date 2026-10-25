// Xoá video ở Kho (OWNER 25/10: "phải cho phép xoá video ở phần kho video") + khôi phục kế hoạch AI trước (plan.prev-*).
// CSDL + thư mục dữ liệu tạm, bộ dựng tắt.
import { test, before, type TestContext } from "node:test";
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

test("khôi phục kế hoạch: rerenderVideo NÉM lỗi (vd ghi việc dựng hỏng) → trả tệp plan về như cũ, báo lỗi, không mất bản cất", () => {
  seedVideo("v_plan_throw", "review");
  const d = path.join(tmp, "video-jobs", "v_plan_throw");
  const human = { by: "Biên tập: OWNER", emphasis: [{ t: 1, text: "NGƯỜI" }], diagrams: [], broll: [] };
  const ai = { by: "Biên tập AI tại máy (qwen)", emphasis: [{ t: 2, text: "AI" }], diagrams: [], broll: [] };
  fs.writeFileSync(path.join(d, "plan.json"), JSON.stringify(ai));
  const prevName = "plan.prev-2026-10-24T10-00-00-000Z.json";
  fs.writeFileSync(path.join(d, prevName), JSON.stringify(human));
  // Chỗ thư mục bản 2 bị một TỆP chiếm → writeJob (mkdir) ném lỗi bên trong rerenderVideo
  fs.writeFileSync(path.join(d, "v2"), "chiếm chỗ");
  let r: ReturnType<typeof jobs.restorePrevPlan> | undefined;
  assert.doesNotThrow(() => {
    r = jobs.restorePrevPlan("v_plan_throw", "OWNER");
  }, "lỗi bên trong dựng lại không làm sập thao tác");
  assert.equal(r?.ok, false);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(d, "plan.json"), "utf8")), ai, "kế hoạch đang dùng được trả về");
  assert.deepEqual(jobs.planBackups("v_plan_throw"), [prevName], "bản cất trả về đúng chỗ, không thêm bản cất thừa");
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(d, prevName), "utf8")), human);
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

// ---------------------------------------------------------------- kiểm toán 26/10: thứ tự xoá + khôi phục kế hoạch lỗi giữa chừng

/** Video có tệp nguồn trong kho tải lên + lịch sử phản hồi + liên kết chiến dịch (để thấy rõ bước nào đã / chưa chạy). */
function seedFull(id: string) {
  seedVideo(id, "review");
  const now = new Date().toISOString();
  const d = db.getDb();
  fs.mkdirSync(path.join(tmp, "uploads"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "uploads", `${id}.mp4`), "video");
  d.insert(db.schema.uploads).values({ id: `up_${id}`, kind: "video", name: `${id}.mp4`, fileName: `${id}.mp4`, createdAt: now }).run();
  d.update(db.schema.videos).set({ uploadId: `up_${id}` }).where(eq(db.schema.videos.id, id)).run();
  d.insert(db.schema.videoFeedback).values({ id: `vf_${id}`, videoId: id, version: 1, kind: "send_review", note: "", by: "OWNER", at: now }).run();
  d.insert(db.schema.marketingLinks).values({ id: `ml_${id}`, campaignId: `cp_${id}`, entityType: "video", entityId: id, status: "review", createdAt: now }).run();
}

function state(id: string) {
  const d = db.getDb();
  return {
    video: videoExists(id),
    feedback: d.select().from(db.schema.videoFeedback).where(eq(db.schema.videoFeedback.videoId, id)).all().length,
    links: d.select().from(db.schema.marketingLinks).where(eq(db.schema.marketingLinks.entityId, id)).all().length,
    uploadRow: !!d.select().from(db.schema.uploads).where(eq(db.schema.uploads.id, `up_${id}`)).get(),
    uploadFile: fs.existsSync(path.join(tmp, "uploads", `${id}.mp4`)),
    jobsDir: fs.existsSync(path.join(tmp, "video-jobs", id)),
    archives: fs.existsSync(path.join(tmp, "removed")) ? fs.readdirSync(path.join(tmp, "removed")).filter((x) => x.startsWith(`${id}-`)).length : 0,
  };
}
const untouched = { video: true, feedback: 1, links: 1, uploadRow: true, uploadFile: true, jobsDir: true, archives: 0 };

test("xoá video: ghi records.json lỗi → chưa đổi gì (dòng CSDL, tệp nguồn, thư mục dựng nguyên chỗ)", (t: TestContext) => {
  seedFull("v_rec_fail");
  const orig = fs.writeFileSync;
  t.mock.method(fs, "writeFileSync", (...args: Parameters<typeof fs.writeFileSync>) => {
    if (String(args[0]).endsWith("records.json")) throw new Error("đĩa đầy");
    return orig.apply(fs, args);
  });
  const r = jobs.deleteVideo("v_rec_fail", "OWNER");
  assert.equal(r.ok, false);
  assert.match(!r.ok ? r.error : "", /chưa xoá gì: đĩa đầy/);
  assert.deepEqual(state("v_rec_fail"), untouched);
});

test("xoá video: CSDL lỗi giữa chừng (lệnh xoá video cuối cùng) → transaction lùi lại hết, tệp CHƯA chuyển, không để bản lưu trữ lẻ", () => {
  seedFull("v_db_fail");
  const sq = db.getSqlite();
  sq.exec("CREATE TRIGGER t_no_del_video BEFORE DELETE ON videos WHEN OLD.id = 'v_db_fail' BEGIN SELECT RAISE(ABORT, 'CSDL bị khoá'); END;");
  try {
    let r: ReturnType<typeof jobs.deleteVideo> | undefined;
    assert.doesNotThrow(() => {
      r = jobs.deleteVideo("v_db_fail", "OWNER");
    }, "lỗi CSDL không làm sập thao tác");
    assert.equal(r?.ok, false);
    assert.match(r && !r.ok ? r.error : "", /CSDL lỗi, chưa gỡ gì\): CSDL bị khoá/);
    assert.deepEqual(state("v_db_fail"), untouched, "lịch sử phản hồi / liên kết / dòng tải lên đã xoá trước đó trong transaction được khôi phục; tệp không bị chuyển");
  } finally {
    sq.exec("DROP TRIGGER t_no_del_video");
  }
  assert.equal(jobs.deleteVideo("v_db_fail", "OWNER").ok, true, "hết lỗi thì xoá bình thường");
});

test("xoá video: chuyển tệp lỗi SAU khi CSDL đã gỡ → báo warning, records.json ghi rõ tệp còn ở chỗ cũ, nhật ký có cảnh báo; tệp khác vẫn chuyển", (t: TestContext) => {
  seedFull("v_mv_fail");
  const orig = fs.renameSync;
  t.mock.method(fs, "renameSync", (...args: Parameters<typeof fs.renameSync>) => {
    if (String(args[0]).endsWith(path.join("video-jobs", "v_mv_fail"))) throw new Error("EBUSY thư mục đang mở");
    return orig.apply(fs, args);
  });
  const r = jobs.deleteVideo("v_mv_fail", "OWNER");
  assert.equal(r.ok, true);
  assert.match(r.ok ? (r.warning ?? "") : "", /1 tệp chưa chuyển được vào lưu trữ, còn ở chỗ cũ: video-jobs\/v_mv_fail \(EBUSY thư mục đang mở\)/);
  const s = state("v_mv_fail");
  assert.deepEqual([s.video, s.feedback, s.links, s.uploadRow], [false, 0, 0, false], "CSDL gỡ trọn (một transaction)");
  assert.equal(s.uploadFile, false, "tệp nguồn vẫn chuyển vào lưu trữ");
  assert.equal(s.jobsDir, true, "thư mục dựng lỗi chuyển → còn ở chỗ cũ, được ghi nhận");
  const arch = fs.readdirSync(path.join(tmp, "removed")).find((x) => x.startsWith("v_mv_fail-"))!;
  assert.ok(fs.existsSync(path.join(tmp, "removed", arch, "v_mv_fail.mp4")));
  const rec = JSON.parse(fs.readFileSync(path.join(tmp, "removed", arch, "records.json"), "utf8"));
  assert.equal(rec.video.id, "v_mv_fail", "dữ liệu CSDL lưu đủ để khôi phục");
  assert.deepEqual(rec.fileErrors.map((f: { from: string }) => f.from), [path.join("video-jobs", "v_mv_fail")]);
  assert.equal(rec.files.length, 2, "danh sách tệp dự kiến chuyển cũng ghi lại");
  const acts = db.getDb().select().from(db.schema.activity).all().map((a) => a.message);
  assert.ok(acts.some((m) => /xoá video “Video v_mv_fail” — CẢNH BÁO: .*chưa chuyển được/.test(m)), "nhật ký ghi rõ trạng thái");
});

function seedPlans(id: string) {
  seedVideo(id, "review");
  const d = path.join(tmp, "video-jobs", id);
  const human = { by: "Biên tập: OWNER", emphasis: [{ t: 1, text: "NGƯỜI" }], diagrams: [], broll: [] };
  const ai = { by: "Biên tập AI tại máy (qwen)", emphasis: [{ t: 2, text: "AI" }], diagrams: [], broll: [] };
  fs.writeFileSync(path.join(d, "plan.json"), JSON.stringify(ai));
  const prevName = "plan.prev-2026-10-24T10-00-00-000Z.json";
  fs.writeFileSync(path.join(d, prevName), JSON.stringify(human));
  return { d, human, ai, prevName };
}

test("khôi phục kế hoạch: rerenderVideo ném SAU khi đã xếp bản dựng → huỷ bản vừa xếp TRƯỚC rồi mới trả tệp (không dựng bằng kế hoạch cũ)", (t: TestContext) => {
  const { d, ai, prevName, human } = seedPlans("v_plan_late");
  const sq = db.getSqlite();
  // writeJob + cập nhật videos đã chạy, ghi lịch sử phản hồi (addVideoFeedback) lỗi
  sq.exec("CREATE TRIGGER t_no_fb BEFORE INSERT ON video_feedback WHEN NEW.video_id IN ('v_plan_late', 'v_plan_keep') BEGIN SELECT RAISE(ABORT, 'lịch sử hỏng'); END;");
  try {
    const r = jobs.restorePrevPlan("v_plan_late", "OWNER");
    assert.equal(r.ok, false);
    assert.match(!r.ok ? r.error : "", /Không dựng lại được: lịch sử hỏng \(đã huỷ bản 2 vừa xếp\)/);
    const j2 = jobs.readJob("v_plan_late", 2)!;
    assert.equal(j2.status, "error", "bản 2 không còn trong hàng dựng");
    assert.ok(jobs.isStoppedJob(j2), "đánh dấu đã dừng (không phải lỗi dựng, không vào Việc cần làm)");
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(d, "plan.json"), "utf8")), ai, "kế hoạch đang dùng trả về");
    assert.deepEqual(jobs.planBackups("v_plan_late"), [prevName]);
    assert.equal(jobs.rerenderBlock("v_plan_late"), null, "dựng lại được tiếp (không kẹt 'đang trong hàng dựng')");

    // Huỷ bản vừa xếp cũng lỗi → KHÔNG trả tệp (bản đã xếp dựng đúng kế hoạch khôi phục), báo rõ
    const k = seedPlans("v_plan_keep");
    const orig = fs.renameSync;
    let jobWrites = 0;
    const rn = t.mock.method(fs, "renameSync", (...args: Parameters<typeof fs.renameSync>) => {
      // lần ghi job.json thứ 2 của bản 2 = stoppedJob (huỷ bản vừa xếp) lỗi
      if (String(args[0]).endsWith(path.join("v_plan_keep", "v2", "job.json.tmp")) && ++jobWrites === 2) throw new Error("ổ đĩa chỉ đọc");
      return orig.apply(fs, args);
    });
    const r2 = jobs.restorePrevPlan("v_plan_keep", "OWNER");
    rn.mock.restore();
    assert.equal(r2.ok, false);
    assert.match(!r2.ok ? r2.error : "", /bản 2 đã xếp dựng với kế hoạch khôi phục và không huỷ được \(ổ đĩa chỉ đọc\) — kế hoạch khôi phục được giữ/);
    assert.equal(jobs.readJob("v_plan_keep", 2)!.status, "queued");
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(k.d, "plan.json"), "utf8")), human, "bản đang xếp dựng đúng kế hoạch đang nằm ở plan.json");
  } finally {
    sq.exec("DROP TRIGGER t_no_fb");
  }
});

test("khôi phục kế hoạch: CSDL hỏng toàn phần (cập nhật videos lỗi) → stoppedJob đã ghi 'đã dừng' rồi mới ném: coi là đã huỷ, trả tệp, báo đúng (phản biện P2-1)", () => {
  const { d, ai, prevName } = seedPlans("v_plan_ro");
  const sq = db.getSqlite();
  sq.exec("CREATE TRIGGER t_ro_video BEFORE UPDATE ON videos WHEN OLD.id = 'v_plan_ro' BEGIN SELECT RAISE(ABORT, 'CSDL chỉ đọc'); END;");
  try {
    const r = jobs.restorePrevPlan("v_plan_ro", "OWNER");
    assert.equal(r.ok, false);
    assert.match(!r.ok ? r.error : "", /Không dựng lại được: CSDL chỉ đọc \(đã huỷ bản 2 vừa xếp\)/);
    assert.doesNotMatch(!r.ok ? r.error : "", /kế hoạch khôi phục được giữ/);
    assert.ok(jobs.isStoppedJob(jobs.readJob("v_plan_ro", 2)), "bản 2 đã thoát hàng dựng");
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(d, "plan.json"), "utf8")), ai, "kế hoạch đang dùng trả về");
    assert.deepEqual(jobs.planBackups("v_plan_ro"), [prevName]);
  } finally {
    sq.exec("DROP TRIGGER t_ro_video");
  }
});

test("xoá video: dừng bản đang dựng lỗi (ghi job.json lỗi) → không ném, không để records.json 'ma', video nguyên vẹn (phản biện P2-2)", (t: TestContext) => {
  seedFull("v_stop_fail");
  const jf = path.join(tmp, "video-jobs", "v_stop_fail", "v1", "job.json");
  fs.writeFileSync(jf, JSON.stringify({ ...JSON.parse(fs.readFileSync(jf, "utf8")), status: "queued" }));
  const orig = fs.renameSync;
  t.mock.method(fs, "renameSync", (...args: Parameters<typeof fs.renameSync>) => {
    if (String(args[0]).endsWith("job.json.tmp")) throw new Error("ổ chỉ đọc");
    return orig.apply(fs, args);
  });
  let r: ReturnType<typeof jobs.deleteVideo> | undefined;
  assert.doesNotThrow(() => {
    r = jobs.deleteVideo("v_stop_fail", "OWNER");
  });
  assert.equal(r?.ok, false);
  assert.match(r && !r.ok ? r.error : "", /Không dừng được bản đang dựng, chưa xoá gì: ổ chỉ đọc/);
  assert.deepEqual(state("v_stop_fail"), untouched);
});

test("xoá video: ghi lại records.json (kèm fileErrors) lỗi giữa chừng → bản records.json đầu vẫn nguyên, đọc được (ghi qua tệp tạm)", (t: TestContext) => {
  seedFull("v_rec_torn");
  const origRename = fs.renameSync;
  const origWrite = fs.writeFileSync;
  t.mock.method(fs, "renameSync", (...args: Parameters<typeof fs.renameSync>) => {
    if (String(args[0]).endsWith(path.join("video-jobs", "v_rec_torn"))) throw new Error("EBUSY");
    return origRename.apply(fs, args);
  });
  let recWrites = 0;
  t.mock.method(fs, "writeFileSync", (...args: Parameters<typeof fs.writeFileSync>) => {
    // lần ghi thứ 2 thẳng vào records.json: ghi dở rồi đĩa đầy
    if (String(args[0]).endsWith("records.json") && ++recWrites === 2) {
      origWrite.call(fs, args[0], "{\"video\":");
      throw new Error("đĩa đầy");
    }
    return origWrite.apply(fs, args);
  });
  const r = jobs.deleteVideo("v_rec_torn", "OWNER");
  assert.equal(r.ok, true);
  const arch = fs.readdirSync(path.join(tmp, "removed")).find((x) => x.startsWith("v_rec_torn-"))!;
  const rec = JSON.parse(fs.readFileSync(path.join(tmp, "removed", arch, "records.json"), "utf8"));
  assert.equal(rec.video.id, "v_rec_torn");
  assert.deepEqual(rec.fileErrors.map((f: { from: string }) => f.from), [path.join("video-jobs", "v_rec_torn")]);
  assert.ok(!fs.readdirSync(path.join(tmp, "removed", arch)).some((f) => f.endsWith(".tmp")), "không để tệp tạm");
});
