// Giới hạn tần suất theo cửa sổ trượt, bộ nhớ trong tiến trình (một tiến trình = một bộ đếm; khởi động lại là xóa).
// Dùng cho webhook, xuất dữ liệu, đăng nhập, xác thực hai lớp. Không thay thế WAF; đủ chặn kịch bản dò/quét thô.

export interface RateLimitRule {
  /** Số yêu cầu tối đa trong cửa sổ. */
  limit: number;
  /** Cửa sổ (ms). */
  windowMs: number;
}

export interface RateLimitResult {
  ok: boolean;
  /** Số lượt còn lại trong cửa sổ hiện tại. */
  remaining: number;
  /** Nếu bị chặn: số giây cần chờ. */
  retryAfterSec: number;
}

export class RateLimiter {
  private hits = new Map<string, number[]>();
  private lastPrune = 0;

  check(key: string, rule: RateLimitRule, now = Date.now()): RateLimitResult {
    const from = now - rule.windowMs;
    const list = (this.hits.get(key) ?? []).filter((t) => t > from);
    if (list.length >= rule.limit) {
      this.hits.set(key, list);
      const retryAfterSec = Math.max(1, Math.ceil((list[0] + rule.windowMs - now) / 1000));
      return { ok: false, remaining: 0, retryAfterSec };
    }
    list.push(now);
    this.hits.set(key, list);
    if (now - this.lastPrune > 60_000) this.prune(now);
    return { ok: true, remaining: rule.limit - list.length, retryAfterSec: 0 };
  }

  reset(key: string) {
    this.hits.delete(key);
  }

  prune(now = Date.now(), maxWindowMs = 60 * 60_000) {
    this.lastPrune = now;
    for (const [k, list] of this.hits) {
      const kept = list.filter((t) => t > now - maxWindowMs);
      if (kept.length) this.hits.set(k, kept);
      else this.hits.delete(k);
    }
  }

  size() {
    return this.hits.size;
  }
}

// Luật mặc định theo từng cửa. Đổi số ở đây, không rải rác trong route.
export const RATE_RULES = {
  /** Webhook từ bên ngoài, theo IP. */
  webhook: { limit: 120, windowMs: 60_000 },
  /** Đăng nhập, theo IP (song song với khóa 5 lần sai của login-guard). */
  login: { limit: 30, windowMs: 10 * 60_000 },
  /** Nhập mã xác thực hai lớp, theo email. */
  mfa: { limit: 10, windowMs: 10 * 60_000 },
  /** Xuất CSV / tải sao lưu, theo tài khoản. */
  export: { limit: 20, windowMs: 60_000 },
  /** Điểm kiểm tra sức khỏe công khai, theo IP. */
  health: { limit: 60, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitRule>;

const g = globalThis as unknown as { __baorRateLimiter?: RateLimiter };
export function rateLimiter(): RateLimiter {
  if (!g.__baorRateLimiter) g.__baorRateLimiter = new RateLimiter();
  return g.__baorRateLimiter;
}

/** Tiện ích cho route: kiểm tra và trả Response 429 sẵn nếu vượt. */
export function limitOr429(key: string, rule: RateLimitRule): Response | null {
  const r = rateLimiter().check(key, rule);
  if (r.ok) return null;
  return new Response(JSON.stringify({ error: "quá nhiều yêu cầu", retryAfterSec: r.retryAfterSec }), {
    status: 429,
    headers: { "Content-Type": "application/json", "Retry-After": String(r.retryAfterSec), "Cache-Control": "no-store" },
  });
}
