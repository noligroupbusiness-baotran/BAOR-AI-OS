import { test } from "node:test";
import assert from "node:assert/strict";
import { OWNER_CHECK, captionCheck, formatsOfKind, imageBriefTemplate, isLegacyScript, kindOf, scriptCheck, scriptTemplate, speechEstimate, vlogTemplate } from "../src/lib/content/formats";
import { buildShootingScript } from "../src/lib/content/shooting-script";

test("phân loại định dạng: reel/story/script là kịch bản, caption và image riêng, còn lại là bài viết", () => {
  assert.equal(kindOf("post"), "text");
  assert.equal(kindOf("reel"), "script");
  assert.equal(kindOf("script"), "script");
  assert.equal(kindOf("caption"), "caption");
  assert.equal(kindOf("image"), "image");
  assert.equal(kindOf("khong-co"), "text");
  assert.deepEqual(formatsOfKind("script"), ["story", "reel", "script"]);
});

test("khung kịch bản mặc định = vlog chia sẻ < 1 phút (4 cảnh, ba dòng mỗi cảnh); kịch bản cũ 5 cảnh vẫn được nhận và kiểm", () => {
  const tpl = scriptTemplate("Gội dưỡng sinh 39K");
  assert.ok(tpl.startsWith("KỊCH BẢN VLOG: Gội dưỡng sinh 39K"));
  assert.equal((tpl.match(/Lời thoại:/g) ?? []).length, 4);
  const full = scriptCheck(tpl);
  assert.equal(full.format, "vlog");
  assert.deepEqual(full.missing, []);
  assert.equal(full.hasSpeech, false, "khung trống chưa có lời thoại");
  // Kịch bản cũ (5 cảnh Hook / Vấn đề / Giải pháp / Bằng chứng / Kêu gọi) không bị coi là thiếu cảnh vlog
  const partial = scriptCheck("1. HOOK\nLời thoại: Bạn có biết…\n2. VẤN ĐỀ\n");
  assert.equal(partial.format, "legacy");
  assert.deepEqual(partial.missing, ["Giải pháp", "Bằng chứng", "Kêu gọi"]);
  assert.equal(partial.hasSpeech, true);
  // "kết" giữa câu ("kết quả") không phải cảnh KẾT
  assert.deepEqual(scriptCheck("1. HOOK\nLời thoại: kết quả ra sao\n2. CÂU CHUYỆN\n3. BÀI HỌC\n").missing, ["Kết"]);
});

test("vlog: điền hook + dàn ý 3 nhịp vào đúng cảnh; ước tính thời lượng lời thoại và cảnh báo khi quá 60 giây", () => {
  const v = vlogTemplate({ hook: "Mới bán online, bắt đầu từ đâu?", beats: ["Hồi mới bán mình nhập 50 áo", "Bài học: thử 5 mẫu trước", "Bạn bắt đầu thế nào?"] });
  assert.match(v, /1\. HOOK \(0–3s\)\nHình ảnh: [^\n]*\nLời thoại: Mới bán online, bắt đầu từ đâu\?/);
  assert.match(v, /2\. CÂU CHUYỆN[^\n]*\n[^]*?Ý chính: Hồi mới bán mình nhập 50 áo\n/);
  assert.match(v, /3\. BÀI HỌC[^\n]*\n[^]*?Ý chính: Bài học: thử 5 mẫu trước\n/);
  assert.match(v, /4\. KẾT[^\n]*\n[^]*?Ý chính: Bạn bắt đầu thế nào\?\n/);
  assert.match(v, /Gợi ý OWNER: \[OWNER KỂ:/, "chuyện thật để OWNER kể");
  const words = (n: number) => Array.from({ length: n }, () => "chữ").join(" ");
  const ok = scriptCheck(`1. HOOK\nLời thoại: ${words(40)}\n2. CÂU CHUYỆN\nLời thoại: ${words(60)}\n3. BÀI HỌC\nLời thoại: ${words(40)}\n4. KẾT\nLời thoại: ${words(15)}`);
  assert.equal(ok.words, 155);
  assert.ok(ok.seconds <= 60 && !ok.tooLong, `${ok.seconds}s`);
  const long = scriptCheck(`1. HOOK\nLời thoại: ${words(120)}\n2. CÂU CHUYỆN\nLời thoại: ${words(100)}`);
  assert.equal(long.tooLong, true);
  assert.ok(long.seconds > 60);
  assert.equal(speechEstimate("Hình ảnh: một hai ba\nGợi ý OWNER: [OWNER KỂ: x]").words, 0, "chỉ đếm dòng Lời thoại");
});

test("nhận khung theo TIÊU ĐỀ cảnh đầu dòng: kịch bản quay từ brief (có “câu chuyện” trong gợi ý OWNER) và kịch bản cũ có “bài học” trong lời thoại vẫn là khung cũ 5 cảnh (phản biện P1)", () => {
  const brief = { topic: "Chào hỏi", goal: "Video ngắn 60 giây", audience: "Sales", keyMessage: "Lời chào không phải để chốt.", angle: "Seller mới hay hỏi câu rỗng.", points: [{ text: "Ba nhịp.", classification: "PROCEDURE" as const, findingIds: [], knowledgeIds: [], sourceIds: [] }], gaps: [] };
  const shoot = buildShootingScript(brief, [], []);
  assert.match(shoot, /câu chuyện/i, "gợi ý OWNER của brief có chữ “câu chuyện”");
  assert.equal(isLegacyScript(shoot), true);
  const c = scriptCheck(shoot);
  assert.equal(c.format, "legacy");
  assert.deepEqual(c.missing, []);
  const old = "1. HOOK (0–3s)\nLời thoại: x\n2. VẤN ĐỀ\nLời thoại: bài học đắt giá\n3. GIẢI PHÁP\n4. BẰNG CHỨNG\n5. KÊU GỌI\n";
  assert.equal(scriptCheck(old).format, "legacy");
  assert.deepEqual(scriptCheck(old).missing, []);
  assert.equal(scriptCheck(scriptTemplate("x")).format, "vlog");
  assert.equal(scriptCheck("", { format: "legacy" }).format, "legacy", "trang truyền format cho kịch bản từ brief");
});

test("hook kể chuyện riêng (“mình từng mất…”) vào lời thoại kèm ghi chú OWNER xác nhận; hook thường thì không (phản biện P2)", () => {
  const claim = vlogTemplate({ hook: "Mình từng mất 5 triệu vì bom hàng" });
  assert.ok(claim.includes(OWNER_CHECK));
  assert.ok(claim.includes(`Lời thoại: Mình từng mất 5 triệu vì bom hàng\n${OWNER_CHECK}\n`), "ghi chú ngay dưới lời thoại hook");
  assert.ok(!vlogTemplate({ hook: "Vì sao khách mới hay cúp máy?" }).includes(OWNER_CHECK));
  // Dấu OWNER nằm ở dòng Gợi ý, không lọt vào Lời thoại
  assert.ok(claim.split("\n").filter((l) => l.startsWith("Lời thoại:")).every((l) => !l.includes("[OWNER")));
});

test("caption: đếm ký tự, hashtag không trùng, CTA, cảnh báo theo nền tảng", () => {
  const ok = captionCheck("Gội dưỡng sinh 39K, đặt lịch ngay hôm nay. #spa #goiduongsinh #Spa");
  assert.equal(ok.hashtags.length, 2, "hashtag trùng không tính hai lần");
  assert.equal(ok.hasCta, true);
  assert.deepEqual(ok.warnings, []);
  const noCta = captionCheck("Hôm nay trời đẹp quá.");
  assert.ok(noCta.warnings.some((w) => w.includes("kêu gọi")));
  const many = captionCheck("đặt lịch " + Array.from({ length: 9 }, (_, i) => `#tag${i}`).join(" "));
  assert.ok(many.warnings.some((w) => w.startsWith("TikTok") && w.includes("9 hashtag")));
  assert.ok(many.warnings.some((w) => w.startsWith("Facebook")));
  const long = captionCheck("a".repeat(130) + " inbox");
  assert.ok(long.warnings.some((w) => w.includes("Xem thêm")));
  const yt = captionCheck("x".repeat(120) + " đặt lịch", ["youtube"]);
  assert.ok(yt.warnings.some((w) => w.startsWith("YouTube Shorts: vượt")));
});

test("brief ảnh lấy màu, font, khẩu hiệu từ thương hiệu và liệt kê kích thước", () => {
  const b = imageBriefTemplate({ title: "Combo 3 bước", hook: "Da sáng sau 7 ngày", primaryColor: "#112233", font: "Montserrat", tagline: "Đẹp thật, không lời hứa" });
  assert.ok(b.includes("#112233"));
  assert.ok(b.includes("Montserrat"));
  assert.ok(b.includes("Đẹp thật, không lời hứa"));
  assert.ok(b.includes("9:16"));
  assert.ok(b.includes("1280×720"));
});
