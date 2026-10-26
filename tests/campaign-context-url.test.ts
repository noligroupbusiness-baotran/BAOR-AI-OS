// Đường dẫn kèm ngữ cảnh chiến dịch: #hash đứng sau ?tab=… không được dính vào giá trị tham số (lỗi mở nhầm tab Chủ đề).
import { test } from "node:test";
import assert from "node:assert/strict";
import { entityHref, withCampaignContext } from "../src/lib/campaigns/context";

test("hash sau query giữ đúng chỗ, tham số tab không bị dính #", () => {
  assert.equal(withCampaignContext("/insights/research?tab=insight#insights", { campaignId: "c1" }), "/insights/research?tab=insight&campaign=c1#insights");
  assert.equal(entityHref("insight", "i5", { campaignId: "c1", channelGoalId: "g" }), "/insights/research?tab=insight&campaign=c1&goal=g#insights");
});

test("không có hash / bỏ ngữ cảnh", () => {
  assert.equal(withCampaignContext("/x#a", { campaignId: "c1" }), "/x?campaign=c1#a");
  assert.equal(withCampaignContext("/x?y=1&campaign=old", {}), "/x?y=1");
});
