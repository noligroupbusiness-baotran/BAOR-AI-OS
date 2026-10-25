import { cookies } from "next/headers";
import { MFA_COOKIE, MFA_TTL_SECONDS, SESSION_COOKIE, SESSION_TTL_SECONDS, createMfaToken, createSessionToken, verifyMfaToken, verifySessionToken } from "@/lib/session-token";
import { sessionVersionFor } from "@/lib/security";

// Tài khoản quản trị đọc từ biến môi trường (.env.local): ADMIN_EMAIL, ADMIN_PASSWORD.
// Không có giá trị mặc định trong mã nguồn để tránh lộ thông tin đăng nhập trên git.
// Token ký/kiểm ở src/lib/session-token.ts (proxy dùng); tệp này thêm cookie và kiểm tra thu hồi phiên.
export { SESSION_COOKIE, MFA_COOKIE, createSessionToken, verifySessionToken } from "@/lib/session-token";

const secure = process.env.NODE_ENV === "production";

export async function setSessionCookie(token: string) {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: SESSION_TTL_SECONDS });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** Cấp phiên đầy đủ cho email (sau khi đã qua mật khẩu và, nếu bật, mã xác thực hai lớp). */
export async function issueSession(email: string) {
  await setSessionCookie(await createSessionToken(email, sessionVersionFor(email)));
}

/**
 * Người đang đăng nhập. Ngoài chữ ký và hạn, còn so "phiên bản phiên" với CSDL:
 * đổi mật khẩu hoặc bấm "Đăng xuất mọi thiết bị" làm mọi cookie cũ hết hiệu lực ngay.
 */
export async function getCurrentUser(): Promise<{ email: string } | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const claims = await verifySessionToken(token);
  if (!claims) return null;
  if (claims.sv !== sessionVersionFor(claims.email)) return null;
  return { email: claims.email };
}

// Bước hai của đăng nhập (xác thực hai lớp): cookie tạm 5 phút, chỉ dùng ở /login/verify.
export async function setMfaCookie(email: string, ip: string) {
  const store = await cookies();
  store.set(MFA_COOKIE, await createMfaToken(email, ip), { httpOnly: true, sameSite: "lax", secure, path: "/login", maxAge: MFA_TTL_SECONDS });
}

export async function clearMfaCookie() {
  const store = await cookies();
  store.delete({ name: MFA_COOKIE, path: "/login" });
}

export async function getPendingMfa(): Promise<{ email: string; ip: string } | null> {
  const store = await cookies();
  const token = store.get(MFA_COOKIE)?.value;
  return token ? verifyMfaToken(token) : null;
}
