import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, createSessionToken, verifySessionToken } from "@/lib/session-token";

// Chỉ khi chạy `next dev` và đặt DEV_AUTO_LOGIN_EMAIL trong .env.local: tự cấp phiên cho email đó,
// để mở trang là vào thẳng quản trị. Bản build production bỏ qua hoàn toàn dù biến có được đặt.
const DEV_AUTO_LOGIN = process.env.NODE_ENV === "development" ? (process.env.DEV_AUTO_LOGIN_EMAIL ?? "").trim().toLowerCase() : "";

// Bảo vệ toàn bộ trang quản trị: chưa đăng nhập thì chuyển về /login.
// Ở đây chỉ kiểm chữ ký và hạn của cookie (rẻ, không đụng CSDL); kiểm tra thu hồi phiên
// (đổi mật khẩu, đăng xuất mọi thiết bị) nằm ở getCurrentUser trong từng trang / API.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api/")) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const user = token ? await verifySessionToken(token) : null;
  if (!user && DEV_AUTO_LOGIN) {
    const url = request.nextUrl.clone();
    if (pathname.startsWith("/login")) url.pathname = "/dashboard";
    const res = NextResponse.redirect(url);
    res.cookies.set(SESSION_COOKIE, await createSessionToken(DEV_AUTO_LOGIN), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7 });
    return res;
  }
  if (pathname === "/login" || pathname.startsWith("/login/")) return NextResponse.next();
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // api/video-sources và api/video-assets nhận tệp lớn dạng luồng: loại khỏi proxy để Next không đệm thân yêu cầu
  // (giới hạn đệm 10 MB sẽ cắt cụt tệp). Route tự kiểm đăng nhập và nguồn yêu cầu.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/video-sources|api/video-assets|.*\\.(?:svg|png|jpg|jpeg|ico|webp)).*)"],
};
