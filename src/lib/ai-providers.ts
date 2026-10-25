import Anthropic from "@anthropic-ai/sdk";
import { getSetting } from "@/lib/admin";
import { readIntegrationConfig } from "@/lib/connectors/config";

// Nhiều hãng AI cho Đội AI (OWNER 25/10/2026: "có gọi được AI của Grok và ChatGPT không… nếu có thêm vào luôn"): mỗi vị trí chọn mô hình
// của Claude (Anthropic), ChatGPT (OpenAI) hoặc Grok (xAI); cổng AI chung (src/lib/ai.ts › gate) giữ nguyên công tắc, trần, sổ chi phí.
// ChatGPT / Grok gọi qua Responses API (POST {base}/responses, Bearer) — cả hai hãng dùng cùng chuẩn này. Bộ chuyển đổi trả về đúng dạng
// Anthropic mà các chỗ gọi đang dùng (messages.create / messages.parse → content[].text, usage, stop_reason, parsed_output), nên không phải
// sửa từng chỗ gọi. Tính năng riêng của Claude (công cụ web_search ở Nghiên cứu bước tìm nguồn) vẫn chạy bằng Claude.

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
}

const asText = (c: Msg["content"] | CompatParams["system"]): string => (typeof c === "string" ? c : (c ?? []).map((b) => b.text ?? "").join("\n"));

interface ResponsesBody {
  status?: string;
  incomplete_details?: { reason?: string } | null;
  output?: { type: string; content?: { type: string; text?: string; refusal?: string }[] }[];
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string } | null;
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
  };
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
  const stop_reason = refused ? "refusal" : json.status === "incomplete" && json.incomplete_details?.reason === "max_output_tokens" ? "max_tokens" : "end_turn";
  return {
    content: text ? [{ type: "text" as const, text }] : [],
    usage: { input_tokens: json.usage?.input_tokens ?? 0, output_tokens: json.usage?.output_tokens ?? 0 },
    stop_reason,
    text,
    format,
  };
}

/** Client dạng Anthropic (chỉ messages.create / messages.parse) cho ChatGPT / Grok. */
export function compatClient(provider: Exclude<AiProvider, "anthropic">, fetchImpl: typeof fetch = fetch): Anthropic {
  const client = {
    messages: {
      async create(p: CompatParams) {
        const { text, format, ...res } = await callResponses(provider, p, fetchImpl);
        void text;
        void format;
        return res;
      },
      async parse(p: CompatParams) {
        const { text, format, ...res } = await callResponses(provider, p, fetchImpl);
        let parsed_output: unknown = null;
        if (text && format?.parse) parsed_output = format.parse(text);
        return { ...res, parsed_output };
      },
    },
  };
  // Chỉ phần messages.create / messages.parse được dùng qua cổng AI; kiểu Anthropic để các chỗ gọi không phải đổi
  return client as unknown as Anthropic;
}

export function clientFor(provider: AiProvider): Anthropic | null {
  const key = providerKey(provider);
  if (!key) return null;
  return provider === "anthropic" ? new Anthropic({ apiKey: key }) : compatClient(provider);
}
