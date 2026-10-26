"use client";

import { useFormStatus } from "react-dom";
import type { LucideIcon } from "lucide-react";
import { Button, type ButtonVariant } from "@/components/ui/button";

// Nút gửi biểu mẫu tự khóa khi đang xử lý (kèm vòng xoay + pendingText), để bấm nhiều lần không tạo thao tác lặp.
// (Máy chủ còn kiểm tra thêm bằng idem key.)
export function SubmitButton({
  children,
  pendingText,
  variant = "primary",
  size = "sm",
  icon,
  className,
  name,
  value,
  disabled,
  title,
}: {
  children: React.ReactNode;
  pendingText?: string;
  variant?: ButtonVariant;
  size?: "sm" | "md";
  icon?: LucideIcon;
  className?: string;
  name?: string;
  value?: string;
  disabled?: boolean;
  title?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size={size} icon={icon} loading={pending} className={className} name={name} value={value} disabled={disabled} title={title}>
      {pending ? (pendingText ?? "Đang xử lý…") : children}
    </Button>
  );
}
