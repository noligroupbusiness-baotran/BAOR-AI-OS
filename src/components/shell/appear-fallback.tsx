"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Dự phòng cho hiệu ứng vào trang (.appear, globals.css): sau 2,4 s mỗi lần đổi trang, phần tử .appear nào đang hiển thị
// mà hiệu ứng vẫn chưa xong (tab nền bị trình duyệt hoãn, hiệu ứng kẹt) được thêm .is-in để chốt trạng thái cuối.
export function AppearFallback() {
  const pathname = usePathname();
  useEffect(() => {
    const t = setTimeout(() => {
      document.querySelectorAll<HTMLElement>(".appear:not(.is-in), .appear-kids > :not(.is-in)").forEach((el) => {
        if (!el.getClientRects().length) return; // đang ẩn (tab chưa chọn): để hiệu ứng chạy khi hiện
        const stuck = el.getAnimations().some((a) => a.playState !== "finished");
        if (stuck) el.classList.add("is-in");
      });
    }, 2400);
    return () => clearTimeout(t);
  }, [pathname]);
  return null;
}
