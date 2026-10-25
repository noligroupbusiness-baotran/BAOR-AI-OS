import Link from "next/link";
import { KeyRound } from "lucide-react";
import type { AiReadiness } from "@/lib/ai";

// Nhãn ngắn khi nút AI không gọi được ("Thiếu khoá ChatGPT", "AI đang tắt"…): bấm mở Cài đặt › Đội AI; lý do đầy đủ ở tooltip.
export function AiBlocked({ ready }: { ready: AiReadiness }) {
  if (ready.ok) return null;
  return (
    <Link href={ready.href} title={ready.reason} aria-label={`${ready.label} — mở Cài đặt › Đội AI`} className="inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-amber-soft px-2 text-[11px] font-semibold text-amber hover:underline">
      <KeyRound size={11} aria-hidden />
      {ready.label}
    </Link>
  );
}
