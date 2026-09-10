export function EmptyState({ emoji = "🍃", title, hint }: { emoji?: string; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[var(--radius)] border border-dashed border-border-strong px-4 py-10 text-center">
      <div className="text-2xl">{emoji}</div>
      <div className="mt-2 text-[13px] font-semibold text-ink">{title}</div>
      {hint && <div className="mt-1 max-w-sm text-[12px] text-muted">{hint}</div>}
    </div>
  );
}
