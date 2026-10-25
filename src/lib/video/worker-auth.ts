// Khoá máy dựng: máy dựng của OWNER gọi /api/render-worker/* bằng "Authorization: Bearer <khoá>". Máy chủ chỉ lưu mã băm SHA-256
// (Cài đặt › Video › Nơi dựng video tạo khoá, hiện ĐÚNG MỘT LẦN). Tạo khoá mới = thu hồi khoá cũ.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getSetting, setSetting } from "@/lib/admin";

const HASH_KEY = "video.workerKeyHash";
const sha = (s: string) => createHash("sha256").update(s).digest();

export function workerKeyConfigured(): boolean {
  return !!getSetting(HASH_KEY);
}

export function generateWorkerKey(): string {
  const key = `bw_${randomBytes(32).toString("base64url")}`;
  setSetting(HASH_KEY, sha(key).toString("hex"));
  return key;
}

export function revokeWorkerKey(): void {
  setSetting(HASH_KEY, "");
}

/** Kiểm khoá trong header Authorization (so sánh thời gian hằng). */
export function workerAuthorized(req: Request): boolean {
  const stored = getSetting(HASH_KEY);
  if (!stored) return false;
  const m = (req.headers.get("authorization") ?? "").match(/^Bearer\s+(\S{20,200})$/);
  if (!m) return false;
  const a = sha(m[1]);
  const b = Buffer.from(stored, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Tên máy dựng (header x-baor-worker), chỉ ký tự an toàn. */
export function workerName(req: Request): string {
  return (req.headers.get("x-baor-worker") ?? "may-dung").replace(/[^\w.-]/g, "").slice(0, 60) || "may-dung";
}

/** Ghi lần cuối máy dựng liên lạc (hiện ở Cài đặt). */
export function touchWorker(name: string): void {
  setSetting("video.workerLastSeen", JSON.stringify({ name, at: new Date().toISOString() }));
}

export function workerLastSeen(): { name: string; at: string } | null {
  try {
    return JSON.parse(getSetting("video.workerLastSeen") ?? "null");
  } catch {
    return null;
  }
}

/** Máy dựng còn liên lạc trong 2 phút gần nhất (nó gọi máy chủ mỗi 20 giây). */
export function workerOnline(seen = workerLastSeen(), now = Date.now()): boolean {
  return !!seen && now - Date.parse(seen.at) < 2 * 60_000;
}
