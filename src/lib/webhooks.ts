import { randomBytes } from "node:crypto";
import { getSetting, setSetting } from "@/lib/admin";

// Khóa xác minh webhook, sinh một lần và lưu trong Cài đặt.
export function getMetaVerifyToken(): string {
  let t = getSetting("meta.verifyToken");
  if (!t) {
    t = randomBytes(12).toString("hex");
    setSetting("meta.verifyToken", t);
  }
  return t;
}

export function getLeadWebhookKey(): string {
  let k = getSetting("webhook.leadKey");
  if (!k) {
    k = randomBytes(16).toString("hex");
    setSetting("webhook.leadKey", k);
  }
  return k;
}

// Địa chỉ công khai của hệ thống (đặt PUBLIC_URL trên VPS; mặc định theo DOMAIN của deploy).
export function publicBaseUrl(): string {
  const env = process.env.PUBLIC_URL || (process.env.DOMAIN ? `https://${process.env.DOMAIN}` : "");
  return env.replace(/\/+$/, "") || "https://mkt.baor.vn";
}
