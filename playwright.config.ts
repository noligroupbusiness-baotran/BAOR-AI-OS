// E2E trên ứng dụng thật: bản build production (`next start`), CSDL + dữ liệu tạm riêng (artifacts/e2e/data), không chạm data/.
// Chạy: npm run verify:e2e (cần đã `next build`; npm run verify:full làm cả hai). Tài khoản là giá trị thử sinh ra cho mỗi lần chạy.
import { defineConfig, devices } from "@playwright/test";
import { E2E } from "./tests-e2e/env";

export default defineConfig({
  testDir: "tests-e2e",
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 60_000,
  reporter: [["list"], ["html", { open: "never", outputFolder: "artifacts/e2e/report" }]],
  outputDir: "artifacts/e2e/results",
  use: { baseURL: E2E.baseURL, trace: "retain-on-failure", screenshot: "only-on-failure", locale: "vi-VN" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx tsx tests-e2e/seed.mts && npx next start --port ${E2E.port}`,
    url: `${E2E.baseURL}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: E2E.serverEnv,
    stdout: "pipe",
    stderr: "pipe",
  },
});
