import { cn } from "@/lib/format";

export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto scroll-thin", className)}>
      <table className="w-full border-collapse text-[12.5px]">{children}</table>
    </div>
  );
}

export function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        "eyebrow border-b border-border px-2.5 py-2 text-left font-semibold first:pl-0 last:pr-0",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <td
      className={cn(
        "border-b border-border/70 px-2.5 py-2 align-top first:pl-0 last:pr-0",
        className,
      )}
    >
      {children}
    </td>
  );
}
