// @critical — Nội dung → Video trên bản build production: gắn kịch bản đã duyệt cho video có sẵn, rồi bỏ gắn.
import { test, expect } from "@playwright/test";
import { login, trackErrors } from "./helpers";

test("gắn kịch bản đã duyệt cho video có sẵn và bỏ gắn", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page);
  await page.goto("/video-studio?open=v_e2e_review");
  const form = page.getByRole("form", { name: "Gắn kịch bản" });
  await expect(form).toBeVisible();
  await form.getByLabel("Kịch bản đã duyệt").selectOption({ label: "E2E · Kịch bản chào hỏi phá băng" });
  await form.getByRole("button", { name: "Lưu kịch bản" }).click();
  await expect(page).toHaveURL(/toast=/);
  await expect(page.getByRole("link", { name: "E2E · Kịch bản chào hỏi phá băng" })).toBeVisible();
  await expect(page.getByText(/Gắn kịch bản “E2E · Kịch bản chào hỏi phá băng”: bản dựng sau/)).toBeVisible();
  await page.getByRole("form", { name: "Gắn kịch bản" }).getByLabel("Kịch bản đã duyệt").selectOption("");
  await page.getByRole("form", { name: "Gắn kịch bản" }).getByRole("button", { name: "Lưu kịch bản" }).click();
  await expect(page.getByText("chưa gắn kịch bản")).toBeVisible();
  expect(errors).toEqual([]);
});
