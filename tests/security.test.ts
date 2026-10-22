// Xác thực hai lớp, mã dự phòng, thu hồi phiên, sự kiện bảo mật: chạy trên CSDL SQLite tạm.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "baor-sec-"));
process.env.DATA_DIR = tmp;
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.AUTH_SECRET = "test-secret-".padEnd(40, "x");
process.env.ADMIN_EMAIL = "ceo@baor.vn";

let sec: typeof import("../src/lib/security");
let totp: typeof import("../src/lib/totp");
let retention: typeof import("../src/lib/retention");
let db: typeof import("../src/db");

before(async () => {
  sec = await import("../src/lib/security");
  totp = await import("../src/lib/totp");
  retention = await import("../src/lib/retention");
  db = await import("../src/db");
});

after(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

const EMAIL = "ceo@baor.vn";

test("phiên bản phiên: mặc định 1, thu hồi thì tăng, token cũ không còn khớp", () => {
  assert.equal(sec.sessionVersionFor(EMAIL), 1);
  assert.equal(sec.revokeAllSessions(EMAIL), 2);
  assert.equal(sec.sessionVersionFor("Chưa-Có@baor.vn"), 1);
  assert.equal(sec.revokeAllSessions(EMAIL), 3);
  assert.equal(sec.sessionVersionFor(EMAIL.toUpperCase()), 3, "không phân biệt hoa thường");
});

test("bật hai lớp: cần mã đúng từ khóa đang chờ; sau khi bật có 10 mã dự phòng và không tạo khóa mới được", () => {
  assert.equal(sec.mfaRequired(EMAIL), false);
  const setup = sec.beginTotpSetup(EMAIL);
  assert.equal(sec.securityAccount(EMAIL).totpPending, true);
  assert.equal(sec.pendingTotpSetup(EMAIL)?.secret, setup.secret, "khóa lưu mã hóa, đọc lại đúng");
  const bad = sec.confirmTotpSetup(EMAIL, "000000", 1_700_000_000_000);
  assert.equal(bad.ok, false);
  const now = 1_700_000_000_000;
  const good = sec.confirmTotpSetup(EMAIL, totp.totp(setup.secret, now), now);
  assert.equal(good.ok, true);
  if (!good.ok) return;
  assert.equal(good.backupCodes.length, 10);
  assert.equal(sec.mfaRequired(EMAIL), true);
  assert.equal(sec.securityAccount(EMAIL).backupCodesLeft, 10);
  assert.throws(() => sec.beginTotpSetup(EMAIL));
  // Mã dự phòng lưu dạng băm, không lưu chữ thường.
  const row = db.getDb().select().from(db.schema.securityAccounts).all()[0];
  for (const c of good.backupCodes) assert.ok(!row.backupCodes.includes(c.replace("-", "")));
  assert.ok(row.totpSecret?.startsWith("enc:v1:"));
  (globalThis as { __codes?: string[] }).__codes = good.backupCodes;
  (globalThis as { __secret?: string }).__secret = setup.secret;
});

test("bước hai: mã TOTP chỉ dùng một lần, mã dự phòng dùng xong bị xóa, mã sai bị từ chối", () => {
  const secret = (globalThis as { __secret?: string }).__secret!;
  const codes = (globalThis as { __codes?: string[] }).__codes!;
  const now = 1_700_000_000_000 + 120_000;
  const code = totp.totp(secret, now);
  const r1 = sec.verifySecondFactor(EMAIL, code, now);
  assert.equal(r1.ok, true);
  const r2 = sec.verifySecondFactor(EMAIL, code, now + 1_000);
  assert.equal(r2.ok, false, "cùng mã không dùng lại được");
  const r3 = sec.verifySecondFactor(EMAIL, totp.totp(secret, now + 30_000), now + 30_000);
  assert.equal(r3.ok, true, "bước sau dùng được");
  const b1 = sec.verifySecondFactor(EMAIL, codes[0].toLowerCase(), now);
  assert.equal(b1.ok && b1.method, "backup");
  assert.equal(sec.securityAccount(EMAIL).backupCodesLeft, 9);
  assert.equal(sec.verifySecondFactor(EMAIL, codes[0], now).ok, false, "mã dự phòng đã dùng");
  assert.equal(sec.verifySecondFactor(EMAIL, "ZZZZ-ZZZZ", now).ok, false);
  const fresh = sec.regenerateBackupCodes(EMAIL);
  assert.equal(fresh.length, 10);
  assert.equal(sec.verifySecondFactor(EMAIL, codes[1], now).ok, false, "mã cũ hết hiệu lực sau khi tạo lại");
  assert.equal(sec.verifySecondFactor(EMAIL, fresh[0], now).ok, true);
});

test("đổi email quản trị mang theo hai lớp; tắt hai lớp xóa khóa và mã", () => {
  sec.renameSecurityAccount(EMAIL, "boss@baor.vn");
  assert.equal(sec.mfaRequired(EMAIL), false);
  assert.equal(sec.mfaRequired("boss@baor.vn"), true);
  sec.renameSecurityAccount("boss@baor.vn", EMAIL);
  sec.disableTotp(EMAIL);
  assert.equal(sec.mfaRequired(EMAIL), false);
  assert.equal(sec.securityAccount(EMAIL).backupCodesLeft, 0);
  assert.equal(sec.verifySecondFactor(EMAIL, "123456").ok, false);
});

test("sự kiện bảo mật: ghi, lọc theo email, dọn theo retention (auditDays)", () => {
  sec.logSecurityEvent("login_ok", { email: EMAIL, ip: "10.0.0.1", detail: "mật khẩu" });
  sec.logSecurityEvent("login_fail", { email: "khac@baor.vn", ip: "10.0.0.2" });
  const mine = sec.listSecurityEvents({ email: EMAIL });
  assert.ok(mine.length >= 1 && mine.every((e) => e.email === EMAIL));
  assert.equal(mine[0].label, "Đăng nhập thành công");
  assert.equal(sec.listSecurityEvents({ limit: 100 }).length >= 2, true);
  // Sự kiện cũ 400 ngày bị dọn khi auditDays = 365; sự kiện mới giữ nguyên.
  const old = new Date(Date.now() - 400 * 86_400_000).toISOString();
  db.getDb().insert(db.schema.securityEvents).values({ at: old, email: EMAIL, ip: "", kind: "logout", detail: "" }).run();
  const r = retention.pruneOldData({ logsDays: 90, auditDays: 365 });
  assert.equal(r.securityEvents, 1);
  assert.ok(sec.listSecurityEvents({ email: EMAIL }).every((e) => e.at > old));
});

test("tình trạng bảo mật: báo quản trị chưa bật hai lớp, hết cảnh báo khi bật", () => {
  const before = sec.securityPosture();
  assert.ok(before.some((p) => p.level !== "ok" && p.text.includes("chưa bật xác thực hai lớp")));
  const s = sec.beginTotpSetup(EMAIL);
  const now = Date.now();
  assert.equal(sec.confirmTotpSetup(EMAIL, totp.totp(s.secret, now), now).ok, true);
  const after = sec.securityPosture();
  assert.ok(after.some((p) => p.level === "ok" && p.text.includes("đã bật xác thực hai lớp")));
  assert.ok(after.some((p) => p.level === "ok" && p.text.includes("AUTH_SECRET")));
});
