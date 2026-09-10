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

function verifyHash(password: string, stored: string): boolean {
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
