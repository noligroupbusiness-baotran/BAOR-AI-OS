import { test } from "node:test";
import assert from "node:assert/strict";
import { captionCheck, formatsOfKind, imageBriefTemplate, kindOf, scriptCheck, scriptTemplate } from "../src/lib/content/formats";

test("phân loại định dạng: reel/story/script là kịch bản, caption và image riêng, còn lại là bài viết", () => {
  assert.equal(kindOf("post"), "text");
  assert.equal(kindOf("reel"), "script");
  assert.equal(kindOf("script"), "script");
  assert.equal(kindOf("caption"), "caption");
  assert.equal(kindOf("image"), "image");
  assert.equal(kindOf("khong-co"), "text");
  assert.deepEqual(formatsOfKind("script"), ["story", "reel", "script"]);
});

test("khung kịch bản có đủ 5 cảnh và ba dòng mỗi cảnh; scriptCheck nhận ra cảnh thiếu", () => {
  const tpl = scriptTemplate("Gội dưỡng sinh 39K");
  assert.ok(tpl.startsWith("KỊCH BẢN: Gội dưỡng sinh 39K"));
  assert.equal((tpl.match(/Lời thoại:/g) ?? []).length, 5);
  const full = scriptCheck(tpl);
  assert.deepEqual(full.missing, []);
  assert.equal(full.hasSpeech, false, "khung trống chưa có lời thoại");
  const partial = scriptCheck("1. HOOK\nLời thoại: Bạn có biết…\n2. VẤN ĐỀ\n");
  assert.deepEqual(partial.missing, ["Giải pháp", "Bằng chứng", "Kêu gọi"]);
  assert.equal(partial.hasSpeech, true);
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
