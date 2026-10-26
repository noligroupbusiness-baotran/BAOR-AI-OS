import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";

// Tài khoản quản trị: ưu tiên bản lưu trong CSDL (đổi được trong Cài đặt),
// chưa có thì dùng ADMIN_EMAIL / ADMIN_PASSWORD trong .env.

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyHash(password: string, stored: string): boolean {
  const [, salt, hash] = stored.split("$");
  if (!salt || !hash) return false;
  const a = scryptSync(password, salt, 64);
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function getSetting(key: string): string | undefined {
  const row = getDb().select().from(schema.settings).where(eq(schema.settings.key, key)).get();
  return row?.value;
}

export function setSetting(key: string, value: string) {
  getDb()
    .insert(schema.settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } })
    .run();
}

export function getAdminEmail(): string {
  return getSetting("admin.email") || process.env.ADMIN_EMAIL || "";
}

/** Email của tài khoản quản trị chính (OWNER)? So không phân biệt hoa thường / khoảng trắng. Chưa đặt email quản trị → false. */
export function isAdminEmail(email: string | null | undefined): boolean {
  const owner = getAdminEmail().trim().toLowerCase();
  return !!owner && (email ?? "").trim().toLowerCase() === owner;
}

// Đăng nhập: tài khoản quản trị hoặc nhân sự đang hoạt động đã được cấp mật khẩu.
export function verifyLogin(email: string, password: string): boolean {
  if (verifyAdmin(email, password)) return true;
  const e = email.trim().toLowerCase();
  if (!e || !password) return false;
  // Email OWNER chỉ đăng nhập bằng mật khẩu quản trị: bản ghi Nhân sự trùng email (có từ trước / do người khác đặt mật khẩu) bị bỏ qua
  if (isAdminEmail(e)) return false;
  const person = getDb().select().from(schema.people).where(eq(schema.people.email, e)).get();
  if (!person || !person.active || !person.passwordHash) return false;
  return verifyHash(password, person.passwordHash);
}

export function verifyAdmin(email: string, password: string): boolean {
  const dbEmail = getSetting("admin.email");
  const dbHash = getSetting("admin.passwordHash");
  const wantEmail = (dbEmail || process.env.ADMIN_EMAIL || "").toLowerCase();
  if (!wantEmail || email.trim().toLowerCase() !== wantEmail) return false;
  if (dbHash) return verifyHash(password, dbHash);
  const envPass = process.env.ADMIN_PASSWORD ?? "";
  if (!envPass) return false;
  const a = Buffer.from(password);
  const b = Buffer.from(envPass);
  return a.length === b.length && timingSafeEqual(a, b);
}
