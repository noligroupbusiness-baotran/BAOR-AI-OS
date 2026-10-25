"use client";

import { useEffect, useRef } from "react";

// Số liệu đếm lên khi trang mở. Máy chủ và lần vẽ đầu luôn có số cuối (không trống, không nháy); hiệu ứng chỉ chạy
// phía trình duyệt, chỉ với chuỗi có ĐÚNG một cụm số nguyên (vd "23", "58.000.000 ₫"), bỏ qua "0/6", ngày giờ, số thập phân.
// Khung rộng giữ bằng số cuối (chữ ẩn) nên không xô bố cục. Tắt khi prefers-reduced-motion.
const ONE_INT = /^(\D*?)(\d{1,3}(?:\.\d{3})+|\d+)(\D*)$/;

export function CountUp({ value, duration = 900 }: { value: string | number; duration?: number }) {
  const text = String(value);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    const m = ONE_INT.exec(text);
    if (!el || !m || m[3].startsWith(",")) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const [, pre, digits, post] = m;
    const target = Number(digits.replace(/\./g, ""));
    if (!Number.isFinite(target) || target === 0) return;
    const grouped = digits.includes(".");
    const fmt = (n: number) => pre + (grouped ? n.toLocaleString("vi-VN") : String(n)) + post;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      if (el.isConnected) el.textContent = text;
    };
  }, [text, duration]);

  return (
    <span className="relative inline-block">
      <span className="invisible whitespace-nowrap" aria-hidden>{text}</span>
      {/* key: đổi số thì React tạo nút mới, không cập nhật nút chữ đã bị hiệu ứng thay */}
      <span key={text} ref={ref} className="absolute inset-0 whitespace-nowrap">{text}</span>
    </span>
  );
}
