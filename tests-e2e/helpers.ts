import { expect, type Locator, type Page } from "@playwright/test";
import { E2E } from "./env";

/**
 * Chờ cho bước phụ thuộc server action (gửi form → máy chủ ghi → redirect → render lại) hoặc hydrate. Mặc định 5 s của
 * Playwright đủ khi máy rảnh, nhưng verify:full chạy sau next build trên máy tải nặng có lúc vượt (đỏ khi chạy chung, xanh khi
 * chạy riêng). Chỉ dùng ở đúng các bước đó, không đổi điều kiện kiểm; không thêm retries.
 */
export const ACTION_MS = 20_000;

/**
 * Chờ React gắn xong phần tử (hydrate / render phía trình duyệt): node DOM có khoá __reactProps$… khi React đã quản lý nó.
 * Dùng trước thao tác cần handler phía trình duyệt (onClick, onChange) — bấm trước lúc hydrate thì thao tác bị mất.
 */
export async function hydrated(locator: Locator) {
  await expect
    .poll(() => locator.evaluate((el) => Object.keys(el).some((k) => k.startsWith("__reactProps$"))), { timeout: ACTION_MS, message: "React chưa hydrate phần tử" })
    .toBe(true);
}

/** Đăng nhập bằng form thật (tài khoản thử của lần chạy E2E). */
export async function login(page: Page) {
  await page.goto("/login");
  await page.locator("#email").fill(E2E.email);
  await page.locator("#password").fill(E2E.password);
  await page.getByRole("button", { name: /Đăng nhập/ }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: ACTION_MS }); // server action đăng nhập + redirect + render Tổng quan
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
