// Kiểm toán độc lập 26/10/2026 (F4, F6, F7 + mục 2–5): MỘT nguồn cho mọi con số "cần anh xử lý" (src/lib/attention.ts).
// Ô "Lỗi cần xử lý" Tổng quan = Việc cần làm (lỗi) = nhóm lỗi trong chuông = tình trạng hệ thống; badge Video Studio / Hook = thẻ Hành trình
// = trang đích; mẫu số Kết nối chung. CSDL + DATA_DIR tạm, không chạm data/ thật.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "baor-attention-"));
process.env.DATA_DIR = tmp;
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.AUTH_SECRET = "test-secret-".padEnd(40, "x");
process.env.BAOR_VIDEO_WORKER = "off";

let db: typeof import("../src/db");
let config: typeof import("../src/lib/connectors/config");
let dash: typeof import("../src/lib/dashboard-data");
let shell: typeof import("../src/lib/shell-data");
let att: typeof import("../src/lib/attention");
let jobs: typeof import("../src/lib/video/jobs");
let journey: typeof import("../src/lib/brand/journey");
let hooks: typeof import("../src/lib/content/hooks");
let registry: typeof import("../src/lib/connectors/registry");
let pipeline: typeof import("../src/lib/brand/pipeline");

before(async () => {
  db = await import("../src/db");
  config = await import("../src/lib/connectors/config");
  dash = await import("../src/lib/dashboard-data");
  shell = await import("../src/lib/shell-data");
  att = await import("../src/lib/attention");
  jobs = await import("../src/lib/video/jobs");
  journey = await import("../src/lib/brand/journey");
  hooks = await import("../src/lib/content/hooks");
  registry = await import("../src/lib/connectors/registry");
  pipeline = await import("../src/lib/brand/pipeline");
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const workflow = () => dash.getPending().filter((p) => p.kind === "workflow");
const bellErrors = () => shell.getNotifications().filter((n) => n.group === "error");

function reset() {
  const d = db.getDb();
  d.delete(db.schema.syncRuns).run();
  d.delete(db.schema.scheduledPosts).run(); // có cả bài mẫu "failed" của seed
}

function failRun(key: string, kind: string, msg: string) {
  const id = config.startRun(key, kind);
  config.finishRun(id, false, msg);
  return id;
}

test("F4: lỗi dựng cũ tự đóng khi lần sau cùng đối tượng thành công; nhãn đúng việc (không 'Webhook video_auto_edit')", async () => {
  reset();
  failRun("video_auto_edit", "Video 1011", "'float' object is not subscriptable");
  await sleep(3);
  const ok = config.startRun("video_auto_edit", "Video 1011");
  config.finishRun(ok, true, "Dựng xong “Video 1011” bản 2 → Chờ kiểm tra", 1);
  assert.deepEqual(workflow().map((p) => p.title), [], "lỗi đã được bản sau khắc phục không còn là việc cần làm");
  // lỗi của video KHÁC vẫn còn, nhãn theo việc thật
  failRun("video_auto_edit", "Video 2022", "ffmpeg lỗi");
  const titles = workflow().map((p) => p.title);
  assert.equal(titles.length, 1);
  assert.match(titles[0], /^Dựng video “Video 2022” lỗi: ffmpeg lỗi$/);
  assert.ok(!titles.some((t) => /Webhook video_auto_edit/.test(t)));
});

test("mục 2: bốn nơi đếm lỗi ra CÙNG một số (lọc theo 24 giờ, không theo N dòng); lỗi bài đăng không đếm đôi", async () => {
  reset();
  failRun("facebook_page", "metrics", "Token hết hạn"); // lỗi cũ hơn 30 dòng gần nhất
  for (let i = 0; i < 31; i++) config.finishRun(config.startRun("website", "webhook"), true, "ok");
  failRun("claude", "check", "Khoá sai"); // tính qua trạng thái kết nối, không phải lần chạy lỗi
  // bài chữ đăng lỗi: vừa có run "publish" lỗi vừa có bài "failed" → MỘT lỗi
  failRun("facebook_page", "publish", "(#200) Không có quyền");
  db.getDb().insert(db.schema.scheduledPosts).values({ id: "sp_err", contentId: "ct_x", title: "Bài A", platform: "facebook", scheduledFor: new Date().toISOString(), status: "failed", error: "(#200) Không có quyền" }).run();

  const errors = att.listErrors();
  assert.deepEqual(errors.map((e) => e.source).sort(), ["post", "run"], `danh sách lỗi: ${errors.map((e) => e.title).join(" | ")}`);
  const status = dash.getSystemStatus(0);
  const counts = { lỗi: errors.length, tổngQuan: dash.getOverview().alerts, ôLỗiTổngQuan: status.issues.length, việcCầnLàm: workflow().length, chuông: bellErrors().length };
  assert.deepEqual(counts, { lỗi: 2, tổngQuan: 2, ôLỗiTổngQuan: 2, việcCầnLàm: 2, chuông: 2 });
  assert.deepEqual(status.issues, workflow().map((w) => w.title).sort((a, b) => status.issues.indexOf(a) - status.issues.indexOf(b)), "ô Lỗi cần xử lý = đúng các mục lỗi trong Việc cần làm");
  assert.equal(status.issues.filter((x) => x.includes("Bài A")).length, 1, "bài lỗi không đếm đôi (Agent đăng bài + bài)");
  assert.equal(shell.getHealth().failedRuns24h, att.failedRuns().length);
  assert.equal(att.failedRuns().length, 1);
});

test("F6 / mục 3: bài lỗi SAU khi nền tảng đã nhận (có mã bài, không xác minh được sau 24 giờ) = 'cần kiểm trang' một mục, không đỏ", () => {
  reset();
  db.getDb().insert(db.schema.scheduledPosts).values({ id: "sp_chk", contentId: "ct_x", title: "Video đã gửi", platform: "facebook", videoId: "v_x", scheduledFor: new Date().toISOString(), status: "failed", externalId: "111_999", error: "Không xác minh được sau 24 giờ: lỗi đọc. Kiểm tra trang (mã 111_999)." }).run();
  const h = shell.getHealth();
  assert.equal(h.issues.filter((x) => x.startsWith("Đăng lỗi")).length, 0, "không còn là 'Đăng lỗi' (đỏ)");
  assert.equal(h.issues.filter((x) => x.startsWith("Cần kiểm trang")).length, 1);
  const errors = att.listErrors();
  assert.equal(errors.length, 1);
  assert.equal(errors[0].severity, "warn");
  assert.equal(errors[0].href, "/publishing?video=v_x#video-posts");
  assert.notEqual(dash.getSystemStatus(0).level, "error", "chỉ có bài cần kiểm trang → không đỏ");
  assert.equal(dash.getAgents().find((a) => a.id === "publish")!.status === "error", false);
  assert.equal(bellErrors().length, 1);
});

function seedVideo(id: string, status: string, uploadId: string | null) {
  db.getDb().insert(db.schema.videos).values({ id, title: `Video ${id}`, contentId: null, agent: "t", status, platforms: "[]", version: 1, note: "", uploadId, updatedAt: new Date().toISOString() }).run();
}

test("F7 / mục 4–5: video Chờ kiểm tra vào badge, Việc cần làm, chuông VÀ thẻ bước 4 như nhau; video mẫu / không tệp không vào", () => {
  const snap = () => ({
    badge: att.videosAwaitingOwner().length,
    việcCầnLàm: dash.getPending().filter((x) => x.kind === "video").length,
    chuông: shell.getNotifications().filter((n) => n.group === "approval" && n.type === "Video").length,
    thẻ4: journey.journeyCards().find((c) => c.n === 4)!.value,
  });
  const a = snap();
  seedVideo("v_rev", "review", "up_rev");
  seedVideo("v_pa", "pending_approval", "up_pa");
  seedVideo("v_nofile", "review", null); // không tệp: máy chủ chặn Duyệt → không phải việc cần làm
  const b = snap();
  assert.deepEqual({ badge: b.badge - a.badge, việcCầnLàm: b.việcCầnLàm - a.việcCầnLàm, chuông: b.chuông - a.chuông, thẻ4: b.thẻ4 - a.thẻ4 }, { badge: 2, việcCầnLàm: 2, chuông: 2, thẻ4: 2 });
  assert.equal(b.badge, b.việcCầnLàm);
  assert.equal(b.badge, b.chuông);
  const ids = dash.getPending().filter((x) => x.kind === "video").map((x) => x.id);
  for (const sample of ["ap-v1", "ap-v2", "ap-v_md2"]) assert.ok(!ids.includes(sample), `video mẫu ${sample} không vào Việc cần làm`);
  assert.ok(!ids.includes("ap-v_nofile"));
  assert.equal(dash.getPending().find((x) => x.id === "ap-v_rev")!.moduleHref, "/video-studio?open=v_rev", "mở đúng video");
});

test("mục 5: video 'editing' có bản dựng lỗi / video mẫu không job KHÔNG tính là đang dựng (Agent, thẻ Hành trình)", () => {
  fs.mkdirSync(path.join(tmp, "uploads"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "uploads", "src.mp4"), "x");
  db.getDb().insert(db.schema.uploads).values({ id: "up_src", kind: "video", name: "src.mp4", fileName: "src.mp4", mime: "video/mp4", size: 1, meta: "{}", uploadedBy: "t", createdAt: new Date().toISOString() }).run();
  const vid = jobs.createVideoFromSource({ title: "Nguồn A", sourceUploadId: "up_src", cutSilence: false, by: "t", start: true });
  const editingTotal = db.getDb().select().from(db.schema.videos).where(eq(db.schema.videos.status, "editing")).all().length;
  assert.ok(editingTotal >= 2, "có cả video mẫu 'editing' không có bản dựng");
  assert.deepEqual(att.videosRendering().map((v) => v.id), [vid], "chỉ video có bản dựng đang chờ / chạy");
  assert.match(dash.getAgents().find((a) => a.id === "video")!.task, /^1 video đang dựng/);
  assert.equal(jobs.stopVideoJob(vid, "OWNER").ok, true);
  assert.deepEqual(att.videosRendering(), [], "bản dựng đã dừng / lỗi → không còn 'đang dựng'");
  assert.match(dash.getAgents().find((a) => a.id === "video")!.task, /^0 video đang dựng/);
  const stage = (journey.journeyCards().find((c) => c.n === 4)!);
  assert.equal(stage.value, att.videosAwaitingOwner().length, "thẻ 4 = đang dựng (0) + chờ duyệt");
  // "dựng lỗi / đã dừng" chỉ đếm video có bản dựng lỗi thật — video thật "editing" chưa có job / tệp không tính (phản biện P3)
  seedVideo("v_nojob", "editing", null);
  assert.deepEqual(att.videosRenderFailed().map((v) => v.id), [vid], "chỉ video có bản dựng lỗi / đã dừng");
  assert.ok(pipeline.getBrandPipeline().stages.find((x) => x.key === "video"));
});

test("mục 4: badge 'Hook & kịch bản' = thẻ bước 3 = danh sách hook chờ chọn của trang /content/hooks (không đếm contentItems)", () => {
  const card3 = () => journey.journeyCards().find((c) => c.n === 3)!.value;
  const pageNew = () => hooks.listHooks().filter((h) => h.status === "new").length;
  const a = att.hooksAwaiting();
  assert.equal(a, card3());
  assert.equal(a, pageNew());
  db.getDb().insert(db.schema.contentItems).values({ id: "ct_wip", title: "Kịch bản đang viết", format: "script", status: "in_progress", draft: "", createdAt: new Date().toISOString() }).run();
  assert.equal(att.hooksAwaiting(), a, "kịch bản đang viết không làm tăng badge Hook");
  db.getDb().insert(db.schema.hookIdeas).values({ id: "hk_t", batchId: "hb_t", hook: "Hook thử", createdAt: new Date().toISOString() }).run();
  assert.equal(att.hooksAwaiting(), a + 1);
  assert.equal(card3(), a + 1);
  assert.equal(pageNew(), a + 1);
});

test("mục 4: 'Kết nối' cùng mẫu số ở thanh bên (sức khoẻ) và ô Tổng quan", () => {
  // Định nghĩa của ô Tổng quan (src/components/dashboard/overview-strip.tsx)
  const overview = config.listIntegrationStatus().filter((i) => (!/^facebook_page_\d+$/.test(i.key) || i.connected || i.lastCheckedAt) && !registry.connectorFor(i.key)?.pending);
  const h = shell.getHealth();
  assert.equal(h.realCount, overview.length);
  assert.equal(h.connectedCount, overview.filter((i) => i.connected).length);
  assert.equal(shell.connectionStats().total, overview.length);
});

test("bài quá hạn (overdue) = MỘT mục 'xếp lại' trong Việc cần làm (trỏ /publishing), không phải lỗi đỏ; bài mẫu không vào số nào", () => {
  reset();
  const at = new Date(Date.now() - 8 * 3600_000).toISOString();
  for (const id of ["sp_od1", "sp_od2"]) db.getDb().insert(db.schema.scheduledPosts).values({ id, contentId: "ct_x", title: `Bài ${id}`, platform: "facebook", scheduledFor: at, status: "overdue", error: "Quá giờ hẹn hơn 6 giờ" }).run();
  // bài mẫu của seed (sp7, "failed"): không bao giờ đăng → không phải lỗi / việc cần làm
  db.getDb().insert(db.schema.scheduledPosts).values({ id: "sp7", contentId: "ct6", title: "Bài mẫu", platform: "facebook", scheduledFor: at, status: "failed", error: "Token Facebook hết hạn." }).run();
  const sched = dash.getPending().filter((p) => p.kind === "schedule");
  assert.equal(sched.length, 1, "gộp một mục");
  assert.equal(sched[0].title, "2 bài quá hạn, cần xếp lại giờ đăng");
  assert.equal(sched[0].moduleHref, "/publishing");
  assert.deepEqual(att.listErrors(), [], "quá hạn / bài mẫu không phải lỗi");
  assert.equal(dash.getOverview().alerts, 0);
  const h = shell.getHealth();
  assert.equal(h.issues.filter((x) => x.startsWith("Đăng lỗi")).length, 0);
  assert.equal(h.issues.filter((x) => x.includes("quá hạn")).length, 1);
  assert.notEqual(dash.getSystemStatus(0).level, "error");
  assert.equal(shell.getNotifications().filter((n) => n.group === "due" && n.text.includes("quá hạn")).length, 1);
});

test("badge menu 'Lead' = lead thật giai đoạn 'new' (không đếm hội thoại, không đếm lead mẫu); menu giữ nhãn OWNER đã duyệt", async () => {
  const { menu, menuGroupLabel } = await import("../src/config/menu");
  const d = db.getDb();
  d.delete(db.schema.leads).run();
  const at = new Date().toISOString();
  const lead = (id: string, stage: string) => d.insert(db.schema.leads).values({ id, name: id, source: "inbox", platform: "facebook", stage, lastMessageAt: at }).run();
  lead("ld_real_new", "new");
  lead("ld_real_new2", "new");
  lead("ld_real_contacted", "contacted");
  lead("ld_real_won", "won");
  lead("l1", "new"); // id của lead mẫu (seed) → không tính
  assert.equal(att.leadsAwaiting(), 2);
  const business = menu.filter((m) => m.group === "business").map((m) => m.label);
  assert.equal(menuGroupLabel.business, "Khác");
  assert.deepEqual(business, ["Chiến dịch", "Lead", "Tư liệu"]);
});

test("chuông: mục nhật ký hoạt động trỏ trang theo phân hệ ghi (activity.step), không trỏ /dashboard", async () => {
  const { hrefForActivityStep } = await import("../src/config/menu");
  assert.equal(hrefForActivityStep("publishing"), "/publishing");
  assert.equal(hrefForActivityStep("video"), "/video-studio");
  assert.equal(hrefForActivityStep("customers"), "/customers");
  assert.equal(hrefForActivityStep("insights"), "/insights/research");
  assert.equal(hrefForActivityStep("automation"), "/settings");
  assert.equal(hrefForActivityStep("reports"), "/insights/learning");
  assert.equal(hrefForActivityStep(""), "/dashboard");
  assert.equal(hrefForActivityStep("la"), "/dashboard");
  const { logActivity } = await import("../src/lib/activity");
  logActivity("human", "Thử nhật ký đăng bài", "publishing");
  const n = shell.getNotifications().find((x) => x.group === "activity" && x.text === "Thử nhật ký đăng bài");
  assert.equal(n?.href, "/publishing");
});
