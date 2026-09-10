import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-[380px]">
        <div className="mb-5 flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-jade text-[15px] font-bold text-white">B</div>
          <div className="leading-tight">
            <div className="text-[15px] font-bold text-ink">BAOR AI OS</div>
            <div className="text-[12px] text-ink-2">Marketing cho fanpage</div>
          </div>
        </div>
        <div className="card p-6">
          <h1 className="text-[15px] font-bold text-ink">Đăng nhập quản trị</h1>
          <p className="mt-1 text-[12px] text-ink-2">Chỉ chủ fanpage mới có quyền truy cập.</p>
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
