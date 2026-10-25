// Personal Brand System bước 8: 8.1 kiểm bài đã đăng theo skill TRƯỚC (luật, không AI), 8.2 AI Đo lường SAU (Đội AI, dẫn bài có thật).
// CSDL tạm, mô hình giả: không gọi Claude thật.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "baor-learn-skill-"));
process.env.DATA_DIR = tmp;
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.AUTH_SECRET = "test-secret-".padEnd(40, "x");
process.env.BAOR_VIDEO_WORKER = "off";
delete process.env.ANTHROPIC_API_KEY;

let db: typeof import("../src/db");
let analyze: typeof import("../src/lib/learning/analyze");
let learning: typeof import("../src/lib/learning");
let review: typeof import("../src/lib/learning/ai-review");
let roster: typeof import("../src/lib/ai-roster");

before(async () => {
  db = await import("../src/db");
  analyze = await import("../src/lib/learning/analyze");
  learning = await import("../src/lib/learning");
  review = await import("../src/lib/learning/ai-review");
  roster = await import("../src/lib/ai-roster");
});

test("8.1 luật theo skill: thiếu CTA cuối bài, mở bằng “N cách…”, cảnh báo luật caption đi kèm", () => {
  assert.deepEqual(analyze.skillChecksForPost({ caption: "Hook\n\nBình luận câu hỏi của bạn nhé", issues: [] }), []);
  assert.match(analyze.skillChecksForPost({ caption: "Hook\n\nNội dung", issues: [] }).join(), /thiếu lời kêu gọi/);
  assert.match(analyze.skillChecksForPost({ caption: "5 cách chốt sales\n\nBạn thử chưa?", issues: [] }).join(), /N cách/);
  assert.deepEqual(analyze.skillChecksForPost({ caption: "Câu hỏi?", issues: ["x"] }), ["x"]);
});

test("8.1 gộp: đề xuất kèm cỡ mẫu; so tương tác chỉ khi mỗi nhóm ≥ 3 bài có số liệu", () => {
  const mk = (i: number, cta: boolean) => ({ id: `p${i}`, title: `Bài ${i}`, platform: "facebook", caption: cta ? "Hook\n\nBình luận nhé" : "Hook\n\nHết", issues: [], views: 100, reach: 100, engagement: cta ? 10 : 2 });
  const posts = [mk(1, false), mk(2, false), mk(3, false), mk(4, true), mk(5, true), mk(6, true)];
  const ps = analyze.skillProposals(posts, "skill thử");
  assert.equal(ps.length, 1);
  assert.match(ps[0].detail, /3\/6 bài/);
  assert.match(ps[0].detail, /bài lệch 2% · bài đạt 10%/);
  assert.equal(ps[0].sampleSize, 6);
  assert.match(analyze.skillProposals(posts.slice(0, 2), "s")[0].detail, /^2\/2/);
  assert.doesNotMatch(analyze.skillProposals(posts.slice(0, 2), "s")[0].detail, /Tương tác TB/, "mẫu nhỏ thì không so");
});

function post(id: string, status: string, mode: string, caption: string) {
  db.getDb()
    .insert(db.schema.scheduledPosts)
    .values({ id, contentId: "", title: `Bài ${id}`, platform: "facebook", scheduledFor: new Date().toISOString(), status, mode, caption, verifiedAt: status === "published" ? new Date().toISOString() : null, views: 500, reach: 400, engagement: 20 } as typeof db.schema.scheduledPosts.$inferInsert)
    .run();
}

test("8.2 chưa có bài đăng thật → KHÔNG gọi AI (logic trước, không tốn tiền)", async () => {
  post("dry1", "dry_run", "dry_run", "Hook");
  const r = await review.aiReviewResults("OWNER");
  assert.match(r.ok ? "" : r.error, /Chưa có bài đã đăng thật/);
  assert.equal(roster.recentAiCalls(5).length, 0);
});

test("8.1 trong phân tích: bài live đã xác minh thiếu CTA → đề xuất; bài chế độ thử không tính", () => {
  post("live1", "published", "live", "Ba giây đầu quyết định\n\nHết bài");
  const { proposals, facts } = learning.analyzeAll();
  assert.equal(facts.skillChecked, 1);
  assert.ok(proposals.some((p) => p.key.startsWith("skill:") && /1\/1 bài/.test(p.detail)));
});

test("8.2 AI Đo lường: qua Đội AI (tắt → không gọi); đề xuất không dẫn bài có thật bị bỏ; lưu là giả thuyết tin cậy thấp", async () => {
  roster.saveRoleSettings("measure", { enabled: false });
  const off = await review.aiReviewResults("OWNER");
  assert.match(off.ok ? "" : off.error, /AI Đo lường đang TẮT/);
  roster.saveRoleSettings("measure", { enabled: true });
  const { createRequire } = await import("node:module");
  const esm = (await import("@anthropic-ai/sdk")).default;
  const cjs = createRequire(import.meta.url)("@anthropic-ai/sdk").default;
  const protos = [...new Set([esm.Messages.prototype, cjs.Messages.prototype])] as unknown as { parse: unknown }[];
  const reals = protos.map((p) => p.parse);
  let sent = "";
  const fake = async (body: { messages: { content: string }[] }) => {
    sent = body.messages[0].content;
    return {
      usage: { input_tokens: 800, output_tokens: 200 },
      parsed_output: { proposals: [{ title: "Thêm CTA hỏi khách", detail: "Thử 3 bài có câu hỏi cuối", target: "content", postIds: ["live1"] }, { title: "Bịa", detail: "x", target: "content", postIds: ["khong-co"] }] },
    };
  };
  for (const p of protos) p.parse = fake;
  process.env.ANTHROPIC_API_KEY = "sk-test-khong-goi-that";
  try {
    const r = await review.aiReviewResults("OWNER");
    assert.deepEqual(r, { ok: true, saved: 1, dropped: 1 });
    assert.match(sent, /\[live1\]/);
    assert.match(sent, /lệch skill: thiếu lời kêu gọi/, "kết quả 8.1 được đưa cho AI");
    assert.doesNotMatch(sent, /\[dry1\]/, "bài chế độ thử không đưa cho AI");
    const saved = learning.listProposals().find((p) => p.title === "AI đề xuất: Thêm CTA hỏi khách")!;
    assert.equal(saved.confidence, "low");
    assert.equal(roster.recentAiCalls(1)[0].role, "measure");
  } finally {
    protos.forEach((p, i) => (p.parse = reals[i]));
    delete process.env.ANTHROPIC_API_KEY;
  }
});

test("gộp theo khoá chuẩn hoá: cùng luật trên 2 nền tảng = 1 đề xuất đúng cỡ mẫu; số % khác nhau không sinh khoá rác (phản biện P2)", () => {
  const mk = (id: string, platform: string, issues: string[]) => ({ id, title: id, platform, caption: "Hook\n\nBình luận nhé", issues, views: 1, reach: 1, engagement: 0 });
  const posts = [
    mk("a", "facebook", ["khẳng định thuộc tính cá nhân người xem — facebook"]),
    mk("b", "instagram", ["khẳng định thuộc tính cá nhân người xem — instagram"]),
    mk("c", "facebook", ["số “12%” không có trong kịch bản đã duyệt (skill)"]),
    mk("d", "facebook", ["số “37%” không có trong kịch bản đã duyệt (skill)"]),
  ];
  const ps = analyze.skillProposals(posts, "s");
  const keys = ps.map((p) => p.key);
  assert.equal(new Set(keys).size, keys.length, "không trùng khoá");
  assert.equal(ps.length, 2);
  assert.ok(ps.some((p) => /^2\/4 bài/.test(p.detail) && /thuộc tính cá nhân/.test(p.title)));
  const pct = ps.find((p) => /số/.test(p.title))!;
  assert.match(pct.detail, /^2\/4 bài/);
  assert.doesNotMatch(pct.key, /\d/);
});

test("CTA / “N cách”: bỏ dòng hashtag cuối; “?” tu từ giữa bài không tính; “1 cách nhìn” không phải listicle (P3)", () => {
  assert.deepEqual(analyze.skillChecksForPost({ caption: "Hook\n\nBình luận nhé\n#sales #baor", issues: [] }), []);
  assert.match(analyze.skillChecksForPost({ caption: "Tại sao mình bỏ việc?\n\nĐó là câu chuyện mình chia sẻ hôm nay.", issues: [] }).join(), /thiếu lời kêu gọi/);
  assert.deepEqual(analyze.skillChecksForPost({ caption: "1 cách nhìn khác về sales\n\nBạn nghĩ sao?", issues: [] }), []);
});
