import { expect, type Page } from "@playwright/test";
import { E2E } from "./env";

/** Đăng nhập bằng form thật (tài khoản thử của lần chạy E2E). */
export async function login(page: Page) {
  await page.goto("/login");
  await page.locator("#email").fill(E2E.email);
  await page.locator("#password").fill(E2E.password);
  await page.getByRole("button", { name: /Đăng nhập/ }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

/** Lỗi trình duyệt (console error, lỗi JS chưa bắt) trong suốt bài test. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource: the server responded with a status of 404/.test(m.text())) errors.push(`console: ${m.text()}`);
  });
  return errors;
}
