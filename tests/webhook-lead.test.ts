// Webhook lead (src/app/api/webhooks/lead/route.ts) — phản biện 26/10 P3: gói quá lớn (413) sau khi đã mở run phải đóng run (không để run
// mở mãi), và lỗi dữ liệu / lỗi khoá dùng câu thông báo chung với src/lib/attention.ts. CSDL tạm, không mạng.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { and, eq, isNull } from "drizzle-orm";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "baor-webhook-lead-"));
process.env.DATA_DIR = tmp;
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.AUTH_SECRET = "test-secret-".padEnd(40, "x");
process.env.BAOR_VIDEO_WORKER = "off";

let db: typeof import("../src/db");
let webhooks: typeof import("../src/lib/webhooks");
let route: typeof import("../src/app/api/webhooks/lead/route");

before(async () => {
  db = await import("../src/db");
  webhooks = await import("../src/lib/webhooks");
  route = await import("../src/app/api/webhooks/lead/route");
});

const runs = () => db.getDb().select().from(db.schema.syncRuns).where(and(eq(db.schema.syncRuns.integrationKey, "website"), eq(db.schema.syncRuns.kind, "webhook"))).all();
const post = (body: string, key: string) =>
  route.POST(new Request("http://localhost/api/webhooks/lead", { method: "POST", headers: { "x-baor-key": key, "content-type": "application/json" }, body }) as unknown as Parameters<typeof route.POST>[0]);

test("gói quá lớn (không khai content-length) → 413 VÀ đóng run lỗi, không để run mở mãi", async () => {
  const r = await post(JSON.stringify({ name: "A", message: "x".repeat(70 * 1024) }), webhooks.getLeadWebhookKey());
  assert.equal(r.status, 413);
  assert.equal(db.getDb().select().from(db.schema.syncRuns).where(isNull(db.schema.syncRuns.finishedAt)).all().length, 0, "không còn run mở");
  const [last] = runs();
  assert.equal(last.ok, false);
  assert.match(last.message, /quá lớn/);
});

test("khoá sai / thiếu tên dùng đúng câu thông báo chung (attention.ts nhận diện bằng cùng hằng số)", async () => {
  db.getDb().delete(db.schema.syncRuns).run();
  assert.equal((await post(JSON.stringify({ name: "A" }), "khoa-sai")).status, 401);
  assert.equal((await post(JSON.stringify({ name: "" }), webhooks.getLeadWebhookKey())).status, 400);
  assert.deepEqual(runs().map((r) => r.message).sort(), [webhooks.WEBHOOK_BAD_KEY_MSG, webhooks.WEBHOOK_MISSING_NAME_MSG].sort());
});
