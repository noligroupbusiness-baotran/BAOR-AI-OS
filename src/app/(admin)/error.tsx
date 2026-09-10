"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card flex flex-col items-center gap-2 px-4 py-12 text-center">
      <span className="grid h-10 w-10 place-items-center rounded-full bg-brick-soft text-brick"><AlertTriangle size={18} aria-hidden /></span>
      <div className="text-[14px] font-bold text-ink">Trang này gặp lỗi</div>
      <p className="max-w-[48ch] text-[12.5px] text-ink-2">{error.message || "Đã xảy ra lỗi không mong muốn."} Bạn thử tải lại, nếu vẫn lỗi hãy xem Nhật ký hệ thống trong Cài đặt.</p>
      <Button variant="primary" onClick={reset}>Thử lại</Button>
    </div>
  );
}
