#!/usr/bin/env node
// Đặt lại tài khoản quản trị khi quên mật khẩu hoặc mất điện thoại xác thực hai lớp.
// Thuần Node ≥ 22.13 (node:sqlite), không cần tsx hay node_modules → chạy được cả trên máy dev lẫn trong container production.
//
//   Máy dev:    node scripts/reset-admin.mjs <email>                 (DATA_DIR mặc định ./data)
//   VPS:        docker compose cp scripts/reset-admin.mjs app:/tmp/reset-admin.mjs
//               docker compose exec app node /tmp/reset-admin.mjs <email>
//
// Mật khẩu mới: đặt sẵn qua biến NEW_PASSWORD, không có thì sinh ngẫu nhiên và in ra MỘT LẦN.
// Làm gì: ghi admin.email + băm scrypt vào bảng settings (ưu tiên hơn ADMIN_EMAIL/ADMIN_PASSWORD trong .env),
// tắt xác thực hai lớp và xóa mã dự phòng của email đó, thu hồi mọi phiên đang mở, ghi sự kiện bảo mật.
import { randomBytes, randomInt, scryptSync } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("Cách dùng: node scripts/reset-admin.mjs <email-quan-tri>   [NEW_PASSWORD=... để tự chọn mật khẩu]");
  process.exit(1);
}

const dataDir = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const file = process.env.DATABASE_PATH ?? path.join(dataDir, "baor.db");
if (!fs.existsSync(file)) {
  console.error(`Không thấy CSDL: ${file} (đặt DATA_DIR hoặc DATABASE_PATH).`);
  process.exit(1);
}

function generatePassword() {
  // 16 ký tự, bỏ các ký tự dễ nhầm (0/O, 1/l/I), luôn có chữ hoa, chữ thường và số để qua chính sách mật khẩu.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 16; i++) s += alphabet[randomInt(alphabet.length)];
  return /[A-Z]/.test(s) && /[a-z]/.test(s) && /\d/.test(s) ? s : generatePassword();
}

const password = process.env.NEW_PASSWORD?.trim() || generatePassword();
if (password.length < 10) {
  console.error("Mật khẩu cần ít nhất 10 ký tự (chính sách mật khẩu của hệ thống).");
  process.exit(1);
}

// Cùng định dạng với src/lib/admin.ts: scrypt$<salt hex>$<hash hex>, 64 byte.
const salt = randomBytes(16).toString("hex");
const hash = `scrypt$${salt}$${scryptSync(password, salt, 64).toString("hex")}`;
const now = new Date().toISOString();

const db = new DatabaseSync(file);
db.exec("BEGIN");
try {
  const oldEmail = db.prepare("SELECT value FROM settings WHERE key = 'admin.email'").get()?.value;
  const upsert = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  upsert.run("admin.email", email);
  upsert.run("admin.passwordHash", hash);

  const hasSecurity = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'security_accounts'").get();
  let mfaWasOn = false;
  if (hasSecurity) {
    for (const e of new Set([email, oldEmail].filter(Boolean))) {
      const row = db.prepare("SELECT totp_enabled FROM security_accounts WHERE email = ?").get(e);
      if (row) {
        mfaWasOn ||= row.totp_enabled === 1;
        db.prepare("UPDATE security_accounts SET totp_enabled = 0, totp_secret = NULL, backup_codes = '[]', session_version = session_version + 1, updated_at = ? WHERE email = ?").run(now, e);
      } else {
        db.prepare("INSERT INTO security_accounts (email, session_version, updated_at) VALUES (?, 2, ?)").run(e, now);
      }
      db.prepare("DELETE FROM settings WHERE key = ?").run(`mfa.lastStep.${e}`);
    }
    db.prepare("INSERT INTO security_events (at, email, ip, kind, detail) VALUES (?, ?, '', 'password_set_by_admin', ?)").run(now, email, `scripts/reset-admin.mjs trên máy chủ${mfaWasOn ? ", đã tắt xác thực hai lớp" : ""}`);
  }
  db.exec("COMMIT");
} catch (err) {
  db.exec("ROLLBACK");
  throw err;
} finally {
  db.close();
}

console.log(`Đã đặt lại tài khoản quản trị trong ${file}`);
console.log(`  Email:     ${email}`);
console.log(`  Mật khẩu:  ${password}`);
console.log("Xác thực hai lớp đã tắt, mọi phiên cũ đã bị đăng xuất. Đăng nhập rồi vào Tài khoản của tôi để đổi mật khẩu và bật lại hai lớp.");
console.log("Dòng mật khẩu chỉ in một lần; xóa khỏi lịch sử terminal nếu cần (history -c).");
