import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getBrand, listInsights, listPersonas } from "@/lib/queries";
import { aiBudgetAllows, estimateCostVnd, recordAiCall, recordDecision } from "@/lib/router";
import { roleAllows, roleForPurpose, roleSettings } from "@/lib/ai-roster";
import { AI_MODELS, PROVIDERS, ProviderError, WEB_SEARCH_PROVIDERS, clientFor, modelCostVnd, modelInfo, providerConfigured, servedCost, type AiProvider } from "@/lib/ai-providers";
import { sendAlert } from "@/lib/alerts";
import { HOOK_COUNT, HOOK_PLATFORMS, hookContext, saveHooks } from "@/lib/content/hooks";
import { DEFAULT_STAGE, PATH_STAGES, VLOG_CARDS, emptyVlogDoc, parseVlogDraft, serializeVlog, stripMetaHooks, unquoteAi, vlogFormulaRules, type PathStage, type VlogKey } from "@/lib/content/vlog-script";
import { scriptContext } from "@/lib/content/script-context";
import { buildCaption, buildPostTitle, captionDraft, captionSkill, postTitle, saveCaptionDraft, savePostTitle, setPostDraftSource } from "@/lib/publishing/caption";

// Bộ não AI của hệ thống. Mô hình theo từng vị trí: src/lib/ai-roster.ts (Cài đặt › Đội AI) — Claude, ChatGPT hoặc Grok
// (src/lib/ai-providers.ts). Khoá API: Cài đặt › Kết nối (Claude API / OpenAI / xAI) hoặc biến môi trường.

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

/** Có khoá Claude. Nút AI theo vị trí dùng aiReadiness (đúng hãng của mô hình vị trí), không dùng hàm này. */
export function aiConfigured(): boolean {
  return providerConfigured("anthropic");
}

/**
 * Hãng chạy bước tìm web của một vị trí (Nghiên cứu bước tìm nguồn): hãng của mô hình vị trí nếu BAOR đã nối công cụ tìm web của hãng
 * đó (Claude, ChatGPT — WEB_SEARCH_PROVIDERS), ngược lại (Grok) → Claude. Dùng chung cho gate(…, { provider }), kiểm khoá trước khi chạy
 * và trạng thái nút "AI tìm nỗi đau khách" (phần web) — ba chỗ luôn khớp nhau.
 */
export function webSearchProvider(purpose: string): AiProvider {
  const role = roleForPurpose(purpose);
  const p = modelInfo(roleSettings(role).model)?.provider ?? "anthropic";
  return WEB_SEARCH_PROVIDERS.includes(p) ? p : "anthropic";
}

/** Hãng của mô hình vị trí đang dùng đã có khoá chưa (để trang hiện đúng "chưa có khoá ChatGPT / Grok / Claude"). */
export function aiConfiguredFor(purpose: string): { ok: boolean; provider: string } {
  const role = roleForPurpose(purpose);
  const p = modelInfo(roleSettings(role).model)?.provider ?? "anthropic";
  return { ok: providerConfigured(p), provider: PROVIDERS[p].label };
}

export type AiReadiness = { ok: true } | { ok: false; label: string; reason: string; href: string };
export const AI_TEAM_HREF = "/settings?tab=ai#ai-team";

/**
 * Nút AI hiện ĐÚNG trạng thái (kiểm toán 26/10: vị trí đặt ChatGPT nhưng chỉ có khoá Claude → nút vẫn bấm được rồi hỏng):
 * cùng thứ tự kiểm như gate() — công tắc / trần riêng của vị trí → khoá hãng của mô hình vị trí → trần chung. Không gọi được thì trả
 * nhãn ngắn ("Thiếu khoá ChatGPT", "AI đang tắt", "Chạm trần AI") + lý do + đường tới Cài đặt › Đội AI để trang vô hiệu nút.
 * alsoProvider: bước cần thêm một hãng (Nghiên cứu web: hãng của bước tìm nguồn = webSearchProvider — Claude khi vị trí chọn Grok;
 * Mô tả ảnh: Claude).
 */
export function aiReadiness(purpose: string, opts: { alsoProvider?: AiProvider } = {}): AiReadiness {
  const role = roleForPurpose(purpose);
  const allowed = roleAllows(role);
  if (!allowed.ok) return { ok: false, label: allowed.value && !allowed.value.enabled ? "AI đang tắt" : "Chạm trần AI", reason: allowed.reason, href: AI_TEAM_HREF };
  const model = allowed.value?.model ?? role.defaultModel;
  const need: AiProvider[] = [modelInfo(model)?.provider ?? "anthropic", ...(opts.alsoProvider ? [opts.alsoProvider] : [])];
  for (const p of need) {
    if (!providerConfigured(p)) return { ok: false, label: `Thiếu khoá ${PROVIDERS[p].label}`, reason: `${role.name} cần khoá ${PROVIDERS[p].label} (${modelInfo(model)?.label ?? model}). Nhập khoá ở Cài đặt › Kết nối hoặc đổi mô hình ở Cài đặt › Đội AI.`, href: AI_TEAM_HREF };
  }
  const budget = aiBudgetAllows();
  if (!budget.ok) return { ok: false, label: "Chạm trần AI", reason: budget.reason, href: AI_TEAM_HREF };
  return { ok: true };
}

// Cổng AI: mọi lần gọi mô hình đi qua đây để (1) kiểm tra công tắc "Cho phép gọi AI" + trần riêng của vị trí (Đội AI),
// (2) kiểm tra trần ngân sách chung, (3) ghi sổ chi phí theo vị trí và giá của đúng mô hình, (4) ghi quyết định vào bộ định tuyến với
// nhãn "AI đề xuất, cần người duyệt". Mô hình (và hãng) do vị trí quyết định (Cài đặt › Đội AI), truyền vào call.
// opts.provider: bước chỉ chạy được trên một số hãng (Nghiên cứu bước tìm nguồn: Claude hoặc ChatGPT — webSearchProvider) → nếu mô hình vị trí
// thuộc hãng khác thì bước này dùng mô hình mặc định của hãng đó (công tắc, trần, sổ chi phí vẫn tính cho vị trí).
// Kết quả: model = mô hình yêu cầu (vị trí chọn); servedModel = nhãn mô hình hãng THỰC SỰ chạy (response.model, kèm ghi chú nếu khác /
// chưa có trong bảng giá) — đúng chuỗi ghi ở cột model của sổ ai_calls; costVnd = đúng số ₫ đã ghi sổ cho lần gọi này.
export async function gate<T extends { usage?: { input_tokens: number; output_tokens: number } }>(purpose: string, subject: string, call: (client: Anthropic, model: string) => Promise<T>, opts: { provider?: AiProvider } = {}): Promise<Result<{ res: T; model: string; servedModel: string; costVnd: number }>> {
  const role = roleForPurpose(purpose);
  const allowed = roleAllows(role);
  if (!allowed.ok) {
    recordDecision({ lane: "rule", domain: purpose === "reply" ? "reply" : purpose === "research" ? "research" : "content", subject, outcome: "không gọi AI", reason: allowed.reason, needsApproval: false });
    return { ok: false, error: allowed.reason };
  }
  let model = allowed.value?.model ?? role.defaultModel;
  if (opts.provider && (modelInfo(model)?.provider ?? "anthropic") !== opts.provider) {
    model = modelInfo(role.defaultModel)?.provider === opts.provider ? role.defaultModel : AI_MODELS.find((m) => m.provider === opts.provider)!.id;
  }
  const provider: AiProvider = modelInfo(model)?.provider ?? "anthropic";
  const client = clientFor(provider);
  if (!client) return { ok: false, error: `Chưa có khoá ${PROVIDERS[provider].label} cho ${role.name} (${model}). Vào Cài đặt › Kết nối để nhập, hoặc đổi mô hình ở Cài đặt › Đội AI.` };
  const budget = aiBudgetAllows();
  if (!budget.ok) {
    recordDecision({ lane: "rule", domain: "content", subject, outcome: "chặn gọi AI", reason: budget.reason, needsApproval: false });
    void sendAlert({ level: "warn", title: "AI chạm trần chi phí", text: budget.reason, href: "/settings#ai" });
    return { ok: false, error: `${budget.reason} Nâng trần ở Cài đặt › Đội AI nếu cần.` };
  }
  const meter = meterClient(client, model);
  try {
    const res = await call(meter.client, model);
    // Ưu tiên tổng đồng hồ (mọi phản hồi hãng đã trả trong lần gọi, giá theo mô hình thực chạy); call không đi qua client (test giả) →
    // usage nó trả về, giá mô hình yêu cầu
    const metered = meter.used.responses > 0;
    const inputTokens = metered ? meter.used.input : (res.usage?.input_tokens ?? 0);
    const outputTokens = metered ? meter.used.output : (res.usage?.output_tokens ?? 0);
    const costVnd = metered ? meter.used.costVnd : (modelCostVnd(model, inputTokens, outputTokens) ?? estimateCostVnd(inputTokens, outputTokens));
    const servedModel = servedLabel(model, meter.used);
    const aiCallId = recordAiCall({ purpose, role: role.id, model: servedModel, inputTokens, outputTokens, ok: true, costVnd });
    recordDecision({ lane: "ai", domain: purpose === "reply" ? "reply" : purpose === "research" ? "research" : "content", subject, outcome: "AI đã tạo đề xuất", reason: "Thiếu dữ liệu nguồn có sẵn, dùng AI; người duyệt trước khi dùng.", sources: ["Dữ liệu trong hệ thống (Cài đặt, insight, hội thoại)", `${role.name} · ${servedModel}`], confidence: 70, needsApproval: true, aiCallId });
    return { ok: true, res, model, servedModel, costVnd };
  } catch (e) {
    // Hãng có thể ĐÃ trả lời (đã tính tiền) rồi bước sau mới lỗi: parse JSON / schema, từ chối ở lượt sau… → ghi đúng token đã dùng
    // và chi phí của chúng (tính vào trần ngày / tháng / trần riêng vị trí) rồi mới báo lỗi. Hãng báo lỗi HTTP → đồng hồ 0, 0 ₫.
    const { input, output, costVnd } = meter.used;
    recordAiCall({ purpose, role: role.id, model: servedLabel(model, meter.used), inputTokens: input, outputTokens: output, ok: false, error: describeError(e), costVnd });
    return { ok: false, error: describeError(e) };
  }
}

/** Nhãn mô hình ghi sổ: mô hình yêu cầu nếu hãng chạy đúng nó; khác → mô hình thực chạy + "(yêu cầu …; ghi chú giá)". */
function servedLabel(requested: string, used: { served: Set<string>; notes: Set<string> }): string {
  const served = [...used.served];
  if (served.length === 0 || (served.length === 1 && served[0] === requested)) return requested;
  return `${served.join(" + ")} (yêu cầu ${requested}${used.notes.size ? `; ${[...used.notes].join("; ")}` : ""})`;
}

type UsageLike = { input_tokens?: number | null; output_tokens?: number | null } | null | undefined;

// Đồng hồ token của cổng AI: bọc client (Claude thật hoặc bộ chuyển đổi ChatGPT / Grok) để cộng usage của MỌI phản hồi hãng trả về
// TRƯỚC khi chỗ gọi xử lý tiếp. messages.parse của SDK (và của bộ chuyển đổi) = this.create(...) rồi mới parse → gọi parse gốc với `this`
// là proxy có đồng hồ ở create, nên lỗi parse (JSON hỏng / sai schema) vẫn ném ra như cũ nhưng token đã được đếm.
// beta.messages (Nghiên cứu web_search của Claude) cũng qua đồng hồ; tìm web ChatGPT đi qua messages.create của bộ chuyển đổi. tests/ai-gate-usage.test.ts giữ giả định "parse gọi this.create" của SDK.
// create của SDK trả APIPromise (.withResponse() / .asResponse()) → gắn đồng hồ bằng _thenUnwrap của chính APIPromise: vẫn là APIPromise,
// đồng hồ chạy đúng MỘT lần khi thân phản hồi được parse (APIPromise nhớ kết quả parse; asResponse không parse → không đếm, như SDK).
// Giá tính theo từng phản hồi với response.model (mô hình hãng thực chạy, vd fallbacks), thiếu / lạ → giá mô hình yêu cầu (servedCost).
// tests/ai-gate-served-model.test.ts giữ giả định "_thenUnwrap" của SDK; thiếu _thenUnwrap → đường dự phòng .then (cảnh báo một lần).
// Token cộng theo từng mô hình có giá được áp rồi mới quy ra ₫ (làm tròn một lần / mô hình — một mô hình thì khớp modelCostVnd tổng như cũ).
type Meter = { input: number; output: number; responses: number; readonly costVnd: number; served: Set<string>; notes: Set<string> };
let warnedNoThenUnwrap = false;
function warnNoThenUnwrap() {
  if (warnedNoThenUnwrap) return;
  warnedNoThenUnwrap = true;
  console.warn("[ai] SDK Anthropic không còn APIPromise._thenUnwrap: cổng AI đếm token qua .then (mất .withResponse() / .asResponse() trên client qua cổng). Kiểm meterClient trong src/lib/ai.ts khi nâng SDK.");
}
function meterClient(client: Anthropic, requested: string): { client: Anthropic; used: Meter } {
  const byPrice = new Map<string, { input: number; output: number }>(); // "" = mô hình không có trong bảng giá → giá chung
  const used: Meter = {
    input: 0,
    output: 0,
    responses: 0,
    get costVnd() {
      return [...byPrice].reduce((a, [m, t]) => a + ((m ? modelCostVnd(m, t.input, t.output) : undefined) ?? estimateCostVnd(t.input, t.output)), 0);
    },
    served: new Set(),
    notes: new Set(),
  };
  const tally = <R>(r: R): R => {
    const body = r as { usage?: UsageLike; model?: unknown } | null;
    const u = body?.usage;
    if (u) {
      const input = u.input_tokens ?? 0;
      const output = u.output_tokens ?? 0;
      const c = servedCost(requested, typeof body.model === "string" ? body.model : undefined, input, output);
      used.input += input;
      used.output += output;
      const bucket = byPrice.get(c.pricedAs ?? "") ?? { input: 0, output: 0 };
      bucket.input += input;
      bucket.output += output;
      byPrice.set(c.pricedAs ?? "", bucket);
      used.served.add(c.model);
      if (c.note) used.notes.add(c.note);
      used.responses++;
    }
    return r;
  };
  type Unwrappable = { _thenUnwrap: (f: (data: unknown) => unknown) => unknown };
  const isApiPromise = (v: unknown): v is Unwrappable => typeof (v as Partial<Unwrappable> | null)?._thenUnwrap === "function";
  // _thenUnwrap là API gạch dưới (nội bộ) của SDK: bản SDK sau đổi tên / bỏ → vẫn đếm token qua .then (mất .withResponse() trong
  // trường hợp đó — không chỗ gọi nào của BAOR cần), cảnh báo MỘT lần để biết mà sửa, không làm hỏng sổ chi phí.
  const looksLikeApiPromise = (v: unknown) => typeof (v as { withResponse?: unknown } | null)?.withResponse === "function";
  type Fn = (...args: unknown[]) => unknown;
  const passThrough = <O extends object>(target: O, overrides: Record<string, unknown>): O =>
    new Proxy(target, {
      get(t, k) {
        if (typeof k === "string" && k in overrides) return overrides[k];
        const v: unknown = Reflect.get(t, k, t);
        return typeof v === "function" ? v.bind(t) : v;
      },
    });
  const meterMessages = <M extends object>(m: M): M => {
    const raw = m as unknown as { create: Fn; parse?: Fn };
    const overrides: Record<string, unknown> = {
      create: (...args: unknown[]) => {
        const out = raw.create.apply(m, args);
        // Claude thật: giữ nguyên kiểu APIPromise; bộ chuyển đổi ChatGPT / Grok, client giả: Promise thường
        if (isApiPromise(out)) return out._thenUnwrap(tally);
        if (looksLikeApiPromise(out)) warnNoThenUnwrap();
        return Promise.resolve(out).then(tally);
      },
    };
    const proxy = passThrough(m, overrides);
    if (typeof raw.parse === "function") overrides.parse = (...args: unknown[]) => raw.parse!.apply(proxy, args);
    return proxy;
  };
  const messages = meterMessages(client.messages);
  // Bộ chuyển đổi ChatGPT / Grok chỉ có messages (không có beta) → để nguyên
  const rawBeta = (client as { beta?: Anthropic["beta"] }).beta;
  const beta = rawBeta?.messages ? passThrough(rawBeta, { messages: meterMessages(rawBeta.messages) }) : rawBeta;
  return { client: passThrough(client, { messages, beta }), used };
}


function describeError(e: unknown): string {
  if (e instanceof ProviderError) {
    const name = PROVIDERS[e.provider].label;
    if (e.status === 401 || e.status === 403) return `Khóa ${name} không hợp lệ hoặc thiếu quyền (${e.status}): ${e.message}`;
    if (e.status === 429) return `${name} đang quá tải hoặc hết hạn mức, thử lại sau ít phút.`;
    return `Lỗi ${name} (${e.status}): ${e.message}`;
  }
  if (e instanceof Anthropic.AuthenticationError) return "Khóa Claude API không hợp lệ.";
  if (e instanceof Anthropic.RateLimitError) return "Claude API đang quá tải, thử lại sau ít phút.";
  // Khoá cấp tổ chức / khoá quản trị (không thuộc workspace) — Anthropic đòi header workspace; cách đúng là tạo khoá API thường trong một workspace
  if (e instanceof Anthropic.APIError && /not scoped to a workspace|anthropic-workspace-id/i.test(e.message))
    return "Khoá Claude này không gắn với workspace nào (thường là khoá quản trị). Vào console.anthropic.com › API keys › Create key, chọn workspace Default, rồi dán khoá mới (bắt đầu sk-ant-api…) ở Cài đặt › Kết nối › Claude.";
  if (e instanceof Anthropic.APIError) return `Lỗi Claude API (${e.status}): ${e.message}`;
  if (e instanceof Error && e.name === "TimeoutError") return "Hết thời gian chờ mô hình AI trả lời.";
  if (e instanceof Error && /parse structured output/i.test(e.message)) return `AI trả về không đúng định dạng: ${e.message.slice(0, 200)}`;
  return "Không gọi được mô hình AI.";
}

function brandContext() {
  const b = getBrand();
  const personas = listPersonas();
  const insights = listInsights().filter((i) => i.status === "approved");
  return [
    `Thương hiệu: ${b.name || "(chưa đặt tên)"}. Sản phẩm/dịch vụ: ${b.products || "(chưa mô tả)"}.`,
    `Giọng văn: ${b.voice || "gần gũi, chân thật"}.`,
    `Nhóm khách hàng:\n${personas.map((p) => `- ${p.name}: nỗi đau ${p.painPoints.join("; ")}; mong muốn ${p.goals.join("; ")}`).join("\n")}`,
    `Insight đã có:\n${insights.map((i) => `- [${i.id}] ${i.title} (tin cậy ${i.confidence}%): ${i.detail}`).join("\n")}`,
  ].join("\n\n");
}

const IdeasSchema = z.object({
  ideas: z.array(
    z.object({
      title: z.string(),
      format: z.enum(["post", "reel", "carousel", "story", "article"]),
      pillar: z.string(),
      hook: z.string(),
      outline: z.array(z.string()),
      insightId: z.string(),
      score: z.number().int().min(0).max(100),
    }),
  ),
});

// Bảng Hook (Personal Brand System bước 3): 10 hook / lần (schema KHÔNG ép min/max — mô hình trả 9 / 11 thì parse vẫn đạt, sổ chi phí
// ghi đúng token; cắt còn 10, thiếu thì báo; nền tảng lạ do saveHooks lọc), vlog chia sẻ < 1 phút (OWNER 26/10), bám căn cứ đưa vào (phát hiện nghiên cứu đã kiểm,
// Second Brain, insight đã duyệt) — ref căn cứ ngoài danh sách bị bỏ; luật ngôn từ theo nền tảng kiểm lại bằng luật khi lưu.
const HooksSchema = z.object({
  hooks: z
    .array(
      z.object({
        hook: z.string().describe("câu mở đầu 3 giây đầu, nói thành lời, tối đa 12-15 chữ; không kể trải nghiệm / con số riêng của OWNER nếu căn cứ không có"),
        angle: z.string().describe("góc tiếp cận / vì sao người xem dừng lại"),
        beats: z
          .array(z.string())
          .describe("đúng 3 nhịp NỘI DUNG nói với người xem: (1) tình huống / khoảnh khắc của khách, (2) MỘT giá trị khách nhận được, (3) lời mời nhẹ — không phải ghi chú về dữ liệu / độ tin cậy"),
        durationSec: z.number().int().describe("độ dài dự kiến, giây, tối đa 60"),
        platforms: z.array(z.string()).describe(`trong: ${HOOK_PLATFORMS.join(", ")}`),
        basisRefs: z.array(z.string()).describe("ref căn cứ dạng finding:<id> / knowledge:<id> / insight:<id>, chỉ lấy từ ngữ cảnh"),
      }),
    )
    .describe(`tối đa ${HOOK_COUNT} phần tử; căn cứ không đủ cho một góc thì bỏ góc đó (trả ít hơn)`),
});

export async function generateHooks(topic: string, by: string, researchId?: string): Promise<Result<{ batchId: string; count: number; dropped: number; short: number; meta: number }>> {
  const ctx = hookContext(topic, researchId);
  const gated = await gate("ideas", `AI Hook: 10 hook “${topic.slice(0, 60)}”`, (client, model) =>
    client.messages.parse({
      model,
      max_tokens: 16000,
      system:
        "Bạn là biên tập viên vlog chia sẻ cho thương hiệu cá nhân Việt Nam. Định dạng: vlog chia sẻ ngôi thứ nhất, dưới 60 giây (~130–160 từ lời thoại), " +
        "cấu trúc theo nguyên lý marketing của Philip Kotler (lấy khách hàng làm trung tâm): hook 3 giây = nỗi đau / nhu cầu của MỘT nhóm khách cụ thể, nói bằng lời của khách → " +
        "câu chuyện = tình huống của khách → MỘT giá trị / bài học khách nhận được (lợi ích, không phải tính năng) → kết nhẹ (CTA mềm như hỏi ý kiến, lưu lại; không chào bán). " +
        "Hook nói thành lời, tự nhiên, cụ thể, tối đa 12–15 chữ; mỗi hook một góc khác nhau. Không viết giọng bán hàng, không khẳng định quá lời. " +
        "Viết hook theo phong cách copywriting của David Ogilvy: như một tiêu đề — một ý lớn, cụ thể, mang lợi ích hoặc điều mới, nói với một người (\"bạn\"); chi tiết / con số cụ thể (chỉ từ căn cứ) thay cho tính từ; " +
        "không so sánh nhất, không thổi phồng, không chơi chữ cho vui. " +
        "Dàn ý là NỘI DUNG sẽ nói với người xem — tuyệt đối không viết ghi chú cho biên tập về chất lượng dữ liệu hay quy trình (\"AI suy luận\", \"chưa kiểm chứng\", \"bản nháp nội bộ\", \"chưa phải căn cứ\", \"nói rõ rằng…\"). " +
        "Căn cứ không đủ cho một góc thì BỎ hook đó (trả ít hơn " + HOOK_COUNT + "), không viết lời rào đón. " +
        "Ngôi thứ nhất chỉ để dẫn dắt (\"mình hay thấy…\", \"nhiều bạn hỏi mình…\"); trải nghiệm riêng, kết quả, số tiền, con số của OWNER chỉ được dùng khi có trong căn cứ " +
        "(tri thức [OWNER] / Second Brain) — không có thì KHÔNG viết (\"mình từng mất 5 triệu…\" là bịa), dàn ý ghi \"[OWNER KỂ: …]\" để OWNER tự kể. Câu chuyện dựa trên bình luận / insight khách. " +
        "Chỉ dựa trên căn cứ được đưa (phát hiện nghiên cứu, Second Brain, insight); không bịa số liệu, giá, công dụng. " +
        "Tuân chính sách nền tảng: không khẳng định tuyệt đối (100%, cam kết, đảm bảo), không tuyên bố chữa bệnh / giảm cân cụ thể, " +
        "không khẳng định thuộc tính cá nhân người xem (\"bạn đang béo / nợ…\"), không hứa thu nhập. Vlog dưới 1 phút.",
      messages: [{ role: "user", content: `${brandContext()}\n\n${ctx.text}\n\nChủ đề OWNER đề xuất: ${topic}\n\nViết tối đa ${HOOK_COUNT} hook vlog chia sẻ dưới 1 phút (bỏ góc không đủ căn cứ), mỗi hook kèm dàn ý 3 nhịp nội dung (tình huống khách · giá trị · lời mời).` }],
      output_config: { format: zodOutputFormat(HooksSchema) },
    }),
  );
  if (!gated.ok) return gated;
  // Bộ lọc sau: nhịp dàn ý là ghi chú nội bộ bị bỏ; hook chỉ còn ghi chú bị bỏ cả (src/lib/content/vlog-script.ts › stripMetaHooks)
  const filtered = stripMetaHooks((gated.res.parsed_output?.hooks ?? []).slice(0, HOOK_COUNT));
  const hooks = filtered.items;
  if (!hooks.length) return { ok: false, error: filtered.metaHooks ? "AI chỉ trả về ghi chú nội bộ, không có hook dùng được. Bổ sung insight cho chủ đề rồi thử lại." : "AI không trả về hook nào." };
  const saved = saveHooks(topic, hooks, { source: "ai", by, allowed: ctx.basis, researchId });
  const dropped = hooks.reduce((n, h) => n + h.basisRefs.filter((r) => !ctx.basis.some((b) => `${b.kind}:${b.id}` === r)).length, 0);
  return { ok: true, batchId: saved.batchId, count: saved.ids.length, dropped, short: Math.max(0, HOOK_COUNT - saved.ids.length), meta: filtered.metaBeats };
}

// Bài đăng theo skill (Personal Brand System 6.1): AI Viết bài đăng viết TIÊU ĐỀ + caption cho video theo skill viết content trong
// Second Brain, chỉ từ kịch bản đã duyệt; luật caption kiểm lại khi hiển thị. Bản nháp lưu theo video, OWNER sửa rồi mới lên lịch.
const PostSchema = z.object({
  title: z.string().describe("Tiêu đề bài đăng ngắn, dưới 100 ký tự, không hashtag"),
  caption: z.string().describe("Nội dung bài đăng (caption) dưới 1.200 ký tự, tối đa 3 hashtag"),
});

/** keepExisting: lượt viết NỀN khi video vào Kho — đã có bản nháp (OWNER gõ / bấm "Viết lại bằng AI" trong lúc chờ) thì không ghi đè. */
export async function generateCaption(videoId: string, opts: { keepExisting?: boolean } = {}): Promise<Result<{ text: string; title: string; skill: string }>> {
  const db = getDb();
  const v = db.select().from(schema.videos).where(eq(schema.videos.id, videoId)).get();
  if (!v) return { ok: false, error: "Không tìm thấy video." };
  const c = v.contentId ? db.select().from(schema.contentItems).where(eq(schema.contentItems.id, v.contentId)).get() : undefined;
  const skill = captionSkill();
  const base = buildCaption(videoId);
  const gated = await gate("caption", `AI viết bài đăng “${v.title.slice(0, 60)}”`, (client, model) =>
    client.messages.parse({
      model,
      max_tokens: 4000,
      system:
        "Bạn viết bài đăng video ngắn (tiêu đề + caption) cho thương hiệu cá nhân Việt Nam, theo đúng skill được đưa. Chỉ dùng thông tin có trong kịch bản; " +
        "không bịa số liệu, giá, công dụng; không khẳng định tuyệt đối, không tuyên bố chữa bệnh / giảm cân, không khẳng định thuộc tính cá nhân người xem, " +
        "không hứa thu nhập. Tiêu đề dưới 100 ký tự, không hashtag. Caption dưới 1.200 ký tự, tối đa 3 hashtag, không giải thích thêm.",
      messages: [
        {
          role: "user",
          content: `${skill ? `SKILL (${skill.title} · ${skill.status}):\n${skill.body.slice(0, 4000)}` : "(Second Brain chưa có skill viết content — dùng cấu trúc Hook → tình huống → bài học → CTA)"}\n\n` +
            `Video: ${v.title}\nHook: ${c?.hook ?? ""}\nKịch bản đã duyệt:\n${(c?.draft ?? "").slice(0, 6000) || "(không có)"}\n\nCaption nháp theo luật (để tham khảo):\n${base.text}`,
        },
      ],
      output_config: { format: zodOutputFormat(PostSchema) },
    }),
  );
  if (!gated.ok) return gated;
  const text = gated.res.parsed_output?.caption?.trim() ?? "";
  const title = gated.res.parsed_output?.title?.trim() || buildPostTitle(videoId);
  if (!text) return { ok: false, error: "AI không trả về caption." };
  if (opts.keepExisting && captionDraft(videoId)) return { ok: true, text: captionDraft(videoId) ?? "", title: postTitle(videoId) ?? title, skill: "giữ bản nháp đã có" };
  saveCaptionDraft(videoId, text);
  savePostTitle(videoId, title);
  setPostDraftSource(videoId, "ai");
  return { ok: true, text, title, skill: skill ? `${skill.title} (${skill.status})` : "chưa có skill" };
}

export async function generateIdeas(n = 5): Promise<Result<{ count: number }>> {
  const gated = await gate("ideas", `AI đề xuất ${n} ý tưởng nội dung`, (client, model) =>
    client.messages.parse({
      model,
      max_tokens: 16000,
      system:
        "Bạn là giám đốc nội dung cho một fanpage Việt Nam. Đề xuất ý tưởng bám chặt vào insight khách hàng, viết tiếng Việt tự nhiên, hook ngắn, dàn ý 3-5 gạch đầu dòng. Điểm score phản ánh khả năng tạo tương tác và lead thật. Hệ thống chỉ làm marketing (không chào bán, không nêu giá); không bịa công dụng.",
      messages: [{ role: "user", content: `${brandContext()}\n\nHãy đề xuất ${n} ý tưởng nội dung mới, mỗi ý tưởng gắn với một insightId có thật ở trên.` }],
      output_config: { format: zodOutputFormat(IdeasSchema) },
    }),
  );
  if (!gated.ok) return gated;
  const res = gated.res;
  try {
    const ideas = res.parsed_output?.ideas ?? [];
    if (ideas.length === 0) return { ok: false, error: "AI không trả về ý tưởng nào." };
    const db = getDb();
    db.insert(schema.contentItems)
      .values(
        ideas.map((i) => ({
          id: `ct_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
          title: i.title,
          format: i.format,
          status: "proposed",
          insightId: i.insightId,
          pillar: i.pillar,
          hook: i.hook,
          outline: JSON.stringify(i.outline),
          assignee: "ai",
          createdAt: new Date().toISOString(),
          score: i.score,
          source: "ai",
        })),
      )
      .run();
    return { ok: true, count: ideas.length };
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}

// Kịch bản mới = vlog chia sẻ < 1 phút (OWNER 26/10); kịch bản quay sinh từ brief nghiên cứu giữ khung 5 cảnh cũ (luật kiểm CP02 dựa trên khung đó).
const VLOG_SCRIPT_FORMAT =
  "reel / story / script = kịch bản VLOG CHIA SẺ ngôi thứ nhất, dưới 60 giây (~130–160 từ lời thoại, giọng kể tự nhiên, không giọng bán hàng), đúng 4 cảnh " +
  "1. HOOK (0–3s), 2. CÂU CHUYỆN (3–25s), 3. BÀI HỌC (25–50s), 4. KẾT (50–60s); mỗi cảnh có ba dòng Hình ảnh / Lời thoại / Chữ trên màn hình. " +
  "Câu chuyện dựa trên hook, dàn ý và insight được đưa; không bịa trải nghiệm riêng, số liệu hay kết quả — giữ nguyên mọi dòng 'Gợi ý OWNER: [OWNER KỂ: …]' để OWNER tự kể. " +
  "Theo nguyên lý marketing của Philip Kotler (lấy khách hàng làm trung tâm): hook = nỗi đau / nhu cầu của một nhóm khách cụ thể, bằng lời của khách; câu chuyện = tình huống của khách. " +
  "Bài học: MỘT lợi ích cụ thể khách nhận được, làm được ngay. Kết: nhẹ nhàng, CTA mềm (hỏi người xem đã gặp chưa, lưu lại), không chào bán. Lời thoại không chứa ghi chú nội bộ về dữ liệu. " +
  "Cách viết theo phong cách copywriting của David Ogilvy: một ý lớn, hook như tiêu đề (cụ thể, có lợi ích), dữ kiện thay tính từ, không so sánh nhất / thổi phồng, câu ngắn đời thường, một lý do để tin, lời mời rõ ràng và trung thực";
const BRIEF_SCRIPT_FORMAT = "reel / story / script = kịch bản video 15–60 giây theo 5 cảnh Hook (0–3s), Vấn đề, Giải pháp, Bằng chứng, Kêu gọi, mỗi cảnh có ba dòng Hình ảnh / Lời thoại / Chữ trên màn hình";

export function draftPurpose(format: string): "draft" | "caption" {
  return format === "reel" || format === "story" || format === "script" ? "draft" : "caption";
}

// Kịch bản vlog soạn bằng thẻ cảnh: AI trả CẤU TRÚC (4 cảnh × lời nói / hình ảnh / chữ trên màn hình) → ghi lại đúng dạng chữ cảnh
// (serializeVlog) nên scriptCheck / bản đọc khi quay / bộ dựng không đổi. Một lần gọi viết đủ 4 cảnh; "Viết lại" một cảnh dùng cùng lần gọi
// nhưng chỉ nhận cảnh đó.
const VlogSceneSchema = z.object({
  speech: z.string().describe("Lời nói của OWNER trong cảnh, nói thẳng vào camera, câu ngắn; không ghi chú nội bộ"),
  visual: z.string().describe("Hình ảnh: một câu ngắn, quay được bằng điện thoại"),
  onScreen: z.string().describe("Chữ trên màn hình, tối đa 8 chữ"),
});
const VlogDraftSchema = z.object({
  segment: z.string().describe("STP: MỘT nhóm khách cụ thể video này nói với (ai, đang ở tình huống nào), một câu ngắn"),
  hook: VlogSceneSchema.describe("HOOK 0–3s: nỗi đau / nhu cầu của nhóm khách, bằng lời của khách, ≤ 12–15 chữ"),
  story: VlogSceneSchema.describe("CÂU CHUYỆN 3–25s: tình huống / khoảnh khắc sự thật của khách"),
  value: VlogSceneSchema.describe("GIÁ TRỊ / BÀI HỌC 25–50s: MỘT lợi ích cụ thể khách nhận được, có bằng chứng thì dẫn 'theo …'"),
  end: VlogSceneSchema.describe("KẾT 50–60s: MỘT lời mời nhẹ đúng chặng khách 5A"),
});

export interface WriteDraftOptions {
  /** Chỉ viết lại một cảnh (thẻ "Viết lại"); bỏ trống = cả 4 cảnh. */
  scene?: VlogKey;
  /** Chặng khách 5A OWNER chọn trên trình soạn; bỏ trống = theo bản nháp / mục tiêu nội dung. */
  stage?: PathStage;
}

async function writeVlogDraft(item: typeof schema.contentItems.$inferSelect, opts: WriteDraftOptions): Promise<Result<{ draft: string }>> {
  const db = getDb();
  const doc = parseVlogDraft(item.draft ?? "") ?? emptyVlogDoc(item.title);
  const ctx = scriptContext(item.id);
  const stage: PathStage = opts.stage ?? doc.stage ?? ctx.stage ?? DEFAULT_STAGE;
  const only = opts.scene ? VLOG_CARDS.find((c) => c.key === opts.scene) : undefined;
  const current = doc.cards
    .map((c, i) => `${i + 1}. ${VLOG_CARDS[i].label}: ${c.speech.trim() || "(trống)"}${c.ownerHints.length ? ` — gợi ý OWNER: ${c.ownerHints.join(" ")}` : ""}`)
    .join("\n");
  const gated = await gate(draftPurpose(item.format), `AI viết kịch bản “${item.title}”${only ? ` · cảnh ${only.label}` : ""}`, (client, model) =>
    client.messages.parse({
      model,
      max_tokens: 8000,
      system:
        "Bạn là biên tập viên vlog chia sẻ cho thương hiệu cá nhân Việt Nam, viết kịch bản dưới 60 giây để OWNER nói thẳng vào camera, ngôi thứ nhất, tiếng Việt tự nhiên. " +
        "Hệ thống chỉ làm marketing (không chào bán, không nêu giá). Chỉ dựa trên căn cứ được đưa; không bịa số liệu, công dụng, kết quả. " +
        "Tuân chính sách nền tảng: không khẳng định tuyệt đối (100%, cam kết, đảm bảo), không tuyên bố chữa bệnh / giảm cân, không khẳng định thuộc tính cá nhân người xem, không hứa thu nhập.\n\n" +
        vlogFormulaRules(stage, getBrand().voice || ""),
      messages: [
        {
          role: "user",
          content:
            `${brandContext()}\n\nCĂN CỨ CỦA KỊCH BẢN NÀY:\n${ctx.basisText || "(không có căn cứ riêng — chỉ dùng insight ở trên)"}\n\n` +
            `Chủ đề: ${item.pillar}\nTiêu đề: ${item.title}\nHook đã chọn ở bước 2: ${item.hook || "(chưa có)"}\n` +
            `Dàn ý: ${ctx.beats.length ? ctx.beats.map((b, i) => `${i + 1}. ${b}`).join(" · ") : "(không có)"}\n` +
            `Khách mục tiêu hiện ghi: ${doc.segment || "(chưa có)"}\n` +
            `Chặng khách (5A): ${PATH_STAGES.find((p) => p.key === stage)!.label}\n\n` +
            `Kịch bản hiện có (lời OWNER đã viết mà hợp công thức thì giữ; không xoá chỗ [OWNER KỂ: …] nếu chưa có chuyện thật trong căn cứ):\n${current}\n\n` +
            (only
              ? `Chỉ viết lại cảnh ${only.label}; các cảnh khác trả lại đúng như hiện có.`
              : "Viết đủ 4 cảnh. Hook đã chọn đạt công thức thì giữ nguyên, chỉ sửa khi dài quá 15 chữ hoặc không nói nỗi đau của khách."),
        },
      ],
      output_config: { format: zodOutputFormat(VlogDraftSchema) },
    }),
  );
  if (!gated.ok) return gated;
  const out = gated.res.parsed_output;
  if (!out) return { ok: false, error: "AI trả về không đúng định dạng kịch bản." };
  const next = {
    ...doc,
    segment: only ? doc.segment || out.segment.trim() : out.segment.trim() || doc.segment,
    stage,
    cards: doc.cards.map((c) => {
      if (only && c.key !== only.key) return c;
      const sc = out[c.key];
      // AI hay bọc cả câu trong “…” — bỏ cặp ngoặc đó (chữ OWNER thì không đụng)
      return { ...c, speech: unquoteAi(sc.speech), visual: sc.visual.trim() || c.visual, onScreen: unquoteAi(sc.onScreen) };
    }),
  };
  const draft = serializeVlog(next);
  // Trong lúc AI viết, nội dung có thể đã được duyệt: chỉ ghi khi vẫn đang viết / chờ duyệt.
  const now = db.select({ status: schema.contentItems.status }).from(schema.contentItems).where(eq(schema.contentItems.id, item.id)).get();
  if (now?.status !== "in_progress" && now?.status !== "review") return { ok: false, error: "Nội dung đã đổi trạng thái trong lúc AI viết; không ghi đè." };
  const hook = next.cards[0].speech.trim() || item.hook;
  db.update(schema.contentItems).set({ draft, hook }).where(eq(schema.contentItems.id, item.id)).run();
  return { ok: true, draft };
}

/** Kịch bản vlog soạn bằng thẻ cảnh (không từ brief, không khung cũ 5 cảnh). */
export function isCardVlog(format: string, draft: string | null, hasBrief: boolean): boolean {
  return draftPurpose(format) === "draft" && !hasBrief && parseVlogDraft(draft ?? "") !== null;
}

/** `briefRules`: khi nội dung sinh từ brief nghiên cứu, AI chỉ được viết lại kịch bản quay hiện có theo các luật này. */
export async function writeDraft(contentId: string, briefRules?: string, validate?: (draft: string) => string[], opts: WriteDraftOptions = {}): Promise<Result<{ draft: string }>> {
  const db = getDb();
  const item = db.select().from(schema.contentItems).where(eq(schema.contentItems.id, contentId)).get();
  if (!item) return { ok: false, error: "Không tìm thấy nội dung." };
  if (!briefRules && isCardVlog(item.format, item.draft, false)) return writeVlogDraft(item, opts);
  // Đội AI: kịch bản video (reel / story / script) → AI Kịch bản; bài đăng / caption / bài viết / carousel / ảnh → AI Viết bài đăng
  const gated = await gate(draftPurpose(item.format), `AI viết nháp “${item.title}”`, (client, model) =>
    client.messages.create({
      model,
      max_tokens: 16000,
      system:
        "Bạn viết nội dung mạng xã hội tiếng Việt cho fanpage. Viết bản nháp hoàn chỉnh, đúng định dạng: post = bài đăng có hook, thân, CTA; article = bài dài có tiêu đề phụ; carousel = từng slide đánh số; " +
        (briefRules ? BRIEF_SCRIPT_FORMAT : VLOG_SCRIPT_FORMAT) +
        "; caption = caption ngắn dưới 125 ký tự ở câu đầu, có CTA, tối đa 5 hashtag; image = bản mô tả ảnh cho thiết kế (thông điệp trên ảnh tối đa 8 từ, chủ thể, bố cục, màu, phong cách, điều cấm). Không dùng emoji quá nhiều. Hệ thống chỉ làm marketing (không chào bán, không nêu giá); không bịa công dụng. Trả về chỉ nội dung nháp, không giải thích.",
      messages: [
        {
          role: "user",
          content: briefRules
            ? `${briefRules}\n\nKịch bản quay hiện có (giữ nguyên cấu trúc cảnh, các dòng Căn cứ và mục NGUỒN):\n${item.draft ?? ""}`
            : `${brandContext()}\n\nViết nháp cho:\nTiêu đề: ${item.title}\nĐịnh dạng: ${item.format}\nHook: ${item.hook}\nDàn ý: ${item.outline}${draftPurpose(item.format) === "draft" && item.draft?.trim() ? `\n\nBản nháp / khung hiện có (giữ các dòng Gợi ý OWNER):\n${item.draft.slice(0, 6000)}` : ""}`,
        },
      ],
    }),
  );
  if (!gated.ok) return gated;
  const res = gated.res;
  try {
    if (res.stop_reason === "refusal") return { ok: false, error: "AI từ chối yêu cầu này." };
    const draft = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    const violations = validate ? validate(draft) : [];
    if (violations.length) return { ok: false, error: `Không nhận bản AI viết lại, giữ bản cũ: ${violations.join("; ")}` };
    // Trong lúc AI viết, nội dung có thể đã được duyệt: chỉ ghi khi vẫn đang viết / chờ duyệt.
    const now = db.select({ status: schema.contentItems.status }).from(schema.contentItems).where(eq(schema.contentItems.id, contentId)).get();
    if (now?.status !== "in_progress" && now?.status !== "review") return { ok: false, error: "Nội dung đã đổi trạng thái trong lúc AI viết; không ghi đè." };
    db.update(schema.contentItems).set({ draft }).where(eq(schema.contentItems.id, contentId)).run();
    return { ok: true, draft };
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}

export async function suggestReply(conversationId: string): Promise<Result<{ text: string }>> {
  const db = getDb();
  const conv = db.select().from(schema.conversations).where(eq(schema.conversations.id, conversationId)).get();
  if (!conv) return { ok: false, error: "Không tìm thấy hội thoại." };
  const msgs = db.select().from(schema.messages).where(eq(schema.messages.conversationId, conversationId)).orderBy(schema.messages.at).all();
  const b = getBrand();
  const gated = await gate("reply", `AI gợi ý trả lời ${conv.leadName}`, (client, model) =>
    client.messages.create({
      model,
      max_tokens: 2000,
      output_config: { effort: "low" },
      system: `Bạn là nhân viên chăm sóc fanpage ${b.name || ""}. Giọng: ${b.voice}. Trả lời ngắn gọn 1-3 câu, tiếng Việt, thân thiện, hướng tới để lại số điện thoại để được tư vấn (lead). Không chào bán, không nêu giá, không hứa điều không chắc. Chỉ trả về câu trả lời.`,
      messages: [
        {
          role: "user",
          content: `Khách: ${conv.leadName}. Lịch sử:\n${msgs.map((m) => `${m.from === "customer" ? "Khách" : m.from === "ai" ? "AI" : "Shop"}: ${m.text}`).join("\n")}\n\nSoạn câu trả lời tiếp theo.`,
        },
      ],
    }),
  );
  if (!gated.ok) return gated;
  const res = gated.res;
  try {
    if (res.stop_reason === "refusal") return { ok: false, error: "AI từ chối yêu cầu này." };
    const text = res.content
      .filter((blk): blk is Anthropic.TextBlock => blk.type === "text")
      .map((blk) => blk.text)
      .join(" ")
      .trim();
    return { ok: true, text };
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}


// ---------- Trợ lý: câu hỏi tự do trên ảnh chụp dữ liệu hệ thống ----------
export async function askAi(question: string, snapshot: string, history: string): Promise<Result<{ text: string }>> {
  const gated = await gate("assistant", `Trợ lý: “${question.slice(0, 80)}”`, (client, model) =>
    client.messages.create({
      model,
      max_tokens: 1500,
      output_config: { effort: "low" },
      system:
        "Bạn là trợ lý vận hành marketing trong hệ thống BAOR AI OS. Chỉ trả lời dựa trên DỮ LIỆU HỆ THỐNG được cung cấp; không bịa số. Nếu dữ liệu không đủ, nói rõ thiếu gì và gợi ý mở phân hệ nào. Trả lời tiếng Việt, ngắn gọn, có gạch đầu dòng khi liệt kê. Không đưa ra quyết định chi tiền hay xuất bản; chỉ đề xuất để người duyệt.",
      messages: [{ role: "user", content: `DỮ LIỆU HỆ THỐNG:\n${snapshot}\n\nHỘI THOẠI TRƯỚC:\n${history || "(chưa có)"}\n\nCÂU HỎI: ${question}` }],
    }),
  );
  if (!gated.ok) return gated;
  const res = gated.res;
  if (res.stop_reason === "refusal") return { ok: false, error: "AI từ chối yêu cầu này." };
  const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
  return { ok: true, text };
}

// ---------- Rút insight từ dữ liệu thật, kèm bằng chứng, chờ người duyệt ----------
const InsightsSchema = z.object({
  insights: z.array(
    z.object({
      title: z.string(),
      detail: z.string(),
      confidence: z.number().int().min(0).max(100),
      source: z.string(),
      evidence: z.array(z.string()).min(1),
      personaId: z.string().nullable(),
    }),
  ),
});

export async function extractInsights(): Promise<Result<{ count: number }>> {
  const db = getDb();
  const msgs = db.select().from(schema.messages).orderBy(desc(schema.messages.at)).limit(120).all().filter((m) => m.from === "customer");
  const leads = db.select().from(schema.leads).orderBy(desc(schema.leads.lastMessageAt)).limit(60).all();
  const posts = db.select().from(schema.scheduledPosts).all().filter((p) => p.status === "published" && p.reach);
  const personas = listPersonas();
  if (msgs.length + leads.length + posts.length < 5) return { ok: false, error: "Chưa đủ dữ liệu (inbox, lead, bài đăng) để rút insight. Kết nối nền tảng hoặc nhập lead trước." };
  const data = [
    `Tin nhắn khách (${msgs.length}):\n${msgs.map((m) => `- [msg ${m.id}] ${m.text}`).join("\n")}`,
    `Lead (${leads.length}):\n${leads.map((l) => `- [lead ${l.id}] ${l.name} · ${l.source}/${l.platform} · ${l.stage} · "${l.lastMessage}" · nhãn ${l.tags}`).join("\n")}`,
    `Bài đã đăng:\n${posts.map((p) => `- [post ${p.id}] "${p.title}" ${p.platform}: reach ${p.reach}, tương tác ${p.engagement}`).join("\n")}`,
    `Nhóm khách hàng có sẵn: ${personas.map((p) => `${p.id}=${p.name}`).join("; ") || "(chưa có)"}`,
  ].join("\n\n");
  const gated = await gate("research", "AI rút insight từ inbox, lead, bài đăng", (client, model) =>
    client.messages.parse({
      model,
      max_tokens: 6000,
      system:
        "Bạn là chuyên viên nghiên cứu khách hàng. Từ dữ liệu thô, rút ra 2–5 insight cụ thể, có thể hành động, tiếng Việt. Mỗi insight PHẢI kèm evidence là trích dẫn / mã bản ghi có trong dữ liệu (dạng [msg id], [lead id], [post id]); không suy đoán ngoài dữ liệu. confidence phản ánh số bằng chứng. personaId chỉ dùng id có trong danh sách, không có thì null. source ghi rõ loại dữ liệu và số lượng (VD: '18 tin nhắn inbox tuần này').",
      messages: [{ role: "user", content: data }],
      output_config: { format: zodOutputFormat(InsightsSchema) },
    }),
  );
  if (!gated.ok) return gated;
  const list = gated.res.parsed_output?.insights ?? [];
  const validPersona = new Set(personas.map((p) => p.id));
  const now = new Date().toISOString();
  for (const i of list) {
    db.insert(schema.insights)
      .values({ id: `i_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, title: i.title, detail: i.detail, confidence: i.confidence, source: i.source, personaId: i.personaId && validPersona.has(i.personaId) ? i.personaId : null, createdAt: now, usedInContent: 0, status: "proposed", origin: "ai", evidence: JSON.stringify(i.evidence) })
      .run();
  }
  return { ok: true, count: list.length };
}
