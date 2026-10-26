// Cài đặt chia nhóm (OWNER 25/10/2026: "làm đơn giản lại"): liên kết cũ /settings#mục mở đúng nhóm; bấm Lưu trong một nhóm thì
// vẫn ở nhóm đó (phản biện P1: redirect "/settings#neo" của server action từng đẩy về nhóm Kết nối); bấm nút nhóm đổi nhóm.
import { test, expect } from "@playwright/test";
import { ACTION_MS, hydrated, login, trackErrors } from "./helpers";

test("cài đặt: liên kết cũ mở đúng nhóm, lưu xong vẫn ở nhóm đó, bấm nút đổi nhóm", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page);

  // Liên kết cũ tới mục ở nhóm khác nhóm mặc định
  await page.goto("/settings#people");
  // #neo không gửi lên máy chủ → chuyển nhóm chạy SAU hydrate; máy tải nặng có lúc > 5 s (verify:full 25/10 đỏ, chạy riêng xanh) — chờ lâu hơn, không đổi điều kiện
  await expect(page.locator("#people")).toBeVisible({ timeout: ACTION_MS });
  await expect(page).toHaveURL(/[?&]tab=he-thong/);
  await expect(page.locator("#integrations")).toBeHidden();

  // Lưu trong nhóm Tự động (server action redirect về /settings#automation) → vẫn ở nhóm Tự động
  await page.goto("/settings?tab=tu-dong");
  const sw = page.locator("#automation [role=switch]").first();
  const before = await sw.getAttribute("aria-checked");
  await sw.click();
  await expect(sw).not.toHaveAttribute("aria-checked", before!, { timeout: ACTION_MS });
  await expect(page.locator("#automation")).toBeVisible();
  await expect(page).toHaveURL(/[?&]tab=tu-dong/);
  await expect(page.getByRole("tab", { name: /Tự động/ })).toHaveAttribute("aria-selected", "true");
  await sw.click(); // trả lại như cũ
  await expect(sw).toHaveAttribute("aria-checked", before!, { timeout: ACTION_MS });
  await expect(page.locator("#automation")).toBeVisible();

  // Bấm nút nhóm (đổi nhóm bằng onClick phía trình duyệt: chờ hydrate trước khi bấm)
  const videoTab = page.getByRole("tab", { name: /Video/ });
  await hydrated(videoTab);
  await videoTab.click();
  await expect(page.locator("#render-worker")).toBeVisible();
  await expect(page.locator("#automation")).toBeHidden();
  expect(errors).toEqual([]);
});
