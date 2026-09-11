import { redirect } from "next/navigation";
import { ShieldCheck, Workflow, BarChart3 } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getBrandLogos } from "@/lib/brand-logos";
import { BrandMark } from "@/components/shell/brand-mark";
import { LoginForm } from "./login-form";

// Trang đăng nhập: hai cột. Trái là mảng thương hiệu nền xanh đen (luôn tối, không đổi theo chế độ màu),
// phải là biểu mẫu trên nền giao diện. Trên điện thoại chỉ còn một cột với logo phía trên.
export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");
  const logos = getBrandLogos();
  const year = new Date().getFullYear();
  const points = [
    { icon: Workflow, title: "Một nơi điều phối mọi kênh", text: "Chiến dịch đặt mục tiêu; nội dung, video, quảng cáo, khách hàng đều bám theo." },
    { icon: ShieldCheck, title: "AI đề xuất, người quyết định", text: "Không có bài đăng hay đồng chi phí nào chạy khi chưa được phê duyệt." },
    { icon: BarChart3, title: "Số liệu thật, kết quả rõ", text: "Lead, đơn hàng, chi phí quy về từng chiến dịch và từng kênh." },
  ];

  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-[#0f1a14] px-12 py-10 text-[#e8ebe8] lg:flex">
        <div className="pointer-events-none absolute -left-24 -top-24 h-[420px] w-[420px] rounded-full bg-[#1e7a4b]/25 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-32 -right-16 h-[360px] w-[360px] rounded-full bg-[#b7791f]/15 blur-3xl" aria-hidden />
        <div className="relative">
          {logos.dark ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logos.dark} alt="BAOR" className="h-9 w-auto" />
          ) : (
            <div className="text-[20px] font-bold tracking-tight">BAOR AI OS</div>
          )}
          <div className="mt-2 text-[11px] font-medium uppercase tracking-[0.22em] text-[#b8a271]">Marketing Automation System</div>
        </div>
        <div className="relative max-w-[440px]">
          <h2 className="text-[30px] font-bold leading-[1.15] tracking-[-0.01em] text-white">Hệ điều hành marketing cho đội ngũ của bạn</h2>
          <p className="mt-3 text-[14px] leading-relaxed text-[#aab2ab]">Từ nghiên cứu khách hàng đến đăng bài, quảng cáo và chăm sóc lead, tất cả chạy trên một luồng dữ liệu và một quy trình phê duyệt.</p>
          <ul className="mt-8 grid gap-4">
            {points.map((p) => {
              const Icon = p.icon;
              return (
                <li key={p.title} className="flex gap-3.5">
                  <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/5 text-[#c9b07a]"><Icon size={17} aria-hidden /></span>
                  <div>
                    <div className="text-[13.5px] font-semibold text-white">{p.title}</div>
                    <div className="mt-0.5 text-[12.5px] leading-relaxed text-[#aab2ab]">{p.text}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="relative flex items-center justify-between text-[11.5px] text-[#8a928b]">
          <span>© {year} BAOR.vn</span>
          <span>Research · Reach · Result</span>
        </div>
      </aside>

      <main className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-[400px]">
          <div className="mb-6 lg:hidden">
            <BrandMark logos={logos} />
          </div>
          <h1 className="text-[22px] font-bold tracking-[-0.01em] text-ink">Đăng nhập</h1>
          <p className="mt-1.5 text-[13px] text-ink-2">Dùng email và mật khẩu do quản trị cấp. Tài khoản chưa được cấp quyền sẽ không vào được.</p>
          <div className="card mt-6 p-6">
            <LoginForm />
          </div>
          <p className="mt-5 text-[12px] leading-relaxed text-ink-3">
            Quên mật khẩu? Liên hệ quản trị viên để đặt lại trong Cài đặt › Nhân sự. Đăng nhập sai nhiều lần sẽ bị khóa tạm 15 phút.
          </p>
        </div>
      </main>
    </div>
  );
}
