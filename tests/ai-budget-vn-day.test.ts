// Kiểm toán độc lập 26/10/2026 (mục 6): "Chi tiêu AI hôm nay", trần ngày / tháng theo GIỜ VIỆT NAM (dateKey như các màn khác),
// không theo ngày UTC; số lần gọi tháng đếm MỌI lần gọi như "hôm nay" (tháng không bao giờ < hôm nay). CSDL tạm.
import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "baor-ai-vn-"));
process.env.DATA_DIR = tmp;
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.AUTH_SECRET = "test-secret-".padEnd(40, "x");
process.env.BAOR_VIDEO_WORKER = "off";

let db: typeof import("../src/db");
let router: typeof import("../src/lib/router");
let roster: typeof import("../src/lib/ai-roster");
let format: typeof import("../src/lib/format");

before(async () => {
  db = await import("../src/db");
  router = await import("../src/lib/router");
  roster = await import("../src/lib/ai-roster");
  format = await import("../src/lib/format");
});

beforeEach(() => db.getDb().delete(db.schema.aiCalls).run());

const vnMidnight = () => Date.parse(`${format.dateKey(new Date())}T00:00:00+07:00`);
function call(atMs: number, costVnd: number, ok = true, role = "caption") {
  db.getDb().insert(db.schema.aiCalls).values({ id: `ai_${atMs}_${costVnd}_${ok}`, at: new Date(atMs).toISOString(), purpose: role, model: "m", inputTokens: 0, outputTokens: 0, costVnd, ok, error: ok ? null : "lỗi", role }).run();
}

test("hôm nay = từ 00:00 giờ VN: lần gọi 00:30 sáng nay (UTC còn là hôm qua) tính, 23:30 tối qua (giờ VN) không tính", () => {
  const mid = vnMidnight();
  call(mid + 30 * 60_000, 1000); // 00:30 giờ VN hôm nay = 17:30 UTC hôm qua
  call(mid - 30 * 60_000, 7); // 23:30 giờ VN hôm qua = 16:30 UTC hôm qua
  const b = router.getAiBudget();
  assert.equal(b.spentTodayVnd, 1000);
  assert.equal(b.callsToday, 1);
  assert.equal(router.vnDayStartIso(), new Date(mid).toISOString());
});

test("trần ngày chặn theo ngày VN", async () => {
  const mid = vnMidnight();
  (await import("../src/lib/admin")).setSetting("ai.dailyCapVnd", "1000");
  call(mid - 60_000, 5000); // tối qua giờ VN: không tính vào hôm nay
  assert.equal(router.aiBudgetAllows().ok, true);
  call(mid + 60_000, 1000);
  assert.equal(router.aiBudgetAllows().ok, false);
});

test("tháng = từ 00:00 ngày 1 giờ VN; số lần gọi tháng đếm mọi lần (thành công + lỗi) → không nhỏ hơn 'hôm nay'", () => {
  const monthStart = Date.parse(`${format.dateKey(new Date()).slice(0, 7)}-01T00:00:00+07:00`);
  call(monthStart - 30 * 60_000, 9, true); // 23:30 ngày cuối tháng trước (giờ VN) — UTC cùng tháng trước nhưng sát mốc
  call(monthStart + 30 * 60_000, 100, true); // 00:30 ngày 1 giờ VN — UTC còn là tháng trước
  call(Date.now(), 0, false);
  call(Date.now(), 50, true);
  assert.equal(router.vnMonthStartIso(), new Date(monthStart).toISOString());
  const b = router.getAiBudget();
  assert.equal(b.spentMonthVnd, 150);
  const caption = roster.roleSpendThisMonth().find((r) => r.role.id === "caption")!;
  assert.equal(caption.calls, 3, "mọi lần gọi trong tháng VN");
  assert.equal(caption.failed, 1);
  assert.equal(caption.costVnd, 150);
  assert.ok(caption.calls >= b.callsToday, "tháng không nhỏ hơn hôm nay");
});
