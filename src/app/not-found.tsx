import Link from "next/link";

// Trang 404 chung (ngoài khu quản trị, ví dụ gõ sai địa chỉ). Trong khu quản trị dùng (admin)/not-found.tsx.
export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-[420px] p-6 text-center">
        <div className="num text-[28px] font-bold text-ink">404</div>
        <div className="mt-1 text-[14px] font-bold text-ink">Không tìm thấy trang</div>
        <p className="mt-1 text-[12.5px] text-ink-2">Địa chỉ không tồn tại hoặc đã được chuyển đi. Kiểm tra lại đường dẫn, hoặc quay về trang Điều hành.</p>
        <Link href="/dashboard" className="mt-4 inline-flex h-8 items-center rounded-full bg-jade px-4 text-[12.5px] font-semibold text-white hover:bg-jade-2">
          Về Điều hành
        </Link>
      </div>
    </div>
  );
}
