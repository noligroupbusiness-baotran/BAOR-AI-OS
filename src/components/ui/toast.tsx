"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Thông báo ngắn sau mỗi hành động: đọc từ ?toast=..., hiện 3 giây rồi tự xóa khỏi URL.
export function Toast() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const msg = params.get("toast");

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      next.delete("toast");
      const q = next.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    }, 3200);
    return () => clearTimeout(t);
  }, [msg, params, pathname, router]);

  if (!msg) return null;
  return (
    <div role="status" className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full border border-jade-2 bg-jade px-4 py-2 text-[13px] font-medium text-white shadow-lg">
      {msg}
    </div>
  );
}
