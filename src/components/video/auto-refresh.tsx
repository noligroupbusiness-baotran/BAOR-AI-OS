"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Làm mới trang định kỳ khi còn video đang dựng, để thanh tiến độ tự chạy mà không cần bấm.
// Không làm mới khi người xem đang xem toàn màn hình hoặc đang phát video (làm mới sẽ thoát toàn màn hình).
export function AutoRefresh({ active, everyMs = 4000 }: { active: boolean; everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => {
      if (document.fullscreenElement || document.hidden || document.querySelector("[data-video-viewer]")) return;
      const playing = Array.from(document.querySelectorAll("video")).some((v) => !v.paused && !v.ended);
      if (playing) return;
      router.refresh();
    }, everyMs);
    return () => clearInterval(t);
  }, [active, everyMs, router]);
  return null;
}
