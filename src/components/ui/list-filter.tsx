"use client";

import { useId, useState } from "react";
import { Search } from "lucide-react";

// Ô lọc nhanh cho danh sách dài, chạy ngay trong trình duyệt: ẩn các dòng không khớp.
// Dòng cần lọc mang thuộc tính data-search="chuỗi để so" và nằm trong phần tử có id = target.
// Không đụng dữ liệu máy chủ, không đổi URL; dùng cho danh mục vài chục tới vài trăm dòng.
const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d");

export function ListFilter({ target, placeholder = "Lọc nhanh…", className }: { target: string; placeholder?: string; className?: string }) {
  const [q, setQ] = useState("");
  const [hidden, setHidden] = useState(0);
  const id = useId();
  const apply = (value: string) => {
    setQ(value);
    const root = document.getElementById(target);
    if (!root) return;
    const needle = normalize(value.trim());
    let n = 0;
    root.querySelectorAll<HTMLElement>("[data-search]").forEach((el) => {
      const hit = !needle || normalize(el.dataset.search ?? "").includes(needle);
      el.hidden = !hit;
      if (!hit) n++;
    });
    setHidden(n);
  };
  return (
    <label htmlFor={id} className={`relative block ${className ?? ""}`}>
      <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden />
      <input id={id} type="search" value={q} onChange={(e) => apply(e.target.value)} placeholder={placeholder} className="h-7 w-[200px] rounded-full border border-border-2 bg-surface pl-7 pr-2.5 text-[12px] text-ink outline-none placeholder:text-ink-3 focus-visible:outline-2 focus-visible:outline-jade" />
      {q && hidden > 0 && <span className="sr-only">Đã ẩn {hidden} dòng không khớp</span>}
    </label>
  );
}
