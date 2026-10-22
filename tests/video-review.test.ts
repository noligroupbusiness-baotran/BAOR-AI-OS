// Video Review: góp ý theo mốc → yêu cầu sửa → dựng lại có phạm vi → kiểm bản mới. CSDL + thư mục dữ liệu tạm, bộ dựng tắt
// (bản dựng xong được giả lập bằng đúng định dạng tệp bộ dựng ghi ra: job.json, plan.json, report.json).
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "baor-review-"));
process.env.DATA_DIR = tmp;
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.AUTH_SECRET = "test-secret-".padEnd(40, "x");
process.env.BAOR_VIDEO_WORKER = "off";

let db: typeof import("../src/db");
let review: typeof import("../src/lib/video/review");
let rt: typeof import("../src/lib/video/review-types");
let jobs: typeof import("../src/lib/video/jobs");

before(async () => {
  db = await import("../src/db");
  review = await import("../src/lib/video/review");
  rt = await import("../src/lib/video/review-types");
  jobs = await import("../src/lib/video/jobs");
});

const PLAN = {
  by: "Biên tập: t",
  note: "",
  emphasis: [
    { t: 10.0, text: "PHÁ BĂNG", style: "blur" },
    { t: 30.0, text: "Chào hỏi", style: "fade" },
  ],
  diagrams: [{ type: "arrow", t0: 40.0, t1: 46.0, top: { t: 40.1, text: "phần chào hỏi" }, bottom: { t: 43.0, text: "gỡ bỏ khoảng cách" } }],
  broll: [{ t0: 50.0, t1: 52.5, file: "anh/x.jpg", keyword: "công ty" }],
};
// Bản dựng đã cắt lặng: bỏ 5–8 s gốc → mốc gốc 10 s nằm ở 7 s bản dựng
const KEEP: [number, number][] = [[0, 5], [8, 60]];

function writeVersion(videoId: string, v: number, opts: { status?: string; plan?: unknown; emphasis?: unknown[]; diagrams?: unknown[]; broll?: unknown[] } = {}) {
  const dir = path.join(tmp, "video-jobs", videoId, `v${v}`);
  fs.mkdirSync(dir, { recursive: true });
  const now = new Date().toISOString();
  fs.writeFileSync(path.join(dir, "job.json"), JSON.stringify({ videoId, version: v, status: opts.status ?? "done", sourceUploadId: "up_src", cutSilence: true, aspect: "9:16", prompt: "", createdAt: now, by: "t" }));
  fs.writeFileSync(path.join(dir, "plan.json"), JSON.stringify(opts.plan ?? PLAN));
  fs.writeFileSync(
    path.join(dir, "report.json"),
    JSON.stringify({
      output: { seconds: 57, keep: KEEP },
      emphasis: opts.emphasis ?? [{ t: 7.0, text: "PHÁ BĂNG", kind: "blur" }, { t: 27.0, text: "Chào hỏi", kind: "fade" }],
      diagrams: opts.diagrams ?? [{ type: "arrow", t0: 37.0, t1: 43.0 }],
      broll: { events: opts.broll ?? [{ t0: 47.0, t1: 49.5, file: "anh/x.jpg" }] },
      qa: [],
      failed: [],
      blockers: [],
      captions: { units: 1 },
      elapsedSec: 1,
    }),
  );
}

function seed(videoId: string) {
  const now = new Date().toISOString();
  db.getDb().insert(db.schema.videos).values({ id: videoId, title: `Video ${videoId}`, contentId: null, agent: "t", status: "review", platforms: "[]", version: 1, note: "", uploadId: null, updatedAt: now }).run();
  writeVersion(videoId, 1);
  fs.writeFileSync(path.join(tmp, "video-jobs", videoId, "plan.json"), JSON.stringify(PLAN));
}

test("góp ý: mốc theo bản dựng đổi đúng sang mốc gốc (đã cắt lặng); mốc ngoài video / chữ trống bị từ chối; tìm đúng mục kế hoạch gần mốc", () => {
  seed("v_a");
  assert.equal(review.addComment({ videoId: "v_a", version: 1, t: 999, text: "x", by: "t" }).ok, false);
  assert.equal(review.addComment({ videoId: "v_a", version: 1, t: 3, text: "   ", by: "t" }).ok, false);
  assert.equal(review.addComment({ videoId: "v_a", version: 9, t: 3, text: "x", by: "t" }).ok, false, "bản không tồn tại");
  const r = review.addComment({ videoId: "v_a", version: 1, t: 7, tEnd: 8, text: "Chữ nhấn này thừa", by: "OWNER" });
  assert.equal(r.ok, true);
  const c = review.listComments("v_a")[0];
  assert.equal(c.srcT, 10, "7 s bản dựng = 10 s gốc (đã bỏ 3 s lặng)");
  assert.equal(c.srcTEnd, 11);
  assert.equal(c.status, "open");
  const near = rt.candidatesNear(PLAN, KEEP, 7, 8);
  assert.equal(near[0].label, "Chữ nhấn “PHÁ BĂNG”");
  assert.equal(near[0].t, 10);
  assert.equal(near.some((x) => x.kind === "diagrams"), false, "sơ đồ ở 37 s không lẫn vào");
  assert.deepEqual(rt.candidatesNear(PLAN, KEEP, 38, null).map((x) => x.kind), ["diagrams"], "đang hiện sơ đồ (37–43 s) thì tìm ra sơ đồ");
});

test("yêu cầu sửa không hợp lệ bị chặn", () => {
  const T = { kind: "emphasis" as const, t: 10, label: "x" };
  assert.match(rt.validateFix({ target: T, action: "text", value: " " }) ?? "", /chữ mới/);
  assert.match(rt.validateFix({ target: T, action: "style", value: "nhay" }) ?? "", /Kiểu/);
  assert.match(rt.validateFix({ target: { ...T, kind: "broll" }, action: "text", value: "a" }) ?? "", /không có chữ/);
  assert.match(rt.validateFix({ target: { ...T, kind: "diagrams", field: "__proto__.x" }, action: "text", value: "a" }) ?? "", /Ô chữ/);
  assert.equal(rt.validateFix({ target: { ...T, kind: "diagrams", field: "bottom.text" }, action: "text", value: "gỡ khoảng cách" }), null);
});

test("dựng lại theo góp ý: chỉ đổi đúng mục được góp ý, xếp hàng bản mới, góp ý ghi chú không bị đụng; lịch sử phản hồi ghi lại", () => {
  seed("v_b");
  const off = { target: { kind: "emphasis" as const, t: 10, label: "Chữ nhấn “PHÁ BĂNG”" }, action: "off" as const };
  const txt = { target: { kind: "diagrams" as const, t: 40, label: "Sơ đồ arrow", field: "bottom.text" }, action: "text" as const, value: "gỡ khoảng cách" };
  assert.equal(review.applyComments("v_b", "t").ok, false, "chưa có yêu cầu sửa thì không dựng lại");
  review.addComment({ videoId: "v_b", version: 1, t: 7, text: "Bỏ chữ nhấn này", fix: off, by: "OWNER" });
  review.addComment({ videoId: "v_b", version: 1, t: 37, text: "Rút gọn dòng dưới", fix: txt, by: "OWNER" });
  review.addComment({ videoId: "v_b", version: 1, t: 20, text: "Ánh sáng hơi tối (ghi chú)", by: "OWNER" });
  const r = review.applyComments("v_b", "OWNER");
  assert.deepEqual(r, { ok: true, version: 2, applied: 2 });
  const plan = jobs.readEditorPlan("v_b").plan as typeof PLAN & { emphasis: { off?: boolean }[] };
  assert.equal(plan.emphasis[0].off, true);
  assert.deepEqual(plan.emphasis[1], PLAN.emphasis[1], "chữ nhấn khác giữ nguyên");
  assert.equal(plan.diagrams[0].bottom.text, "gỡ khoảng cách");
  assert.equal(plan.diagrams[0].top.text, "phần chào hỏi");
  assert.deepEqual(plan.broll, PLAN.broll);
  assert.equal(jobs.readJob("v_b", 2)?.status, "queued");
  const cs = review.listComments("v_b");
  assert.equal(cs.find((c) => c.text.startsWith("Ánh sáng"))?.status, "open", "ghi chú không kèm yêu cầu sửa vẫn mở");
  assert.equal(cs.filter((c) => c.status === "planned" && c.appliedVersion === 2).length, 2);
  // Đang dựng lại: không đổi yêu cầu, không xác nhận được
  const planned = cs.find((c) => c.status === "planned")!;
  assert.equal(review.setCommentFix(planned.id, null, "t").ok, false);
  assert.equal(review.resolveComment(planned.id, "t").ok, false);
  const fb = db.getDb().select().from(db.schema.videoFeedback).all().filter((f) => f.videoId === "v_b");
  assert.ok(fb.some((f) => f.kind === "rerender" && /theo 2 góp ý/.test(f.note)));
  assert.equal(fb.filter((f) => f.kind === "rerender" && f.version === 2).length, 1, "một lần dựng lại = một dòng lịch sử");
});

test("kiểm bản mới: đạt khi đầu ra bộ dựng khớp; KHÔNG đạt khi bộ dựng bỏ qua yêu cầu (vẫn còn chữ nhấn) hoặc bản dựng lỗi", () => {
  // Bản 2 của v_b dựng xong NHƯNG bộ dựng vẫn vẽ "PHÁ BĂNG" (giả lập bộ dựng bỏ qua off) → phải báo chưa áp dụng
  const editorPlan = jobs.readEditorPlan("v_b").plan;
  writeVersion("v_b", 2, { plan: editorPlan });
  assert.equal(review.verifyComments("v_b"), 2);
  let cs = review.listComments("v_b");
  const emph = cs.find((c) => c.fix?.target.kind === "emphasis")!;
  assert.equal(emph.status, "failed");
  assert.match(emph.verifyNote, /vẫn có chữ nhấn “PHÁ BĂNG”/);
  const dia = cs.find((c) => c.fix?.target.kind === "diagrams")!;
  assert.equal(dia.status, "applied", "kế hoạch bản 2 có chữ mới + bộ dựng có sơ đồ ở 37 s");
  // Chưa đạt → dựng lại lần nữa; lần này đầu ra không còn chữ nhấn ở 7 s → đạt
  const r = review.applyComments("v_b", "OWNER");
  assert.equal(r.ok && r.version, 3);
  writeVersion("v_b", 3, { plan: jobs.readEditorPlan("v_b").plan, emphasis: [{ t: 27.0, text: "Chào hỏi", kind: "fade" }] });
  review.verifyComments("v_b");
  cs = review.listComments("v_b");
  assert.equal(cs.find((c) => c.id === emph.id)!.status, "applied");
  assert.match(cs.find((c) => c.id === emph.id)!.verifyNote, /Bản 3: Bản dựng không còn chữ nhấn ở 7\.0 s/);
  // Xác nhận xong / mở lại
  assert.equal(review.resolveComment(emph.id, "OWNER").ok, true);
  assert.equal(review.listComments("v_b").find((c) => c.id === emph.id)!.status, "resolved");
  assert.equal(review.resolveComment(emph.id, "OWNER", true).ok, true);
  assert.equal(review.listComments("v_b").find((c) => c.id === emph.id)!.status, "open");
  // Bản dựng lỗi → góp ý "chưa áp dụng được" kèm lý do
  seed("v_c");
  review.addComment({ videoId: "v_c", version: 1, t: 47, text: "Bỏ ảnh", fix: { target: { kind: "broll", t: 50, label: "Ảnh" }, action: "off" }, by: "OWNER" });
  assert.equal(review.applyComments("v_c", "OWNER").ok, true);
  writeVersion("v_c", 2, { status: "error" });
  review.verifyComments("v_c");
  assert.match(review.listComments("v_c")[0].verifyNote, /dựng lỗi/);
  assert.equal(review.listComments("v_c")[0].status, "failed");
  // Lịch sử: không có góp ý nào bị xoá
  assert.equal(db.getDb().select().from(db.schema.videoComments).all().length, 5, "v_a 1 + v_b 3 + v_c 1");
});

test("so phiên bản: chỉ liệt kê bản đã dựng xong có preview", () => {
  for (const v of [1, 3]) fs.writeFileSync(path.join(tmp, "video-jobs", "v_b", `v${v}`, "preview.mp4"), "x");
  assert.deepEqual(review.comparableVersions("v_b"), [3, 1]);
});

test("phản biện S2: hai sơ đồ cùng mốc → sửa đúng mục được chọn, kiểm không báo sai; mốc mơ hồ bị từ chối", () => {
  const plan = {
    emphasis: [],
    broll: [],
    diagrams: [
      { type: "leak", t0: 20 },
      { type: "chapter", t0: 20, t1: 23, text: "phần hai", num: "02" },
    ],
  };
  const cands = rt.candidatesNear(plan, null, 20, null);
  const chap = cands.find((c) => c.label.includes("chapter"))!;
  assert.equal(chap.type, "chapter");
  const fix = { target: { kind: chap.kind, t: chap.t, label: chap.label, type: chap.type }, action: "off" as const };
  const r = rt.applyFix(plan, fix);
  assert.equal(r.error, undefined);
  assert.equal((r.plan.diagrams![0] as { off?: boolean }).off, undefined, "vệt sáng cùng mốc KHÔNG bị tắt");
  assert.equal((r.plan.diagrams![1] as { off?: boolean }).off, true);
  // Bộ dựng vẫn vẽ thẻ chương → phải báo chưa áp dụng (trước đây khớp nhầm vệt sáng rồi báo đạt)
  const wrongPlan = structuredClone(plan) as typeof plan & { diagrams: { off?: boolean }[] };
  wrongPlan.diagrams[0].off = true;
  const v = rt.verifyFix(fix, wrongPlan, { diagrams: [{ type: "chapter", t0: 20 }], output: { keep: null } });
  assert.equal(v.ok, false);
  // Hai mục giống hệt cùng mốc → mơ hồ, không đoán
  const twin = { emphasis: [{ t: 5, text: "A" }, { t: 5, text: "A" }] };
  assert.match(rt.applyFix(twin, { target: { kind: "emphasis", t: 5, label: "Chữ nhấn “A”" }, action: "off" }).error ?? "", /mơ hồ/);
});

test("phản biện S2: yêu cầu không làm đổi gì bị từ chối; ô chữ không tồn tại bị từ chối", () => {
  const plan = { emphasis: [{ t: 5, text: "PHÁ BĂNG", style: "blur" }], diagrams: [{ type: "arrow", t0: 9, t1: 12, top: { t: 9, text: "a" }, bottom: { t: 10, text: "b" } }] };
  const E = { kind: "emphasis" as const, t: 5, label: "Chữ nhấn “PHÁ BĂNG”" };
  assert.match(rt.applyFix(plan, { target: E, action: "text", value: "PHÁ BĂNG" }).error ?? "", /không làm thay đổi/);
  assert.match(rt.applyFix(plan, { target: E, action: "style", value: "blur" }).error ?? "", /không làm thay đổi/);
  const A = { kind: "diagrams" as const, t: 9, label: "Sơ đồ arrow “a”", type: "arrow" };
  assert.match(rt.applyFix(plan, { target: { ...A, field: "steps.9.text" }, action: "text", value: "x" }).error ?? "", /ô chữ/i);
  assert.match(rt.applyFix(plan, { target: A, action: "text", value: "x" }).error ?? "", /ô chữ/i, "sơ đồ arrow không có trường text gốc");
  assert.equal(rt.applyFix(plan, { target: { ...A, field: "bottom.text" }, action: "text", value: "c" }).error, undefined);
});

test("phản biện S2: không dựng lại được (video chờ phê duyệt) thì KHÔNG ghi kế hoạch; fix được chuẩn hoá trước khi lưu", () => {
  seed("v_p");
  review.addComment({ videoId: "v_p", version: 1, t: 7, text: "Bỏ", fix: { target: { kind: "emphasis", t: 10, label: "x".repeat(5000) }, action: "off" }, by: "OWNER" });
  const c = review.listComments("v_p")[0];
  assert.ok(c.fix!.target.label.length <= 120, "nhãn bị cắt");
  db.getDb().update(db.schema.videos).set({ status: "pending_approval" }).where(eq(db.schema.videos.id, "v_p")).run();
  const before = fs.readFileSync(path.join(tmp, "video-jobs", "v_p", "plan.json"), "utf8");
  const r = review.applyComments("v_p", "OWNER");
  assert.equal(r.ok, false);
  assert.equal(fs.readFileSync(path.join(tmp, "video-jobs", "v_p", "plan.json"), "utf8"), before, "kế hoạch không bị ghi");
  assert.equal(review.listComments("v_p")[0].status, "open");
});
