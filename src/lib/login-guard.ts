// Chặn dò mật khẩu: đếm số lần đăng nhập sai theo email và theo IP, quá ngưỡng thì khóa tạm.
// Bộ nhớ trong tiến trình (một tiến trình = một bộ đếm); khởi động lại là xóa. Không lưu mật khẩu.

export interface GuardConfig {
  /** Số lần sai tối đa trong cửa sổ trước khi khóa. */
  maxFailures: number;
  /** Cửa sổ đếm lần sai (ms). */
  windowMs: number;
  /** Thời gian khóa sau khi vượt ngưỡng (ms). */
  lockMs: number;
}

export const DEFAULT_GUARD: GuardConfig = { maxFailures: 5, windowMs: 15 * 60_000, lockMs: 15 * 60_000 };

interface Entry {
  failures: number[];
  lockedUntil: number;
}

export class LoginGuard {
  private entries = new Map<string, Entry>();
  constructor(private cfg: GuardConfig = DEFAULT_GUARD) {}

  private entry(key: string): Entry {
    let e = this.entries.get(key);
    if (!e) {
      e = { failures: [], lockedUntil: 0 };
      this.entries.set(key, e);
    }
    return e;
  }

  /** Còn bị khóa bao nhiêu giây (0 = không khóa). Kiểm tra cả email lẫn IP. */
  lockedSeconds(keys: string[], now = Date.now()): number {
    let max = 0;
    for (const k of keys) {
      const e = this.entries.get(k);
      if (e && e.lockedUntil > now) max = Math.max(max, Math.ceil((e.lockedUntil - now) / 1000));
    }
    return max;
  }

  /** Ghi một lần sai; trả về true nếu lần này làm khóa tài khoản/IP. */
  fail(keys: string[], now = Date.now()): { locked: boolean; remaining: number } {
    let locked = false;
    let remaining = this.cfg.maxFailures;
    for (const k of keys) {
      const e = this.entry(k);
      e.failures = e.failures.filter((t) => now - t < this.cfg.windowMs);
      e.failures.push(now);
      remaining = Math.min(remaining, Math.max(0, this.cfg.maxFailures - e.failures.length));
      if (e.failures.length >= this.cfg.maxFailures) {
        e.lockedUntil = now + this.cfg.lockMs;
        e.failures = [];
        locked = true;
      }
    }
    return { locked, remaining };
  }

  /** Đăng nhập đúng: xóa bộ đếm của các khóa liên quan. */
  succeed(keys: string[]) {
    for (const k of keys) this.entries.delete(k);
  }

  /** Dọn các mục đã hết hạn để bộ nhớ không phình. */
  prune(now = Date.now()) {
    for (const [k, e] of this.entries) {
      e.failures = e.failures.filter((t) => now - t < this.cfg.windowMs);
      if (!e.failures.length && e.lockedUntil <= now) this.entries.delete(k);
    }
  }

  size() {
    return this.entries.size;
  }
}

// Một bộ đếm dùng chung cho cả tiến trình (giữ qua hot reload ở dev).
const g = globalThis as unknown as { __baorLoginGuard?: LoginGuard };
export function loginGuard(): LoginGuard {
  if (!g.__baorLoginGuard) g.__baorLoginGuard = new LoginGuard();
  return g.__baorLoginGuard;
}

/** Lấy IP người gọi từ header do reverse proxy đặt (Nginx, Cloudflare). */
export function clientIp(get: (name: string) => string | null | undefined): string {
  const xf = get("x-forwarded-for");
  if (xf) return xf.split(",")[0].trim();
  return get("x-real-ip")?.trim() || "unknown";
}
