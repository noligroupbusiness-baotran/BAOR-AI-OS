"use client";

import { useState } from "react";
import { Send, Sparkles } from "lucide-react";
import { Drawer } from "@/components/ui/dialog";
import { assistantGreeting, assistantHistory, assistantSuggestions, type AssistantMessage } from "@/lib/mock/assistant";
import { formatTime, cn } from "@/lib/format";

export function AssistantPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [messages, setMessages] = useState<AssistantMessage[]>(assistantHistory);
  const [text, setText] = useState("");

  const send = (t: string) => {
    const q = t.trim();
    if (!q) return;
    const now = new Date().toISOString();
    setMessages((m) => [
      ...m,
      { id: `u${Date.now()}`, from: "user", text: q, at: now },
      { id: `a${Date.now()}`, from: "assistant", text: "Trợ lý AI sẽ được kết nối ở giai đoạn sau. Em đã ghi nhận yêu cầu của anh.", at: now },
    ]);
    setText("");
  };

  return (
    <Drawer open={open} onClose={onClose} title="Trợ lý BAOR AI" width={420}>
      <div className="flex h-full flex-col">
        <div className="flex items-start gap-2.5 border-b border-border px-4 py-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-violet-soft text-violet"><Sparkles size={16} aria-hidden /></span>
          <p className="text-[13px] text-ink">{assistantGreeting}</p>
        </div>
        <div className="flex flex-wrap gap-1.5 border-b border-border px-4 py-3">
          {assistantSuggestions.map((s) => (
            <button key={s} type="button" onClick={() => send(s)} className="cursor-pointer rounded-full border border-border-2 bg-surface px-2.5 py-1 text-[12px] text-ink hover:border-ink-3">
              {s}
            </button>
          ))}
        </div>
        <div className="flex flex-1 flex-col gap-2 overflow-y-auto bg-ground px-4 py-3" aria-live="polite">
          {messages.map((m) => (
            <div key={m.id} className={cn("max-w-[85%] rounded-[14px] px-3 py-2 text-[12.5px] leading-relaxed", m.from === "user" ? "self-end rounded-br-[4px] bg-jade text-white" : "self-start rounded-bl-[4px] bg-violet-soft text-ink")}>
              {m.text}
              <div className={cn("num mt-0.5 text-[10px]", m.from === "user" ? "text-white/70" : "text-ink-3")}>{formatTime(m.at)}</div>
            </div>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(text);
          }}
          className="flex gap-2 border-t border-border px-3 py-2.5"
        >
          <label className="sr-only" htmlFor="assistant-input">Nhập yêu cầu</label>
          <input id="assistant-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Nhập yêu cầu cho trợ lý…" className="h-9 flex-1 rounded-full border border-border-2 bg-surface px-3 text-[13px] text-ink outline-none focus-visible:outline-2 focus-visible:outline-jade" />
          <button type="submit" aria-label="Gửi" className="grid h-9 w-9 cursor-pointer place-items-center rounded-full bg-jade text-white hover:bg-jade-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jade">
            <Send size={16} />
          </button>
        </form>
      </div>
    </Drawer>
  );
}
