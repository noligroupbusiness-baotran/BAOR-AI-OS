// @critical — luồng nền tảng trên bản build production thật: đăng nhập, các trang chính không lỗi, an toàn đăng bài.
import { test, expect } from "@playwright/test";
import { login, trackErrors } from "./helpers";
import { E2E } from "./env";

test("đăng nhập: sai mật khẩu bị từ chối, đúng thì vào bảng điều hành; chưa đăng nhập bị chuyển về /login", async ({ page }) => {
  await page.goto("/video-studio");
  await expect(page).toHaveURL(/\/login/);
  await page.locator("#email").fill(E2E.email);
  await page.locator("#password").fill("sai-mat-khau");
  await page.getByRole("button", { name: /Đăng nhập/ }).click();
  await expect(page.locator("form [role=alert]")).toContainText("không đúng");
  await login(page);
});

test("các trang chính mở được, không lỗi trình duyệt", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page);
  for (const p of ["/dashboard", "/content", "/video-studio", "/publishing", "/reports", "/insights", "/settings"]) {
    const res = await page.goto(p);
    expect(res?.status(), p).toBeLessThan(400);
    await expect(page.locator("h1").first(), p).toBeVisible();
    await expect(page.getByText("Application error"), p).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test("an toàn: đăng bài mặc định ở chế độ thử", async ({ page }) => {
  await login(page);
  await page.goto("/publishing");
  await expect(page.getByText(/Chế độ thử/).first()).toBeVisible();
});

test("Video Studio: video đã dựng hiện trình phát và bảng biên tập", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page);
  await page.goto("/video-studio?open=v_e2e_review");
  await expect(page.getByRole("link", { name: "E2E · Video chờ góp ý" })).toBeVisible();
  const video = page.locator("video").first();
  await expect(video).toBeVisible();
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThan(0);
  await page.getByRole("button", { name: /Bảng biên tập · 3 mục/ }).click();
  await expect(page.getByText("Mũi tên 2 bước")).toBeVisible();
  expect(errors).toEqual([]);
});

test("Quảng cáo: hiện reach / CPM / CTR / tần suất từ số liệu Insights", async ({ page }) => {
  await login(page);
  await page.goto("/publishing#ads");
  const row = page.getByRole("row", { name: /E2E · Quảng cáo có số liệu/ });
  await expect(row).toContainText("Reach 4.000 · CPM 24.000 ₫ · CTR 1,20% · tần suất 1,25");
});
