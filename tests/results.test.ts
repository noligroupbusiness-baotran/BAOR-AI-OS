import { test } from "node:test";
import assert from "node:assert/strict";
import { campaignProgress, checkBudget, costPerLead, goalProgress, overlapsMonth, timingLabel } from "../src/lib/campaigns/results";

test("ngân sách kênh vượt tổng bị đánh dấu over", () => {
  assert.equal(checkBudget(10_000_000, [{ budget: 6_000_000 }, { budget: 4_000_000 }]).over, false);
  assert.equal(checkBudget(10_000_000, [{ budget: 6_000_000 }, { budget: 4_000_001 }]).over, true);
});

test("tiến độ và tỷ lệ", () => {
  assert.equal(goalProgress({ targetValue: 200, currentValue: 64 }), 32);
  assert.equal(goalProgress({ targetValue: 0, currentValue: 5 }), 0);
  assert.equal(campaignProgress({ targetValue: 300 }, [], { achievedValue: 64 }), 21);
  assert.equal(campaignProgress({ targetValue: null }, [{ targetValue: 100, currentValue: 50 }, { targetValue: 100, currentValue: 100 }]), 75);
  assert.equal(costPerLead(5_900_000, 64), 92_188);
  assert.equal(costPerLead(0, 64), null);
});

test("overlapsMonth theo khoảng ngày", () => {
  assert.equal(overlapsMonth("2026-10-01", "2026-10-31", "2026-10"), true);
  assert.equal(overlapsMonth("2026-09-15", "2026-10-15", "2026-09"), true);
  assert.equal(overlapsMonth("2026-11-01", "2026-11-30", "2026-10"), false);
});

test("timingLabel: sắp bắt đầu, còn N ngày, hôm nay, quá hạn", () => {
  assert.deepEqual(timingLabel("2026-10-01", "2026-10-31", "2026-09-28"), { text: "bắt đầu sau 3 ngày", tone: "neutral" });
  assert.deepEqual(timingLabel("2026-10-01", "2026-10-31", "2026-10-19"), { text: "còn 12 ngày", tone: "neutral" });
  assert.deepEqual(timingLabel("2026-10-01", "2026-10-31", "2026-10-29"), { text: "còn 2 ngày", tone: "amber" });
  assert.deepEqual(timingLabel("2026-10-01", "2026-10-31", "2026-10-31"), { text: "kết thúc hôm nay", tone: "amber" });
  assert.deepEqual(timingLabel("2026-10-01", "2026-10-31", "2026-11-02"), { text: "đã qua hạn 2 ngày", tone: "brick" });
});
