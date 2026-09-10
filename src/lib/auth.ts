import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

// Tài khoản quản trị đọc từ biến môi trường (.env.local): ADMIN_EMAIL, ADMIN_PASSWORD.
// Không có giá trị mặc định trong mã nguồn để tránh lộ thông tin đăng nhập trên git.
export const SESSION_COOKIE = "baor_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 ngày

function getSecret(): Uint8Array {
  // Chuỗi rỗng cũng coi như chưa đặt, tránh lỗi "zero-length key" khi ký cookie.
  const secret = process.env.AUTH_SECRET || "dev-secret-change-me-in-production";
  return new TextEncoder().encode(secret);
}

export function getAdminCredentials() {
  return {
    email: process.env.ADMIN_EMAIL ?? "",
    password: process.env.ADMIN_PASSWORD ?? "",
  };
}

// So sánh chuỗi theo thời gian cố định để tránh timing attack.
function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

export function verifyCredentials(email: string, password: string): boolean {
  const admin = getAdminCredentials();
  // Chưa cấu hình tài khoản thì từ chối mọi đăng nhập.
  if (!admin.email || !admin.password) return false;
  return (
    safeEqual(email.trim().toLowerCase(), admin.email.toLowerCase()) &&
    safeEqual(password, admin.password)
  );
}

export async function createSessionToken(email: string): Promise<string> {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(email)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<{ email: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (typeof payload.email !== "string") return null;
    return { email: payload.email };
  } catch {
    return null;
  }
}

export async function setSessionCookie(token: string) {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<{ email: string } | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}
