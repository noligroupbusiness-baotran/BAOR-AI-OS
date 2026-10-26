import Anthropic from "@anthropic-ai/sdk";
import { getSetting } from "@/lib/admin";
import { readIntegrationConfig } from "@/lib/connectors/config";

// Nhiều hãng AI cho Đội AI (OWNER 25/10/2026: "có gọi được AI của Grok và ChatGPT không… nếu có thêm vào luôn"): mỗi vị trí chọn mô hình
// của Claude (Anthropic), ChatGPT (OpenAI) hoặc Grok (xAI); cổng AI chung (src/lib/ai.ts › gate) giữ nguyên công tắc, trần, sổ chi phí.
// ChatGPT / Grok gọi qua Responses API (POST {base}/responses, Bearer) — cả hai hãng dùng cùng chuẩn này. Bộ chuyển đổi trả về đúng dạng
// Anthropic mà các chỗ gọi đang dùng (messages.create / messages.parse → content[].text, usage, stop_reason, parsed_output), nên không phải
// sửa từng chỗ gọi. Nghiên cứu bước tìm nguồn (công cụ tìm web phía hãng): Claude (web_search của Anthropic) hoặc ChatGPT (công cụ
// web_search của Responses API — OWNER 27/10/2026 "chuyển phần này thành của gpt luôn"); Grok chưa có tài liệu đủ (dạng nguồn trả về,
// giá mỗi lượt) nên vị trí chọn Grok thì bước tìm nguồn vẫn chạy Claude (WEB_SEARCH_PROVIDERS).

export type AiProvider = "anthropic" | "openai" | "xai";

export const PROVIDERS: Record<AiProvider, { label: string; integration: string; env: string; base?: string }> = {
  anthropic: { label: "Claude", integration: "claude", env: "ANTHROPIC_API_KEY" },
  openai: { label: "ChatGPT", integration: "openai", env: "OPENAI_API_KEY", base: "https://api.openai.com/v1" },
  xai: { label: "Grok", integration: "xai", env: "XAI_API_KEY", base: "https://api.x.ai/v1" },
};

export interface ModelInfo {
  id: string;
  provider: AiProvider;
  label: string;
  usdIn: number; // USD / 1 triệu token vào
  usdOut: number; // USD / 1 triệu token ra
}

// Giá niêm yết chính thức, đọc 25/10/2026 (platform.claude.com/docs/en/about-claude/pricing,
// developers.openai.com/api/docs/pricing, docs.x.ai/docs/models) — mức thường, prompt ngắn. Hãng đổi giá → sửa ở đây.
export const AI_MODELS: ModelInfo[] = [
  { id: "claude-opus-5-5", provider: "anthropic", label: "Claude Opus 5.5", usdIn: 4, usdOut: 20 },
  { id: "claude-sonnet-5-5", provider: "anthropic", label: "Claude Sonnet 5.5", usdIn: 2, usdOut: 10 },
  { id: "claude-haiku-5-5", provider: "anthropic", label: "Claude Haiku 5.5", usdIn: 0.1, usdOut: 0.5 },
  { id: "gpt-6-astra", provider: "openai", label: "ChatGPT · GPT-6 Astra", usdIn: 10, usdOut: 50 },
  { id: "gpt-6.1-sol", provider: "openai", label: "ChatGPT · GPT-6.1 Sol", usdIn: 2, usdOut: 10 },
  { id: "gpt-6-luna", provider: "openai", label: "ChatGPT · GPT-6 Luna", usdIn: 0.1, usdOut: 0.5 },
  { id: "grok-4.7", provider: "xai", label: "Grok 4.7", usdIn: 2, usdOut: 6 },
  { id: "grok-4.3", provider: "xai", label: "Grok 4.3", usdIn: 1.25, usdOut: 2.5 },
  { id: "grok-build-0.1", provider: "xai", label: "Grok Build 0.1", usdIn: 1, usdOut: 2 },
];

export const MODEL_IDS = AI_MODELS.map((m) => m.id);

export function modelInfo(id: string): ModelInfo | undefined {
  return AI_MODELS.find((m) => m.id === id);
}

/** Tỷ giá quy đổi chi phí AI sang VND (Cài đặt › Đội AI › Chi tiêu AI). */
export const DEFAULT_VND_PER_USD = 26_000;
export function vndPerUsd(): number {
  const v = Number(getSetting("ai.vndPerUsd"));
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_VND_PER_USD;
}

/** Chi phí một lần gọi theo giá của đúng mô hình; undefined = mô hình không có trong bảng (router dùng giá chung cũ). */
export function modelCostVnd(model: string, inputTokens: number, outputTokens: number): number | undefined {
  const m = modelInfo(model);
  if (!m) return undefined;
  return Math.round(((inputTokens * m.usdIn + outputTokens * m.usdOut) / 1_000_000) * vndPerUsd());
}

/** Mô hình trong bảng giá ứng với id hãng trả về ở response.model: khớp đúng, hoặc bỏ đuôi ngày của bản chụp (-20261001 / -2026-10-01). */
export function pricedModel(id: string): ModelInfo | undefined {
  return modelInfo(id) ?? modelInfo(id.replace(/-(\d{8}|\d{4}-\d{2}-\d{2})$/, ""));
}

/**
 * Giá MỘT phản hồi theo mô hình hãng THỰC SỰ chạy (response.model — vd fallbacks phía hãng có thể chạy mô hình khác mô hình yêu cầu).
 * Không có response.model → mô hình yêu cầu. Mô hình thực tế không có trong bảng giá → tính theo giá mô hình yêu cầu và trả ghi chú.
 * model = id đã chuẩn hoá (bỏ đuôi ngày nếu khớp bảng giá); pricedAs = mô hình có giá được áp (undefined = cả hai đều không có trong bảng,
 * chỗ gọi dùng giá chung); costVnd = modelCostVnd(pricedAs, …).
 */
export function servedCost(requested: string, served: string | null | undefined, inputTokens: number, outputTokens: number): { model: string; pricedAs: string | undefined; costVnd: number | undefined; note?: string } {
  const ran = served?.trim() || requested;
  const info = pricedModel(ran);
  const pricedAs = info?.id ?? (modelInfo(requested) ? requested : undefined);
  const costVnd = pricedAs ? modelCostVnd(pricedAs, inputTokens, outputTokens) : undefined;
  if (info || ran === requested) return { model: info?.id ?? requested, pricedAs, costVnd };
  return { model: ran, pricedAs, costVnd, note: `${ran} chưa có trong bảng giá, tính theo giá ${requested}` };
}

// ---------- Tìm web phía hãng (Nghiên cứu bước tìm nguồn) ----------

/**
 * Hãng có công cụ tìm web phía hãng mà BAOR đã nối, kèm giá MỖI lượt tìm (USD) — đọc 27/10/2026:
 * - Claude: web_search, 10 USD / 1.000 lượt (platform.claude.com/docs/en/about-claude/pricing).
 * - ChatGPT: tool "web_search" của Responses API, "$10.00 / 1k calls + Search content tokens billed at model rates"
 *   (developers.openai.com/api/docs/pricing#built-in-tools; developers.openai.com/api/docs/guides/tools-web-search).
 *   Token nội dung tìm được đã nằm trong usage.input_tokens → cổng AI tính theo giá mô hình như thường.
 * Grok (xAI) có tool web_search nhưng tài liệu chưa ghi dạng nguồn trả về / giá mỗi lượt → chưa nối, bước này chạy Claude.
 */
export const WEB_SEARCH_USD_PER_CALL: Partial<Record<AiProvider, number>> = { anthropic: 0.01, openai: 0.01 };
export const WEB_SEARCH_PROVIDERS = Object.keys(WEB_SEARCH_USD_PER_CALL) as AiProvider[];

/** Phí công cụ tìm web (₫) cho n lượt của hãng — ghi riêng vào sổ ai_calls để tính trần ngày / tháng / vị trí. */
export function webSearchFeeVnd(provider: AiProvider, calls: number): number {
  return Math.round(calls * (WEB_SEARCH_USD_PER_CALL[provider] ?? 0.01) * vndPerUsd());
}

export interface WebSearchResult {
  model: string;
  usage: { input_tokens: number; output_tokens: number };
  stop_reason: string;
  text: string;
  /** URL → tiêu đề: nguồn trích dẫn (url_citation) + mọi nguồn đã tìm (web_search_call.action.sources). */
  sources: Map<string, string>;
  /** Số mục web_search_call hãng đã chạy (tính phí theo lượt). */
  searches: number;
}

export function providerKey(p: AiProvider): string {
  return readIntegrationConfig(PROVIDERS[p].integration).apiKey || process.env[PROVIDERS[p].env] || "";
}

export function providerConfigured(p: AiProvider): boolean {
  return Boolean(providerKey(p));
}

/** Lỗi trả về từ ChatGPT / Grok (status HTTP + thông báo của hãng). */
export class ProviderError extends Error {
  constructor(
    readonly provider: AiProvider,
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

// ---------- Bộ chuyển đổi Responses API → dạng tin nhắn Anthropic ----------

type Msg = { role: "user" | "assistant"; content: string | { type: string; text?: string }[] };
interface CompatParams {
  model: string;
  max_tokens: number;
  system?: string | { type: string; text?: string }[];
  messages: Msg[];
  output_config?: { format?: { type: string; schema?: unknown; parse?: (s: string) => unknown } | null } | null;
  /** Bật tool tìm web của Responses API (chỉ ChatGPT — xem WEB_SEARCH_PROVIDERS); maxCalls → max_tool_calls. country → user_location
   * (vị trí gần đúng, mã ISO 2 chữ — developers.openai.com/api/docs/guides/tools-web-search); allowedDomains → filters.allowed_domains. */
  web_search?: { maxCalls: number; country?: string; timezone?: string; allowedDomains?: string[] };
}

const asText = (c: Msg["content"] | CompatParams["system"]): string => (typeof c === "string" ? c : (c ?? []).map((b) => b.text ?? "").join("\n"));

interface ResponsesBody {
  /** Mô hình hãng THỰC chạy (có thể kèm đuôi ngày bản chụp, vd gpt-6.1-sol-2026-09-01) — cổng AI tính giá theo nó (servedCost). */
  model?: string;
  status?: string;
  incomplete_details?: { reason?: string } | null;
  // Tìm web (developers.openai.com/api/reference/resources/responses/methods/create): mục { type: "web_search_call", status,
  // action: { type: "search", query, sources?: [{ type: "url", url }] } | { type: "open_page", url } | … }; chữ trả lời mang
  // annotations [{ type: "url_citation", url, title, start_index, end_index }].
  output?: {
    type: string;
    status?: string;
    action?: { type?: string; url?: string | null; sources?: { type?: string; url?: string }[] } | null;
    content?: { type: string; text?: string; refusal?: string; annotations?: { type: string; url?: string; title?: string }[] }[];
  }[];
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string } | null;
}

/** Tool web_search của Responses API: vị trí người dùng gần đúng (Nghiên cứu: Việt Nam) + lọc tên miền khi đọc đúng một trang. */
export function webSearchTool(w: NonNullable<CompatParams["web_search"]>): Record<string, unknown> {
  return {
    type: "web_search",
    ...(w.country ? { user_location: { type: "approximate", country: w.country, ...(w.timezone ? { timezone: w.timezone } : {}) } } : {}),
    ...(w.allowedDomains?.length ? { filters: { allowed_domains: w.allowedDomains.slice(0, 100) } } : {}),
  };
}

async function callResponses(provider: AiProvider, p: CompatParams, fetchImpl: typeof fetch) {
  const key = providerKey(provider);
  if (!key) throw new ProviderError(provider, 401, `Chưa có khoá ${PROVIDERS[provider].label}. Vào Cài đặt › Kết nối để nhập.`);
  const format = p.output_config?.format;
  const body = {
    model: p.model,
    instructions: p.system ? asText(p.system) : undefined,
    input: p.messages.map((m) => ({ role: m.role, content: asText(m.content) })),
    max_output_tokens: p.max_tokens,
    store: false,
    ...(format?.schema ? { text: { format: { type: "json_schema", name: "ket_qua", schema: format.schema, strict: false } } } : {}),
    // Tool tìm web: "web_search" (bản mới, không dùng web_search_preview cũ); include để nhận ĐỦ nguồn đã tìm, không chỉ nguồn được trích;
    // max_tool_calls chặn số lượt (mỗi lượt tính phí)
    ...(p.web_search ? { tools: [webSearchTool(p.web_search)], include: ["web_search_call.action.sources"], max_tool_calls: p.web_search.maxCalls } : {}),
  };
  if (p.web_search && provider !== "openai") throw new ProviderError(provider, 400, `${PROVIDERS[provider].label}: chưa nối công cụ tìm web.`);
  const r = await fetchImpl(`${PROVIDERS[provider].base}/responses`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10 * 60_000),
  });
  const json = (await r.json().catch(() => ({}))) as ResponsesBody;
  if (!r.ok) throw new ProviderError(provider, r.status, json.error?.message || `HTTP ${r.status}`);
  const parts = (json.output ?? []).filter((o) => o.type === "message").flatMap((o) => o.content ?? []);
  const text = parts.filter((c) => c.type === "output_text").map((c) => c.text ?? "").join("");
  const refused = parts.some((c) => c.type === "refusal");
  const sources = new Map<string, string>();
  const isUrl = (u: unknown): u is string => typeof u === "string" && /^https?:\/\/\S+$/i.test(u);
  for (const c of parts) for (const a of c.annotations ?? []) if (a.type === "url_citation" && isUrl(a.url)) sources.set(a.url, a.title?.trim() || sources.get(a.url) || a.url);
  const calls = (json.output ?? []).filter((o) => o.type === "web_search_call");
  // Chỉ nhận URL từ lượt tool ĐÃ XONG: lượt "failed" (trang không mở được — URL bịa hoặc cài vào câu hỏi / Second Brain) không thành nguồn
  for (const o of calls.filter((c) => c.status === "completed")) {
    for (const src of o.action?.sources ?? []) if ((src.type ?? "url") === "url" && isUrl(src.url) && !sources.has(src.url)) sources.set(src.url, src.url);
    if (o.action?.type === "open_page" && isUrl(o.action.url) && !sources.has(o.action.url)) sources.set(o.action.url, o.action.url);
  }
  // Phí theo tài liệu OpenAI: "Search actions incur a tool call cost" — chỉ action search tính phí (open_page / find_in_page thì không)
  const searches = calls.filter((c) => c.action?.type === "search").length;
  const stop_reason = refused ? "refusal" : json.status === "incomplete" && json.incomplete_details?.reason === "max_output_tokens" ? "max_tokens" : "end_turn";
  return {
    // Trả mô hình thực chạy như response.model của Claude: meterClient (src/lib/ai.ts) ghi sổ + tính giá theo nó; thiếu → mô hình yêu cầu
    model: typeof json.model === "string" && json.model.trim() ? json.model : p.model,
    content: text ? [{ type: "text" as const, text }] : [],
    usage: { input_tokens: json.usage?.input_tokens ?? 0, output_tokens: json.usage?.output_tokens ?? 0 },
    stop_reason,
    text,
    format,
    // Chỉ có khi bật web_search (bộ chuyển đổi bỏ đi ở messages.create thường)
    web_search: p.web_search ? { sources, searches } : undefined,
  };
}

/** Client dạng Anthropic (chỉ messages.create / messages.parse) cho ChatGPT / Grok. */
export function compatClient(provider: Exclude<AiProvider, "anthropic">, fetchImpl: typeof fetch = fetch): Anthropic {
  const client = {
    messages: {
      async create(p: CompatParams) {
        const { text, format, web_search, ...res } = await callResponses(provider, p, fetchImpl);
        void format;
        // Tìm web: trả thêm chữ + nguồn + số lượt (đồng hồ của cổng AI vẫn đếm usage như mọi phản hồi)
        return web_search ? { ...res, text, sources: web_search.sources, searches: web_search.searches } : res;
      },
      // Qua this.create như SDK Anthropic: cổng AI (src/lib/ai.ts › meterClient) đếm token của phản hồi TRƯỚC khi parse → JSON hỏng /
      // sai schema vẫn ném lỗi nhưng sổ chi phí ghi đúng token hãng đã tính tiền.
      async parse(p: CompatParams) {
        const res = await this.create(p);
        const text = res.content.map((c) => c.text).join("");
        const format = p.output_config?.format;
        let parsed_output: unknown = null;
        if (text && format?.parse) parsed_output = format.parse(text);
        return { ...res, parsed_output };
      },
    },
  };
  // Chỉ phần messages.create / messages.parse được dùng qua cổng AI; kiểu Anthropic để các chỗ gọi không phải đổi
  return client as unknown as Anthropic;
}

/**
 * Một lượt tìm web bằng ChatGPT (Responses API, tool "web_search") qua client của cổng AI — client PHẢI là client gate() đưa vào call
 * (đã bọc đồng hồ: token ghi sổ ai_calls theo vị trí + giá mô hình thực chạy, công tắc / trần đã kiểm). Phí mỗi lượt tìm ghi riêng
 * ở chỗ gọi bằng webSearchFeeVnd. Hãng chạy vòng tìm → đọc → trả lời phía máy chủ trong MỘT phản hồi (không có pause_turn như Claude).
 */
export async function compatWebSearch(client: Anthropic, p: { model: string; max_tokens: number; system: string; prompt: string; maxSearches: number; country?: string; timezone?: string; allowedDomains?: string[] }): Promise<WebSearchResult> {
  const params: CompatParams = { model: p.model, max_tokens: p.max_tokens, system: p.system, messages: [{ role: "user", content: p.prompt }], web_search: { maxCalls: p.maxSearches, country: p.country, timezone: p.timezone, allowedDomains: p.allowedDomains } };
  const res = (await client.messages.create(params as never)) as unknown as Partial<WebSearchResult> & { model: string; usage: WebSearchResult["usage"]; stop_reason: string };
  if (!(res.sources instanceof Map)) throw new Error("Client không phải bộ chuyển đổi ChatGPT — không chạy được tìm web.");
  return { model: res.model, usage: res.usage, stop_reason: res.stop_reason, text: res.text ?? "", sources: res.sources, searches: res.searches ?? 0 };
}

export function clientFor(provider: AiProvider): Anthropic | null {
  const key = providerKey(provider);
  if (!key) return null;
  return provider === "anthropic" ? new Anthropic({ apiKey: key }) : compatClient(provider);
}
