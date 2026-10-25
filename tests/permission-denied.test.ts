// Bị từ chối quyền ở server action: quay về đúng trang, thông báo hiện được (?toast= trước #neo) và — với Cài đặt chia
// nhóm — mở đúng nhóm (?tab=). Trước đây requirePermission dán "?toast=" SAU "#neo": trình duyệt coi cả đoạn là neo,
// thông báo không hiện, Cài đặt rơi về nhóm "Kết nối".
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SETTINGS_ANCHORS } from "../src/config/settings-groups";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "baor-perm-"));
process.env.DATA_DIR = tmp;
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.AUTH_SECRET = "test-secret-".padEnd(40, "x");

let permissions: typeof import("../src/lib/permissions");
before(async () => {
  permissions = await import("../src/lib/permissions");
});
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const parse = (url: string) => new URL(url, "http://x");

test("từ chối quyền ở Cài đặt: ?toast + tone=error trước #neo, kèm ?tab= đúng nhóm", () => {
  const u = parse(permissions.deniedPath("/settings#account", "admin", "manager"));
  assert.equal(u.pathname, "/settings");
  assert.equal(u.hash, "#account");
  assert.equal(u.searchParams.get("tab"), "he-thong");
  assert.equal(u.searchParams.get("tone"), "error");
  assert.match(u.searchParams.get("toast") ?? "", /Cần quyền .+ Bạn đang là /);

  // 26/10: Thư viện nhạc nền chuyển sang trang Tư liệu (/assets) — mục còn ở nhóm Video: Nơi dựng video
  assert.equal(parse(permissions.deniedPath("/settings#render-worker", "admin", "staff")).searchParams.get("tab"), "video");
  assert.equal(parse(permissions.deniedPath("/assets#music-library", "admin", "staff")).searchParams.get("tab"), null, "trang Tư liệu không có nhóm");
  assert.equal(parse(permissions.deniedPath("/settings#ai-team", "admin", "staff")).searchParams.get("tab"), "ai");
  assert.equal(parse(permissions.deniedPath("/settings#sample", "admin", "staff")).searchParams.get("tab"), "he-thong");
});

test("từ chối quyền ngoài Cài đặt: giữ tham số cũ, không thêm tab", () => {
  const u = parse(permissions.deniedPath("/customers?tab=segments", "manager", "staff"));
  assert.equal(u.pathname, "/customers");
  assert.equal(u.searchParams.get("tab"), "segments");
  assert.equal(u.searchParams.get("tone"), "error");
  assert.ok(u.searchParams.get("toast"));
  const p = parse(permissions.deniedPath("/publishing#ads", "manager", "staff"));
  assert.equal(p.hash, "#ads");
  assert.equal(p.searchParams.get("tone"), "error");
  assert.equal(p.searchParams.get("tab"), null);
});

test("mọi requirePermission(..., \"/settings…\") đều có #neo đã khai báo nhóm (thiếu neo → bị đẩy về nhóm Kết nối)", () => {
  const dir = path.join(__dirname, "..", "src", "lib", "actions");
  const bad: string[] = [];
  let seen = 0;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".ts"))) {
    const src = fs.readFileSync(path.join(dir, f), "utf8");
    for (const m of src.matchAll(/\brequirePermission\(\s*"[a-z]+"\s*,\s*(`[^`]*`|"[^"]*"|'[^']*')/g)) {
      const url = m[1].slice(1, -1);
      if (!url.startsWith("/settings")) continue;
      seen++;
      const anchor = url.split("#")[1]?.split("?")[0];
      if (!anchor || !SETTINGS_ANCHORS[anchor]) bad.push(`${f}: ${url}`);
    }
  }
  assert.ok(seen > 10, `quét được ${seen} chỗ gọi — mẫu regex lệch so với mã?`);
  assert.deepEqual(bad, []);
});
