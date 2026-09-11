"use client";

import { useSyncExternalStore } from "react";
import { CAPTION_LIMITS, captionCheck, scriptCheck, SCRIPT_SCENES } from "@/lib/content/formats";
import { cn } from "@/lib/format";

// Trợ giúp theo định dạng, chạy ngay trong trình duyệt, theo luật (đếm ký tự, hashtag, cảnh).
// Đọc trực tiếp textarea "draft" trong cùng biểu mẫu để không cần đồng bộ state.

function useDraft(formId: string) {
  return useSyncExternalStore(
    (cb) => {
      const ta = document.getElementById(formId)?.querySelector<HTMLTextAreaElement>("textarea[name=draft]");
      if (!ta) return () => {};
      ta.addEventListener("input", cb);
      // Đọc giá trị ban đầu sau khi textarea đã gắn (defaultValue từ máy chủ).
      queueMicrotask(cb);
      return () => ta.removeEventListener("input", cb);
    },
    () => document.getElementById(formId)?.querySelector<HTMLTextAreaElement>("textarea[name=draft]")?.value ?? "",
    () => "",
  );
}

export function CaptionHelper({ formId }: { formId: string }) {
  const text = useDraft(formId);
  const c = captionCheck(text);
  return (
    <div className="rounded-md border border-border bg-ground px-3 py-2 text-[12px]">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-ink-2">
        <span><span className="num font-semibold text-ink">{c.chars}</span> ký tự</span>
        <span><span className="num font-semibold text-ink">{c.words}</span> từ</span>
        <span><span className="num font-semibold text-ink">{c.hashtags.length}</span> hashtag</span>
        <span className={c.hasCta ? "text-jade" : "text-amber"}>{c.hasCta ? "Có kêu gọi hành động" : "Chưa có kêu gọi hành động"}</span>
        <span className={c.firstLine.length > 125 ? "text-amber" : "text-ink-2"}>Câu đầu {c.firstLine.length}/125 ký tự</span>
      </div>
      {c.warnings.length > 0 && (
        <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-amber">
          {c.warnings.map((w) => <li key={w}>{w}</li>)}
        </ul>
      )}
      <div className="mt-1.5 flex flex-wrap gap-x-3 text-[11px] text-ink-3">
        {CAPTION_LIMITS.map((l) => (
          <span key={l.platform} className={cn(c.chars > l.maxChars && "text-brick")}>{l.label}: tối đa {l.maxChars.toLocaleString("vi-VN")} ký tự, {l.maxHashtags} hashtag</span>
        ))}
      </div>
    </div>
  );
}

export function ScriptHelper({ formId }: { formId: string }) {
  const text = useDraft(formId);
  const c = scriptCheck(text);
  return (
    <div className="rounded-md border border-border bg-ground px-3 py-2 text-[12px]">
      <div className="flex flex-wrap gap-1.5">
        {c.scenes.map((s, i) => {
          const def = SCRIPT_SCENES[i];
          return (
            <span key={s.name} title={`${def.seconds}: ${def.goal}`} className={cn("rounded-full border px-2 py-0.5", s.present ? "border-jade/40 bg-jade-soft text-jade-ink" : "border-border-2 text-ink-3")}>
              {i + 1}. {s.name} <span className="num text-[10.5px]">{def.seconds}</span>
            </span>
          );
        })}
      </div>
      <div className={cn("mt-1.5", c.missing.length ? "text-amber" : "text-jade")}>
        {c.missing.length ? `Còn thiếu cảnh: ${c.missing.join(", ")}.` : c.hasSpeech ? "Đủ 5 cảnh và đã có lời thoại." : "Đủ 5 cảnh, chưa điền lời thoại."}
      </div>
    </div>
  );
}
