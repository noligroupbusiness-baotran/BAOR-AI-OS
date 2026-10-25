// Kiểm toán 26/10: ủy quyền ngân sách chỉ OWNER đặt; bộ chạy nền không chạy chồng. CSDL tạm, không gọi nền tảng thật.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "baor-owner-"));
process.env.DATA_DIR = tmp;
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.AUTH_SECRET = "test-secret-".padEnd(40, "x");
process.env.BAOR_VIDEO_WORKER = "off";

let permissions: typeof import("../src/lib/permissions");
let admin: typeof import("../src/lib/admin");
let catalog: typeof import("../src/lib/catalog/repository");
let scheduler: typeof import("../src/lib/scheduler");

before(async () => {
  permissions = await import("../src/lib/permissions");
  admin = await import("../src/lib/admin");
  catalog = await import("../src/lib/catalog/repository");
  scheduler = await import("../src/lib/scheduler");
});

test("OWNER = tài khoản quản trị chính; nhân sự được cấp quyền Quản trị KHÔNG phải OWNER", () => {
  admin.setSetting("admin.email", "owner@baor.test");
  catalog.catalogRepo.savePerson({ name: "Quản lý", role: "Trưởng nhóm", email: "staff-admin@baor.test", permission: "admin" });
  const owner = permissions.actorFor("Owner@Baor.test");
  const staffAdmin = permissions.actorFor("staff-admin@baor.test");
  assert.equal(owner.permission, "admin");
  assert.equal(staffAdmin.permission, "admin", "có quyền Quản trị");
  assert.equal(permissions.isOwner(owner), true);
  assert.equal(permissions.isOwner(staffAdmin), false, "quyền Quản trị không đủ để đặt ủy quyền chi tiền");
  admin.setSetting("admin.email", "");
  const prev = process.env.ADMIN_EMAIL;
  delete process.env.ADMIN_EMAIL;
  assert.equal(permissions.isOwner({ email: "" }), false, "chưa có email quản trị thì không ai là OWNER");
  if (prev !== undefined) process.env.ADMIN_EMAIL = prev;
});

test("ủy quyền ngân sách: saveAuthorizationAs chỉ nhận OWNER — nhân sự quyền Quản trị bị từ chối, không ghi gì", async () => {
  const auth = await import("../src/lib/ads/authorization");
  admin.setSetting("admin.email", "owner@baor.test");
  auth.revokeAuthorization();
  const A = { monthlyCapVnd: 3_000_000, dailyCapVnd: 200_000, validUntil: "2099-12-31", adAccountId: "act_1", autoPauseCplAbove: 50_000, allowAutoScale: true, authorizedBy: "x", authorizedAt: "", note: "" };
  const staff = permissions.actorFor("staff-admin@baor.test");
  assert.equal(staff.permission, "admin");
  const r = auth.saveAuthorizationAs(staff, A);
  assert.equal(r.ok, false);
  assert.equal(auth.getAuthorization(), null, "không lưu ủy quyền");
  assert.equal(auth.saveAuthorizationAs(permissions.actorFor("owner@baor.test"), A).ok, true);
  assert.equal(auth.getAuthorization()?.dailyCapVnd, 200_000);
  auth.revokeAuthorization();
});

test("P1-1: nhân sự không mang được email OWNER — tạo mới bị từ chối; bản ghi trùng có sẵn không đăng nhập được, không sửa / ngừng được", async () => {
  const { getDb, schema } = await import("../src/db");
  const security = await import("../src/lib/security");
  admin.setSetting("admin.email", "owner@baor.test");
  admin.setSetting("admin.passwordHash", admin.hashPassword("Owner-Secret-123!"));
  const before = security.sessionVersionFor("owner@baor.test");
  // Tạo mới (kể cả viết hoa / thừa khoảng trắng) → từ chối, không ghi
  assert.throws(() => catalog.catalogRepo.savePerson({ name: "Giả OWNER", role: "x", email: " Owner@Baor.TEST ", permission: "staff", password: "Staff-Chosen-999!" }), /OWNER/);
  assert.equal(catalog.personEditBlock(undefined, "OWNER@baor.test") !== null, true);
  assert.equal(getDb().select().from(schema.people).all().some((p) => p.email.trim().toLowerCase() === "owner@baor.test"), false);
  // Bản ghi trùng có sẵn từ trước (vd nhập trước khi đổi email quản trị), đã có mật khẩu
  getDb().insert(schema.people).values({ id: "u_legacy_owner", name: "Cũ", role: "", email: "owner@baor.test", permission: "admin", active: true, passwordHash: admin.hashPassword("Staff-Chosen-999!"), updatedAt: new Date().toISOString() }).run();
  assert.equal(admin.verifyLogin("owner@baor.test", "Staff-Chosen-999!"), false, "mật khẩu nhân sự không mở được tài khoản OWNER");
  assert.equal(admin.verifyLogin("owner@baor.test", "Owner-Secret-123!"), true, "OWNER vẫn đăng nhập bằng mật khẩu quản trị");
  // Không sửa (đặt mật khẩu / đổi quyền → thu hồi phiên OWNER) và không ngừng hoạt động bản ghi đó
  assert.throws(() => catalog.catalogRepo.savePerson({ id: "u_legacy_owner", name: "Cũ", role: "", email: "khac@baor.test", permission: "staff", password: "Another-Pass-777!" }), /OWNER/);
  assert.throws(() => catalog.catalogRepo.setPersonActive("u_legacy_owner", false), /OWNER/);
  assert.notEqual(catalog.personEditBlock("u_legacy_owner", "khac@baor.test"), null, "action savePerson / togglePerson dừng TRƯỚC revokeAllSessions");
  assert.equal(security.sessionVersionFor("owner@baor.test"), before, "phiên OWNER không bị thu hồi");
  // Nhân sự thường vẫn thêm / đăng nhập được
  catalog.catalogRepo.savePerson({ name: "Thường", role: "", email: "thuong@baor.test", permission: "staff", password: "Staff-Normal-555!" });
  assert.equal(admin.verifyLogin("thuong@baor.test", "Staff-Normal-555!"), true);
});

test("tắt chế độ thử chỉ OWNER; bật lại thì quản trị được", async () => {
  const guards = await import("../src/lib/publishing/guards");
  admin.setSetting("admin.email", "owner@baor.test");
  admin.setSetting("publishing.dryRun", "1");
  const staff = permissions.actorFor("staff-admin@baor.test");
  assert.equal(guards.setDryRunMode(false, staff).ok, false);
  assert.equal(guards.isDryRun(), true, "vẫn ở chế độ thử");
  assert.equal(guards.setDryRunMode(false, permissions.actorFor("owner@baor.test")).ok, true);
  assert.equal(guards.isDryRun(), false);
  assert.equal(guards.setDryRunMode(true, staff).ok, true, "bật lại: quản trị được");
  assert.equal(guards.isDryRun(), true);
});

test("bộ chạy nền: 'Chạy ngay' trùng lúc lượt khác đang chạy → bỏ qua, không chạy chồng", async () => {
  const [a, b] = await Promise.all([scheduler.runSchedulerNow(), scheduler.runSchedulerNow()]);
  assert.notEqual(a, scheduler.TICK_BUSY, "lượt đầu chạy");
  assert.equal(b, scheduler.TICK_BUSY, "lượt thứ hai bị bỏ qua");
  // Xong lượt trước thì chạy lại được
  assert.notEqual(await scheduler.runSchedulerNow(), scheduler.TICK_BUSY);
});
