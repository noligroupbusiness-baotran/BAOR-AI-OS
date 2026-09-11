import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, createSessionToken, verifySessionToken } from "@/lib/auth";

// Chỉ khi chạy `next dev` và đặt DEV_AUTO_LOGIN_EMAIL trong .env.local: tự cấp phiên cho email đó,
// để mở trang là vào thẳng quản trị. Bản build production bỏ qua hoàn toàn dù biến có được đặt.
const DEV_AUTO_LOGIN = process.env.NODE_ENV === "development" ? (process.env.DEV_AUTO_LOGIN_EMAIL ?? "").trim().toLowerCase() : "";

// Bảo vệ toàn bộ trang quản trị: chưa đăng nhập thì chuyển về /login.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api/")) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const user = token ? await verifySessionToken(token) : null;
  if (!user && DEV_AUTO_LOGIN) {
    const url = request.nextUrl.clone();
    if (pathname === "/login") url.pathname = "/dashboard";
    const res = NextResponse.redirect(url);
    res.cookies.set(SESSION_COOKIE, await createSessionToken(DEV_AUTO_LOGIN), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7 });
    return res;
  }
  if (pathname === "/login") return NextResponse.next();
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|ico|webp)).*)"],
};
