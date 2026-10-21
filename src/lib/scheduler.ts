// Bộ chạy nền trong tiến trình Next.js (khởi động từ src/instrumentation.ts).
// Mỗi phút: đăng bài đến giờ. Mỗi giờ: đồng bộ số liệu kênh, luật CPL. Mỗi ngày: dọn nhật ký cũ. Một tiến trình = một lịch.
import { publishDuePosts, syncChannelMetrics } from "@/lib/connectors/sync";
import { runScheduledRules } from "@/lib/automation/engine";
import { sendAlert } from "@/lib/alerts";
import { pruneOldData } from "@/lib/retention";
import { runAutoEditOnce } from "@/lib/video/auto-edit";
import { notionConfigured, syncSecondBrain } from "@/lib/knowledge/sync";
import { getSetting, setSetting } from "@/lib/admin";
import { publishDueVideoPosts, syncVideoPostMetrics, verifyPublishingPosts } from "@/lib/publishing/video";
import { autoOptimize, proposeFromVideoPosts, syncAdInsights } from "@/lib/ads/engine";

const g = globalThis as unknown as { __baorScheduler?: { timer: NodeJS.Timeout; lastHourly: number; lastDaily: number } };

export interface SchedulerState {
  running: boolean;
  lastTickAt: string | null;
  lastHourlyAt: string | null;
  lastDailyAt: string | null;
  lastResult: string;
}

const state: SchedulerState = { running: false, lastTickAt: null, lastHourlyAt: null, lastDailyAt: null, lastResult: "" };

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
    // Video đã duyệt: đăng, rồi xác minh bằng cách đọc lại bài trên nền tảng
    const pv = await publishDueVideoPosts();
    if (pv.published || pv.tested || pv.failed) parts.push(`video: đăng ${pv.published}, thử ${pv.tested}, lỗi ${pv.failed}`);
    const vf = await verifyPublishingPosts();
    if (vf.verified) parts.push(`xác minh ${vf.verified} bài`);
    // Dựng video: nhận tệp mới trong hộp thư vào vào hàng đợi; việc dựng chạy ngầm trong tiến trình con (không chặn máy chủ)
    const v = runAutoEditOnce();
    if (v.processed) parts.push(`nhận ${v.processed} video vào hàng dựng`);
    if (!g.__baorScheduler || now - g.__baorScheduler.lastHourly >= 60 * 60 * 1000) {
      if (g.__baorScheduler) g.__baorScheduler.lastHourly = now;
      state.lastHourlyAt = state.lastTickAt;
      const m = await syncChannelMetrics();
      parts.push(`đồng bộ ${m.updated} mục tiêu${m.errors.length ? `, lỗi ${m.errors.length}` : ""}`);
      const vm = await syncVideoPostMetrics();
      if (vm.updated || vm.errors) parts.push(`số liệu ${vm.updated} bài video${vm.errors ? `, lỗi ${vm.errors}` : ""}`);
      // Quảng cáo: đọc chi phí theo ngày, tự dừng khi vượt ngưỡng (tăng chỉ khi OWNER cho phép), đề xuất từ video tốt
      const ai = await syncAdInsights();
      if (ai.updated || ai.errors.length) parts.push(`chi phí ${ai.updated} quảng cáo${ai.errors.length ? `, lỗi ${ai.errors.length}` : ""}`);
      const opt = await autoOptimize();
      if (opt.paused || opt.scaled) parts.push(`tối ưu: dừng ${opt.paused}, tăng ${opt.scaled}`);
      const prop = proposeFromVideoPosts();
      if (prop) parts.push(`đề xuất ${prop} quảng cáo`);
      const rules = runScheduledRules();
      if (rules.fired || rules.errors) parts.push(`automation ${rules.fired} lần${rules.errors ? `, ${rules.errors} lỗi` : ""}`);
      // Second Brain: đồng bộ Notion mỗi 6 giờ khi đã có token (mốc lưu trong CSDL để khởi động lại không chạy dồn)
      const lastKb = Date.parse(getSetting("knowledge.lastAutoSync") ?? "") || 0;
      if (notionConfigured() && now - lastKb >= 6 * 60 * 60 * 1000) {
        setSetting("knowledge.lastAutoSync", new Date(now).toISOString());
        const kb = await syncSecondBrain();
        parts.push(`Second Brain: ${kb.ok ? "đồng bộ xong" : "lỗi đồng bộ"}`);
      }
    }
    // Mỗi ngày: dọn nhật ký cũ và tệp mồ côi theo chính sách lưu trữ.
    if (!g.__baorScheduler || now - g.__baorScheduler.lastDaily >= 24 * 60 * 60 * 1000) {
      if (g.__baorScheduler) g.__baorScheduler.lastDaily = now;
      state.lastDailyAt = state.lastTickAt;
      const r = pruneOldData();
      const total = r.activity + r.decisions + r.automationRuns + r.syncRuns + r.campaignLogs + r.aiCalls + r.orphanFiles + r.orphanRows;
      if (total) parts.push(`dọn ${total} mục cũ`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    parts.push(`lỗi: ${msg}`);
    void sendAlert({ level: "error", title: "Bộ chạy nền gặp lỗi", text: msg, href: "/settings#syslog" });
  }
  state.lastResult = parts.join(" · ") || "không có việc";
}

export function startScheduler(intervalMs = 60_000) {
  if (g.__baorScheduler) return;
  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref?.();
  g.__baorScheduler = { timer, lastHourly: 0, lastDaily: 0 };
  // Chạy lần đầu sau 15 giây để máy chủ kịp khởi động.
  setTimeout(() => void tick(), 15_000).unref?.();
}

// Cho nút "Chạy ngay" trong Cài đặt.
export async function runSchedulerNow(): Promise<string> {
  if (g.__baorScheduler) g.__baorScheduler.lastHourly = 0;
  await tick();
  return state.lastResult;
}
