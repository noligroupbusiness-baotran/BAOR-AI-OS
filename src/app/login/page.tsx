import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-[380px]">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-[16px] font-black text-white shadow">
            B
          </div>
          <div>
            <div className="text-[16px] font-bold text-ink">BAOR AI OS</div>
            <div className="text-[12px] text-muted">Trung tâm điều hành marketing cho fanpage</div>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-[0_8px_30px_rgba(30,30,20,0.06)]">
          <h1 className="text-[15px] font-bold text-ink">Đăng nhập quản trị</h1>
          <p className="mt-1 text-[12px] text-muted">
            Chỉ chủ fanpage mới có quyền truy cập. Phiên đăng nhập kéo dài 7 ngày.
          </p>
          <LoginForm />
        </div>
        <p className="mt-4 text-center text-[11px] text-faint">
          Research → Insight → Nội dung → Đăng bài → Quảng cáo → Khách hàng → Email
        </p>
      </div>
    </div>
  );
}
