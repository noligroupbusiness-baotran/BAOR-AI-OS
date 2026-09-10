import { test } from "node:test";
import assert from "node:assert/strict";
import { availableActions, campaignTransitions, canTransition } from "../src/lib/campaigns/transitions";
import { checkEnv } from "../src/lib/env-check";

test("luồng chuẩn: nháp → chờ duyệt → đã duyệt → đang chạy → kết thúc", () => {
  assert.equal(canTransition("submit", "draft"), true);
  assert.equal(campaignTransitions.submit.to, "pending_approval");
  assert.equal(canTransition("approve", "pending_approval"), true);
  assert.equal(canTransition("activate", "approved"), true);
  assert.equal(canTransition("end", "active"), true);
});

test("không được bỏ qua phê duyệt hay kích hoạt từ nháp", () => {
  assert.equal(canTransition("activate", "draft"), false);
  assert.equal(canTransition("activate", "pending_approval"), false);
  assert.equal(canTransition("approve", "draft"), false);
  assert.equal(canTransition("approve", "approved"), false, "không duyệt hai lần");
  assert.equal(canTransition("submit", "active"), false);
});

test("yêu cầu chỉnh sửa quay về needs_changes rồi gửi lại được; kết thúc là trạng thái cuối", () => {
  assert.equal(campaignTransitions.request_changes.to, "needs_changes");
  assert.equal(canTransition("submit", "needs_changes"), true);
  assert.deepEqual(availableActions("ended"), []);
  assert.deepEqual(availableActions("active"), ["pause", "end"]);
  assert.deepEqual(availableActions("paused"), ["activate", "end"]);
});

test("kiểm tra môi trường: production thiếu AUTH_SECRET là lỗi, dev chỉ cảnh báo", () => {
  const prod = checkEnv({ NODE_ENV: "production", ADMIN_EMAIL: "a@b.c", PUBLIC_URL: "https://x", ANTHROPIC_API_KEY: "k" } as NodeJS.ProcessEnv);
  assert.equal(prod.length, 1);
  assert.equal(prod[0].level, "error");
  const dev = checkEnv({ NODE_ENV: "development", AUTH_SECRET: "dev-secret-change-me-in-production", ANTHROPIC_API_KEY: "k" } as NodeJS.ProcessEnv);
  assert.equal(dev[0].level, "warn");
  const ok = checkEnv({ NODE_ENV: "production", AUTH_SECRET: "x".repeat(48), ADMIN_EMAIL: "a@b.c", PUBLIC_URL: "https://x", ANTHROPIC_API_KEY: "k" } as NodeJS.ProcessEnv);
  assert.deepEqual(ok, []);
  const short = checkEnv({ NODE_ENV: "production", AUTH_SECRET: "abc", ADMIN_EMAIL: "a@b.c", PUBLIC_URL: "https://x", ANTHROPIC_API_KEY: "k" } as NodeJS.ProcessEnv);
  assert.match(short[0].text, /quá ngắn/);
});
