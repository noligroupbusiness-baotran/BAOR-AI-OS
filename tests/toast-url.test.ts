// Thông báo sau hành động: ?toast= phải nằm trước #neo, nếu không trình duyệt coi là neo và thông báo không hiện.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { withToast } from "../src/lib/actions/common";
import { SETTINGS_ANCHORS } from "../src/config/settings-groups";

test("toast đặt trước #neo, giữ tham số cũ", () => {
  assert.equal(withToast("/settings#faq", "Đã lưu"), "/settings?toast=%C4%90%C3%A3%20l%C6%B0u&tab=thuong-hieu#faq");
  assert.equal(withToast("/publishing?tone=error#ads", "x"), "/publishing?tone=error&toast=x#ads");
  assert.equal(withToast("/content?tab=mine", "y"), "/content?tab=mine&toast=y");
  assert.equal(withToast("/dashboard", "z"), "/dashboard?toast=z");
  assert.equal(withToast("/settings#faq?tone=error", "e"), "/settings?tone=error&toast=e&tab=thuong-hieu#faq", "dạng cũ: tham số sau neo");
});

test("Cài đặt chia nhóm: lưu xong vẫn ở đúng nhóm (redirect /settings#neo kèm ?tab=)", () => {
  assert.equal(withToast("/settings#music-library", "x"), "/settings?toast=x&tab=video#music-library");
  assert.equal(withToast("/settings#people", "x"), "/settings?toast=x&tab=he-thong#people");
  assert.equal(withToast("/settings#ai-team?tone=error", "x"), "/settings?tone=error&toast=x&tab=ai#ai-team");
  assert.equal(withToast("/settings?tab=video#music", "x"), "/settings?tab=video&toast=x#music", "đã có tab thì giữ");
  assert.equal(withToast("/settings#facebook", "x"), "/settings?toast=x#facebook", "neo kết nối động → nhóm mặc định");
  assert.equal(withToast("/settings", "x"), "/settings?toast=x");
  assert.equal(withToast("/settings-khac#faq", "x"), "/settings-khac?toast=x#faq", "chỉ trang Cài đặt");
});

test("mọi action quay về Cài đặt đều kèm #neo đã khai báo nhóm (thiếu neo → lưu xong bị đẩy về nhóm Kết nối)", () => {
  const dir = path.join(__dirname, "..", "src", "lib", "actions");
  const bad: string[] = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".ts"))) {
    const src = fs.readFileSync(path.join(dir, f), "utf8");
    for (const m of src.matchAll(/\b(?:done|fail)\(\s*(`[^`]*`|"[^"]*"|'[^']*')/g)) {
      const url = m[1].slice(1, -1);
      if (!url.startsWith("/settings")) continue;
      const anchor = url.split("#")[1]?.split("?")[0];
      // #${key}: neo động của từng kết nối → nhóm mặc định "Kết nối" (đúng)
      if (!anchor || !(SETTINGS_ANCHORS[anchor] || anchor === "${key}")) bad.push(`${f}: ${url}`);
    }
  }
  assert.deepEqual(bad, []);
});
