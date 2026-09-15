import { redirect } from "next/navigation";
import { getCurrentUser, getPendingMfa } from "@/lib/auth";
import { getBrandLogos } from "@/lib/brand-logos";
import { BrandMark } from "@/components/shell/brand-mark";
import { VerifyForm } from "./verify-form";

export const metadata = { title: "Xác thực hai lớp – BAOR AI OS" };

// Bước hai của đăng nhập: chỉ vào được khi đã qua mật khẩu (cookie tạm 5 phút).
export default async function VerifyPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  const pending = await getPendingMfa();
  if (!pending) redirect("/login");
  const logos = getBrandLogos();
  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-6">
          <BrandMark logos={logos} />
        </div>
        <h1 className="text-[22px] font-bold tracking-[-0.01em] text-ink">Xác thực hai lớp</h1>
        <p className="mt-1.5 text-[13px] text-ink-2">
          Mở ứng dụng xác thực trên điện thoại và nhập mã 6 số cho tài khoản <span className="font-medium text-ink">{pending.email}</span>. Không có điện thoại thì dùng một mã dự phòng.
        </p>
        <div className="card mt-6 p-6">
          <VerifyForm />
        </div>
        <p className="mt-5 text-[12px] leading-relaxed text-ink-3">Mã có hiệu lực 5 phút kể từ khi nhập mật khẩu. Mất cả điện thoại lẫn mã dự phòng thì liên hệ quản trị viên.</p>
      </div>
    </main>
  );
}
