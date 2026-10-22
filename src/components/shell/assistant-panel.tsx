"use client";

import { useActionState, useEffect, useRef } from "react";
import { Send, Sparkles } from "lucide-react";
import { Drawer } from "@/components/ui/dialog";
import { Pill } from "@/components/ui/pill";
import { askAssistant, type AssistantState } from "@/lib/actions/assistant";
import { formatTime, cn } from "@/lib/format";

const suggestions = ["Hôm nay có việc gì cần duyệt?", "Chiến dịch nào đang chậm tiến độ?", "Có lỗi gì trong hệ thống không?", "Hôm nay có bao nhiêu lead mới?", "Doanh thu đến giờ bao nhiêu?"];

// Trợ lý AI: câu hỏi vận hành quen thuộc trả lời từ dữ liệu (làn luật); câu khác gọi Claude với ngữ cảnh hệ thống.
export function AssistantPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [state, formAction, pending] = useActionState<AssistantState, FormData>(askAssistant, { messages: [] });
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
    if (!pending && inputRef.current) inputRef.current.value = "";
  }, [state.messages.length, pending]);

  const ask = (q: string) => {
    if (!inputRef.current || !formRef.current) return;
    inputRef.current.value = q;
    formRef.current.requestSubmit();
  };

  return (
    <Drawer open={open} onClose={onClose} title="Trợ lý BAOR AI" width={440}>
      <div className="flex h-full flex-col">
        <div className="flex items-start gap-2.5 border-b border-border px-4 py-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-violet-soft text-violet"><Sparkles size={16} aria-hidden /></span>
          <p className="text-[13px] text-ink">Hỏi về việc cần duyệt, tiến độ chiến dịch, lead, doanh thu, lỗi hệ thống. Câu quen thuộc trả lời ngay từ dữ liệu; câu khác dùng AI có ghi sổ chi phí.</p>
        </div>
        <div className="flex flex-wrap gap-1.5 border-b border-border px-4 py-3">
          {suggestions.map((s) => (
            <button key={s} type="button" onClick={() => ask(s)} disabled={pending} className="cursor-pointer rounded-full border border-border-2 bg-surface px-2.5 py-1 text-[12px] text-ink hover:border-ink-3 disabled:opacity-50">
              {s}
            </button>
          ))}
        </div>
        <div className="flex flex-1 flex-col gap-2 overflow-y-auto bg-ground px-4 py-3" aria-live="polite">
          {state.messages.length === 0 && <p className="text-[12.5px] text-ink-3">Chưa có hội thoại. Chọn một câu gợi ý hoặc nhập câu hỏi.</p>}
          {state.messages.map((m) => (
            <div key={m.id} className={cn("max-w-[88%] whitespace-pre-line rounded-[14px] px-3 py-2 text-[12.5px] leading-relaxed", m.from === "user" ? "self-end rounded-br-[4px] bg-jade text-white" : "self-start rounded-bl-[4px] bg-surface text-ink border border-border")}>
              {m.text}
              <div className={cn("mt-1 flex flex-wrap items-center gap-1.5 text-[10px]", m.from === "user" ? "text-white/70" : "text-ink-3")}>
                <span className="num">{formatTime(m.at)}</span>
                {m.lane && <Pill tone={m.lane === "ai" ? "amber" : "jade"} className="h-4 px-1.5 text-[9.5px]">{m.lane === "ai" ? "AI, cần kiểm tra" : "Từ dữ liệu"}</Pill>}
                {m.sources?.length ? <span>Nguồn: {m.sources.join(", ")}</span> : null}
              </div>
            </div>
          ))}
          {pending && <div className="self-start rounded-[14px] border border-border bg-surface px-3 py-2 text-[12.5px] text-ink-2">Đang trả lời…</div>}
          {state.error && <div className="rounded-md bg-brick-soft px-3 py-2 text-[12px] text-brick">{state.error}</div>}
          <div ref={endRef} />
        </div>
        <form ref={formRef} action={formAction} className="flex gap-2 border-t border-border px-3 py-2.5">
          <label className="sr-only" htmlFor="assistant-input">Nhập câu hỏi</label>
          <input ref={inputRef} id="assistant-input" name="q" placeholder="Nhập câu hỏi…" disabled={pending} className="h-9 flex-1 rounded-full border border-border-2 bg-surface px-3 text-[13px] text-ink outline-none focus-visible:outline-2 focus-visible:outline-jade disabled:opacity-60" />
          <button type="submit" aria-label="Gửi" disabled={pending} className="grid h-9 w-9 cursor-pointer place-items-center rounded-full bg-jade text-white hover:bg-jade-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jade disabled:opacity-50">
            <Send size={16} />
          </button>
        </form>
      </div>
    </Drawer>
  );
}
