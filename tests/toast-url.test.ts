// Thông báo sau hành động: ?toast= phải nằm trước #neo, nếu không trình duyệt coi là neo và thông báo không hiện.
import { test } from "node:test";
import assert from "node:assert/strict";
import { withToast } from "../src/lib/actions/common";

test("toast đặt trước #neo, giữ tham số cũ", () => {
  assert.equal(withToast("/settings#faq", "Đã lưu"), "/settings?toast=%C4%90%C3%A3%20l%C6%B0u#faq");
  assert.equal(withToast("/publishing?tone=error#ads", "x"), "/publishing?tone=error&toast=x#ads");
  assert.equal(withToast("/content?tab=mine", "y"), "/content?tab=mine&toast=y");
  assert.equal(withToast("/dashboard", "z"), "/dashboard?toast=z");
  assert.equal(withToast("/settings#faq?tone=error", "e"), "/settings?tone=error&toast=e#faq", "dạng cũ: tham số sau neo");
});
