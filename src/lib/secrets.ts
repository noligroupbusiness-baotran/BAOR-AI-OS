import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

// Mã hóa giá trị bí mật (token, khóa API) trước khi lưu vào SQLite.
// Khóa mã hóa suy ra từ AUTH_SECRET; đổi AUTH_SECRET thì phải nhập lại token.
const PREFIX = "enc:v1:";

function key(): Buffer {
  const secret = process.env.AUTH_SECRET || "dev-secret-change-me-in-production";
  return scryptSync(secret, "baor-integrations", 32);
}

export function encryptSecret(plain: string): string {
  if (!plain) return "";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}

// Giá trị chưa mã hóa (lưu từ phiên bản cũ) được trả nguyên văn để không mất kết nối.
export function decryptSecret(value: string): string {
  if (!value || !isEncrypted(value)) return value;
  const [iv, tag, data] = value.slice(PREFIX.length).split(":");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}

// Che giá trị khi hiển thị: chỉ 4 ký tự cuối.
export function maskSecret(plain: string): string {
  if (!plain) return "";
  return plain.length <= 4 ? "••••" : `••••${plain.slice(-4)}`;
}
