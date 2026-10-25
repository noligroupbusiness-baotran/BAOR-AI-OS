// Khoá API của các hãng AI cho Đội AI (Claude / ChatGPT / Grok — src/lib/ai-providers.ts). Kiểm tra khoá = hỏi danh sách mô hình của hãng:
// không sinh token, không tốn tiền; lỗi của hãng (khoá sai, thiếu quyền, khoá cần workspace…) hiện nguyên văn để OWNER sửa đúng chỗ.
import type { CheckResult, Connector } from "./types";

async function errorText(r: Response): Promise<string> {
  const j = (await r.json().catch(() => null)) as { error?: { message?: string } | string } | null;
  const m = typeof j?.error === "string" ? j.error : j?.error?.message;
  return m ? `${r.status}: ${m}` : `HTTP ${r.status}`;
}

function aiKeyConnector(key: string, label: string, hint: string, probe: (apiKey: string, f: typeof fetch) => Promise<Response>): Connector {
  return {
    key,
    channels: [],
    fields: [{ key: "apiKey", label: "API key", secret: true, hint }],
    async check(ctx): Promise<CheckResult> {
      const apiKey = ctx.config.apiKey;
      if (!apiKey) return { ok: false, message: `Chưa nhập khoá ${label}.` };
      try {
        const r = await probe(apiKey, ctx.fetch);
        if (r.ok) return { ok: true, account: label, message: `Khoá ${label} hợp lệ.` };
        return { ok: false, message: `${label} từ chối khoá (${await errorText(r)})` };
      } catch (e) {
        return { ok: false, message: `Không gọi được ${label}: ${e instanceof Error ? e.message : String(e)}` };
      }
    },
  };
}

export const claudeKeyConnector = aiKeyConnector("claude", "Claude", "sk-ant-...", (k, f) =>
  f("https://api.anthropic.com/v1/models?limit=1", { headers: { "x-api-key": k, "anthropic-version": "2023-06-01" }, signal: AbortSignal.timeout(20_000) }),
);

export const openaiKeyConnector = aiKeyConnector("openai", "ChatGPT (OpenAI)", "sk-...", (k, f) =>
  f("https://api.openai.com/v1/models", { headers: { authorization: `Bearer ${k}` }, signal: AbortSignal.timeout(20_000) }),
);

export const xaiKeyConnector = aiKeyConnector("xai", "Grok (xAI)", "xai-...", (k, f) =>
  f("https://api.x.ai/v1/models", { headers: { authorization: `Bearer ${k}` }, signal: AbortSignal.timeout(20_000) }),
);

/** Dòng kết nối tự tạo cho CSDL đã có từ trước (production) — nạp mẫu chỉ chạy lần đầu. */
export const AI_KEY_ROWS = [
  { key: "openai", name: "ChatGPT API (OpenAI)", description: "Khoá OpenAI cho các vị trí Đội AI chọn mô hình ChatGPT." },
  { key: "xai", name: "Grok API (xAI)", description: "Khoá xAI cho các vị trí Đội AI chọn mô hình Grok." },
];
