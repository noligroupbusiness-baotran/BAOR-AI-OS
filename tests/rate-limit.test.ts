import { test } from "node:test";
import assert from "node:assert/strict";
import { RateLimiter } from "../src/lib/rate-limit";

test("cho qua đúng số lượt trong cửa sổ rồi chặn, báo thời gian chờ", () => {
  const rl = new RateLimiter();
  const rule = { limit: 3, windowMs: 10_000 };
  assert.equal(rl.check("k", rule, 0).ok, true);
  assert.equal(rl.check("k", rule, 1_000).ok, true);
  assert.equal(rl.check("k", rule, 2_000).remaining, 0);
  const blocked = rl.check("k", rule, 3_000);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.retryAfterSec, 7, "lượt đầu hết hạn ở giây 10");
  assert.equal(rl.check("khac", rule, 3_000).ok, true, "khóa khác không bị ảnh hưởng");
});

test("cửa sổ trượt: lượt cũ hết hạn thì cho qua lại; reset xóa ngay; prune dọn khóa rỗng", () => {
  const rl = new RateLimiter();
  const rule = { limit: 2, windowMs: 1_000 };
  rl.check("k", rule, 0);
  rl.check("k", rule, 500);
  assert.equal(rl.check("k", rule, 900).ok, false);
  assert.equal(rl.check("k", rule, 1_001).ok, true, "lượt tại t=0 đã rơi khỏi cửa sổ");
  rl.reset("k");
  assert.equal(rl.check("k", rule, 1_002).remaining, 1);
  rl.prune(10_000_000);
  assert.equal(rl.size(), 0);
});
