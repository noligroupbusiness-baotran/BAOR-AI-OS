import { test } from "node:test";
import assert from "node:assert/strict";

process.env.AUTH_SECRET = "test-secret-".padEnd(40, "x");

test("token phiên mang email và phiên bản; token hai lớp không dùng được làm phiên và ngược lại", async () => {
  const { createMfaToken, createSessionToken, verifyMfaToken, verifySessionToken } = await import("../src/lib/session-token");
  const t = await createSessionToken("ceo@baor.vn", 3);
  assert.deepEqual(await verifySessionToken(t), { email: "ceo@baor.vn", sv: 3 });
  const m = await createMfaToken("ceo@baor.vn", "1.2.3.4");
  assert.equal(await verifySessionToken(m), null, "cookie tạm hai lớp không mở được trang quản trị");
  assert.deepEqual(await verifyMfaToken(m), { email: "ceo@baor.vn", ip: "1.2.3.4" });
  assert.equal(await verifyMfaToken(t), null);
  assert.equal(await verifySessionToken(t + "x"), null, "chữ ký sai");
});

test("đổi AUTH_SECRET làm mọi token cũ hết hiệu lực", async () => {
  const { createSessionToken, verifySessionToken } = await import("../src/lib/session-token");
  const t = await createSessionToken("a@b.c");
  process.env.AUTH_SECRET = "another-secret-".padEnd(40, "y");
  assert.equal(await verifySessionToken(t), null);
  process.env.AUTH_SECRET = "test-secret-".padEnd(40, "x");
});
