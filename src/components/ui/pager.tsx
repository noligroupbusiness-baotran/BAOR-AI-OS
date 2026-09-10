import Link from "next/link";
import { cn } from "@/lib/format";

// Phân trang đơn giản bằng tham số URL ?page=N (biểu mẫu GET, chia sẻ được liên kết).
export const PAGE_SIZE = 25;

export function paginate<T>(list: T[], pageRaw: string | undefined, size = PAGE_SIZE): { items: T[]; page: number; pages: number; total: number } {
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const page = Math.min(pages, Math.max(1, Number(pageRaw) || 1));
  return { items: list.slice((page - 1) * size, page * size), page, pages, total };
}

export function Pager({ page, pages, total, hrefFor, label = "mục" }: { page: number; pages: number; total: number; hrefFor: (p: number) => string; label?: string }) {
  if (pages <= 1) return null;
  const btn = "inline-flex h-7 items-center rounded-full border border-border-2 px-2.5 text-[12px] font-medium text-ink hover:border-ink-3";
  return (
    <nav aria-label="Phân trang" className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2.5 text-[12px] text-ink-2">
      <span className="num">Trang {page}/{pages} · {total} {label}</span>
      <div className="flex gap-1.5">
        <Link href={hrefFor(Math.max(1, page - 1))} aria-disabled={page === 1} className={cn(btn, page === 1 && "pointer-events-none opacity-40")}>Trước</Link>
        <Link href={hrefFor(Math.min(pages, page + 1))} aria-disabled={page === pages} className={cn(btn, page === pages && "pointer-events-none opacity-40")}>Sau</Link>
      </div>
    </nav>
  );
}
