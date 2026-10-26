// Ô trần chi phí AI nhập bằng $, dòng nhỏ quy ra ₫; máy chủ vẫn nhận số đồng (ô ẩn).
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseUsd, usdToVnd, vndHint, vndToUsdText } from "../src/components/ui/vnd-cap-input";

test("nhập $ → lưu ₫ theo tỷ giá; 0 / trống / chữ lạ = 0", () => {
  assert.equal(usdToVnd("5", 26000), 130000);
  assert.equal(usdToVnd("5,5", 26000), 143000);
  assert.equal(usdToVnd("$2.25", 26000), 58500);
  assert.equal(usdToVnd("", 26000), 0);
  assert.equal(parseUsd("abc"), 0);
  assert.equal(parseUsd("1.000.000"), 1_000_000, "phân cách hàng nghìn không thành 0 (trước đây NaN → 0 = mất trần riêng)");
  assert.equal(parseUsd("1,000"), 1000);
  assert.equal(parseUsd("12.5"), 12.5);
});

test("số đồng đang lưu hiện lại bằng $, dòng dưới là ₫", () => {
  assert.equal(vndToUsdText(130000, 26000), "5");
  assert.equal(vndToUsdText(100000, 26000), "3.85");
  assert.equal(vndToUsdText(0, 26000), "0");
  assert.match(vndHint("5", 26000) ?? "", /^≈ 130\.000 ₫$/);
  assert.equal(vndHint("0", 26000), null);
});
