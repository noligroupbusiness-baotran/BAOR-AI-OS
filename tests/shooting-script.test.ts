// CP02: dựng kịch bản quay từ brief và luật kiểm kịch bản (hàm thuần, không CSDL, không AI).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildShootingScript, hasStatistic, maxSecondsFromGoal, parseShootingScript, rewriteViolations, scriptQa, OWNER_MARK } from "../src/lib/content/shooting-script";

const sources = [
  { id: "s1", title: "Listening meta-analysis", author: "Itani, Goad, Jaramillo", publisher: "Journal of Business Research", publishedAt: "2019", grade: "A", url: "https://doi.org/x", excerpt: "salespeople who listen adapt their selling to customer needs and achieve better relational and sales outcomes over time in many studies" },
  { id: "s2", title: "Cold call openers", author: "", publisher: "Vendor", publishedAt: "2024-07-24", grade: "D", url: "https://vendor.example/a", excerpt: "" },
];
const pages = [
  { id: "k1", title: "Quy trình mẫu", status: "DRAFT" },
  { id: "k2", title: "Nguyên tắc mẫu", status: "VERIFIED" },
];
const brief = {
  topic: "Chào hỏi phá băng",
  goal: "Video ngắn 60–90 giây",
  audience: "Sales mới",
  keyMessage: "Lời chào không phải để chốt.",
  angle: "Seller mới hay hỏi câu rỗng. Thay bằng lý do gọi rõ ràng.",
  points: [
    { text: "Ba nhịp: xác nhận khách, nhắc nguồn, xin phép.", classification: "PROCEDURE" as const, findingIds: [], knowledgeIds: ["k1"], sourceIds: [] },
    { text: "Lắng nghe giúp người bán điều chỉnh theo nhu cầu khách.", classification: "FACT" as const, findingIds: [], knowledgeIds: [], sourceIds: ["s1"] },
    { text: "Câu xin phép kèm lý do đạt tỷ lệ 11,18%.", classification: "OBSERVATION" as const, findingIds: [], knowledgeIds: [], sourceIds: ["s2"] },
    { text: "Hiểu trước khi bán.", classification: "OWNER_VIEW" as const, findingIds: [], knowledgeIds: ["k2"], sourceIds: [] },
    { text: "Nhắc nguồn giúp khách nghe tiếp.", classification: "HYPOTHESIS" as const, findingIds: [], knowledgeIds: [], sourceIds: [] },
  ],
  gaps: ["Câu chuyện thật của OWNER"],
};
const known = { knownSources: sources.map((s) => s.url), knownPages: pages.map((p) => p.title), sourceExcerpts: sources.map((s) => s.excerpt) };
const script = buildShootingScript(brief, sources, pages);

test("dựng kịch bản quay: đủ 5 cảnh, nguồn ngoài luôn được đọc kèm tên, OWNER chỉ là gợi ý ngoài lời thoại, giả thuyết không vào lời thoại", () => {
  const p = parseShootingScript(script);
  assert.equal(p.scenes.length, 5);
  assert.deepEqual([...p.tags].sort(), ["K1", "K2", "S1", "S2"]);
  assert.ok(script.includes("Theo Itani và cộng sự (2019): Lắng nghe"), "sự thật có ghi nguồn khi nói");
  const withNumber = p.scenes.find((s) => s.speech.includes("11,18%"))!;
  assert.ok(withNumber.speech.startsWith("Theo Vendor (2024): "), "quan sát của nhà cung cấp cũng đọc kèm nguồn");
  assert.ok(withNumber.basis.includes("S2"));
  assert.ok(p.scenes.every((s) => !s.speech.includes(OWNER_MARK)), "không đặt chỗ OWNER trong lời thoại");
  assert.ok(p.scenes[3].ownerHint.includes(OWNER_MARK));
  assert.ok(!p.scenes.some((s) => s.speech.includes("Nhắc nguồn giúp khách")), "giả thuyết không được đọc như sự thật");
  assert.ok(script.includes("Giả thuyết chưa kiểm"));
});

test("kịch bản sinh ra đạt kiểm; cảnh báo trang DRAFT và chỗ thêm câu chuyện OWNER", () => {
  const qa = scriptQa(script, known);
  assert.equal(qa.ok, true, qa.blocking.join("; "));
  assert.ok(qa.warnings.some((w) => w.includes("DRAFT")));
  assert.ok(qa.warnings.some((w) => w.includes("câu chuyện thật")));
});

test("chặn: dấu OWNER trong lời thoại (mọi biến thể), số liệu không nguồn, thẻ lạ, nguồn ngoài brief, sao chép nguyên văn", () => {
  const speech = (txt: string) => script.replace("Lời thoại: Seller mới", `Lời thoại: ${txt} Seller mới`);
  for (const mark of ["[OWNER KỂ: x]", "[owner kể: x]", "[OWNER  KỂ: x]", "[OWNER KE: x]", "[OWNER KỂ: x]".normalize("NFD")]) {
    assert.equal(scriptQa(speech(mark), known).ok, false, `phải chặn ${mark}`);
  }
  assert.ok(scriptQa(speech("73% seller bỏ cuộc."), known).blocking.some((b) => b.includes("Cảnh 1") && b.includes("số liệu")));
  assert.ok(scriptQa(script.replace(/Căn cứ: \[K1\]/, "Căn cứ: [K9]"), known).blocking.some((b) => b.includes("[K9]")));
  const fake = script.replace("NGUỒN\n", "NGUỒN\n[S9] Nghiên cứu bịa: https://bia.example\n").replace("Căn cứ: [K1]", "Căn cứ: [K1] [S9]");
  assert.ok(scriptQa(fake, known).blocking.some((b) => b.includes("[S9]") && b.includes("không thuộc brief")));
  assert.ok(scriptQa(speech(`${sources[0].excerpt}.`), known).blocking.some((b) => b.includes("nguyên văn")));
  assert.ok(scriptQa(speech("Đảm bảo hiệu quả."), known).warnings.some((w) => w.includes("tuyệt đối")));
});

test("chặn cách lách cấu trúc: không có tiêu đề cảnh, tiêu đề markdown, NGUỒN đặt sớm, số liệu ngoài cảnh", () => {
  assert.equal(scriptQa("Hook vấn đề giải pháp bằng chứng kêu gọi\nLời thoại: 73% seller bỏ cuộc sau 2.500 cuộc gọi").ok, false);
  const md = script.replace("1. HOOK (0–3s)", "**1. HOOK (0–3s)**");
  assert.ok(scriptQa(md, known).blocking.some((b) => b.includes("5 cảnh")));
  const early = script.replace("2. VẤN ĐỀ", "NGUỒN\n\n2. VẤN ĐỀ");
  assert.ok(scriptQa(early, known).blocking.some((b) => b.includes("NGUỒN")));
  const loose = script.replace("Thông điệp chính:", "Thông điệp chính: 8 trong 10 khách cúp máy.");
  assert.ok(scriptQa(loose, known).blocking.some((b) => b.includes("ngoài cảnh")));
});

test("nhận số liệu viết kiểu nói; không nhầm thời lượng, thứ tự, năm", () => {
  for (const s of ["tăng 3x", "chín trên mười khách", "một nửa số khách", "Có 45 khách hàng phàn nàn", "Hơn 2000 khách", "1999 người", "73 phần trăm seller", "ba phần tư khách", "3/4 seller", "8 trong 10 khách hàng", "doanh số x3", "10k khách hàng", "99 khách thì 60 người bỏ", "gấp 2 lần", "90.380 cuộc gọi", "11,18%", "2 triệu"]) {
    assert.equal(hasStatistic(s), true, s);
  }
  for (const s of ["30 giây đầu là để khách hiểu bạn là ai", "3 bước chào hỏi", "Năm 2025 thị trường đổi", "1) Xác nhận · 2) Xin phép"]) {
    assert.equal(hasStatistic(s), false, s);
  }
  assert.equal(maxSecondsFromGoal("Video ngắn 60–90 giây"), 90);
  assert.equal(maxSecondsFromGoal("Kịch bản 45 giây"), 45);
  assert.equal(maxSecondsFromGoal("không ghi"), 90);
});

test("câu nói bắt đầu bằng 'Còn thiếu' không làm bộ đọc bỏ qua nội dung", () => {
  const sneaky = script.replace("Lời thoại: Seller mới", "Lời thoại: Seller mới\nCòn thiếu lý do gọi thì 73% khách cúp máy.");
  assert.ok(scriptQa(sneaky, known).blocking.some((b) => b.includes("số liệu")));
});

test("AI viết lại: chỉ nhận khi giữ nguyên dấu OWNER, NGUỒN, căn cứ và không thêm số", () => {
  const reworded = script.replace("Seller mới hay hỏi câu rỗng.", "Nhiều bạn mới vào nghề hay hỏi một câu rỗng.");
  assert.deepEqual(rewriteViolations(script, reworded), []);
  const story = script.replace(/\[OWNER KỂ:[^\]]*\]/, "Hôm trước anh gọi cho một chị khách và chị ấy rất vui.");
  assert.ok(rewriteViolations(script, story).some((v) => v.includes("OWNER")), "AI không được viết thay câu chuyện");
  assert.ok(rewriteViolations(script, script.replace("Lời chào không phải để chốt.", "Lời chào không phải để chốt, 9 trên 10 người đồng ý.")).some((v) => v.includes("số mới")));
  assert.ok(rewriteViolations(script, script.replace("[K2] Kiến thức", "[K2] Nguồn khác")).some((v) => v.includes("NGUỒN")));
  assert.ok(rewriteViolations(script, script.replace("Căn cứ: [K1]", "Căn cứ: [K1] [S1]")).some((v) => v.includes("căn cứ")));
});
