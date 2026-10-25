import Link from "next/link";
import { SearchX } from "lucide-react";

// 404 trong khu quản trị: giữ sidebar và topbar, ví dụ mở chiến dịch/khách hàng đã bị xóa.
export default function AdminNotFound() {
  return (
    <div className="card flex flex-col items-center gap-2 px-4 py-12 text-center">
      <span className="grid h-10 w-10 place-items-center rounded-full bg-amber-soft text-amber"><SearchX size={18} aria-hidden /></span>
      <div className="text-[14px] font-bold text-ink">Không tìm thấy mục này</div>
      <p className="max-w-[48ch] text-[12.5px] text-ink-2">Mục bạn mở không tồn tại hoặc đã bị xóa. Nếu đi từ một liên kết cũ, hãy tìm lại bằng ô tìm kiếm phía trên.</p>
      <div className="mt-1 flex gap-2">
        <Link href="/dashboard" className="inline-flex h-8 items-center rounded-full bg-jade px-4 text-[12.5px] font-semibold text-white hover:bg-jade-2">Về Điều hành</Link>
        <Link href="/campaigns" className="inline-flex h-8 items-center rounded-full border border-border-2 px-4 text-[12.5px] font-semibold text-ink hover:bg-ground">Danh sách chiến dịch</Link>
      </div>
    </div>
  );
}
