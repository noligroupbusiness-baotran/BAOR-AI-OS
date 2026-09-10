import { test } from "node:test";
import assert from "node:assert/strict";
import { campaignProgress, checkBudget, conversionRate, goalProgress, overlapsMonth, roas } from "../src/lib/campaigns/results";

test("ngân sách kênh vượt tổng bị đánh dấu over", () => {
  assert.equal(checkBudget(10_000_000, [{ budget: 6_000_000 }, { budget: 4_000_000 }]).over, false);
  assert.equal(checkBudget(10_000_000, [{ budget: 6_000_000 }, { budget: 4_000_001 }]).over, true);
});

test("tiến độ và tỷ lệ", () => {
  assert.equal(goalProgress({ targetValue: 200, currentValue: 64 }), 32);
  assert.equal(goalProgress({ targetValue: 0, currentValue: 5 }), 0);
  assert.equal(campaignProgress({ targetValue: 300 }, [], { achievedValue: 64 }), 21);
  assert.equal(campaignProgress({ targetValue: null }, [{ targetValue: 100, currentValue: 50 }, { targetValue: 100, currentValue: 100 }]), 75);
  assert.equal(roas(146_280_000, 2_720_000), 53.78);
  assert.equal(roas(0, 100), null);
  assert.equal(conversionRate(41, 64), 64.1);
});

test("overlapsMonth theo khoảng ngày", () => {
  assert.equal(overlapsMonth("2026-10-01", "2026-10-31", "2026-10"), true);
  assert.equal(overlapsMonth("2026-09-15", "2026-10-15", "2026-09"), true);
  assert.equal(overlapsMonth("2026-11-01", "2026-11-30", "2026-10"), false);
});
