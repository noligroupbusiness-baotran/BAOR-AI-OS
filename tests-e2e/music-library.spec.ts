// @critical — Thư viện nhạc nền trên bản build production: nghe thử được (luồng có Range), OWNER duyệt bài chờ nghe duyệt
// rồi bỏ duyệt; giấy phép kho trả lại nguyên văn. Dữ liệu E2E tạm (seed.mts), âm tự tạo.
import fs from "node:fs";
import path from "node:path";
import { test, expect, request as playwrightRequest } from "@playwright/test";
import { login, trackErrors } from "./helpers";
import { E2E } from "./env";

const FILE = "acoustic_e2e-cho-duyet_pixabay1.mp3";
// Server action ghi manifest + làm mới trang: máy tải nặng có lúc > 5 s (nút còn "Đang bỏ…") — chờ lâu hơn, không đổi điều kiện kiểm
const ACTION_MS = 20_000;
const manifest = () => JSON.parse(fs.readFileSync(path.join(E2E.dataDir, "video-assets", "music", "manifest.json"), "utf8")) as { file: string; license: string; ownerApproved?: { by: string } }[];

test("nghe thử, duyệt dùng rồi bỏ duyệt một bài trong thư viện nhạc nền", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page);
  await page.goto("/settings#music-library");
  const panel = page.locator("#music-library");
  await expect(panel.getByText("1/2 bài đã duyệt")).toBeVisible();
  const row = panel.locator(`[data-track="${FILE}"]`);
  await expect(row.getByText("chờ nghe duyệt")).toBeVisible();

  // Nghe thử: tệp phát được qua API (Range 206), đường dẫn lạ bị chặn
  const src = await row.locator("audio").getAttribute("src");
  const part = await page.request.get(src!, { headers: { Range: "bytes=0-99" } });
  expect(part.status()).toBe(206);
  expect(part.headers()["content-type"]).toBe("audio/mpeg");
  expect((await page.request.get("/api/video-assets/music?file=../music/manifest.json")).status()).toBe(404);
  const anon = await playwrightRequest.newContext({ baseURL: E2E.baseURL });
  expect((await anon.get(src!)).status(), "chưa đăng nhập không nghe được").toBe(401);
  await anon.dispose();
  const playing = await row.locator("audio").evaluate(async (a: HTMLAudioElement) => {
    a.muted = true;
    await a.play();
    await new Promise((r) => setTimeout(r, 800));
    a.pause();
    return a.currentTime > 0;
  });
  expect(playing).toBe(true);

  await row.getByRole("button", { name: "Duyệt dùng" }).click();
  await expect(page.getByText(/Đã duyệt “acoustic_e2e-cho-duyet_pixabay1\.mp3”/)).toBeVisible({ timeout: ACTION_MS });
  await expect(page.locator("#music-library").getByText("2/2 bài đã duyệt")).toBeVisible({ timeout: ACTION_MS });
  const approved = manifest().find((m) => m.file === FILE)!;
  expect(approved.ownerApproved?.by).toBe(E2E.email);
  expect(approved.license).toMatch(/OWNER nghe duyệt \d{2}\/\d{2}\/\d{4} \(e2e-admin@baor\.test\)/);
  expect(approved.license).not.toContain("chờ OWNER");

  await page.locator(`#music-library [data-track="${FILE}"]`).getByRole("button", { name: "Bỏ duyệt" }).click();
  await expect(page.locator("#music-library").getByText("1/2 bài đã duyệt")).toBeVisible({ timeout: ACTION_MS });
  expect(manifest().find((m) => m.file === FILE)!.license).toContain("chờ OWNER nghe duyệt");
  expect(errors).toEqual([]);
});
