import { cn } from "@/lib/format";

// Công tắc gửi biểu mẫu ngay khi gạt (form chứa action bật / tắt): một nút submit có vai trò switch.
export function SwitchSubmit({ on, label, className }: { on: boolean; label: string; className?: string }) {
  return (
    <button
      type="submit"
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={label}
      className={cn("relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jade", on ? "bg-jade" : "bg-border-2", className)}
    >
      <span className={cn("inline-block h-4 w-4 rounded-full bg-white shadow transition-transform", on ? "translate-x-[18px]" : "translate-x-[2px]")} />
    </button>
  );
}
