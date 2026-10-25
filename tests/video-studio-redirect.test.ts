// Liên kết cũ "Xưởng video › Đã phê duyệt" (?tab=approved) chuyển sang Kho video — phải GIỮ ngữ cảnh chiến dịch (?campaign=&goal=),
// không thì người đi từ Chiến dịch sang mất bộ lọc chiến dịch. Gọi thẳng trang (server component); CSDL tạm.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "baor-studio-redirect-"));
process.env.DATA_DIR = tmp;
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.AUTH_SECRET = "test-secret-".padEnd(40, "x");
process.env.BAOR_VIDEO_WORKER = "off";

let page: typeof import("../src/app/(admin)/video-studio/page");

before(async () => {
  page = await import("../src/app/(admin)/video-studio/page");
});

/** URL đích của redirect() (Next ném lỗi có digest "NEXT_REDIRECT;<kiểu>;<url>;<mã>;"). */
async function redirectTarget(sp: Record<string, string>): Promise<string> {
  try {
    await page.default({ searchParams: Promise.resolve(sp) });
  } catch (e) {
    const digest = String((e as { digest?: string }).digest ?? "");
    if (digest.startsWith("NEXT_REDIRECT")) return digest.split(";")[2];
    throw e;
  }
  return "";
}

test("?tab=approved → /video-library, giữ ?campaign=&goal=", async () => {
  const to = await redirectTarget({ tab: "approved", campaign: "cmp_1", goal: "goal_2" });
  const u = new URL(to, "http://x");
  assert.equal(u.pathname, "/video-library");
  assert.equal(u.searchParams.get("campaign"), "cmp_1");
  assert.equal(u.searchParams.get("goal"), "goal_2");
});

test("?tab=approved không có chiến dịch → /video-library sạch", async () => {
  assert.equal(await redirectTarget({ tab: "approved" }), "/video-library");
});
