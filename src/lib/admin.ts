import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";

// Cài đặt chung lưu trong CSDL (bảng settings). Không còn cơ chế đăng nhập:
// hệ thống mở cho chủ fanpage dùng trực tiếp; email chỉ để hiển thị trong giao diện.

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
  return getSetting("admin.email") || process.env.ADMIN_EMAIL || "chu-fanpage@baor.vn";
}
