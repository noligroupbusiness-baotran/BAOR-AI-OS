import { test } from "node:test";
import assert from "node:assert/strict";
import { LoginGuard, clientIp } from "../src/lib/login-guard";

test("khóa sau 5 lần sai, mở lại sau thời gian khóa", () => {
  const g = new LoginGuard({ maxFailures: 5, windowMs: 60_000, lockMs: 30_000 });
  const keys = ["email:a@b.c", "ip:1.2.3.4"];
  const t0 = 1_000_000;
  for (let i = 0; i < 4; i++) assert.equal(g.fail(keys, t0 + i).locked, false);
  assert.equal(g.lockedSeconds(keys, t0 + 5), 0);
  const r = g.fail(keys, t0 + 5);
  assert.equal(r.locked, true);
  assert.equal(g.lockedSeconds(keys, t0 + 6), 30);
  assert.equal(g.lockedSeconds(keys, t0 + 5 + 30_000), 0);
});

test("khóa theo IP chặn cả email khác từ cùng IP", () => {
  const g = new LoginGuard({ maxFailures: 3, windowMs: 60_000, lockMs: 60_000 });
  for (let i = 0; i < 3; i++) g.fail([`email:u${i}@x.vn`, "ip:9.9.9.9"], 1000 + i);
  assert.ok(g.lockedSeconds(["email:khac@x.vn", "ip:9.9.9.9"], 1005) > 0);
  assert.equal(g.lockedSeconds(["email:khac@x.vn", "ip:8.8.8.8"], 1005), 0);
});

test("lần sai ngoài cửa sổ không tính; đăng nhập đúng xóa bộ đếm; prune dọn mục hết hạn", () => {
  const g = new LoginGuard({ maxFailures: 3, windowMs: 10_000, lockMs: 10_000 });
  const keys = ["email:a@b.c"];
  g.fail(keys, 0);
  g.fail(keys, 1);
  assert.equal(g.fail(keys, 20_000).locked, false, "hai lần đầu đã quá cửa sổ");
  g.succeed(keys);
  assert.equal(g.size(), 0);
  g.fail(keys, 30_000);
  g.prune(50_000);
  assert.equal(g.size(), 0);
});

test("clientIp ưu tiên x-forwarded-for, lấy IP đầu tiên", () => {
  assert.equal(clientIp((n) => (n === "x-forwarded-for" ? "203.0.113.5, 10.0.0.1" : null)), "203.0.113.5");
  assert.equal(clientIp((n) => (n === "x-real-ip" ? "198.51.100.7" : null)), "198.51.100.7");
  assert.equal(clientIp(() => null), "unknown");
});
