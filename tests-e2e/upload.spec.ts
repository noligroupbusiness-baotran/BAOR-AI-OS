// @critical — tải video gốc NỐI TIẾP được trên bản build production: một khúc bị đứt mạng giữa chừng → trình duyệt tự hỏi
// máy chủ đã nhận tới đâu và gửi tiếp; tệp ghép lại đúng, video mới xuất hiện.
import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { ACTION_MS, hydrated, login, trackErrors } from "./helpers";
import { E2E } from "./env";

test("tải lên theo khúc, đứt mạng ở khúc 2 vẫn tải tiếp xong và tạo video", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page);
  const src = path.join(E2E.dataDir, "uploads", "e2e-source.mp4");
  const size = fs.statSync(src).size;
  await page.goto("/video-studio?upload=1");
  await page.evaluate(() => localStorage.setItem("baor.uploadChunkBytes", String(64 * 1024)));
  let puts = 0;
  let aborted = false;
  await page.route("**/api/video-sources/resumable?**", async (route) => {
    if (route.request().method() === "PUT" && ++puts === 2 && !aborted) {
      aborted = true;
      return route.abort("connectionfailed");
    }
    return route.continue();
  });
  const before = await page.locator("li a").filter({ hasText: "e2e upload resume" }).count();
  const file = path.join(E2E.dataDir, "e2e-upload-resume.mp4");
  fs.copyFileSync(src, file);
  const input = page.locator('input[type="file"]');
  await hydrated(input); // onChange gắn sau hydrate: chọn tệp sớm hơn thì không tải
  await input.setInputFiles(file);
  await expect(page.getByTestId("upload-note")).toContainText(/đang thử tiếp/, { timeout: ACTION_MS }); // khúc 1 PUT xong mới tới khúc 2 bị đứt
  await expect(page.getByText(/Đã nhận — chọn khung hình/)).toBeVisible({ timeout: 30_000 });
  expect(aborted).toBe(true);
  expect(puts).toBeGreaterThan(Math.ceil(size / (64 * 1024)));
  await page.goto("/video-studio");
  await expect(page.locator("li a").filter({ hasText: "e2e upload resume" })).toHaveCount(before + 1);
  // tệp trên máy chủ đúng từng byte
  const got = fs.readdirSync(path.join(E2E.dataDir, "uploads")).filter((f) => f.endsWith(".mp4") && f.startsWith("up_"));
  expect(got.some((f) => fs.statSync(path.join(E2E.dataDir, "uploads", f)).size === size && fs.readFileSync(path.join(E2E.dataDir, "uploads", f)).equals(fs.readFileSync(src)))).toBe(true);
  expect(errors.filter((e) => !/Failed to load resource|ERR_CONNECTION|net::/.test(e))).toEqual([]);
});

test("khách ngắt kết nối GIỮA khúc: máy chủ không sập, phiên giữ đúng vị trí và tải tiếp được", async ({ page, context }) => {
  const http = await import("node:http");
  await login(page);
  await page.goto("/video-studio");
  const cookie = (await context.cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
  const origin = E2E.baseURL;
  const open = await page.evaluate(async () => (await fetch("/api/video-sources/resumable?name=ngat.mp4&size=400000&key=ngat|400000|1&cut=1", { method: "POST" })).json());
  expect(open.ok).toBe(true);
  // Gửi khai báo 200.000 byte nhưng chỉ đẩy 50.000 rồi huỷ socket
  await new Promise<void>((resolve) => {
    const req = http.request(`${origin}/api/video-sources/resumable?sid=${open.sid}&offset=0`, { method: "PUT", headers: { cookie, origin, "content-type": "application/octet-stream", "content-length": "200000" } });
    req.on("error", () => resolve());
    req.write(Buffer.alloc(50_000, 7));
    setTimeout(() => {
      req.destroy();
      resolve();
    }, 300);
  });
  await page.waitForTimeout(500);
  // máy chủ vẫn sống
  expect((await page.request.get("/login")).status()).toBe(200);
  const info = await page.evaluate(async (sid) => (await fetch(`/api/video-sources/resumable?sid=${sid}`)).json(), open.sid);
  expect(info.ok).toBe(true);
  expect(info.offset).toBe(0); // khúc đứt bị cắt bỏ, không để byte dở
  const put = await page.evaluate(async (sid) => (await fetch(`/api/video-sources/resumable?sid=${sid}&offset=0`, { method: "PUT", body: new Uint8Array(400000) })).json(), open.sid);
  expect(put.ok && put.done).toBe(true);
});
