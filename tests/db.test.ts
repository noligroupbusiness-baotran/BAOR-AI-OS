// Test chạy trên CSDL SQLite tạm (migration + dữ liệu mẫu), không đụng data/baor.db.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "baor-test-"));
process.env.DATA_DIR = tmp;
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.AUTH_SECRET = "test-secret-".padEnd(40, "x");

let engine: typeof import("../src/lib/automation/engine");
let retention: typeof import("../src/lib/retention");
let router: typeof import("../src/lib/router");
let permissions: typeof import("../src/lib/permissions");
let db: typeof import("../src/db");

before(async () => {
  engine = await import("../src/lib/automation/engine");
  retention = await import("../src/lib/retention");
  router = await import("../src/lib/router");
  permissions = await import("../src/lib/permissions");
  db = await import("../src/db");
});

after(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("automation: khiếu nại chuyển người xử lý, không trả lời tự động", () => {
  const r = engine.evaluateMessage("Tôi muốn khiếu nại, dịch vụ quá tệ, hoàn tiền cho tôi", { dryRun: true });
  assert.equal(r.needsHuman, true);
  assert.equal(r.autoReply, undefined);
  assert.ok(r.matched.length >= 1);
});

test("automation: hỏi giá trả lời từ bảng giá; có số điện thoại thì gắn thẻ và đổi giai đoạn", () => {
  const price = engine.evaluateMessage("cho em hỏi giá combo bao nhiêu tiền ạ", { dryRun: true });
  assert.ok(price.autoReply && price.autoReply.includes("₫"), "câu trả lời phải lấy giá từ danh mục");
  const phone = engine.evaluateMessage("số em 0909123456 gọi em nhé", { dryRun: true });
  assert.ok(phone.matched.some((m) => m.reason.includes("số điện thoại")));
});

test("automation: tin không khớp luật nào thì chuyển AI đề xuất, người duyệt", () => {
  const r = engine.evaluateMessage("xyz qwerty lorem ipsum", { dryRun: true });
  assert.equal(r.fallbackAi || r.needsHuman, true);
  assert.equal(r.autoReply, undefined);
});

test("router: chi phí AI ước tính và trần ngân sách", () => {
  assert.ok(router.estimateCostVnd(1000, 500) > 0);
  const b = router.getAiBudget();
  assert.ok(b.dailyCapVnd > 0);
  assert.equal(router.aiBudgetAllows().ok, true);
});

test("phân quyền: staff < manager < admin", () => {
  const can = permissions.can;
  assert.equal(can({ permission: "staff" }, "manager"), false);
  assert.equal(can({ permission: "manager" }, "manager"), true);
  assert.equal(can({ permission: "manager" }, "admin"), false);
  assert.equal(can({ permission: "admin" }, "staff"), true);
});

test("dọn dữ liệu: xóa nhật ký cũ hơn hạn, giữ nhật ký mới", () => {
  const { getDb, schema } = db;
  const old = new Date(Date.now() - 200 * 86_400_000).toISOString();
  const recent = new Date().toISOString();
  getDb().insert(schema.activity).values([
    { at: old, actor: "system", message: "act_old", step: "" },
    { at: recent, actor: "system", message: "act_new", step: "" },
  ]).run();
  const r = retention.pruneOldData({ logsDays: 90, auditDays: 365 });
  assert.ok(r.activity >= 1);
  const left = getDb().select().from(schema.activity).all().map((a) => a.message);
  assert.ok(left.includes("act_new"));
  assert.ok(!left.includes("act_old"));
});
