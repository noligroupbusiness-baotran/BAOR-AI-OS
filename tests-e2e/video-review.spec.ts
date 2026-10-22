// @critical — Video Review trên bản build production thật: góp ý tại mốc đang xem → yêu cầu sửa cụ thể → bấm mốc để tua →
// so 2 phiên bản → "Dựng lại theo góp ý" xếp hàng bản mới với kế hoạch chỉ đổi đúng mục được góp ý.
import fs from "node:fs";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { login, trackErrors } from "./helpers";
import { E2E } from "./env";

const VID = "v_e2e_review";
const ws = (page: Page) => page.getByTestId("review-workspace");

/** Đưa trình phát tới mốc (như kéo thanh tua) và đợi giao diện nhận mốc mới. */
async function seekTo(page: Page, t: number) {
  const video = ws(page).locator("video");
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThan(0);
  await video.evaluate((v: HTMLVideoElement, to) => {
    v.currentTime = to;
  }, t);
  await expect(ws(page).getByRole("button", { name: new RegExp(`Góp ý tại 0:0${Math.floor(t)}`) })).toBeVisible();
}

test("góp ý tại mốc + yêu cầu sửa → tua bằng mốc → so phiên bản → dựng lại theo góp ý", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page);
  await page.goto(`/video-studio?open=${VID}`);
  await expect(ws(page)).toBeVisible();

  // So phiên bản: có 2 bản đã dựng
  const cmp = page.getByTestId("compare-versions");
  await expect(cmp).toBeVisible();
  await expect(cmp.locator("video")).toHaveCount(2);

  // Góp ý tại 1,6 s — hệ thống tìm ra chữ nhấn “PHÁ BĂNG” (1,5 s) để gắn yêu cầu sửa
  await seekTo(page, 1.6);
  await ws(page).getByRole("button", { name: /Góp ý tại 0:01/ }).click();
  const form = page.getByRole("form", { name: "Góp ý mới" });
  await form.getByLabel("Nội dung góp ý").fill("Chữ nhấn mở đầu thừa, bỏ đi");
  const target = form.getByLabel("Mục cần sửa");
  await expect(target.locator("option")).toContainText(["Chỉ ghi chú cho người dựng", "0:01.5 · Chữ nhấn “PHÁ BĂNG”"]);
  await target.selectOption({ label: "0:01.5 · Chữ nhấn “PHÁ BĂNG”" });
  await expect(form.getByLabel("Cách sửa")).toHaveValue("off");
  await form.getByRole("button", { name: "Lưu góp ý" }).click();
  await expect(page).toHaveURL(/toast=/);

  // Góp ý thứ hai: chỉ ghi chú, ở đoạn 5,2–6,4 s
  await seekTo(page, 5.2);
  await ws(page).getByRole("button", { name: /Góp ý tại 0:05/ }).click();
  await seekTo(page, 6.4);
  await ws(page).getByRole("button", { name: /Kết thúc đoạn tại 0:06/ }).click();
  const form2 = page.getByRole("form", { name: "Góp ý mới" });
  await expect(form2).toContainText(/đoạn 0:05\.\d – 0:06\.\d/);
  await form2.getByLabel("Nội dung góp ý").fill("Mũi tên hiện hơi nhanh (ghi chú)");
  await form2.getByRole("button", { name: "Lưu góp ý" }).click();
  await expect(page).toHaveURL(/toast=/);

  const items = page.getByTestId("review-comment");
  await expect(items).toHaveCount(2);
  await expect(items.first()).toContainText("Chưa xử lý");
  await expect(items.first()).toContainText("Yêu cầu sửa: Chữ nhấn “PHÁ BĂNG” → Bỏ mục này");

  // Bấm mốc của góp ý → trình phát tua tới đó
  await seekTo(page, 7);
  await items.first().getByRole("button", { name: /^0:01\.\d$/ }).click();
  await expect.poll(() => ws(page).locator("video").evaluate((v: HTMLVideoElement) => v.currentTime)).toBeCloseTo(1.6, 0);

  // Dựng lại theo góp ý (bộ dựng tắt trong E2E: bản 3 nằm trong hàng đợi)
  await page.getByRole("button", { name: "Dựng lại theo 1 góp ý" }).click();
  await expect(page).toHaveURL(/toast=.*b%E1%BA%A3n%203|toast=/);
  await expect(page.getByText("1 góp ý đang chờ bản dựng mới")).toBeVisible();
  await expect(page.getByText(/Dựng lại theo 1 góp ý: 1\.\d s “Chữ nhấn mở đầu thừa, bỏ đi”/)).toBeVisible();

  // Kế hoạch cấp video: chỉ chữ nhấn được góp ý bị tắt; mục khác giữ nguyên
  const plan = JSON.parse(fs.readFileSync(path.join(E2E.dataDir, "video-jobs", VID, "plan.json"), "utf8"));
  expect(plan.emphasis[0]).toMatchObject({ text: "PHÁ BĂNG", off: true });
  expect(plan.emphasis[1].off).toBeUndefined();
  expect(plan.diagrams[0].off).toBeUndefined();
  const job = JSON.parse(fs.readFileSync(path.join(E2E.dataDir, "video-jobs", VID, "v3", "job.json"), "utf8"));
  expect(job.status).toBe("queued");
  expect(errors).toEqual([]);
});
