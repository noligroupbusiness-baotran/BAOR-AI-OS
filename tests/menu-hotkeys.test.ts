// Phím tắt chuyển phân hệ khớp hành trình 7 bước: Alt+1…7 = bước 1…7, Alt+8 Tổng quan, Alt+0 Cài đặt; đọc e.code (Mac Option+số),
// không nhận khi đang gõ / Shift / IME.
import { test } from "node:test";
import assert from "node:assert/strict";
import { hotkeyOf, isTypingTarget, menu } from "../src/config/menu";
import { JOURNEY_STEPS, displayStepsIn } from "../src/config/journey";

const hrefOf = (k: string) => menu.find((m) => m.hotkey === k)?.href;

test("Alt+1…7 mở đúng bước 1…7 của hành trình", () => {
  assert.equal(JOURNEY_STEPS.length, 7);
  for (const s of JOURNEY_STEPS) assert.equal(hrefOf(String(s.step)), s.href, `bước ${s.step}`);
  assert.equal(hrefOf("8"), "/dashboard");
  assert.equal(hrefOf("9"), "/customers");
  assert.equal(hrefOf("0"), "/settings");
});

test("mỗi phím chỉ gán một mục", () => {
  const keys = menu.flatMap((m) => (m.hotkey ? [m.hotkey] : []));
  assert.equal(new Set(keys).size, keys.length);
});

test("hotkeyOf đọc phím vật lý, bỏ qua Ctrl / Cmd", () => {
  const ev = (code: string, mods: Partial<{ altKey: boolean; ctrlKey: boolean; metaKey: boolean }> = {}) => ({ altKey: true, ctrlKey: false, metaKey: false, code, ...mods });
  assert.equal(hotkeyOf(ev("Digit3")), "3", "Mac Option+3 cho e.key '£' nhưng e.code vẫn Digit3");
  assert.equal(hotkeyOf(ev("Numpad0")), "0");
  assert.equal(hotkeyOf(ev("Backquote")), null, "Alt+` không còn là phím tắt (GNOME bắt, lệch nhãn AZERTY)");
  assert.equal(hotkeyOf(ev("KeyA")), null);
  assert.equal(hotkeyOf(ev("Digit1", { altKey: false })), null);
  assert.equal(hotkeyOf(ev("Digit1", { ctrlKey: true })), null);
  assert.equal(hotkeyOf(ev("Digit1", { metaKey: true })), null);
});

test("đang gõ chữ thì không nhận phím tắt (Mac Option+số / Option+Shift+số là ký tự [ ] { } |)", () => {
  const ev = (extra: Record<string, unknown>) => ({ altKey: true, ctrlKey: false, metaKey: false, code: "Digit5", ...extra });
  for (const tagName of ["INPUT", "TEXTAREA", "SELECT"]) assert.equal(hotkeyOf(ev({ target: { tagName } })), null, tagName);
  assert.equal(hotkeyOf(ev({ target: { tagName: "DIV", isContentEditable: true } })), null, "contenteditable");
  assert.equal(hotkeyOf(ev({ isComposing: true })), null, "IME đang soạn");
  assert.equal(hotkeyOf(ev({ shiftKey: true })), null, "Option+Shift+5 (Mac AZERTY '[')");
  assert.equal(hotkeyOf(ev({ target: { tagName: "BODY" } })), "5", "ngoài ô nhập vẫn nhận");
  assert.equal(isTypingTarget(null), false);
  assert.equal(isTypingTarget({ tagName: "BUTTON" }), false);
});

test("đề xuất đã lưu: 'bước 8.1 / 8.2' hiển thị thành bước 7, mã lạ giữ nguyên", () => {
  assert.equal(displayStepsIn("Kiểm theo skill (bước 8.1 — luật, không AI)."), "Kiểm theo skill (bước 7 — luật, không AI).");
  assert.equal(displayStepsIn("AI Đo lường — bước 8.2, giả thuyết"), "AI Đo lường — bước 7, giả thuyết");
  assert.equal(displayStepsIn("Bước 6.2.1 xong"), "Bước 5 xong");
  assert.equal(displayStepsIn("bước 9.1 và 8.1 đơn lẻ"), "bước 9.1 và 8.1 đơn lẻ");
  assert.equal(displayStepsIn("Kiểm (bước 8.1)"), "Kiểm (bước 7)");
  assert.equal(displayStepsIn("xong bước 8.2. Sau đó"), "xong bước 7. Sau đó");
});

test("số có dấu chấm ngăn nghìn / thập phân / đơn vị sau chữ 'bước' giữ nguyên", () => {
  for (const s of ["mỗi bước 3.500 lượt xem", "Bước 1.000 người", "bước 8.10", "bước 8.1.5000", "bước 2,5", "bước 8.1,5", "bước 8.1 triệu", "bước 8.1%", "bước 8.1k lượt", "bước 12.5"]) assert.equal(displayStepsIn(s), s, s);
});
