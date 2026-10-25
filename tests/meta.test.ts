import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { parseMessengerWebhook, readAdsInsights, sumInsight, verifyMetaSignature } from "../src/lib/connectors/meta";

test("sumInsight cộng dồn giá trị theo ngày, kể cả giá trị dạng object", () => {
  const res = { data: [{ name: "page_impressions_unique", values: [{ value: 100 }, { value: 250 }] }, { name: "page_post_engagements", values: [{ value: { like: 3, comment: 2 } }] }] };
  assert.equal(sumInsight(res, "page_impressions_unique"), 350);
  assert.equal(sumInsight(res, "page_post_engagements"), 5);
  assert.equal(sumInsight(res, "khong_co"), 0);
});

test("readAdsInsights đọc chi phí, lead từ actions", () => {
  const r = readAdsInsights({ data: [{ spend: "1420000.5", impressions: "96500", clicks: "2130", actions: [{ action_type: "lead", value: "40" }, { action_type: "onsite_conversion.messaging_conversation_started_7d", value: "21" }, { action_type: "link_click", value: "999" }] }] });
  assert.deepEqual(r, { spent: 1420001, leads: 61, impressions: 96500, clicks: 2130 });
});

test("parseMessengerWebhook chỉ lấy tin văn bản của khách, bỏ echo của Page", () => {
  const body = { object: "page", entry: [{ id: "PAGE1", messaging: [
    { sender: { id: "USER9" }, recipient: { id: "PAGE1" }, timestamp: 1757480000000, message: { mid: "m1", text: "Cho mình xin giá gội dưỡng sinh" } },
    { sender: { id: "PAGE1" }, recipient: { id: "USER9" }, timestamp: 1757480001000, message: { mid: "m2", text: "Dạ 39.000 đồng ạ" } },
    { sender: { id: "USER9" }, recipient: { id: "PAGE1" }, timestamp: 1757480002000, message: { mid: "m3" } },
  ] }] };
  const out = parseMessengerWebhook(body);
  assert.equal(out.length, 1);
  assert.equal(out[0].externalUserId, "USER9");
  assert.equal(out[0].threadId, "PAGE1:USER9");
  assert.equal(parseMessengerWebhook({ object: "instagram" }).length, 0);
});

test("verifyMetaSignature chấp nhận chữ ký đúng, từ chối chữ ký sai", () => {
  const raw = JSON.stringify({ object: "page", entry: [] });
  const sig = "sha256=" + createHmac("sha256", "secret-1").update(raw).digest("hex");
  assert.equal(verifyMetaSignature("secret-1", raw, sig), true);
  assert.equal(verifyMetaSignature("secret-2", raw, sig), false);
  assert.equal(verifyMetaSignature("secret-1", raw, null), false);
  assert.equal(verifyMetaSignature("secret-1", raw + " ", sig), false);
});
