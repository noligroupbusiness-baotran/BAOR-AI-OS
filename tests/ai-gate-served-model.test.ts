// Cổng AI (src/lib/ai.ts › meterClient) — phản biện 25/10 (P3):
// 1. Client bọc đồng hồ phải giữ nguyên APIPromise của SDK (.withResponse() / .asResponse()) và đếm token đúng MỘT lần.
// 2. Sổ chi phí tính giá theo mô hình hãng THỰC SỰ chạy (response.model — Nghiên cứu bước 1 bật fallbacks "default"), không theo mô hình
//    yêu cầu; mô hình thực tế lạ → giá mô hình yêu cầu + ghi chú. CSDL tạm, fetch giả — không gọi hãng thật.
import { test, before, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type Anthropic from "@anthropic-ai/sdk";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "baor-ai-gate-served-"));
process.env.DATA_DIR = tmp;
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.AUTH_SECRET = "test-secret-".padEnd(40, "x");
process.env.BAOR_VIDEO_WORKER = "off";
process.env.ANTHROPIC_API_KEY = "sk-ant-test-khong-goi-that";
delete process.env.OPENAI_API_KEY;
delete process.env.XAI_API_KEY;

let providers: typeof import("../src/lib/ai-providers");
let roster: typeof import("../src/lib/ai-roster");
let ai: typeof import("../src/lib/ai");
let router: typeof import("../src/lib/router");
let admin: typeof import("../src/lib/admin");
let research: typeof import("../src/lib/research");
let db: typeof import("../src/db");
const realFetch = globalThis.fetch;

before(async () => {
  providers = await import("../src/lib/ai-providers");
  roster = await import("../src/lib/ai-roster");
  ai = await import("../src/lib/ai");
  router = await import("../src/lib/router");
  admin = await import("../src/lib/admin");
  research = await import("../src/lib/research");
  db = await import("../src/db");
});

beforeEach(() => {
  db.getDb().delete(db.schema.aiCalls).run();
  admin.setSetting("ai.dailyCapVnd", "200000");
  admin.setSetting("ai.monthlyCapVnd", "3000000");
  roster.saveRoleSettings("caption", { enabled: true, model: "claude-sonnet-5-5", monthlyCapVnd: 0 });
  roster.saveRoleSettings("research", { enabled: true, model: "claude-opus-5-5", monthlyCapVnd: 0 });
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json", "request-id": "req_gia_123" } });
const claudeMsg = (model: string, text: string, usage: Record<string, unknown> = { input_tokens: 1000, output_tokens: 400 }, content?: unknown[]) => ({
  id: "msg_1",
  type: "message",
  role: "assistant",
  model,
  content: content ?? [{ type: "text", text }],
  stop_reason: "end_turn",
  stop_sequence: null,
  usage,
});

let calls = 0;
/** fetch giả trả lần lượt các thân phản hồi (phần tử cuối dùng lại cho các lần sau). */
function fetchSeq(...bodies: unknown[]): typeof fetch {
  calls = 0;
  return (async () => json(bodies[Math.min(calls++, bodies.length - 1)])) as unknown as typeof fetch;
}

test("client qua cổng AI giữ nguyên APIPromise: .withResponse() / .asResponse() chạy, token đếm đúng MỘT lần", async () => {
  globalThis.fetch = fetchSeq(claudeMsg("claude-sonnet-5-5", "chào"));
  const r = await ai.gate("caption", "thử withResponse", async (client: Anthropic, model: string) => {
    const p = client.messages.create({ model, max_tokens: 10, messages: [{ role: "user", content: "x" }] });
    assert.equal(typeof p.withResponse, "function", "create qua cổng AI phải trả APIPromise của SDK");
    const { data, response, request_id } = await p.withResponse();
    assert.equal(response.status, 200);
    assert.equal(request_id, "req_gia_123");
    assert.equal(data.content[0].type === "text" ? data.content[0].text : "", "chào");
    const again = await p; // APIPromise nhớ kết quả parse → không đếm đôi
    assert.equal(again.usage.input_tokens, 1000);
    // beta.messages (Nghiên cứu) cũng vậy
    const b = await client.beta.messages.create({ model, max_tokens: 10, messages: [{ role: "user", content: "y" }] }).withResponse();
    assert.equal(b.response.status, 200);
    // asResponse: trả Response thô (thân chưa đọc) — chỗ gọi tự đọc
    const raw = await client.messages.create({ model, max_tokens: 10, messages: [{ role: "user", content: "z" }] }).asResponse();
    assert.equal(((await raw.json()) as { usage: { output_tokens: number } }).usage.output_tokens, 400);
    return data;
  });
  assert.ok(r.ok, r.ok ? "" : r.error);
  assert.equal(calls, 3);
  const [last] = router.listAiCalls(1);
  // withResponse + await lại (1 lượt) + beta withResponse (1 lượt) = 2 phản hồi đã parse; asResponse không parse → không đếm
  assert.deepEqual([last.ok, last.model, last.inputTokens, last.outputTokens, last.costVnd], [true, "claude-sonnet-5-5", 2000, 800, providers.modelCostVnd("claude-sonnet-5-5", 2000, 800)]);
});

test("response.model khác mô hình yêu cầu → sổ tính giá theo mô hình THỰC chạy, nhãn ghi rõ mô hình yêu cầu", async () => {
  globalThis.fetch = fetchSeq(claudeMsg("claude-sonnet-5-5", "đã chạy bằng Sonnet"));
  const r = await ai.gate("research", "thử fallbacks", (client, model) =>
    client.beta.messages.create({ model, max_tokens: 10, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default", messages: [{ role: "user", content: "x" }] } as Parameters<typeof client.beta.messages.create>[0]) as Promise<Anthropic.Beta.BetaMessage>,
  );
  assert.ok(r.ok, r.ok ? "" : r.error);
  const sonnet = providers.modelCostVnd("claude-sonnet-5-5", 1000, 400)!;
  assert.notEqual(sonnet, providers.modelCostVnd("claude-opus-5-5", 1000, 400), "hai mô hình khác giá — test có nghĩa");
  const [last] = router.listAiCalls(1);
  assert.equal(last.costVnd, sonnet);
  assert.match(last.model, /^claude-sonnet-5-5 \(yêu cầu claude-opus-5-5\)$/);
  assert.equal(r.ok && r.costVnd, sonnet, "gate trả đúng số ₫ đã ghi sổ");
  assert.equal(r.ok && r.model, "claude-opus-5-5", "model = mô hình yêu cầu (không đổi nghĩa cũ)");
});

test("mô hình thực tế chưa có trong bảng giá → giá mô hình yêu cầu + ghi chú; đuôi ngày bản chụp → coi là cùng mô hình", async () => {
  globalThis.fetch = fetchSeq(claudeMsg("claude-mau-moi-9", "x"));
  const r = await ai.gate("research", "thử mô hình lạ", (client, model) => client.messages.create({ model, max_tokens: 10, messages: [{ role: "user", content: "x" }] }));
  assert.ok(r.ok);
  const [odd] = router.listAiCalls(1);
  assert.equal(odd.costVnd, providers.modelCostVnd("claude-opus-5-5", 1000, 400));
  assert.match(odd.model, /claude-mau-moi-9 \(yêu cầu claude-opus-5-5; claude-mau-moi-9 chưa có trong bảng giá, tính theo giá claude-opus-5-5\)/);

  db.getDb().delete(db.schema.aiCalls).run();
  globalThis.fetch = fetchSeq(claudeMsg("claude-opus-5-5-20261001", "x"));
  await ai.gate("research", "thử bản chụp", (client, model) => client.messages.create({ model, max_tokens: 10, messages: [{ role: "user", content: "x" }] }));
  const [dated] = router.listAiCalls(1);
  assert.deepEqual([dated.model, dated.costVnd], ["claude-opus-5-5", providers.modelCostVnd("claude-opus-5-5", 1000, 400)]);
  assert.equal(providers.servedCost("claude-opus-5-5", undefined, 10, 10).model, "claude-opus-5-5", "không có response.model → mô hình yêu cầu");
});

test("Nghiên cứu bước 1 (fallbacks) chạy bằng mô hình khác → chi phí nhiệm vụ = giá mô hình thực chạy, khớp sổ ai_calls", async () => {
  const url = "https://example.org/nghien-cuu-goi-dien";
  const step1 = claudeMsg("claude-sonnet-5-5", "", { input_tokens: 5000, output_tokens: 2000, server_tool_use: { web_search_requests: 2 } }, [
    { type: "web_search_tool_result", tool_use_id: "srvtoolu_1", content: [{ type: "web_search_result", url, title: "Nghiên cứu gọi điện", page_age: null, encrypted_content: "x" }] },
    { type: "text", text: "Báo cáo: khách nghe máy nhiều hơn vào buổi sáng.", citations: null },
  ]);
  const out = {
    summary: "Tóm tắt nghiên cứu gọi điện",
    sources: [{ url, title: "Nghiên cứu gọi điện", author: "", publisher: "Example", publishedAt: null, sourceType: "research", grade: "B", excerpt: "Tóm ý", limits: "Mẫu nhỏ" }],
    findings: [],
  };
  const step2 = claudeMsg("claude-opus-5-5", JSON.stringify(out), { input_tokens: 3000, output_tokens: 1000 });
  globalThis.fetch = fetchSeq(step1, step2);
  const id = research.createResearchTask({ question: "Gọi điện cho khách giờ nào hiệu quả?", purposeKind: "content", purpose: "Kịch bản video ngắn", by: "OWNER" });
  const r = await research.runResearchWithAi(id, "OWNER");
  assert.ok(r.ok, r.ok ? "" : r.error);
  assert.equal(calls, 2);
  const want = providers.modelCostVnd("claude-sonnet-5-5", 5000, 2000)! + providers.modelCostVnd("claude-opus-5-5", 3000, 1000)! + 2 * 260;
  const task = research.getResearchTask(id)!.task;
  assert.equal(task.costVnd, want, "bước 1 tính giá Sonnet (mô hình thực chạy), không phải Opus");
  assert.match(task.model ?? "", /^claude-sonnet-5-5 \(yêu cầu claude-opus-5-5\) \+ claude-opus-5-5$/);
  const ledger = router.listAiCalls(5).filter((c) => c.purpose === "research");
  // Kiểm toán 26/10: phí web_search (2 lượt × 260 ₫) GHI VÀO sổ ai_calls (tính trần ngày / tháng / vị trí), không chỉ cộng vào nhiệm vụ
  assert.equal(ledger.reduce((a, c) => a + c.costVnd, 0), want, "chi phí nhiệm vụ = đúng tổng sổ ai_calls (gồm phí web_search)");
  assert.ok(ledger.some((c) => c.role === "research" && c.costVnd === 2 * 260 && /web_search/.test(c.model)), "dòng sổ riêng cho phí web_search");
  assert.equal(router.getAiBudget().spentTodayVnd, want, "trần ngày tính cả phí web_search");
  // Dòng phí web_search có chi phí nhưng KHÔNG phải một lần gọi mô hình (phản biện P3): 2 lần gọi, không phải 3
  assert.equal(router.getAiBudget().callsToday, 2);
  assert.equal(roster.roleSpendThisMonth().find((x) => x.role.id === "research")!.calls, 2);
});

test("SDK thiếu APIPromise._thenUnwrap (API gạch dưới đổi / bỏ) → cổng AI vẫn đếm token đúng qua .then, cảnh báo MỘT lần", async () => {
  globalThis.fetch = fetchSeq(claudeMsg("claude-sonnet-5-5", "chào"));
  // Lấy đúng prototype APIPromise mà ai.ts dùng (cùng bản SDK đã nạp) từ một lần gọi thật qua cổng
  let proto: { _thenUnwrap?: unknown } | null = null;
  await ai.gate("caption", "lấy prototype", async (client: Anthropic, model: string) => {
    const p = client.messages.create({ model, max_tokens: 10, messages: [{ role: "user", content: "x" }] });
    proto = Object.getPrototypeOf(p) as { _thenUnwrap?: unknown };
    return p;
  });
  assert.ok(proto && typeof (proto as { _thenUnwrap?: unknown })._thenUnwrap === "function", "đúng prototype có _thenUnwrap");
  const target = proto as unknown as { _thenUnwrap?: unknown };
  const saved = target._thenUnwrap;
  const warns: string[] = [];
  const realWarn = console.warn;
  console.warn = (...a: unknown[]) => void warns.push(a.map(String).join(" "));
  delete target._thenUnwrap;
  try {
    db.getDb().delete(db.schema.aiCalls).run();
    const r = await ai.gate("caption", "SDK không có _thenUnwrap", async (client: Anthropic, model: string) => {
      const a = await client.messages.create({ model, max_tokens: 10, messages: [{ role: "user", content: "x" }] });
      await client.beta.messages.create({ model, max_tokens: 10, messages: [{ role: "user", content: "y" }] });
      return a;
    });
    assert.ok(r.ok, r.ok ? "" : r.error);
    const [last] = router.listAiCalls(1);
    assert.deepEqual([last.model, last.inputTokens, last.outputTokens, last.costVnd], ["claude-sonnet-5-5", 2000, 800, providers.modelCostVnd("claude-sonnet-5-5", 2000, 800)], "hai phản hồi đều được đếm");
    await ai.gate("caption", "lần nữa", (client, model) => client.messages.create({ model, max_tokens: 10, messages: [{ role: "user", content: "z" }] }));
    assert.equal(warns.filter((w) => /_thenUnwrap/.test(w)).length, 1, "cảnh báo một lần, không lặp mỗi lần gọi");
  } finally {
    target._thenUnwrap = saved;
    console.warn = realWarn;
  }
});
