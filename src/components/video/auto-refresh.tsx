"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Làm mới trang định kỳ khi còn video đang dựng, để thanh tiến độ tự chạy mà không cần bấm.
export function AutoRefresh({ active, everyMs = 4000 }: { active: boolean; everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(t);
  }, [active, everyMs, router]);
  return null;
}
