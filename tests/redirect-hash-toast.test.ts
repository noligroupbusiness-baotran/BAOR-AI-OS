// Chuyển hướng sau hành động khi đường dẫn quay lại có #neo (vd. Insight › "Gắn chiến dịch" quay về ?tab=insight#insights):
// ?toast= và &tone=error phải đứng TRƯỚC #, nếu không thông báo không hiện / lỗi hiện như thành công.
import { test } from "node:test";
import assert from "node:assert/strict";
import { toastUrl, withQuery } from "../src/lib/actions/common";

test("toast + tone=error chèn trước #neo", () => {
  assert.equal(toastUrl("/insights/research?tab=insight#insights", "Cần chọn chiến dịch.", "error"), "/insights/research?tab=insight&tone=error&toast=C%E1%BA%A7n%20ch%E1%BB%8Dn%20chi%E1%BA%BFn%20d%E1%BB%8Bch.#insights");
  assert.equal(toastUrl("/insights/research?tab=insight#insights", "ok"), "/insights/research?tab=insight&toast=ok#insights");
  assert.equal(toastUrl("/campaigns/c1", "ok"), "/campaigns/c1?toast=ok");
  assert.equal(toastUrl("/campaigns/c1", "x", "error"), "/campaigns/c1?tone=error&toast=x");
});

test("withQuery giữ #neo ở cuối", () => {
  assert.equal(withQuery("/insights/research?tab=insight#proposed", "tone", "error"), "/insights/research?tab=insight&tone=error#proposed");
  assert.equal(withQuery("/x#a", "k", "v w"), "/x?k=v%20w#a");
  assert.equal(withQuery("/x", "k", "v"), "/x?k=v");
});
