// Bảng Hook (Personal Brand System bước 3): luật ngôn từ theo nền tảng, 10 hook / lần, căn cứ chỉ từ ngữ cảnh, chọn hook → kịch bản.
// CSDL tạm, không gọi Claude thật (khoá giả + client giả qua gate bị thay bằng llm giả ở mức messages.parse).
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "baor-hooks-"));
process.env.DATA_DIR = tmp;
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.AUTH_SECRET = "test-secret-".padEnd(40, "x");
process.env.BAOR_VIDEO_WORKER = "off";
delete process.env.ANTHROPIC_API_KEY;

let db: typeof import("../src/db");
let hooks: typeof import("../src/lib/content/hooks");
let ai: typeof import("../src/lib/ai");
let roster: typeof import("../src/lib/ai-roster");

before(async () => {
  db = await import("../src/db");
  hooks = await import("../src/lib/content/hooks");
  ai = await import("../src/lib/ai");
  roster = await import("../src/lib/ai-roster");
});

test("luật ngôn từ: tuyệt đối / chữa bệnh / giảm cân / thuộc tính cá nhân (chỉ Meta) / thu nhập / quá 3 phút", () => {
  const all = ["facebook", "tiktok"];
  assert.match(hooks.policyIssues("Cam kết hiệu quả 100%", all).join(), /tuyệt đối/);
  assert.match(hooks.policyIssues("sản phẩm chữa khỏi mất ngủ", all).join(), /chữa/);
  assert.match(hooks.policyIssues("giảm 5kg trong 7 ngày", all).join(), /giảm cân/);
  assert.match(hooks.policyIssues("Bạn đang béo lên mỗi ngày?", ["facebook"]).join(), /thuộc tính cá nhân/);
  assert.equal(hooks.policyIssues("Bạn đang béo lên mỗi ngày?", ["tiktok"]).length, 0, "luật thuộc tính cá nhân là của Meta");
  assert.match(hooks.policyIssues("thu nhập 30 triệu mỗi tháng", all).join(), /thu nhập/);
  assert.match(hooks.policyIssues("ok", all, 200).join(), /vượt 3 phút/);
  assert.equal(hooks.policyIssues("Ba câu chào hỏi giúp khách bớt đề phòng", all, 60).length, 0);
  assert.equal(hooks.policyIssues("Số 10 khách gọi lại", all).length, 0, "“số 10” không phải “số 1”");
});

test("lưu hook: bỏ căn cứ không có trong ngữ cảnh, gắn cảnh báo, nền tảng lạ bị lọc", () => {
  const allowed = [{ kind: "insight" as const, id: "ins_1", label: "Khách sợ cuộc gọi rác" }];
  const r = hooks.saveHooks("chào hỏi", [{ hook: "Đảm bảo khách nghe máy 100%", platforms: ["facebook", "myspace"], basisRefs: ["insight:ins_1", "finding:bia"], beats: ["a", " ", "b"], durationSec: 45 }], { source: "ai", by: "test", allowed });
  const row = hooks.listHooks().find((h) => h.id === r.ids[0])!;
  assert.deepEqual(row.basis.map((b) => b.id), ["ins_1"]);
  assert.deepEqual(row.platforms, ["facebook"]);
  assert.deepEqual(row.beats, ["a", "b"]);
  assert.ok(row.policyIssues.length >= 1);
});

test("AI tạo hook: qua Đội AI — tắt thì không gọi, thiếu khoá thì báo", async () => {
  roster.saveRoleSettings("hooks", { enabled: false });
  const off = await ai.generateHooks("chào hỏi phá băng", "OWNER");
  assert.equal(off.ok, false);
  assert.match(off.ok ? "" : off.error, /TẮT/);
  roster.saveRoleSettings("hooks", { enabled: true });
  const noKey = await ai.generateHooks("chào hỏi phá băng", "OWNER");
  assert.match(noKey.ok ? "" : noKey.error, /khóa Claude API/);
});

test("chọn hook → tạo kịch bản đang viết mang hook + dàn ý; chọn lại không tạo trùng; bỏ hook", () => {
  const r = hooks.saveHooks("gọi điện", [{ hook: "Ba câu đầu tiên quyết định khách có nghe tiếp", beats: ["mở", "giữa", "chốt"] }, { hook: "Hook thứ hai" }], { source: "manual", by: "OWNER" });
  const p1 = hooks.pickHook(r.ids[0]);
  assert.equal(p1.ok, true);
  const p2 = hooks.pickHook(r.ids[0]);
  assert.deepEqual(p2, p1);
  const c = db.getDb().select().from(db.schema.contentItems).where(eq(db.schema.contentItems.id, p1.ok ? p1.contentId : "")).get()!;
  assert.equal(c.format, "script");
  assert.equal(c.status, "in_progress");
  assert.equal(c.hook, "Ba câu đầu tiên quyết định khách có nghe tiếp");
  assert.deepEqual(JSON.parse(c.outline), ["mở", "giữa", "chốt"]);
  hooks.rejectHook(r.ids[1]);
  hooks.rejectHook(r.ids[0]);
  const rows = hooks.listHooks();
  assert.equal(rows.find((h) => h.id === r.ids[1])!.status, "rejected");
  assert.equal(rows.find((h) => h.id === r.ids[0])!.status, "picked", "hook đã chọn không bị bỏ");
});

test("AI tạo hook: mô hình (giả) trả 10 → lưu đúng 10 trong một lô, căn cứ bịa bị bỏ và đếm", async () => {
  // SDK có thể nạp 2 bản (ESM + CJS): vá cả hai để chắc không gọi mạng thật
  const { createRequire } = await import("node:module");
  const esm = (await import("@anthropic-ai/sdk")).default;
  const cjs = createRequire(import.meta.url)("@anthropic-ai/sdk").default;
  const protos = [...new Set([esm.Messages.prototype, cjs.Messages.prototype])] as unknown as { parse: unknown }[];
  const reals = protos.map((p) => p.parse);
  const now = new Date().toISOString();
  db.getDb().insert(db.schema.insights).values({ id: "ins_goi", title: "Khách sợ cuộc gọi rác", detail: "", status: "approved", createdAt: now } as typeof db.schema.insights.$inferInsert).run();
  let sentModel = "";
  const fake = async function (body: { model: string }) {
    sentModel = body.model;
    return {
      usage: { input_tokens: 100, output_tokens: 100 },
      parsed_output: { hooks: Array.from({ length: 10 }, (_, i) => ({ hook: `Hook ${i + 1}`, angle: "góc", beats: ["a", "b", "c"], durationSec: 60, platforms: ["tiktok"], basisRefs: i === 0 ? ["insight:ins_goi", "finding:bia"] : [] })) },
    };
  };
  for (const p of protos) p.parse = fake;
  process.env.ANTHROPIC_API_KEY = "sk-test-khong-goi-that";
  try {
    const r = await ai.generateHooks("chào hỏi khách", "OWNER");
    assert.equal(r.ok, true, r.ok ? "" : r.error);
    if (!r.ok) return;
    assert.equal(r.count, 10);
    assert.equal(r.dropped, 1);
    assert.equal(sentModel, roster.roleSettings(roster.roleById("hooks")!).model);
    const batch = hooks.listHooks().filter((h) => h.batchId === r.batchId);
    assert.equal(batch.length, 10);
    assert.deepEqual(batch.find((h) => h.hook === "Hook 1")!.basis.map((b) => b.id), ["ins_goi"]);
  } finally {
    protos.forEach((p, i) => (p.parse = reals[i]));
    delete process.env.ANTHROPIC_API_KEY;
  }
});

test("mô hình trả 11 hook, nền tảng viết khác → bộ parse thật của SDK vẫn đạt, lưu 10, sổ chi phí ghi đủ token (phản biện P2)", async () => {
  const { createRequire } = await import("node:module");
  const esm = (await import("@anthropic-ai/sdk")).default;
  const cjs = createRequire(import.meta.url)("@anthropic-ai/sdk").default;
  const protos = [...new Set([esm.Messages.prototype, cjs.Messages.prototype])] as unknown as { create: unknown }[];
  const reals = protos.map((p) => p.create);
  const out = { hooks: Array.from({ length: 11 }, (_, i) => ({ hook: `H${i + 1}`, angle: "", beats: ["x"], durationSec: 30, platforms: ["Facebook", "tiktok"], basisRefs: [] })) };
  const fake = async () => ({ id: "msg_test", type: "message", role: "assistant", model: "m", stop_reason: "end_turn", stop_sequence: null, content: [{ type: "text", text: JSON.stringify(out), citations: null }], usage: { input_tokens: 3000, output_tokens: 2000 } });
  for (const p of protos) p.create = fake;
  process.env.ANTHROPIC_API_KEY = "sk-test-khong-goi-that";
  try {
    const r = await ai.generateHooks("gọi lại khách cũ", "OWNER");
    assert.equal(r.ok, true, r.ok ? "" : r.error);
    if (!r.ok) return;
    assert.equal(r.count, 10);
    assert.equal(r.short, 0);
    const batch = hooks.listHooks().filter((h) => h.batchId === r.batchId);
    assert.deepEqual(batch[0].platforms, ["tiktok"], "nền tảng lạ (“Facebook”) bị lọc khi lưu");
    const last = roster.recentAiCalls(1)[0];
    assert.equal(last.ok, true);
    assert.equal(last.inputTokens, 3000, "token đã tiêu được ghi sổ");
  } finally {
    protos.forEach((p, i) => (p.create = reals[i]));
    delete process.env.ANTHROPIC_API_KEY;
  }
});
