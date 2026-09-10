"use server";

import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { done } from "./common";
import { hashPassword, setSetting, verifyAdmin, getAdminEmail } from "@/lib/admin";
import { clearAll, seedAll } from "@/db/seed";
import { writeIntegrationConfig } from "@/lib/connectors/config";
import { checkIntegration as runCheck } from "@/lib/connectors/sync";
import { runSchedulerNow } from "@/lib/scheduler";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function toggleAutomation(fd: FormData) {
  const key = str(fd, "key");
  const on = str(fd, "on") === "1";
  setSetting(`automation.${key}`, on ? "0" : "1");
  done("/settings", on ? "Đã tắt" : "Đã bật");
}

export async function saveBrand(fd: FormData) {
  setSetting("brand.name", str(fd, "name"));
  setSetting("brand.products", str(fd, "products"));
  setSetting("brand.voice", str(fd, "voice"));
  done("/settings", "Đã lưu thương hiệu và giọng văn");
}

export async function saveAccount(fd: FormData) {
  const email = str(fd, "email").toLowerCase();
  const current = str(fd, "current");
  const next = str(fd, "password");
  if (!email) return done("/settings", "Cần nhập email");
  if (!verifyAdmin(getAdminEmail(), current)) return done("/settings", "Mật khẩu hiện tại không đúng");
  setSetting("admin.email", email);
  if (next) {
    if (next.length < 6) return done("/settings", "Mật khẩu mới cần ít nhất 6 ký tự");
    setSetting("admin.passwordHash", hashPassword(next));
  }
  done("/settings", "Đã cập nhật tài khoản");
}

export async function saveIntegration(fd: FormData) {
  const key = str(fd, "key");
  const db = getDb();
  const row = db.select().from(schema.integrations).where(eq(schema.integrations.key, key)).get();
  if (!row) return done("/settings", "Không tìm thấy kết nối");
  const fields: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (k.startsWith("cfg.") && String(v).trim()) fields[k.slice(4)] = String(v).trim();
  // Giá trị bí mật được mã hóa trước khi ghi. "Đã kết nối" chỉ bật sau khi kiểm tra thật thành công.
  const config = writeIntegrationConfig(key, fields);
  const account = str(fd, "account") || row.account || null;
  db.update(schema.integrations).set({ account }).where(eq(schema.integrations.key, key)).run();
  if (Object.keys(config).length === 0) return done("/settings#integrations", "Chưa có thông tin để lưu");
  const res = await runCheck(key);
  done(`/settings#${key}`, res.ok ? `Đã lưu và kết nối ${row.name}: ${res.message}` : `Đã lưu khóa ${row.name}. Kiểm tra: ${res.message}`);
}

export async function checkIntegration(fd: FormData) {
  const key = str(fd, "key");
  const res = await runCheck(key);
  done(`/settings${res.ok ? "" : "?tone=error"}#${key}`, res.message);
}

export async function saveAiBudget(fd: FormData) {
  const n = (k: string) => Number(String(fd.get(k) ?? "").replace(/[^\d]/g, "")) || 0;
  setSetting("ai.dailyCapVnd", String(n("dailyCapVnd")));
  setSetting("ai.monthlyCapVnd", String(n("monthlyCapVnd")));
  done("/settings#ai", "Đã lưu trần chi phí AI");
}

export async function runBackgroundNow() {
  const result = await runSchedulerNow();
  done("/settings#syslog", `Đã chạy bộ chạy nền: ${result}`);
}

export async function disconnectIntegration(fd: FormData) {
  const key = str(fd, "key");
  getDb().update(schema.integrations).set({ config: "{}", connected: false, account: null }).where(eq(schema.integrations.key, key)).run();
  done("/settings", "Đã ngắt kết nối");
}

export async function resetSampleData() {
  const db = getDb();
  clearAll(db);
  seedAll(db);
  done("/dashboard", "Đã nạp lại dữ liệu mẫu");
}

export async function clearSampleData() {
  clearAll(getDb());
  done("/dashboard", "Đã xóa dữ liệu mẫu. Hệ thống sẵn sàng nhận dữ liệu thật.");
}
