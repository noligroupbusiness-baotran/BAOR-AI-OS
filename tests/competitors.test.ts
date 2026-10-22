import { test } from "node:test";
import assert from "node:assert/strict";
import { competitorSummary, parseChannels, parseOffers, priceComparison, similarity, type Competitor } from "../src/lib/insights/competitors";
import type { Product } from "../src/lib/campaigns/types";

const product = (id: string, name: string, price: number, brand = "Mộc Diệp Spa"): Product => ({ id, name, brand, price, unit: "lượt", description: "" });
const competitor = (id: string, offers: { name: string; price: number }[], brand = "Mộc Diệp Spa"): Competitor => ({ id, name: id, brand, positioning: "", channels: [], offers: offers.map((o) => ({ ...o, unit: "lượt" })), strengths: [], weaknesses: [], note: "", lastCheckedAt: null, active: true, updatedAt: "" });

test("khớp tên bỏ dấu, bỏ từ dừng (gói, liệu trình, phút…)", () => {
  assert.equal(similarity("Gội dưỡng sinh", "Gội đầu dưỡng sinh"), 1);
  assert.equal(similarity("Massage cổ vai gáy", "Massage cổ vai gáy 60 phút"), 1);
  assert.ok(similarity("Serum vitamin C", "Kem chống nắng") < 0.5);
  assert.equal(similarity("", "x"), 0);
});

test("so sánh giá: ghép gói tốt nhất, tính chênh lệch %, phân loại rẻ / ngang / đắt", () => {
  const products = [product("p1", "Gội dưỡng sinh", 39000), product("p2", "Massage cổ vai gáy", 149000), product("p3", "Thẻ thành viên 10 lượt gội", 350000), product("p0", "Miễn phí", 0)];
  const comps = [competitor("A", [{ name: "Gội đầu dưỡng sinh", price: 45000 }, { name: "Massage cổ vai gáy 60 phút", price: 129000 }, { name: "Thẻ 10 lượt gội", price: 390000 }])];
  const rows = priceComparison(products, comps);
  const by = Object.fromEntries(rows.map((r) => [r.product.id, r]));
  assert.equal(rows.length, 3, "sản phẩm giá 0 không so sánh");
  assert.equal(by.p1.diffPct, -13);
  assert.equal(by.p1.verdict, "cheaper");
  assert.equal(by.p2.diffPct, 16);
  assert.equal(by.p2.verdict, "pricier");
  assert.equal(by.p3.diffPct, -10);
  assert.equal(by.p3.verdict, "cheaper");
  const s = competitorSummary(rows);
  assert.deepEqual([s.cheaper, s.similar, s.pricier], [2, 0, 1]);
});

test("chỉ so với đối thủ cùng thương hiệu; đối thủ không ghi thương hiệu so với tất cả", () => {
  const products = [product("p1", "Serum vitamin C", 390000, "BAOR Skincare"), product("p2", "Gội dưỡng sinh", 39000)];
  const comps = [competitor("spa", [{ name: "Serum vitamin C", price: 300000 }]), competitor("any", [{ name: "Serum vitamin C", price: 350000 }], "")];
  const rows = priceComparison(products, comps);
  assert.deepEqual(rows.map((r) => r.competitor.id), ["any"]);
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
