// @critical — Nội dung → Video trên bản build production: gắn kịch bản đã duyệt cho video có sẵn, rồi bỏ gắn.
import { test, expect } from "@playwright/test";
import { ACTION_MS, login, trackErrors } from "./helpers";

test("gắn kịch bản đã duyệt cho video có sẵn và bỏ gắn", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page);
  await page.goto("/video-studio?open=v_e2e_review");
  // Trang chi tiết gọn (25/10): dòng "Kịch bản" — bấm "Đổi" mới mở biểu mẫu gắn kịch bản
  const openScript = () => page.locator("summary span", { hasText: /^Đổi kịch bản$/ }).click();
  await openScript();
  const form = page.getByRole("form", { name: "Gắn kịch bản" });
  await expect(form).toBeVisible();
  await form.getByLabel("Kịch bản đã duyệt").selectOption({ label: "E2E · Kịch bản chào hỏi phá băng" });
  await form.getByRole("button", { name: "Lưu kịch bản" }).click();
  // Server action ghi CSDL + redirect ?toast= + render lại: máy tải nặng có lúc > 5 s
  await expect(page).toHaveURL(/toast=/, { timeout: ACTION_MS });
  await expect(page.getByRole("link", { name: "E2E · Kịch bản chào hỏi phá băng" })).toBeVisible({ timeout: ACTION_MS });
  await expect(page.getByText(/Gắn kịch bản “E2E · Kịch bản chào hỏi phá băng”: bản dựng sau/)).toBeVisible({ timeout: ACTION_MS });
  await openScript();
  await page.getByRole("form", { name: "Gắn kịch bản" }).getByLabel("Kịch bản đã duyệt").selectOption("");
  await page.getByRole("form", { name: "Gắn kịch bản" }).getByRole("button", { name: "Lưu kịch bản" }).click();
  await expect(page.getByText("chưa gắn kịch bản")).toBeVisible({ timeout: ACTION_MS }); // sau server action bỏ gắn
  expect(errors).toEqual([]);
});
