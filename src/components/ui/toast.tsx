"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Thông báo ngắn sau mỗi hành động: đọc từ ?toast=..., hiện 3 giây rồi tự xóa khỏi URL.
export function Toast() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const msg = params.get("toast");
  const isError = params.get("tone") === "error";

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      next.delete("toast");
      next.delete("tone");
      const q = next.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    }, isError ? 6000 : 3200);
    return () => clearTimeout(t);
  }, [msg, isError, params, pathname, router]);

  if (!msg) return null;
  return (
    <div role={isError ? "alert" : "status"} className={`fixed bottom-5 left-1/2 z-50 max-w-[calc(100vw-32px)] -translate-x-1/2 rounded-full border px-4 py-2 text-[13px] font-medium text-white shadow-lg ${isError ? "border-brick bg-brick" : "border-jade-2 bg-jade"}`}>
      {msg}
    </div>
  );
}
