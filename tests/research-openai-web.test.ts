// OWNER 27/10/2026: "AI tìm kiến thức trên mạng" chạy bằng ChatGPT khi vị trí Nghiên cứu chọn ChatGPT ("chuyển phần này thành của gpt luôn").
// Bước 1 dùng tool "web_search" của OpenAI Responses API (developers.openai.com/api/docs/guides/tools-web-search) qua cổng AI: sổ ai_calls
// ghi token + phí mỗi lượt tìm ($10 / 1k calls — developers.openai.com/api/docs/pricing#built-in-tools) dưới vị trí research; công tắc /
// trần / thiếu khoá → không gọi hãng. Đường Claude giữ nguyên (tests/ai-gate-served-model.test.ts, tests/ai-providers.test.ts).
// CSDL tạm, fetch giả — không gọi hãng thật, không tốn tiền.
import { test, before, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "baor-research-openai-"));
process.env.DATA_DIR = tmp;
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.AUTH_SECRET = "test-secret-".padEnd(40, "x");
process.env.BAOR_VIDEO_WORKER = "off";
delete process.env.ANTHROPIC_API_KEY;
delete process.env.XAI_API_KEY;
process.env.OPENAI_API_KEY = "sk-openai-test-khong-goi-that";

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
  roster.saveRoleSettings("research", { enabled: true, model: "gpt-6-luna", monthlyCapVnd: 0 });
  process.env.OPENAI_API_KEY = "sk-openai-test-khong-goi-that";
  delete process.env.ANTHROPIC_API_KEY;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

type Seen = { url: string; init: RequestInit; body: Record<string, unknown> };
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

const A = "https://vi.example.org/nghien-cuu-goi-dien";
const B = "https://example.com/bao-cao-2026";
// Dạng phản hồi theo tài liệu: mục web_search_call (action.search + sources khi include "web_search_call.action.sources"), rồi message có
// output_text kèm annotations url_citation { url, title, start_index, end_index }
const searchBody = {
  model: "gpt-6-luna",
  status: "completed",
  output: [
    { type: "web_search_call", id: "ws_1", status: "completed", action: { type: "search", query: "giờ gọi điện khách", sources: [{ type: "url", url: A }, { type: "url", url: B }] } },
    { type: "web_search_call", id: "ws_2", status: "completed", action: { type: "open_page", url: A } },
    { type: "reasoning", id: "rs_1", summary: [] },
    {
      type: "message",
      id: "msg_1",
      status: "completed",
      role: "assistant",
      content: [{ type: "output_text", text: "Khách nghe máy nhiều hơn buổi sáng [1].", annotations: [{ type: "url_citation", url: A, title: "Nghiên cứu gọi điện", start_index: 0, end_index: 38 }] }],
    },
  ],
  usage: { input_tokens: 9000, output_tokens: 1500 },
};
const result = {
  summary: "Tóm tắt nghiên cứu gọi điện",
  sources: [
    { url: A, title: "Nghiên cứu gọi điện", author: "", publisher: "Example", publishedAt: null, sourceType: "research", grade: "B", excerpt: "Tóm ý", limits: "Mẫu nhỏ" },
    { url: "https://bia.example.net/khong-co-trong-tim-kiem", title: "Bịa", author: "", publisher: "X", publishedAt: null, sourceType: "research", grade: "C", excerpt: "x", limits: "x" },
  ],
  findings: [],
};
const parseBody = { model: "gpt-6-luna", status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(result) }] }], usage: { input_tokens: 3000, output_tokens: 800 } };

function openaiFetch(seen: Seen[], first: unknown = searchBody): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    seen.push({ url: String(url), init: init ?? {}, body });
    return json(body.tools ? first : parseBody);
  }) as typeof fetch;
}
const newTask = () => research.createResearchTask({ question: "Gọi điện cho khách giờ nào hiệu quả?", purposeKind: "content", purpose: "Kịch bản video ngắn", by: "OWNER" });
const task = (id: string) => db.getDb().select().from(db.schema.researchTasks).where(eq(db.schema.researchTasks.id, id)).get()!;

test("vị trí Nghiên cứu chọn ChatGPT → bước tìm web gọi tool web_search của OpenAI Responses API (Bearer), không gọi Claude", async () => {
  const seen: Seen[] = [];
  globalThis.fetch = openaiFetch(seen);
  const id = newTask();
  const r = await research.runResearchWithAi(id, "OWNER");
  assert.ok(r.ok, r.ok ? "" : r.error);
  assert.equal(seen.length, 2);
  assert.ok(seen.every((s) => s.url === "https://api.openai.com/v1/responses"), "cả hai bước gọi OpenAI, không gọi api.anthropic.com");
  const [s1, s2] = seen;
  assert.equal((s1.init.headers as Record<string, string>).authorization, "Bearer sk-openai-test-khong-goi-that");
  assert.equal(s1.body.model, "gpt-6-luna");
  // Thị trường Việt Nam (OWNER 26/10): vị trí gần đúng VN cho tool web_search (developers.openai.com/api/docs/guides/tools-web-search)
  assert.deepEqual(s1.body.tools, [{ type: "web_search", user_location: { type: "approximate", country: "VN", timezone: "Asia/Ho_Chi_Minh" } }]);
  assert.match(String(s1.body.instructions), /Thị trường: Việt Nam/);
  assert.match(JSON.stringify(s1.body.input), /site:facebook\.com|tiếng Việt/);
  assert.deepEqual(s1.body.include, ["web_search_call.action.sources"], "lấy đủ nguồn đã tìm, không chỉ nguồn được trích");
  assert.equal(s1.body.max_tool_calls, 8);
  assert.equal(s1.body.text, undefined, "bước tìm web không ép JSON");
  // Bước 2: lập hồ sơ có cấu trúc, không tìm thêm, chỉ dùng URL đã tìm được (cả nguồn được trích lẫn nguồn chỉ có trong sources)
  assert.equal(s2.body.tools, undefined);
  assert.equal((s2.body.text as { format: { type: string } }).format.type, "json_schema");
  const step2Input = JSON.stringify(s2.body.input);
  assert.ok(step2Input.includes(A) && step2Input.includes(B));
  assert.ok(step2Input.includes("Nghiên cứu gọi điện"), "tiêu đề lấy từ url_citation");

  const saved = research.getResearchTask(id)!;
  assert.deepEqual(saved.sources.map((s) => s.url), [A], "URL bịa (không có trong kết quả tìm) bị bỏ");
  assert.match(saved.task.error ?? "", /không có trong kết quả tìm kiếm/);
});

test("sổ ai_calls: token hai bước + phí lượt tìm (10 USD / 1.000 lượt search) dưới vị trí research; chi phí nhiệm vụ = tổng sổ", async () => {
  globalThis.fetch = openaiFetch([]);
  const id = newTask();
  const r = await research.runResearchWithAi(id, "OWNER");
  assert.ok(r.ok, r.ok ? "" : r.error);
  const ledger = router.listAiCalls(10);
  assert.ok(ledger.every((c) => c.role === "research" && c.purpose === "research"));
  const fee = ledger.find((c) => /^web_search/.test(c.model))!;
  // 1 lượt search tính phí; open_page không tính (tài liệu OpenAI: "Search actions incur a tool call cost")
  assert.equal(fee.model, "web_search × 1 (ChatGPT)");
  assert.equal(fee.costVnd, 1 * 0.01 * providers.DEFAULT_VND_PER_USD);
  assert.equal(providers.webSearchFeeVnd("openai", 2), 520);
  const step1 = providers.modelCostVnd("gpt-6-luna", 9000, 1500)!;
  const step2 = providers.modelCostVnd("gpt-6-luna", 3000, 800)!;
  const tokenRows = ledger.filter((c) => !/^web_search/.test(c.model));
  assert.deepEqual(tokenRows.map((c) => [c.model, c.inputTokens, c.outputTokens]).sort(), [["gpt-6-luna", 3000, 800], ["gpt-6-luna", 9000, 1500]]);
  const want = step1 + step2 + 260;
  assert.equal(ledger.reduce((a, c) => a + c.costVnd, 0), want);
  const t = task(id);
  assert.equal(t.costVnd, want, "chi phí nhiệm vụ = đúng tổng sổ ai_calls");
  assert.equal(t.searchCount, 1);
  assert.equal(t.model, "gpt-6-luna");
  assert.equal(router.getAiBudget().spentTodayVnd, want, "trần ngày tính cả phí tìm web");
  assert.equal(router.getAiBudget().callsToday, 2, "dòng phí tìm web không phải một lần gọi mô hình");
});

test("tìm web không ra nguồn → lỗi rõ, token đã dùng vẫn ghi sổ, không gọi bước 2", async () => {
  const seen: Seen[] = [];
  globalThis.fetch = openaiFetch(seen, { model: "gpt-6-luna", status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "Không tìm thấy", annotations: [] }] }], usage: { input_tokens: 500, output_tokens: 20 } });
  const id = newTask();
  const r = await research.runResearchWithAi(id, "OWNER");
  assert.ok(!r.ok && r.error === "Không tìm được nguồn ngoài nào.");
  assert.equal(seen.length, 1);
  assert.equal(task(id).status, "error");
  const [row] = router.listAiCalls(5);
  assert.deepEqual([row.role, row.inputTokens, row.outputTokens], ["research", 500, 20]);
  assert.equal(router.listAiCalls(5).length, 1, "0 lượt tìm → không ghi dòng phí");
});

test("công tắc tắt / chạm trần riêng → không gọi hãng, nhiệm vụ báo lỗi", async () => {
  const seen: Seen[] = [];
  globalThis.fetch = openaiFetch(seen);
  roster.saveRoleSettings("research", { enabled: false });
  const off = newTask();
  const r1 = await research.runResearchWithAi(off, "OWNER");
  assert.ok(!r1.ok && /TẮT/.test(r1.error));
  assert.equal(task(off).status, "error");
  assert.equal(ai.aiReadiness("research", { alsoProvider: ai.webSearchProvider("research") }).ok, false);

  roster.saveRoleSettings("research", { enabled: true, monthlyCapVnd: 1000 });
  router.recordAiCall({ purpose: "research", role: "research", model: "gpt-6-luna", inputTokens: 0, outputTokens: 0, ok: true, costVnd: 1000 });
  const capped = newTask();
  const r2 = await research.runResearchWithAi(capped, "OWNER");
  assert.ok(!r2.ok && /trần riêng/.test(r2.error));
  assert.equal(seen.length, 0, "không lần nào gọi OpenAI");
});

test("thiếu khoá ChatGPT (dù có khoá Claude) → không gọi hãng nào; nút báo “Thiếu khoá ChatGPT”", async () => {
  delete process.env.OPENAI_API_KEY;
  process.env.ANTHROPIC_API_KEY = "sk-ant-test-khong-goi-that";
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return json({});
  }) as typeof fetch;
  const id = newTask();
  const r = await research.runResearchWithAi(id, "OWNER");
  assert.ok(!r.ok && /Chưa có khoá ChatGPT/.test(r.error));
  assert.equal(calls, 0);
  const ready = ai.aiReadiness("research", { alsoProvider: ai.webSearchProvider("research") });
  assert.equal(ready.ok ? "" : ready.label, "Thiếu khoá ChatGPT");
  // Ngược lại: có khoá ChatGPT, KHÔNG có khoá Claude → nút bấm được (trước đây luôn đòi khoá Claude)
  process.env.OPENAI_API_KEY = "sk-openai-test-khong-goi-that";
  delete process.env.ANTHROPIC_API_KEY;
  assert.equal(ai.aiReadiness("research", { alsoProvider: ai.webSearchProvider("research") }).ok, true);
});

test("hãng của bước tìm web theo mô hình vị trí: ChatGPT → ChatGPT, Claude → Claude, Grok (chưa nối tìm web) → Claude", () => {
  assert.equal(ai.webSearchProvider("research"), "openai");
  roster.saveRoleSettings("research", { model: "claude-sonnet-5-5" });
  assert.equal(ai.webSearchProvider("research"), "anthropic");
  roster.saveRoleSettings("research", { model: "grok-4.3" });
  assert.equal(ai.webSearchProvider("research"), "anthropic");
  roster.saveRoleSettings("research", { model: "gpt-6.1-sol" });
  assert.equal(ai.webSearchProvider("research"), "openai");
});

test("bộ chuyển đổi: tìm web trên Grok bị từ chối trước khi gọi mạng; create thường không có trường tìm web", async () => {
  process.env.XAI_API_KEY = "xai-test";
  try {
    let calls = 0;
    const f = (async () => {
      calls++;
      return json(searchBody);
    }) as typeof fetch;
    await assert.rejects(providers.compatWebSearch(providers.compatClient("xai", f), { model: "grok-4.3", max_tokens: 10, system: "s", prompt: "p", maxSearches: 2 }), /chưa nối công cụ tìm web/);
    assert.equal(calls, 0);
    const plain = (await providers.compatClient("openai", f).messages.create({ model: "gpt-6-luna", max_tokens: 10, messages: [{ role: "user", content: "x" }] })) as unknown as Record<string, unknown>;
    assert.equal(plain.sources, undefined);
    const ws = await providers.compatWebSearch(providers.compatClient("openai", f), { model: "gpt-6-luna", max_tokens: 10, system: "s", prompt: "p", maxSearches: 2 });
    assert.equal(ws.searches, 1, "chỉ action search tính phí");
    assert.deepEqual([...ws.sources], [[A, "Nghiên cứu gọi điện"], [B, B]]);
    // Lượt tool thất bại (URL bịa / bị cài vào câu hỏi) không thành nguồn; URL chỉ có trong chữ của mô hình cũng không
    const BAD = "https://injected.attacker.example/fake-study";
    const failedBody = {
      ...searchBody,
      output: [
        ...searchBody.output,
        { type: "web_search_call", id: "ws_3", status: "failed", action: { type: "open_page", url: BAD } },
        { type: "web_search_call", id: "ws_4", status: "failed", action: { type: "search", query: "x", sources: [{ type: "url", url: BAD }] } },
        { type: "message", id: "msg_2", status: "completed", role: "assistant", content: [{ type: "output_text", text: `Xem ${BAD}`, annotations: [] }] },
      ],
    };
    const f2 = (async () => json(failedBody)) as typeof fetch;
    const ws2 = await providers.compatWebSearch(providers.compatClient("openai", f2), { model: "gpt-6-luna", max_tokens: 10, system: "s", prompt: "p", maxSearches: 2 });
    assert.ok(![...ws2.sources.keys()].includes(BAD), "URL từ lượt tool thất bại / chữ mô hình không được nhận làm nguồn");
    assert.equal(ws2.searches, 2, "lượt search thất bại vẫn bị tính phí như tài liệu");
  } finally {
    delete process.env.XAI_API_KEY;
  }
});
