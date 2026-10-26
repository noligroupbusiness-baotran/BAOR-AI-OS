"use client";

import { usePathname } from "next/navigation";
import { findMenuByPath } from "@/config/menu";
import { IconChip } from "@/components/ui/icon-chip";

// Icon chip màu theo nhóm chức năng của trang đang mở (lấy từ menu), đặt cạnh tiêu đề trang.
export function PageIcon({ className }: { className?: string }) {
  const m = findMenuByPath(usePathname());
  if (!m) return null;
  return <IconChip icon={m.icon} tone={m.tone} size="lg" className={className} />;
}
