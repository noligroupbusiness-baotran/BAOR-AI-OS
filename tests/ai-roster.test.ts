// Đội AI (Personal Brand System): mỗi vị trí 1 AI, công tắc "Cho phép gọi AI", trần riêng, báo cáo chi phí chung.
// CSDL tạm, không có khoá Claude: không gọi mô hình thật, không tốn tiền.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "baor-ai-roster-"));
process.env.DATA_DIR = tmp;
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.AUTH_SECRET = "test-secret-".padEnd(40, "x");
process.env.BAOR_VIDEO_WORKER = "off";
delete process.env.ANTHROPIC_API_KEY;

let roster: typeof import("../src/lib/ai-roster");
let router: typeof import("../src/lib/router");
let ai: typeof import("../src/lib/ai");

before(async () => {
  roster = await import("../src/lib/ai-roster");
  router = await import("../src/lib/router");
  ai = await import("../src/lib/ai");
});

test("mục đích gọi cũ quy về đúng vị trí; mỗi vị trí một AI", () => {
  assert.equal(roster.roleForPurpose("ideas").id, "hooks");
  assert.equal(roster.roleForPurpose("draft").id, "hooks"); // gộp Hook & Ý tưởng + Kịch bản (26/10)
  assert.equal(roster.roleById("script")?.id, "hooks", "id cũ trong sổ / cài đặt quy về vị trí gộp");
  assert.ok(!roster.AI_ROLES.some((r) => (r.id as string) === "script"));
  assert.equal(roster.roleForPurpose("research").id, "research");
  assert.equal(roster.roleForPurpose("video_plan").id, "video_edit");
  assert.equal(new Set(roster.AI_ROLES.map((r) => r.id)).size, roster.AI_ROLES.length);
});

test("tắt “Cho phép gọi AI” → cổng AI từ chối TRƯỚC khi gọi mô hình, ghi quyết định theo luật", async () => {
  roster.saveRoleSettings("hooks", { enabled: false });
  let called = false;
  const r = await ai.gate("ideas", "thử", async () => {
    called = true;
    return { usage: { input_tokens: 1, output_tokens: 1 } };
  });
  assert.equal(r.ok, false);
  assert.match(r.ok ? "" : r.error, /AI Nội dung đang TẮT/);
  assert.equal(called, false);
  assert.ok(router.listDecisions(5).some((d) => d.lane === "rule" && d.outcome === "không gọi AI"));
  roster.saveRoleSettings("hooks", { enabled: true });
  const r2 = await ai.gate("ideas", "thử", async () => ({ usage: { input_tokens: 1, output_tokens: 1 } }));
  assert.match(r2.ok ? "" : r2.error, /Chưa có khoá ChatGPT/, "bật lại thì đi tiếp tới bước khoá API (mặc định ChatGPT từ 26/10)");
});

test("trần riêng của vị trí: chạm trần thì chặn vị trí đó, vị trí khác vẫn được gọi", () => {
  roster.saveRoleSettings("hooks", { monthlyCapVnd: 5000 });
  assert.equal(roster.roleAllows(roster.roleById("hooks")!).ok, true);
  router.recordAiCall({ purpose: "draft", role: "script", model: "claude-opus-5-5", inputTokens: 5000, outputTokens: 2000, ok: true });
  const blocked = roster.roleAllows(roster.roleById("hooks")!); // bản ghi role "script" cũ tính vào vị trí gộp
  assert.equal(blocked.ok, false);
  assert.match(blocked.reason, /trần riêng/);
  assert.equal(roster.roleAllows(roster.roleById("caption")!).ok, true);
});

test("mô hình theo vị trí: chỉ nhận mô hình Claude hợp lệ; AI tại máy không đổi được", () => {
  roster.saveRoleSettings("caption", { model: "claude-haiku-5-5" });
  assert.equal(roster.roleSettings(roster.roleById("caption")!).model, "claude-haiku-5-5");
  assert.throws(() => roster.saveRoleSettings("caption", { model: "gpt-x" }), /không hợp lệ/);
  roster.saveRoleSettings("video_edit", { model: "claude-opus-5-5" });
  assert.match(roster.roleSettings(roster.roleById("video_edit")!).model, /tại máy/);
});

test("báo cáo chung: chi phí theo từng AI, bản ghi cũ (không có role) suy từ purpose, AI tại máy ₫0", () => {
  router.recordAiCall({ purpose: "research", model: "claude-opus-5-5", inputTokens: 1000, outputTokens: 1000, ok: true }); // bản ghi kiểu cũ
  router.recordAiCall({ purpose: "video_plan", role: "video_edit", model: "qwen", inputTokens: 0, outputTokens: 0, ok: true, costVnd: 0 });
  router.recordAiCall({ purpose: "research", role: "research", model: "claude-opus-5-5", inputTokens: 0, outputTokens: 0, ok: false, error: "lỗi" });
  const by = Object.fromEntries(roster.roleSpendThisMonth().map((r) => [r.role.id, r]));
  // Định nghĩa thống nhất 26/10: calls = MỌI lần gọi (1 thành công + 1 lỗi), failed = phần lỗi trong đó
  assert.equal(by.research.calls, 2);
  assert.equal(by.research.failed, 1);
  assert.equal(by.research.costVnd, router.estimateCostVnd(1000, 1000));
  assert.equal(by.video_edit.calls, 1);
  assert.equal(by.video_edit.costVnd, 0);
  assert.equal(by.hooks.calls, 1);
  assert.ok(by.hooks.costVnd > 0 && by.hooks.avgVnd === by.hooks.costVnd, "1 lần gọi → mỗi lần = tổng");
  const recent = roster.recentAiCalls(10);
  assert.ok(recent.some((c) => c.roleName === "AI Nghiên cứu" && c.role === null));
  assert.ok(recent.some((c) => c.roleName === "AI Edit Video"));
});

test("cổng AI truyền ĐÚNG mô hình của vị trí vào lần gọi và ghi sổ theo vị trí → tính vào trần riêng", async () => {
  process.env.ANTHROPIC_API_KEY = "sk-test-khong-goi-that";
  try {
    roster.saveRoleSettings("assistant", { model: "claude-opus-5-5", monthlyCapVnd: 3000 });
    let used = "";
    const r = await ai.gate("assistant", "thử", async (_client, model) => {
      used = model;
      return { usage: { input_tokens: 20000, output_tokens: 5000 } }; // Opus 5.5 $4/$20 → 0,18 USD ≈ 4.680 ₫ (tỷ giá mặc định)
    });
    assert.equal(r.ok, true);
    assert.equal(used, "claude-opus-5-5");
    const last = roster.recentAiCalls(1)[0];
    assert.equal(last.role, "assistant");
    assert.equal(last.model, "claude-opus-5-5");
    assert.equal(last.costVnd, Math.round(0.18 * 26_000), "ghi sổ theo giá của đúng mô hình");
    assert.equal(roster.roleAllows(roster.roleById("assistant")!).ok, false, "lượt gọi qua cổng phải tính vào trần riêng");
  } finally {
    delete process.env.ANTHROPIC_API_KEY;
  }
});

test("viết nháp: bài đăng / caption đi qua AI Viết bài đăng, kịch bản video qua AI Kịch bản (phản biện P1)", async () => {
  assert.equal(ai.draftPurpose("caption"), "caption");
  assert.equal(ai.draftPurpose("post"), "caption");
  assert.equal(ai.draftPurpose("reel"), "draft");
  assert.equal(ai.draftPurpose("script"), "draft");
  const { getDb, schema } = await import("../src/db");
  const now = new Date().toISOString();
  getDb().insert(schema.contentItems).values({ id: "c_test_caption", title: "Bài thử", format: "caption", status: "draft", createdAt: now, updatedAt: now } as typeof schema.contentItems.$inferInsert).run();
  roster.saveRoleSettings("caption", { enabled: false });
  const r = await ai.writeDraft("c_test_caption");
  assert.equal(r.ok, false);
  assert.match(r.ok ? "" : r.error, /AI Viết bài đăng đang TẮT/);
  roster.saveRoleSettings("caption", { enabled: true });
});

test("trần riêng tính cả bản ghi cũ chưa có cột vị trí (khớp với báo cáo)", () => {
  roster.saveRoleSettings("reply", { monthlyCapVnd: 1000 });
  router.recordAiCall({ purpose: "reply", model: "claude-opus-5-5", inputTokens: 2000, outputTokens: 500, ok: true }); // role null
  assert.equal(roster.roleAllows(roster.roleById("reply")!).ok, false);
});

test("Đội AI hiển thị bước theo 7 bước (mã sơ đồ 8.2 → 7, 6.1 → 5, 4.2 → 3); vị trí ngoài hành trình giữ '—'", async () => {
  const { displayStepOf } = await import("../src/config/journey");
  const step = (id: string) => displayStepOf(roster.AI_ROLES.find((r) => r.id === id)!.step);
  assert.equal(step("measure"), "7");
  assert.equal(step("caption"), "5");
  assert.equal(step("video_edit"), "3");
  assert.equal(step("research"), "1");
  assert.equal(step("reply"), "—");
  for (const r of roster.AI_ROLES) assert.ok(!/Second Brain/.test(r.job), `${r.id}: không hiện "Second Brain" trên giao diện`);
});
