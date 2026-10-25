"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

// Nút gửi biểu mẫu tự khóa khi đang xử lý, để bấm nhiều lần không tạo thao tác lặp.
// (Máy chủ còn kiểm tra thêm bằng idem key.)
export function SubmitButton({ children, pendingText, variant = "primary", size = "sm", className, name, value, disabled, title }: { children: React.ReactNode; pendingText?: string; variant?: "primary" | "outline" | "soft" | "ghost"; size?: "sm" | "md"; className?: string; name?: string; value?: string; disabled?: boolean; title?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size={size} className={className} name={name} value={value} disabled={pending || disabled} aria-busy={pending} title={title}>
      {pending ? (pendingText ?? "Đang xử lý…") : children}
    </Button>
  );
}
