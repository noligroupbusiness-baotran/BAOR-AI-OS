export function PageHeader({
  emoji,
  title,
  subtitle,
  meta,
  actions,
}: {
  emoji?: string;
  title: string;
  subtitle?: string;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-[19px] font-bold tracking-tight text-ink">
          {emoji && <span aria-hidden>{emoji}</span>}
          {title}
        </h1>
        {subtitle && <p className="mt-1 max-w-3xl text-[12.5px] text-muted">{subtitle}</p>}
        {meta && <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-muted">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
