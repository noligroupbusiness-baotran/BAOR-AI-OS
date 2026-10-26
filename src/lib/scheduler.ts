// Bộ chạy nền trong tiến trình Next.js (khởi động từ src/instrumentation.ts).
// Mỗi phút: đăng bài đến giờ. Mỗi giờ: đồng bộ số liệu kênh, luật CPL, tự nghiên cứu chủ đề. Mỗi ngày: dọn nhật ký cũ. Một tiến trình = một lịch.
import { publishDuePosts, syncChannelMetrics } from "@/lib/connectors/sync";
import { runScheduledRules } from "@/lib/automation/engine";
import { sendAlert } from "@/lib/alerts";
import { pruneOldData } from "@/lib/retention";
import { purgePostedVideos } from "@/lib/videos/library";
import { runAutoEditOnce } from "@/lib/video/auto-edit";
import { notionConfigured, syncSecondBrain } from "@/lib/knowledge/sync";
import { getSetting, setSetting } from "@/lib/admin";
import { publishDueVideoPosts, syncVideoPostMetrics, verifyPublishingPosts } from "@/lib/publishing/video";
import { autoOptimize, enforceAuthorization, proposeFromVideoPosts, syncAdInsights } from "@/lib/ads/engine";
import { refreshProposals } from "@/lib/learning";
import { kickAutoResearch } from "@/lib/research/auto";

const g = globalThis as unknown as { __baorScheduler?: { timer: NodeJS.Timeout; lastHourly: number; lastDaily: number }; __baorTickRunning?: boolean };

/** Lượt trước chưa xong (mạng chậm, "Chạy ngay" trùng nhịp 60 giây) thì không chạy chồng: hai lượt cùng lúc có thể đăng trùng. */
export const TICK_BUSY = "Lượt chạy trước chưa xong — bỏ qua, không chạy chồng.";

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

async function tick(): Promise<boolean> {
  if (g.__baorTickRunning) return false;
  g.__baorTickRunning = true;
  try {
    await tickBody();
  } finally {
    g.__baorTickRunning = false;
  }
  return true;
}

async function tickBody() {
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
      // Giữ chi tiêu đang chạy trong ủy quyền (hết hạn, vượt trần tháng, quá ngày kết thúc → dừng)
      const enf = await enforceAuthorization();
      if (enf.paused || enf.failed.length) parts.push(`ủy quyền: dừng ${enf.paused}${enf.failed.length ? `, lỗi ${enf.failed.length}` : ""}`);
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
        parts.push(`Kiến thức: ${kb.ok ? "đồng bộ xong" : "lỗi đồng bộ"}`); // chữ hiển thị (25/10: ẩn tên Second Brain khỏi giao diện)
      }
      // Tự nghiên cứu: chạy TÁCH RỜI (không giữ lượt mỗi phút — đăng bài đến giờ vẫn chạy), tối đa 1 chủ đề / giờ, 2 chủ đề / ngày (chung với
      // chủ đề mới tạo); thiếu khoá / AI tắt → lặng lẽ bỏ qua (src/lib/research/auto.ts)
      try {
        const ar = kickAutoResearch(new Date(now));
        if (ar.started) parts.push(ar.started);
      } catch (e) {
        parts.push(`tự nghiên cứu lỗi: ${e instanceof Error ? e.message : e}`);
      }
    }
    // Mỗi ngày: dọn nhật ký cũ và tệp mồ côi theo chính sách lưu trữ.
    if (!g.__baorScheduler || now - g.__baorScheduler.lastDaily >= 24 * 60 * 60 * 1000) {
      if (g.__baorScheduler) g.__baorScheduler.lastDaily = now;
      state.lastDailyAt = state.lastTickAt;
      // CP06: phân tích kết quả mỗi ngày, cập nhật đề xuất cải tiến (chờ OWNER quyết)
      try {
        const lp = refreshProposals();
        if (lp.created) parts.push(`${lp.created} đề xuất cải tiến mới`);
      } catch (e) {
        parts.push(`phân tích lỗi: ${e instanceof Error ? e.message : e}`);
      }
      // Tổng kho video ngắn: video đã đăng thật quá hạn (mặc định 1 ngày) → gỡ tệp video, giữ bản ghi
      try {
        const pv = purgePostedVideos();
        if (pv.videos) parts.push(`kho video: gỡ tệp ${pv.videos} video đã đăng (${Math.round(pv.bytes / 1024 / 1024)} MB)`);
      } catch (e) {
        parts.push(`kho video lỗi: ${e instanceof Error ? e.message : e}`);
      }
      const r = pruneOldData();
      const total = r.activity + r.decisions + r.automationRuns + r.syncRuns + r.campaignLogs + r.aiCalls + r.orphanFiles + r.orphanRows + r.trashFiles;
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
  if (g.__baorTickRunning) return TICK_BUSY;
  // Việc mỗi giờ chạy lại ngay; tự tăng ngân sách quảng cáo vẫn theo thời gian chờ riêng (AUTO_SCALE_COOLDOWN_MS)
  if (g.__baorScheduler) g.__baorScheduler.lastHourly = 0;
  if (!(await tick())) return TICK_BUSY;
  return state.lastResult;
}
