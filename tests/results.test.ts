import { test } from "node:test";
import assert from "node:assert/strict";
import { campaignAlerts, campaignProgress, checkBudget, costPerLead, goalProgress, overlapsMonth, timingLabel } from "../src/lib/campaigns/results";
import type { Campaign, CampaignStatus } from "../src/lib/campaigns/types";

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
  assert.deepEqual(timingLabel("2026-10-01", "2026-10-31", "2026-11-02"), { text: "Đã quá hạn 2 ngày", tone: "brick" });
});

test("kiểm toán 26/10: quá ngày kết thúc → cảnh báo “Đã quá hạn” ở MỌI trạng thái chưa kết thúc (kể cả Chờ phê duyệt)", () => {
  const base = { id: "c", name: "C", description: "", objective: "", targetMetric: "lead", targetValue: 10, productIds: [], audience: "", location: "", startDate: "2026-09-15", endDate: "2026-10-15", totalBudget: 0, budgetNote: "", ownerId: null, createdBy: "t", createdAt: "", updatedAt: "", approvedBy: null, approvedAt: null } as unknown as Campaign;
  const overdue = (status: CampaignStatus, today = "2026-10-26") => campaignAlerts({ ...base, status }, [], {}, today).some((a) => a.startsWith("Đã quá hạn"));
  for (const st of ["draft", "pending_approval", "needs_changes", "approved", "active", "paused", "error"] as CampaignStatus[]) assert.equal(overdue(st), true, st);
  assert.equal(overdue("ended"), false, "đã kết thúc thì không cảnh báo");
  assert.equal(overdue("pending_approval", "2026-10-15"), false, "đúng ngày kết thúc chưa quá hạn");
});
