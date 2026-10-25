"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/format";

// Ô giờ đăng điền sẵn khung giờ vàng gần nhất + nút giờ gợi ý (bấm là điền). Vẫn chọn tay được.
export function WhenPicker({ suggestions, source }: { suggestions: { value: string; label: string }[]; source: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(suggestions[0]?.value ?? "");
  return (
    <div className="grid min-w-0 flex-1 gap-1.5">
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Giờ gợi ý" title={source}>
          {suggestions.map((s) => (
            <button
              key={s.value}
              type="button"
              aria-pressed={value === s.value}
              onClick={() => {
                setValue(s.value);
                input.current?.focus();
              }}
              className={cn("num h-7 cursor-pointer rounded-full border px-2.5 text-[12px] font-medium", value === s.value ? "border-jade bg-jade-soft text-jade-ink" : "border-border-2 text-ink-2 hover:border-ink-3 hover:text-ink")}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
      <input ref={input} type="datetime-local" name="when" required aria-label="Giờ đăng" value={value} onChange={(e) => setValue(e.target.value)} className="h-8 min-w-0 rounded-md border border-border-2 bg-surface px-2.5 text-[13px] text-ink" />
    </div>
  );
}
