// Nghiên cứu theo nền tảng (Personal Brand System bước 2.1–2.4): dán bình luận → làm sạch dữ liệu cá nhân → phân tích theo luật →
// phát hiện QUAN SÁT có nguồn → Bảng Hook dùng được làm căn cứ. CSDL tạm, không gọi nền tảng / AI.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "baor-social-"));
process.env.DATA_DIR = tmp;
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.AUTH_SECRET = "test-secret-".padEnd(40, "x");
process.env.BAOR_VIDEO_WORKER = "off";

let social: typeof import("../src/lib/research/social");
let research: typeof import("../src/lib/research");
let hooks: typeof import("../src/lib/content/hooks");

before(async () => {
  social = await import("../src/lib/research/social");
  research = await import("../src/lib/research");
  hooks = await import("../src/lib/content/hooks");
});

test("làm sạch: bỏ số điện thoại, email, @nhắc tên, link", () => {
  const c = social.cleanComment("@Nguyễn Văn An gọi em 0912 345 678 hoặc an.nguyen@gmail.com xem https://x.com/a nhé");
  assert.doesNotMatch(c, /0912|gmail|Nguyễn|https/);
  assert.match(c, /gọi em/);
  assert.doesNotMatch(social.cleanComment("liên hệ +84 912345678"), /912/);
});

test("đọc dán: JSON object / CSV có dấu phẩy trong ngoặc kép / chữ từng dòng; bỏ trùng, bỏ dòng rỗng", () => {
  assert.deepEqual(social.parseSocialPaste('[{"message": "Làm sao để khách nghe máy?"}, {"text": "hay quá"}, "chuỗi thô"]'), ["Làm sao để khách nghe máy?", "hay quá", "chuỗi thô"]);
  assert.deepEqual(social.parseSocialPaste('author,comment,likes\nAn,"Sợ bị từ chối, ngại gọi",3\nBình,hay quá,1\n'), ["Sợ bị từ chối, ngại gọi", "hay quá"]);
  assert.deepEqual(social.parseSocialPaste("dòng một\n\ndòng một\nok\ndòng hai"), ["dòng một", "dòng hai"], "bỏ trùng và dòng < 3 ký tự");
});

const COMMENTS = [
  "Làm sao để khách không cúp máy ngay?",
  "Gọi điện cho khách mới em sợ bị từ chối lắm",
  "Có nên gọi vào buổi trưa không ạ",
  "khách hay nghĩ là cuộc gọi rác",
  "Em ngại gọi cho khách mới quá",
  "gọi điện cho khách mới thì nói câu đầu tiên thế nào",
  "video hay quá anh",
];

test("phân tích theo luật: câu hỏi, nỗi lo, cụm từ lặp lại", () => {
  const a = social.analyzeComments(COMMENTS);
  assert.equal(a.total, 7);
  assert.equal(a.questions.length, 3);
  assert.equal(a.pains.length, 3, "sợ bị từ chối / cuộc gọi rác / ngại gọi");
  assert.ok(a.topPhrases.some((p) => p.phrase === "khách mới" && p.count === 3));
});

test("nhập → nhiệm vụ nghiên cứu có nguồn hạng D + phát hiện QUAN SÁT đạt kiểm → Bảng Hook lấy làm căn cứ", () => {
  const id = research.createResearchTask({ question: "Bình luận YouTube: gọi điện khách mới", purposeKind: "audience", purpose: "insight cho hook", by: "test" });
  const r = research.saveResearchResult(id, social.socialToResearch("youtube", "https://www.youtube.com/watch?v=abc", COMMENTS, "gọi điện khách mới"), { runner: "import", by: "test" });
  assert.equal(r.sources, 1);
  assert.equal(r.findings, 3);
  assert.equal(r.verified, 3, "quan sát có số liệu đều gắn nguồn → đạt kiểm");
  const t = research.getResearchTask(id)!;
  assert.equal(t.sources[0].grade, "D");
  assert.match(t.task.summary, /không AI/);
  const ctx = hooks.hookContext("gọi điện khách mới");
  assert.ok(ctx.basis.some((b) => b.kind === "finding" && /câu hỏi/.test(b.label)));
});

// ---- Phản biện P1 / P2 / P3 (riêng tư): các ca này đỏ trên bản đầu ----
test("chép tay từ Facebook: bỏ dòng tên, dòng giao diện (Thích · Phản hồi · 2 tuần), tiền tố “Tên:”", () => {
  const paste = [
    "Nguyễn Văn An",
    "Làm sao để khách nghe máy vậy anh?",
    "Thích · Phản hồi · 2 tuần",
    "Trần Thị Bình",
    "em cũng ngại gọi lắm",
    "Thích · Phản hồi · 1 tuần",
    "Anh Lê Văn Cường: gọi buổi sáng có được không",
    "Xem thêm bình luận",
  ].join("\n");
  const c = social.parseSocialPaste(paste);
  assert.deepEqual(c, ["Làm sao để khách nghe máy vậy anh?", "em cũng ngại gọi lắm", "gọi buổi sáng có được không"]);
  const r = social.socialToResearch("facebook", "https://facebook.com/x", c, "");
  assert.doesNotMatch(JSON.stringify(r), /Nguyễn|Trần Thị|Cường|Phản hồi/);
});

test("bảng dán từ Excel (tab) / CSV dấu chấm phẩy / tiêu đề YouTube: chỉ lấy cột nội dung, không lọt cột tác giả", () => {
  assert.deepEqual(social.parseSocialPaste("Tác giả\tBình luận\nNguyễn An\tSợ bị từ chối quá\nLê Bình\tgọi giờ nào hợp lý?"), ["Sợ bị từ chối quá", "gọi giờ nào hợp lý?"]);
  assert.deepEqual(social.parseSocialPaste("author;comment\nNguyễn An;Sợ bị từ chối quá\nLê Bình;gọi giờ nào?"), ["Sợ bị từ chối quá", "gọi giờ nào?"]);
  assert.deepEqual(social.parseSocialPaste("authorDisplayName,textDisplay\nNguyễn An,Sợ bị từ chối quá\nLê Bình,ok luôn"), ["Sợ bị từ chối quá", "ok luôn"]);
});

test("bảng nhiều cột mà không nhận ra cột nội dung → từ chối (không đoán, tránh lọt tên)", () => {
  assert.throws(() => social.parseSocialPaste("Name,Ghi chú\nNguyễn An,Sợ bị từ chối quá\nLê Bình,gọi giờ nào?"), /cột nội dung/);
});

test("JSON lồng (YouTube Data API / {comments: […]}) đọc được", () => {
  const yt = { items: [{ snippet: { topLevelComment: { snippet: { authorDisplayName: "Nguyễn An", textDisplay: "Hay quá anh ơi" } } } }, { snippet: { topLevelComment: { snippet: { authorDisplayName: "Lê Bình", textDisplay: "gọi giờ nào?" } } } }] };
  assert.deepEqual(social.parseSocialPaste(JSON.stringify(yt)), ["Hay quá anh ơi", "gọi giờ nào?"]);
  assert.deepEqual(social.parseSocialPaste(JSON.stringify({ comments: [{ message: "một hai ba" }] })), ["một hai ba"]);
});

test("làm sạch thêm: số điện thoại có ngoặc, link không có http, chữ NFD", () => {
  assert.doesNotMatch(social.cleanComment("gọi (091) 234 5678 hoặc (+84) 912 345 678"), /\d{3}/);
  assert.doesNotMatch(social.cleanComment("xem www.facebook.com/an.nguyen123 và facebook.com/profile.php?id=10001234"), /facebook|10001234/);
  assert.equal(social.analyzeComments(["em sợ bị từ chối".normalize("NFD"), "a b c", "d e f"].map(social.cleanComment)).pains.length, 1);
  assert.equal(social.analyzeComments(["sao kê tháng này", "ngôi sao hạng A", "tại sao khách không nghe"]).questions.length, 1, "“sao” đứng riêng không phải câu hỏi");
});

test("dòng rất dài không chặn máy (cắt trước khi chạy regex)", () => {
  const t0 = Date.now();
  social.parseSocialPaste("a".repeat(100_000) + "@b");
  assert.ok(Date.now() - t0 < 300, `mất ${Date.now() - t0} ms`);
});

test("vòng 2 phản biện: email bỏ TRỌN (cả phần tên), dòng “A trả lời B”, tên kèm emoji / huy hiệu, số tiền không bị méo, bảng tab lệch cột → từ chối", () => {
  assert.doesNotMatch(social.cleanComment("email an.nguyen@gmail.com nhé"), /an\.nguyen|@/);
  assert.doesNotMatch(social.cleanComment("mail an@baor.vn"), /an@|baor/);
  assert.doesNotMatch(social.cleanComment("zalo 912 345 678 nha"), /912/);
  assert.match(social.cleanComment("giá 100.000.000 đồng"), /100\.000\.000/);
  const c = social.parseSocialPaste(["Nguyễn An trả lời Trần Bình", "Nguyễn An 🌸", "Trần Bình · Tác giả", "An Nguyễn (Bé Bông)", "gọi giờ nào thì hợp?", "em sợ bị từ chối", "cảm ơn anh nhiều"].join("\n"));
  assert.deepEqual(c, ["gọi giờ nào thì hợp?", "em sợ bị từ chối", "cảm ơn anh nhiều"]);
  assert.throws(() => social.parseSocialPaste("Name\tÝ kiến\nNguyễn An\tSợ bị từ chối\tx\nLê Bình\tok"), /cột nội dung/);
  assert.deepEqual(social.parseSocialPaste(JSON.stringify({ data: ["một hai ba", "bốn năm sáu"] })), ["một hai ba", "bốn năm sáu"]);
  assert.deepEqual(social.parseSocialPaste(JSON.stringify([{ author: { text: "Nguyễn An" }, message: "hay quá anh" }])), ["hay quá anh"]);
});
