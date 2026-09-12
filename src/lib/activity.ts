import { getDb, schema } from "@/db";

// Nhật ký hoạt động chung (Điều hành › Hoạt động). Tách riêng để bộ chạy nền, webhook, connector
// dùng được mà không kéo theo next/cache hay next/navigation.
export function logActivity(actor: "ai" | "human" | "system", message: string, step = "") {
  getDb().insert(schema.activity).values({ at: new Date().toISOString(), actor, message, step }).run();
}
