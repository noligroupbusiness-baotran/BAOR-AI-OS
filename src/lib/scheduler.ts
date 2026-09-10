// Bộ chạy nền trong tiến trình Next.js (khởi động từ src/instrumentation.ts).
// Mỗi phút: đăng bài đến giờ. Mỗi giờ: đồng bộ số liệu kênh, luật CPL. Một tiến trình = một lịch.
import { autoPauseAdsByCpl, publishDuePosts, syncChannelMetrics } from "@/lib/connectors/sync";

const g = globalThis as unknown as { __baorScheduler?: { timer: NodeJS.Timeout; lastHourly: number } };

export interface SchedulerState {
  running: boolean;
  lastTickAt: string | null;
  lastHourlyAt: string | null;
  lastResult: string;
}

const state: SchedulerState = { running: false, lastTickAt: null, lastHourlyAt: null, lastResult: "" };

export function schedulerState(): SchedulerState {
  return { ...state, running: !!g.__baorScheduler };
}

async function tick() {
  const now = Date.now();
  state.lastTickAt = new Date(now).toISOString();
  const parts: string[] = [];
  try {
    const p = await publishDuePosts();
    if (p.published || p.failed) parts.push(`đăng ${p.published}, lỗi ${p.failed}`);
    if (!g.__baorScheduler || now - g.__baorScheduler.lastHourly >= 60 * 60 * 1000) {
      if (g.__baorScheduler) g.__baorScheduler.lastHourly = now;
      state.lastHourlyAt = state.lastTickAt;
      const m = await syncChannelMetrics();
      parts.push(`đồng bộ ${m.updated} mục tiêu${m.errors.length ? `, lỗi ${m.errors.length}` : ""}`);
      const paused = autoPauseAdsByCpl();
      if (paused) parts.push(`tự dừng ${paused} quảng cáo`);
    }
  } catch (e) {
    parts.push(`lỗi: ${e instanceof Error ? e.message : String(e)}`);
  }
  state.lastResult = parts.join(" · ") || "không có việc";
}

export function startScheduler(intervalMs = 60_000) {
  if (g.__baorScheduler) return;
  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref?.();
  g.__baorScheduler = { timer, lastHourly: 0 };
  // Chạy lần đầu sau 15 giây để máy chủ kịp khởi động.
  setTimeout(() => void tick(), 15_000).unref?.();
}

// Cho nút "Chạy ngay" trong Cài đặt.
export async function runSchedulerNow(): Promise<string> {
  if (g.__baorScheduler) g.__baorScheduler.lastHourly = 0;
  await tick();
  return state.lastResult;
}
