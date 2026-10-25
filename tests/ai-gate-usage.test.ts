// Cổng AI ghi sổ đúng token khi hãng ĐÃ trả lời (đã tính tiền) nhưng bước parse kết quả có cấu trúc / bước sau trong lần gọi ném lỗi
// (nợ: "parse JSON lỗi sau khi hãng đã tính tiền → sổ ghi 0 token, đếm thiếu trần"). CSDL tạm, fetch giả — không gọi hãng thật.
import { test, before, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod/v4";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "baor-ai-gate-usage-"));
process.env.DATA_DIR = tmp;
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.AUTH_SECRET = "test-secret-".padEnd(40, "x");
process.env.BAOR_VIDEO_WORKER = "off";
process.env.ANTHROPIC_API_KEY = "sk-ant-test-khong-goi-that";
process.env.XAI_API_KEY = "xai-test-key";
delete process.env.OPENAI_API_KEY;

let providers: typeof import("../src/lib/ai-providers");
let roster: typeof import("../src/lib/ai-roster");
let ai: typeof import("../src/lib/ai");
let router: typeof import("../src/lib/router");
let admin: typeof import("../src/lib/admin");
let db: typeof import("../src/db");
const realFetch = globalThis.fetch;

before(async () => {
  providers = await import("../src/lib/ai-providers");
  roster = await import("../src/lib/ai-roster");
  ai = await import("../src/lib/ai");
  router = await import("../src/lib/router");
  admin = await import("../src/lib/admin");
  db = await import("../src/db");
});

beforeEach(() => {
  db.getDb().delete(db.schema.aiCalls).run();
  admin.setSetting("ai.dailyCapVnd", "200000");
  admin.setSetting("ai.monthlyCapVnd", "3000000");
  roster.saveRoleSettings("caption", { enabled: true, model: "claude-sonnet-5-5", monthlyCapVnd: 0 });
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const claudeMsg = (text: string, usage = { input_tokens: 1000, output_tokens: 400 }) => ({
  id: "msg_1",
  type: "message",
  role: "assistant",
  model: "claude-sonnet-5-5",
  content: [{ type: "text", text }],
  stop_reason: "end_turn",
  stop_sequence: null,
  usage,
});
const grokBody = (text: string) => ({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text }] }], usage: { input_tokens: 1200, output_tokens: 300 } });

let calls = 0;
function fetchReturning(make: () => Response): typeof fetch {
  calls = 0;
  return (async () => {
    calls++;
    return make();
  }) as unknown as typeof fetch;
}

const Post = z.object({ title: z.string(), caption: z.string() });
const parseCall = (client: import("@anthropic-ai/sdk").default, model: string) =>
  client.messages.parse({ model, max_tokens: 100, messages: [{ role: "user", content: "x" }], output_config: { format: zodOutputFormat(Post) } });

test("Claude: JSON hỏng sau khi hãng đã trả lời → báo lỗi định dạng NHƯNG sổ ghi đúng token + chi phí theo usage", async () => {
  globalThis.fetch = fetchReturning(() => json(200, claudeMsg("{ không phải JSON")));
  const r = await ai.gate("caption", "thử JSON hỏng", parseCall);
  assert.equal(r.ok, false);
  assert.match(r.ok ? "" : r.error, /không đúng định dạng/);
  assert.equal(calls, 1, "đã gọi hãng đúng một lần");
  const [last] = router.listAiCalls(1);
  assert.equal(last.ok, false);
  assert.equal(last.role, "caption");
  assert.equal(last.model, "claude-sonnet-5-5");
  assert.equal(last.inputTokens, 1000);
  assert.equal(last.outputTokens, 400);
  assert.equal(last.costVnd, providers.modelCostVnd("claude-sonnet-5-5", 1000, 400));
  assert.ok(last.costVnd > 0);
});

test("Claude: JSON đúng cú pháp nhưng sai schema → cũng ghi đúng token", async () => {
  globalThis.fetch = fetchReturning(() => json(200, claudeMsg(JSON.stringify({ title: 1 }), { input_tokens: 700, output_tokens: 50 })));
  const r = await ai.gate("caption", "thử sai schema", parseCall);
  assert.ok(!r.ok && /không đúng định dạng/.test(r.error));
  const [last] = router.listAiCalls(1);
  assert.deepEqual([last.ok, last.inputTokens, last.outputTokens, last.costVnd], [false, 700, 50, providers.modelCostVnd("claude-sonnet-5-5", 700, 50)]);
});

test("Grok (nhánh ChatGPT / xAI cùng cổng): JSON hỏng → ghi đúng token + giá Grok", async () => {
  roster.saveRoleSettings("caption", { model: "grok-4.7" });
  globalThis.fetch = fetchReturning(() => json(200, grokBody("{hỏng")));
  const r = await ai.gate("caption", "thử Grok JSON hỏng", parseCall);
  assert.ok(!r.ok && /không đúng định dạng/.test(r.error));
  const [last] = router.listAiCalls(1);
  assert.deepEqual([last.ok, last.model, last.inputTokens, last.outputTokens, last.costVnd], [false, "grok-4.7", 1200, 300, providers.modelCostVnd("grok-4.7", 1200, 300)]);
});

test("lỗi sau khi hãng đã trả lời được tính vào trần ngày (lần gọi sau bị chặn) và trần riêng của vị trí", async () => {
  const cost = providers.modelCostVnd("claude-sonnet-5-5", 1000, 400)!;
  admin.setSetting("ai.dailyCapVnd", String(cost));
  globalThis.fetch = fetchReturning(() => json(200, claudeMsg("{ hỏng")));
  const first = await ai.gate("caption", "thử trần", parseCall);
  assert.ok(!first.ok && /không đúng định dạng/.test(first.error));
  assert.equal(router.getAiBudget().spentTodayVnd, cost, "chi phí lần lỗi nằm trong tổng hôm nay");
  const second = await ai.gate("caption", "thử trần lần 2", parseCall);
  assert.ok(!second.ok && /chạm trần AI hôm nay/.test(second.error), "đã chạm trần → không gọi tiếp");
  assert.equal(calls, 1, "lần thứ hai không gọi hãng");

  admin.setSetting("ai.dailyCapVnd", "200000");
  roster.saveRoleSettings("caption", { monthlyCapVnd: cost });
  assert.equal(roster.roleAllows(roster.roleById("caption")!).ok, false, "lần lỗi đã tính tiền phải tính vào trần riêng của vị trí");
});

test("nhiều lượt gọi trong một bước (vd Nghiên cứu web_search): lượt sau ném lỗi → vẫn cộng token các lượt đã trả", async () => {
  globalThis.fetch = fetchReturning(() => json(200, claudeMsg("lượt", { input_tokens: 300, output_tokens: 100 })));
  const r = await ai.gate("caption", "thử nhiều lượt", async (client, model) => {
    await client.messages.create({ model, max_tokens: 10, messages: [{ role: "user", content: "1" }] });
    await client.beta.messages.create({ model, max_tokens: 10, messages: [{ role: "user", content: "2" }] });
    throw new Error("Mô hình từ chối nhiệm vụ nghiên cứu này.");
  });
  assert.equal(r.ok, false);
  const [last] = router.listAiCalls(1);
  assert.deepEqual([last.ok, last.inputTokens, last.outputTokens, last.costVnd], [false, 600, 200, providers.modelCostVnd("claude-sonnet-5-5", 600, 200)]);
});

test("không đổi: parse thành công ghi đúng token; hãng báo lỗi HTTP (chưa trả lời) → 0 token, 0 ₫", async () => {
  globalThis.fetch = fetchReturning(() => json(200, claudeMsg(JSON.stringify({ title: "T", caption: "C" }), { input_tokens: 900, output_tokens: 120 })));
  const ok = await ai.gate("caption", "thử đúng", parseCall);
  assert.ok(ok.ok);
  assert.deepEqual(ok.ok ? ok.res.parsed_output : null, { title: "T", caption: "C" });
  assert.equal(ok.ok ? ok.res.usage.input_tokens : 0, 900);
  const [good] = router.listAiCalls(1);
  assert.deepEqual([good.ok, good.inputTokens, good.outputTokens, good.costVnd], [true, 900, 120, providers.modelCostVnd("claude-sonnet-5-5", 900, 120)]);

  db.getDb().delete(db.schema.aiCalls).run();
  globalThis.fetch = fetchReturning(() => json(400, { type: "error", error: { type: "invalid_request_error", message: "bad" } }));
  const bad = await ai.gate("caption", "thử lỗi HTTP", parseCall);
  assert.ok(!bad.ok && /Claude API \(400\)/.test(bad.error));
  const [last] = router.listAiCalls(1);
  assert.deepEqual([last.ok, last.inputTokens, last.outputTokens, last.costVnd], [false, 0, 0, 0]);
});
