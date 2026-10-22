import { test } from "node:test";
import assert from "node:assert/strict";
import { base32Decode, base32Encode, generateBackupCodes, generateTotpSecret, hotp, normalizeBackupCode, otpauthUri, totp, verifyTotp } from "../src/lib/totp";

// Vector chuẩn RFC 6238 (SHA1, khóa ASCII "12345678901234567890"), rút về 6 số.
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));

test("base32 encode/decode vòng tròn", () => {
  const buf = Buffer.from("Hello, BAOR!");
  assert.equal(base32Decode(base32Encode(buf)).toString(), "Hello, BAOR!");
  assert.equal(base32Encode(Buffer.from("12345678901234567890")), "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
});

test("TOTP khớp vector RFC 6238 (6 số cuối của mã 8 số)", () => {
  // T=59s → 94287082; T=1111111109 → 07081804; T=1234567890 → 89005924; T=2000000000 → 69279037
  assert.equal(totp(RFC_SECRET, 59_000), "287082");
  assert.equal(totp(RFC_SECRET, 1_111_111_109_000), "081804");
  assert.equal(totp(RFC_SECRET, 1_234_567_890_000), "005924");
  assert.equal(totp(RFC_SECRET, 2_000_000_000_000), "279037");
  assert.equal(hotp(RFC_SECRET, 1, 8), "94287082");
});

test("verifyTotp chấp nhận lệch ±1 bước, từ chối lệch 2 bước và mã sai định dạng", () => {
  const now = 1_234_567_890_000;
  const code = totp(RFC_SECRET, now);
  assert.equal(verifyTotp(RFC_SECRET, code, now), Math.floor(now / 30_000));
  assert.equal(verifyTotp(RFC_SECRET, code, now + 30_000), Math.floor(now / 30_000), "bước trước vẫn nhận");
  assert.equal(verifyTotp(RFC_SECRET, code, now - 30_000), Math.floor(now / 30_000), "bước sau vẫn nhận");
  assert.equal(verifyTotp(RFC_SECRET, code, now + 60_000), null, "lệch 2 bước bị từ chối");
  assert.equal(verifyTotp(RFC_SECRET, "12345", now), null);
  assert.equal(verifyTotp(RFC_SECRET, "abcdef", now), null);
  assert.equal(verifyTotp(RFC_SECRET, "000 000", now), null);
});

test("khóa mới 160 bit base32, otpauth URI đúng định dạng, mã dự phòng đủ 10 và chuẩn hóa được", () => {
  const s = generateTotpSecret();
  assert.equal(s.length, 32);
  assert.match(s, /^[A-Z2-7]+$/);
  const uri = otpauthUri(s, "ceo@baor.vn");
  assert.ok(uri.startsWith("otpauth://totp/BAOR%20AI%20OS%3Aceo%40baor.vn?"));
  assert.ok(uri.includes(`secret=${s}`) && uri.includes("issuer=BAOR+AI+OS") && uri.includes("digits=6"));
  const codes = generateBackupCodes();
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  for (const c of codes) assert.match(c, /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  assert.equal(normalizeBackupCode(" ab2c-d3ef "), "AB2CD3EF");
});
