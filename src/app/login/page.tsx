import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BadgeCheck, CalendarClock, MessageSquareText, Sparkles } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Đăng nhập · BAOR AI OS",
};

const highlights = [
  { icon: Sparkles, title: "AI đề xuất và viết nội dung", desc: "Ý tưởng có điểm ưu tiên, nháp sẵn để bạn duyệt." },
  { icon: CalendarClock, title: "Tự động đăng bài đúng lịch", desc: "Lịch tuần, hàng đợi và kết quả từng bài." },
  { icon: MessageSquareText, title: "Kết nối khách hàng", desc: "Inbox, bình luận, lead và trả lời tự động." },
  { icon: BadgeCheck, title: "Bạn luôn là người duyệt cuối", desc: "Mọi khoản chi quảng cáo đều chờ bạn quyết." },
];

function Brand({ light = false }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`grid h-10 w-10 place-items-center rounded-xl text-[17px] font-bold ${
          light ? "bg-white text-jade" : "bg-jade text-white"
        }`}
      >
        B
      </div>
      <div className="leading-tight">
        <div className={`text-[16px] font-bold ${light ? "text-white" : "text-ink"}`}>BAOR AI OS</div>
        <div className={`text-[12px] ${light ? "text-white/75" : "text-ink-2"}`}>Marketing automation cho fanpage</div>
      </div>
    </div>
  );
}

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <main className="grid min-h-screen lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      {/* Bảng thương hiệu (ẩn trên mobile) */}
      <aside className="relative hidden overflow-hidden bg-jade-2 px-12 py-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(60% 50% at 20% 10%, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 60%), radial-gradient(50% 45% at 90% 90%, rgba(30,122,75,0.9) 0%, rgba(21,93,56,0) 60%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        <div className="relative">
          <Brand light />
        </div>

        <div className="relative max-w-[440px]">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/90">
            <span className="live !bg-white" /> Trung tâm điều hành
          </p>
          <h2 className="text-[30px] font-bold leading-[1.2] tracking-tight">
            Fanpage tự vận hành, <br /> bạn chỉ cần duyệt.
          </h2>
          <ul className="mt-8 space-y-4">
            {highlights.map(({ icon: Icon, title, desc }) => (
              <li key={title} className="flex gap-3">
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/12 ring-1 ring-white/20">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <div>
                  <div className="text-[14px] font-semibold">{title}</div>
                  <div className="text-[12.5px] text-white/70">{desc}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative text-[12px] text-white/60">mkt.baor.vn · Hệ thống nội bộ của chủ fanpage</div>
      </aside>

      {/* Cột form */}
      <section className="flex flex-col px-4 py-8 sm:px-8 lg:px-16">
        <div className="lg:hidden">
          <Brand />
        </div>

        <div className="flex flex-1 items-center justify-center py-8">
          <div className="w-full max-w-[400px]">
            <div className="card p-7 sm:p-8">
              <h1 className="text-[22px] font-bold tracking-tight text-ink">Đăng nhập quản trị</h1>
              <p className="mt-1.5 text-[13px] text-ink-2">Chỉ chủ fanpage mới có quyền truy cập hệ thống.</p>
              <LoginForm />
            </div>
            <p className="mt-5 text-center text-[12px] text-ink-3">
              Phiên đăng nhập được giữ 7 ngày trên thiết bị này.
            </p>
          </div>
        </div>

        <footer className="text-center text-[11.5px] text-ink-3 lg:text-left">© {new Date().getFullYear()} BAOR · mkt.baor.vn</footer>
      </section>
    </main>
  );
}
