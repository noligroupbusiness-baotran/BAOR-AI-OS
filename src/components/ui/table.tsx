import { cn } from "@/lib/format";

export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">{children}</table>
    </div>
  );
}
export function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return <th className={cn("lbl border-b border-border px-4 py-2 font-semibold", right ? "text-right" : "text-left")}>{children}</th>;
}
export function Td({ children, right, className }: { children?: React.ReactNode; right?: boolean; className?: string }) {
  return <td className={cn("border-b border-border px-4 py-2.5 align-top [tr:last-child_&]:border-b-0", right && "text-right", className)}>{children}</td>;
}
