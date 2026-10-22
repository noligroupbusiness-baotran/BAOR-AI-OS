import { test } from "node:test";
import assert from "node:assert/strict";
process.env.AUTH_SECRET = "test-secret";
import { decryptSecret, encryptSecret, isEncrypted, maskSecret } from "../src/lib/secrets";

test("mã hóa rồi giải mã trả về giá trị gốc, bản mã không chứa bản rõ", () => {
  const enc = encryptSecret("EAABsbCS1234token");
  assert.ok(isEncrypted(enc));
  assert.ok(!enc.includes("EAABsbCS1234token"));
  assert.equal(decryptSecret(enc), "EAABsbCS1234token");
  assert.notEqual(encryptSecret("x"), encryptSecret("x"), "mỗi lần mã hóa một IV khác");
});

test("giá trị chưa mã hóa (bản cũ) được giữ nguyên; che chỉ hiện 4 ký tự cuối", () => {
  assert.equal(decryptSecret("plain-token"), "plain-token");
  assert.equal(maskSecret("EAABsbCS1234token"), "••••oken");
  assert.equal(encryptSecret(""), "");
});
