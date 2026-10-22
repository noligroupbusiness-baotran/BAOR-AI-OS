// Môi trường E2E dùng chung cho playwright.config.ts, seed và spec. Giá trị thử, chỉ cho máy chủ localhost tạm.
import path from "node:path";
import { randomBytes } from "node:crypto";

const root = path.resolve(__dirname, "..");
const dataDir = path.join(root, "artifacts", "e2e", "data");
// Mật khẩu thử ổn định trong một lần chạy (config + worker đọc cùng biến môi trường)
process.env.BAOR_E2E_PASSWORD ??= `e2e-${randomBytes(9).toString("hex")}`;

export const E2E = {
  port: 3199,
  baseURL: "http://localhost:3199",
  dataDir,
  email: "e2e-admin@baor.test",
  password: process.env.BAOR_E2E_PASSWORD,
  serverEnv: {
    NODE_ENV: "production",
    DATA_DIR: dataDir,
    DATABASE_PATH: path.join(dataDir, "e2e.db"),
    AUTH_SECRET: "e2e-only-secret-".padEnd(48, "x"),
    ADMIN_EMAIL: "e2e-admin@baor.test",
    ADMIN_PASSWORD: process.env.BAOR_E2E_PASSWORD,
    BAOR_VIDEO_WORKER: "off",
    BACKUP_DISABLED: "1",
    BAOR_E2E: "1",
  } as Record<string, string>,
};
