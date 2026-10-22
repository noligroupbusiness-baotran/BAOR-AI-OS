// Xác thực hai lớp theo chuẩn TOTP (RFC 6238, HMAC-SHA1, 6 số, 30 giây) — tương thích Google Authenticator,
// Authy, 1Password, Microsoft Authenticator. Thuần node:crypto, không phụ thuộc thư viện ngoài.
import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Khóa bí mật mới, 20 byte (160 bit) như khuyến nghị RFC 4226, ở dạng base32 để nhập vào ứng dụng xác thực. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function hotp(secretBase32: string, counter: number, digits = 6): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac("sha1", base32Decode(secretBase32)).update(buf).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const code = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(code % 10 ** digits).padStart(digits, "0");
}

export function totp(secretBase32: string, nowMs = Date.now(), stepSec = 30, digits = 6): string {
  return hotp(secretBase32, Math.floor(nowMs / 1000 / stepSec), digits);
}

/**
 * Kiểm tra mã người dùng nhập. Chấp nhận lệch ±1 bước (30 giây) để bù lệch giờ giữa điện thoại và máy chủ.
 * Trả về bước thời gian đã khớp (để chống dùng lại cùng một mã) hoặc null.
 */
export function verifyTotp(secretBase32: string, code: string, nowMs = Date.now(), window = 1, stepSec = 30): number | null {
  const c = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(c)) return null;
  const step = Math.floor(nowMs / 1000 / stepSec);
  for (let d = -window; d <= window; d++) {
    const expected = hotp(secretBase32, step + d);
    if (expected.length === c.length && timingSafeEqual(Buffer.from(expected), Buffer.from(c))) return step + d;
  }
  return null;
}

/** Đường dẫn otpauth:// để ứng dụng xác thực quét (mã QR) hoặc nhập tay. */
export function otpauthUri(secretBase32: string, account: string, issuer = "BAOR AI OS"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret: secretBase32, issuer, algorithm: "SHA1", digits: "6", period: "30" });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Mã dự phòng: 10 mã, mỗi mã 8 ký tự chữ-số dễ đọc (bỏ 0/O/1/I), dạng XXXX-XXXX. */
export function generateBackupCodes(count = 10): string[] {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    let s = "";
    for (let j = 0; j < 8; j++) s += alphabet[randomInt(alphabet.length)];
    codes.push(`${s.slice(0, 4)}-${s.slice(4)}`);
  }
  return codes;
}

/** Chuẩn hóa mã dự phòng người dùng nhập: bỏ dấu gạch, khoảng trắng, viết hoa. */
export function normalizeBackupCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
