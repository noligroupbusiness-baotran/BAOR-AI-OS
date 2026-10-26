"use client";

import { useState } from "react";
import { inputClass } from "./field";
import { cn } from "@/lib/format";

// Ô trần chi phí AI nhập bằng đô ($), dòng nhỏ bên dưới quy ra đồng theo tỷ giá đang dùng (OWNER 26/10: "đổi thành $ đi,
// ở dưới sẽ là việt nam đồng"). Máy chủ vẫn lưu ₫: ô ẩn mang số đồng đã quy đổi, nên action / CSDL không đổi.
// Số 0 / trống → hiện emptyHint (vd "0 = trần chung").

/** "5" / "5.5" / "5,5" / "$5" → số đô; "1.000" / "1,000,000" là phân cách hàng nghìn; không hợp lệ → 0. */
export function parseUsd(raw: string): number {
  const t = raw.replace(/[^\d.,]/g, "");
  const v = Number(/^\d{1,3}([.,]\d{3})+$/.test(t) ? t.replace(/[.,]/g, "") : t.replace(",", "."));
  return Number.isFinite(v) && v > 0 ? v : 0;
}

export function usdToVnd(raw: string, rate: number): number {
  return rate > 0 ? Math.round(parseUsd(raw) * rate) : 0;
}

/** Số đồng đang lưu → chuỗi đô hiện trong ô (bỏ số 0 thừa). */
export function vndToUsdText(vnd: number, rate: number): string {
  if (!vnd || !(rate > 0)) return "0";
  return String(Math.round((vnd / rate) * 100) / 100);
}

export function vndHint(raw: string, rate: number): string | null {
  const vnd = usdToVnd(raw, rate);
  return vnd ? `≈ ${vnd.toLocaleString("vi-VN")} ₫` : null;
}

/** Trần trên một ô (khớp kiểm ở máy chủ MAX_AI_CAP_VND): quá ngưỡng này gần như chắc là gõ nhầm số đồng vào ô đô. */
export const WARN_USD = 1000;

export function VndCapInput({ name, defaultValue, rate, emptyHint, className }: { name: string; defaultValue: number; rate: number; emptyHint?: string; className?: string }) {
  const initial = vndToUsdText(defaultValue, rate);
  const [value, setValue] = useState(initial);
  // Không sửa ô → gửi lại đúng số đồng đang lưu (đô làm tròn 2 số lẻ, quy ngược có thể lệch vài trăm đồng)
  const vnd = value === initial ? defaultValue || 0 : usdToVnd(value, rate);
  const hint = vnd ? `≈ ${vnd.toLocaleString("vi-VN")} ₫` : emptyHint;
  const tooBig = value !== initial && parseUsd(value) > WARN_USD;
  return (
    <>
      <div className="relative">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] text-ink-3">$</span>
        <input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} className={cn(inputClass, "pl-6", className)} />
        <input type="hidden" name={name} value={vnd} />
      </div>
      {hint && (
        <span className={cn("num mt-1 block text-[11.5px]", tooBig ? "font-semibold text-amber" : "text-ink-3")} aria-live="polite">
          {tooBig ? `${hint} — ô nhập bằng $, kiểm lại` : hint}
        </span>
      )}
    </>
  );
}
