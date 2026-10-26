import { randomBytes } from "node:crypto";
import { getSetting, setSetting } from "@/lib/admin";

// Câu ghi vào sync_runs khi nhận webhook lỗi — DÙNG CHUNG giữa src/app/api/webhooks/* và src/lib/attention.ts (lỗi khoá / chữ ký được lần
// nhận ok sau đóng; lỗi dữ liệu từng gói thì không). Đổi câu ở đây, không gõ lại nguyên văn ở nơi khác.
export const WEBHOOK_BAD_KEY_MSG = "Khóa webhook không đúng.";
export const WEBHOOK_BAD_SIGNATURE_MSG = "Chữ ký webhook không hợp lệ (kiểm tra App Secret).";
export const WEBHOOK_BAD_JSON_MSG = "Payload không phải JSON.";
export const WEBHOOK_MISSING_NAME_MSG = "Thiếu tên khách.";
export const WEBHOOK_TOO_LARGE_MSG = "Payload quá lớn.";
/** Lỗi do CẤU HÌNH (không phải dữ liệu một gói). */
export const WEBHOOK_CONFIG_ERRORS: readonly string[] = [WEBHOOK_BAD_KEY_MSG, WEBHOOK_BAD_SIGNATURE_MSG];

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
