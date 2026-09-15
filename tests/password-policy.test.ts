import { test } from "node:test";
import assert from "node:assert/strict";
import { PASSWORD_MIN_LENGTH, checkPassword } from "../src/lib/password-policy";

test("chặn mật khẩu ngắn, lặp, phổ biến, chứa email hoặc tên, một loại ký tự", () => {
  assert.equal(PASSWORD_MIN_LENGTH, 10);
  assert.equal(checkPassword("Ngan123").ok, false);
  assert.equal(checkPassword("aaaaaaaaaaaa").ok, false);
  assert.equal(checkPassword("Password123").ok, false);
  assert.equal(checkPassword("baotran-2026x", { email: "baotran@baor.vn" }).ok, false);
  assert.equal(checkPassword("Nguyen#2026ok", { name: "Nguyễn Văn Nguyen" }).ok, false);
  assert.equal(checkPassword("abcdefghijkl").ok, false, "chỉ chữ thường");
  assert.equal(checkPassword("1234567890123").ok, false, "chỉ số");
  assert.equal(checkPassword("x".repeat(129) + "1").ok, false);
});

test("nhận mật khẩu đủ dài và có từ 2 loại ký tự", () => {
  assert.equal(checkPassword("mua-thu-ha-noi-2026", { email: "ceo@baor.vn", name: "Trần Bảo" }).ok, true);
  assert.equal(checkPassword("Marketing2026").ok, true);
  assert.equal(checkPassword("correct horse battery").ok, true, "khoảng trắng là ký tự đặc biệt");
});
