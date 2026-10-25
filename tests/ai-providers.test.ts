// Nhiều hãng AI cho Đội AI (OWNER 25/10/2026: thêm Grok và ChatGPT): bộ chuyển đổi Responses API → dạng Anthropic, chi phí theo giá
// từng mô hình, cổng AI đi đúng hãng, kiểm khoá. CSDL tạm, fetch giả — không gọi hãng thật, không tốn tiền.
import { test, before, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod/v4";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "baor-ai-providers-"));
process.env.DATA_DIR = tmp;
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.AUTH_SECRET = "test-secret-".padEnd(40, "x");
process.env.BAOR_VIDEO_WORKER = "off";
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENAI_API_KEY;
process.env.XAI_API_KEY = "xai-test-key";

let providers: typeof import("../src/lib/ai-providers");
let roster: typeof import("../src/lib/ai-roster");
let ai: typeof import("../src/lib/ai");
let router: typeof import("../src/lib/router");
let aiKeys: typeof import("../src/lib/connectors/ai-keys");
const realFetch = globalThis.fetch;

before(async () => {
  providers = await import("../src/lib/ai-providers");
  roster = await import("../src/lib/ai-roster");
  ai = await import("../src/lib/ai");
  router = await import("../src/lib/router");
  aiKeys = await import("../src/lib/connectors/ai-keys");
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

type Seen = { url: string; init: RequestInit };
function fakeFetch(status: number, body: unknown, seen: Seen[] = []): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    seen.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

const okBody = (text: string, extra: Record<string, unknown> = {}) => ({
  status: "completed",
  output: [{ type: "reasoning" }, { type: "message", content: [{ type: "output_text", text }] }],
  usage: { input_tokens: 1200, output_tokens: 300 },
  ...extra,
});

test("chi phí theo giá đúng mô hình (USD / 1M token × tỷ giá); mô hình lạ → để router dùng giá chung", () => {
  assert.equal(providers.modelCostVnd("grok-4.7", 1_000_000, 1_000_000), (2 + 6) * providers.DEFAULT_VND_PER_USD);
  assert.equal(providers.modelCostVnd("claude-sonnet-5-5", 1000, 1000), Math.round(((1000 * 2 + 1000 * 10) / 1e6) * providers.DEFAULT_VND_PER_USD));
  assert.equal(providers.modelCostVnd("mo-hinh-la", 10, 10), undefined);
  assert.ok(providers.AI_MODELS.some((m) => m.provider === "openai") && providers.AI_MODELS.some((m) => m.provider === "xai"));
});

test("ChatGPT / Grok: create gửi đúng Responses API, trả về dạng Anthropic (chữ, token, lý do dừng)", async () => {
  const seen: Seen[] = [];
  const c = providers.compatClient("xai", fakeFetch(200, okBody("Xin chào"), seen));
  const res = await c.messages.create({ model: "grok-4.7", max_tokens: 500, system: "Bạn là trợ lý", messages: [{ role: "user", content: "Chào" }] });
  assert.equal(seen[0].url, "https://api.x.ai/v1/responses");
  assert.equal((seen[0].init.headers as Record<string, string>).authorization, "Bearer xai-test-key");
  const sent = JSON.parse(String(seen[0].init.body));
  assert.equal(sent.model, "grok-4.7");
  assert.equal(sent.instructions, "Bạn là trợ lý");
  assert.deepEqual(sent.input, [{ role: "user", content: "Chào" }]);
  assert.equal(sent.max_output_tokens, 500);
  assert.equal(sent.text, undefined, "không có schema thì không ép JSON");
  assert.deepEqual(res.content, [{ type: "text", text: "Xin chào" }]);
  assert.deepEqual(res.usage, { input_tokens: 1200, output_tokens: 300 });
  assert.equal(res.stop_reason, "end_turn");

  const refused = await providers.compatClient("xai", fakeFetch(200, { output: [{ type: "message", content: [{ type: "refusal", refusal: "không" }] }] })).messages.create({ model: "grok-4.7", max_tokens: 10, messages: [{ role: "user", content: "x" }] });
  assert.equal(refused.stop_reason, "refusal");
  const cut = await providers.compatClient("xai", fakeFetch(200, okBody("dở", { status: "incomplete", incomplete_details: { reason: "max_output_tokens" } }))).messages.create({ model: "grok-4.7", max_tokens: 10, messages: [{ role: "user", content: "x" }] });
  assert.equal(cut.stop_reason, "max_tokens");
});

test("parse: gửi JSON schema, kiểm kết quả bằng zod; sai schema → lỗi (không lưu dữ liệu hỏng)", async () => {
  const Schema = z.object({ hooks: z.array(z.object({ hook: z.string() })) });
  const seen: Seen[] = [];
  const good = await providers
    .compatClient("xai", fakeFetch(200, okBody(JSON.stringify({ hooks: [{ hook: "A" }, { hook: "B" }] })), seen))
    .messages.parse({ model: "grok-4.7", max_tokens: 100, messages: [{ role: "user", content: "x" }], output_config: { format: zodOutputFormat(Schema) } });
  assert.deepEqual(good.parsed_output, { hooks: [{ hook: "A" }, { hook: "B" }] });
  const sent = JSON.parse(String(seen[0].init.body));
  assert.equal(sent.text.format.type, "json_schema");
  assert.equal(sent.text.format.schema.type, "object");
  await assert.rejects(
    providers.compatClient("xai", fakeFetch(200, okBody(JSON.stringify({ hooks: [{ khac: 1 }] })))).messages.parse({ model: "grok-4.7", max_tokens: 100, messages: [{ role: "user", content: "x" }], output_config: { format: zodOutputFormat(Schema) } }),
    /structured output/,
  );
});

test("lỗi của hãng → ProviderError giữ status + thông báo; thiếu khoá → báo rõ", async () => {
  await assert.rejects(
    providers.compatClient("xai", fakeFetch(401, { error: { message: "Incorrect API key" } })).messages.create({ model: "grok-4.7", max_tokens: 10, messages: [{ role: "user", content: "x" }] }),
    (e: unknown) => e instanceof providers.ProviderError && e.status === 401 && /Incorrect API key/.test(e.message),
  );
  await assert.rejects(
    providers.compatClient("openai", fakeFetch(200, okBody("x"))).messages.create({ model: "gpt-6.1-sol", max_tokens: 10, messages: [{ role: "user", content: "x" }] }),
    /Chưa có khoá ChatGPT/,
  );
  assert.equal(providers.clientFor("openai"), null);
  assert.ok(providers.clientFor("xai"));
});

test("Đội AI: vị trí chọn được mô hình ChatGPT / Grok; mô hình lạ bị từ chối", () => {
  roster.saveRoleSettings("caption", { model: "gpt-6.1-sol" });
  assert.equal(roster.roleSettings(roster.roleById("caption")!).model, "gpt-6.1-sol");
  assert.throws(() => roster.saveRoleSettings("caption", { model: "gpt-khong-co" }), /không hợp lệ/);
});

test("cổng AI: vị trí dùng Grok → gọi xAI, ghi sổ đúng mô hình + giá; thiếu khoá ChatGPT → không gọi, báo đúng hãng", async () => {
  roster.saveRoleSettings("caption", { enabled: true, model: "grok-4.7" });
  const seen: Seen[] = [];
  globalThis.fetch = fakeFetch(200, okBody("Caption thử"), seen);
  const r = await ai.gate("caption", "thử Grok", (client, model) => client.messages.create({ model, max_tokens: 100, messages: [{ role: "user", content: "x" }] }));
  assert.ok(r.ok);
  assert.equal(seen[0].url, "https://api.x.ai/v1/responses");
  const last = router.listAiCalls(1)[0];
  assert.equal(last.model, "grok-4.7");
  assert.equal(last.role, "caption");
  assert.equal(last.costVnd, providers.modelCostVnd("grok-4.7", 1200, 300));

  roster.saveRoleSettings("caption", { model: "gpt-6.1-sol" });
  let called = false;
  const r2 = await ai.gate("caption", "thử ChatGPT", async () => {
    called = true;
    return { usage: { input_tokens: 1, output_tokens: 1 } };
  });
  assert.equal(called, false);
  assert.ok(!r2.ok && /Chưa có khoá ChatGPT/.test(r2.error));
  assert.deepEqual(ai.aiConfiguredFor("caption"), { ok: false, provider: "ChatGPT" });
});

test("kiểm khoá ở Kết nối: hỏi danh sách mô hình (không tốn tiền); khoá sai → hiện lỗi nguyên văn của hãng", async () => {
  const seen: Seen[] = [];
  const ok = await aiKeys.xaiKeyConnector.check({ config: { apiKey: "xai-1" }, fetch: fakeFetch(200, { data: [] }, seen) });
  assert.ok(ok.ok);
  assert.equal(seen[0].url, "https://api.x.ai/v1/models");
  const bad = await aiKeys.claudeKeyConnector.check({ config: { apiKey: "sk-ant-x" }, fetch: fakeFetch(400, { error: { message: "This API key is not scoped to a workspace" } }) });
  assert.ok(!bad.ok && /not scoped to a workspace/.test(bad.message));
  const none = await aiKeys.openaiKeyConnector.check({ config: {}, fetch: fakeFetch(200, {}) });
  assert.ok(!none.ok);
});

test("Nghiên cứu bước tìm nguồn (web_search chỉ có ở Claude): vị trí Nghiên cứu chọn Grok → bước 1 vẫn gọi Claude, bước 2 gọi Grok", async () => {
  const research = await import("../src/lib/research/index");
  process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  try {
    roster.saveRoleSettings("research", { enabled: true, model: "grok-4.3" });
    const seen: Seen[] = [];
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      seen.push({ url: String(url), init: init ?? {} });
      if (String(url).startsWith("https://api.anthropic.com/")) {
        return new Response(JSON.stringify({ id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5-5", content: [{ type: "web_search_tool_result", tool_use_id: "srvtoolu_1", content: [{ type: "web_search_result", url: "https://vi.example.com/a", title: "Nguồn A", page_age: null, encrypted_content: "x" }] }, { type: "text", text: "Báo cáo thử" }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 100, output_tokens: 50 } }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify(okBody("{}")), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const id = research.createResearchTask({ question: "Câu hỏi thử", purposeKind: "content" as never, purpose: "thử", by: "t" });
    const r = await research.runResearchWithAi(id, "t");
    const first = seen[0];
    assert.match(first.url, /^https:\/\/api\.anthropic\.com\/v1\/messages/, "bước 1 gọi Claude");
    assert.equal(JSON.parse(String(first.init.body)).model, "claude-opus-5-5", "dùng mô hình Claude mặc định của vị trí");
    assert.ok(seen.some((s) => s.url === "https://api.x.ai/v1/responses"), "bước 2 gọi Grok của vị trí");
    assert.ok(r.ok || r.error !== "Không gọi được mô hình AI.", "không còn văng lỗi chung chung");
  } finally {
    delete process.env.ANTHROPIC_API_KEY;
  }
});
