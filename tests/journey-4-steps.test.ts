// Hành trình 4 bước (OWNER 05/11/2026): /ads chuyển hướng vào Kết quả › Quảng cáo giữ tham số; mục ẩn không hotkey, có mục cha hiện;
// badge của mục ẩn cộng vào mục cha trên thanh bên; mỗi bước mở một mục hiện.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "baor-4buoc-"));
process.env.DATA_DIR = tmp;
process.env.DATABASE_PATH = path.join(tmp, "t.db");
process.env.AUTH_SECRET = "test-secret-".padEnd(40, "x");
process.env.BAOR_VIDEO_WORKER = "off";

let page: typeof import("../src/app/(admin)/ads/page");
let m: typeof import("../src/config/menu");
let j: typeof import("../src/config/journey");

before(async () => {
  page = await import("../src/app/(admin)/ads/page");
  m = await import("../src/config/menu");
  j = await import("../src/config/journey");
});

async function target(sp: Record<string, string>): Promise<string> {
  try {
    await page.default({ searchParams: Promise.resolve(sp) });
  } catch (e) {
    const d = String((e as { digest?: string }).digest ?? "");
    if (d.startsWith("NEXT_REDIRECT")) return d.split(";")[2];
    throw e;
  }
  return "";
}

test("/ads?edit=&toast=&tone= → /insights/learning?tab=quang-cao giữ tham số (toast, lỗi quyền vẫn hiện)", async () => {
  const u = new URL(await target({ edit: "ad_1", toast: "xin chào", tone: "error", campaign: "c1", tab: "khac" }), "http://x");
  assert.equal(u.pathname, "/insights/learning");
  assert.equal(u.searchParams.get("tab"), "quang-cao");
  assert.equal(u.searchParams.get("edit"), "ad_1");
  assert.equal(u.searchParams.get("toast"), "xin chào");
  assert.equal(u.searchParams.get("tone"), "error");
  assert.equal(u.searchParams.get("campaign"), "c1");
});

test("mục ẩn: không hotkey, mục cha có thật và hiện; mỗi bước hành trình mở một mục hiện; trang ẩn vẫn thuộc đúng bước", () => {
  const visible = m.menu.filter((x) => !x.hidden).map((x) => x.href);
  for (const h of m.menu.filter((x) => x.hidden)) {
    assert.equal(h.hotkey, undefined, h.key);
    const p = m.menu.find((x) => x.key === h.parent);
    assert.ok(p && !p.hidden, `${h.key} cần mục cha hiện`);
  }
  for (const s of j.JOURNEY_STEPS) assert.ok(visible.includes(s.href), `bước ${s.step} ${s.href} phải là mục hiện`);
  assert.equal(m.activeMenuItem("/insights/research")?.key, "research");
  assert.equal(m.hrefForActivityStep("ads"), "/ads");
  assert.equal(j.journeyDisplayStepFor("/video-studio")?.step, 2);
  assert.equal(j.journeyDisplayStepFor("/ads")?.step, 4);
  assert.equal(j.journeyDisplayStepFor("/insights/research/abc")?.step, 1);
});

test("badge của mục ẩn cộng vào mục cha (video chờ duyệt → Video, quảng cáo chờ → Kết quả)", () => {
  const badges = { "/video-studio": 2, "/video-library": 1, "/ads": 3, "/content/hooks": 6 };
  const by = (k: string) => m.menu.find((x) => x.key === k)!;
  assert.equal(m.menuBadge(by("video-library"), badges), 3);
  assert.equal(m.menuBadge(by("learning"), badges), 3);
  assert.equal(m.menuBadge(by("content"), badges), 6);
  assert.equal(m.menuBadge(by("publishing"), badges), 0);
});
