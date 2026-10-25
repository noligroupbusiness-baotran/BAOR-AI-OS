import { test } from "node:test";
import assert from "node:assert/strict";
import { parseChannels, parseOffers, similarity } from "../src/lib/insights/competitors";

test("khớp tên bỏ dấu, bỏ từ dừng (gói, liệu trình, phút…)", () => {
  assert.equal(similarity("Gội dưỡng sinh", "Gội đầu dưỡng sinh"), 1);
  assert.equal(similarity("Massage cổ vai gáy", "Massage cổ vai gáy 60 phút"), 1);
  assert.ok(similarity("Serum vitamin C", "Kem chống nắng") < 0.5);
  assert.equal(similarity("", "x"), 0);
});

test("đọc bảng giá và kênh từ ô nhập nhiều dòng", () => {
  assert.deepEqual(parseOffers("Gội đầu | 45.000 | lượt\n\nThẻ 10 lượt | 390000\nkhông giá |"), [
    { name: "Gội đầu", price: 45000, unit: "lượt" },
    { name: "Thẻ 10 lượt", price: 390000, unit: "lượt" },
    { name: "không giá", price: 0, unit: "lượt" },
  ]);
  assert.deepEqual(parseChannels("facebook | https://fb.com/x | 28.000\ntiktok | https://t.com/y"), [
    { platform: "facebook", url: "https://fb.com/x", followers: 28000 },
    { platform: "tiktok", url: "https://t.com/y", followers: null },
  ]);
});
