// CP06: phân tích kết quả → đề xuất cải tiến (giả thuyết, có cỡ mẫu). CSDL tạm.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "baor-learn-"));
process.env.DATA_DIR = tmp;
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.AUTH_SECRET = "test-secret-".padEnd(40, "x");
process.env.BAOR_VIDEO_WORKER = "off";

let an: typeof import("../src/lib/learning/analyze");
let learn: typeof import("../src/lib/learning");
let db: typeof import("../src/db");

before(async () => {
  db = await import("../src/db");
  an = await import("../src/lib/learning/analyze");
  learn = await import("../src/lib/learning");
});

const post = (topic: string, views: number, i: number) => ({ id: `${topic}${i}`, title: topic, topic, platform: "facebook", views, reach: views * 2, engagement: Math.round(views * 0.1) });

test("nội dung: chưa đủ mẫu thì không kết luận; đủ mẫu và chênh rõ thì đề xuất làm tiếp chủ đề tốt (giả thuyết)", () => {
  const few = [post("A", 5000, 1), post("A", 6000, 2), post("B", 400, 1)];
  assert.deepEqual(an.contentProposals(an.topicPerformance(few)), [], "dưới 3 bài mỗi chủ đề");
  const rows = [1, 2, 3].flatMap((i) => [post("Chào hỏi", 3000 + i, i), post("Chốt đơn", 900 + i, i)]);
  const p = an.contentProposals(an.topicPerformance(rows));
  assert.equal(p.length, 1);
  assert.match(p[0].title, /Chào hỏi/);
  assert.match(p[0].detail, /Giả thuyết/);
  assert.equal(p[0].sampleSize, 6);
});

test("video: lỗi bảng kiểm chỉ là 'lặp lại' khi gặp ở từ 2 video (bản mới nhất); phản hồi sửa gom theo nhóm", () => {
  const rep = (videoId: string, version: number, status: string) => ({ videoId, version, blockers: [], qa: [{ id: "F", name: "Bố cục", status, detail: "logo lố 42px" }] });
  assert.deepEqual(an.videoQaPatterns([rep("v1", 1, "fail")]), [], "một video chưa phải mẫu lặp");
  assert.deepEqual(an.videoQaPatterns([rep("v1", 1, "fail"), rep("v1", 2, "pass"), rep("v2", 1, "fail")]), [], "bản mới nhất của v1 đã đạt");
  const p = an.videoQaPatterns([rep("v1", 1, "blocker"), rep("v2", 1, "fail")]);
  assert.equal(p.length, 1);
  assert.equal(p[0].target, "video_skill");
  const fb = an.feedbackPatterns([{ videoId: "v1", note: "Nhạc to quá" }, { videoId: "v2", note: "giảm nhạc nền" }, { videoId: "v3", note: "logo nhỏ lại" }]);
  assert.deepEqual(fb.map((x) => x.key), ["video_skill:feedback:nhạc / âm thanh"]);
});

test("quảng cáo và kiến thức: chỉ đánh giá quảng cáo đủ dữ liệu; chỗ thiếu lặp lại thành đề xuất bổ sung Second Brain", () => {
  const ads = an.adProposals([{ id: "a", name: "Tốt", status: "active", spent: 400_000, leads: 12, impressions: 9000 }, { id: "b", name: "Ít dữ liệu", status: "active", spent: 30_000, leads: 1, impressions: 800 }], 50_000);
  assert.deepEqual(ads.map((x) => x.key), ["ads:good:a"]);
  const k = an.knowledgeProposals([{ briefId: "b1", gap: "Câu chuyện thật của OWNER về cuộc gọi" }, { briefId: "b2", gap: "Câu chuyện thật của OWNER về cuộc gọi khác" }], [{ pageId: "p1", title: "SOP", uses: 2 }]);
  assert.ok(k.some((x) => x.key.startsWith("second_brain:gap:") && x.sampleSize === 2));
  assert.ok(k.some((x) => x.key === "second_brain:verify:p1"));
});

test("lưu đề xuất: chạy lại không tạo trùng; bản nháp Second Brain chỉ gồm đề xuất OWNER đã chấp nhận, ghi rõ DRAFT", () => {
  const d = db.getDb();
  const now = new Date().toISOString();
  d.insert(db.schema.contentBriefs).values({ id: "br1", taskId: null, contentId: "ct1", topic: "B1", points: "[]", gaps: JSON.stringify(["Câu thoại chuẩn cho bước chào hỏi"]), qa: "{}", status: "used", createdAt: now, updatedAt: now }).run();
  d.insert(db.schema.contentBriefs).values({ id: "br2", taskId: null, contentId: "ct2", topic: "B2", points: "[]", gaps: JSON.stringify(["Câu thoại chuẩn cho bước chào hỏi"]), qa: "{}", status: "used", createdAt: now, updatedAt: now }).run();
  const r1 = learn.refreshProposals();
  assert.ok(r1.created >= 1);
  const r2 = learn.refreshProposals();
  assert.equal(r2.created, 0, "không tạo trùng");
  assert.equal(learn.secondBrainDraft(), "", "chưa chấp nhận thì không có gì để xuất");
  const p = learn.listProposals().find((x) => x.target === "second_brain")!;
  assert.equal(learn.decideProposal(p.id, "accepted", "OWNER", "Sẽ ghi câu chuẩn"), true);
  const draft = learn.secondBrainDraft();
  assert.match(draft, /DRAFT/);
  assert.match(draft, /\[AI SUY LUẬN\]/);
  assert.match(draft, /Sẽ ghi câu chuẩn/);
  assert.equal(learn.markExported("OWNER"), 1);
  learn.refreshProposals();
  assert.equal(learn.listProposals().find((x) => x.id === p.id)!.status, "exported", "phân tích lại không ghi đè quyết định của OWNER");
});
