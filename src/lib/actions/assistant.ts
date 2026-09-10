"use server";

import { answerByRule, recordAssistantRule, systemSnapshot } from "@/lib/assistant";
import { askAi } from "@/lib/ai";
import { getCurrentUser } from "@/lib/auth";

export interface AssistantState {
  messages: { id: string; from: "user" | "assistant"; text: string; at: string; lane?: "rule" | "ai"; sources?: string[] }[];
  error?: string;
}

// Mỗi câu hỏi: thử làn luật trước; không khớp thì gọi AI với ảnh chụp dữ liệu hệ thống.
export async function askAssistant(prev: AssistantState, fd: FormData): Promise<AssistantState> {
  const user = await getCurrentUser();
  if (!user) return { ...prev, error: "Phiên đăng nhập đã hết." };
  const q = String(fd.get("q") ?? "").trim();
  if (!q) return prev;
  const now = new Date().toISOString();
  const messages = [...prev.messages, { id: `u${Date.now()}`, from: "user" as const, text: q, at: now }];
  const byRule = answerByRule(q);
  if (byRule) {
    recordAssistantRule(q, byRule);
    return { messages: [...messages, { id: `a${Date.now()}`, from: "assistant", text: byRule.text, at: new Date().toISOString(), lane: "rule", sources: byRule.sources }] };
  }
  const history = prev.messages.slice(-6).map((m) => `${m.from === "user" ? "Người dùng" : "Trợ lý"}: ${m.text}`).join("\n");
  const r = await askAi(q, systemSnapshot(), history);
  if (!r.ok) {
    return { messages: [...messages, { id: `a${Date.now()}`, from: "assistant", text: `Chưa trả lời bằng AI được: ${r.error}\n\nCâu hỏi này không thuộc nhóm trả lời được từ dữ liệu sẵn có (việc chờ duyệt, chiến dịch chậm, lỗi, lead mới, doanh thu, tình hình chiến dịch).`, at: new Date().toISOString(), lane: "rule", sources: [] }] };
  }
  return { messages: [...messages, { id: `a${Date.now()}`, from: "assistant", text: r.text, at: new Date().toISOString(), lane: "ai", sources: ["Ảnh chụp dữ liệu hệ thống", "Claude"] }] };
}
