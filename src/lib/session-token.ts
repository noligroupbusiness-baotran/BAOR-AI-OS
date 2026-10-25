import { SignJWT, jwtVerify } from "jose";

// Ký và kiểm tra token phiên (JWT HS256) — thuần jose, không đụng CSDL, để proxy.ts dùng được
// mà không kéo theo better-sqlite3. Kiểm tra "phiên bản phiên" (đăng xuất mọi thiết bị) nằm ở src/lib/auth.ts.
export const SESSION_COOKIE = "baor_session";
/** Cookie tạm giữa bước mật khẩu và bước mã xác thực hai lớp. */
export const MFA_COOKIE = "baor_mfa";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 ngày
export const MFA_TTL_SECONDS = 5 * 60; // 5 phút để nhập mã

export interface SessionClaims {
  email: string;
  /** Phiên bản phiên lúc cấp; khác với phiên bản trong CSDL nghĩa là đã bị thu hồi. */
  sv: number;
}

function getSecret(): Uint8Array {
  // Chuỗi rỗng cũng coi như chưa đặt, tránh lỗi "zero-length key" khi ký cookie.
  const secret = process.env.AUTH_SECRET || "dev-secret-change-me-in-production";
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(email: string, sv = 1): Promise<string> {
  return new SignJWT({ email, sv, typ: "session" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(email)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (typeof payload.email !== "string") return null;
    // Token cấp trước khi có xác thực hai lớp không mang typ; vẫn nhận (phiên bản phiên bắt mọi token cũ hết hạn khi cần).
    if (payload.typ !== undefined && payload.typ !== "session") return null;
    const sv = typeof payload.sv === "number" ? payload.sv : 1;
    return { email: payload.email, sv };
  } catch {
    return null;
  }
}

/** Token tạm sau khi mật khẩu đúng nhưng còn chờ mã xác thực hai lớp. Không mở được trang quản trị. */
export async function createMfaToken(email: string, ip: string): Promise<string> {
  return new SignJWT({ email, ip, typ: "mfa" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(email)
    .setIssuedAt()
    .setExpirationTime(`${MFA_TTL_SECONDS}s`)
    .sign(getSecret());
}

export async function verifyMfaToken(token: string): Promise<{ email: string; ip: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (payload.typ !== "mfa" || typeof payload.email !== "string") return null;
    return { email: payload.email, ip: typeof payload.ip === "string" ? payload.ip : "" };
  } catch {
    return null;
  }
}
