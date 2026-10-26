// Tự nghiên cứu (OWNER 26/10: "Tôi muốn AI tự gọi để nghiên cứu đúng insight"): "AI tìm nỗi đau khách" tự chạy ngay khi tạo chủ đề và
// theo lịch (bộ chạy nền mỗi giờ — src/lib/scheduler.ts): mỗi lượt giờ tối đa 1 chủ đề, tối đa AUTO_PER_DAY chủ đề / ngày (giãn ra theo giờ),
// bỏ chủ đề đã tự nghiên cứu trong AUTO_EVERY_DAYS ngày, bỏ chủ đề cũ không còn dùng (tạo quá AUTO_ACTIVE_DAYS ngày). Mọi lượt AI qua
// gate() (công tắc AI Nghiên cứu, trần riêng, trần chung); YouTube có chặn hạn mức riêng; thiếu khoá thì lặng lẽ bỏ qua (không gửi cảnh báo).
// Kết quả = insight ĐỀ XUẤT chờ OWNER duyệt (review_status pending), đã bỏ câu gần trùng. Không tự duyệt.
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getSetting, setSetting } from "@/lib/admin";
import { aiReadiness, webSearchProvider } from "@/lib/ai";
import { roleAllows, roleById } from "@/lib/ai-roster";
import { logActivity } from "@/lib/activity";
import { finishRun, startRun } from "@/lib/connectors/config";
import { TOPIC_PURPOSE, runPainResearch } from "./topic";
import { youtubeReadiness } from "./youtube";

export const AUTO_PER_DAY = 2;
export const AUTO_EVERY_DAYS = 7;
export const AUTO_ACTIVE_DAYS = 120;
const DAY = 86_400_000;
const ENABLED_KEY = "research.auto";
const LAST_KEY = "research.autoLast";
const DAY_KEY = "research.autoDay";
const atKey = (id: string) => `research.autoAt.${id}`;

export const autoResearchEnabled = () => getSetting(ENABLED_KEY) !== "0"; // mặc định BẬT
export const setAutoResearch = (on: boolean) => setSetting(ENABLED_KEY, on ? "1" : "0");
export const lastAutoAt = (taskId: string): string | null => getSetting(atKey(taskId)) || null;
export function lastAutoRun(): { at: string; topic: string; notes: string } | null {
  try {
    const v = JSON.parse(getSetting(LAST_KEY) ?? "null") as { at: string; topic: string; notes: string } | null;
    return v?.at ? v : null;
  } catch {
    return null;
  }
}

/** Ngày theo giờ Việt Nam (đếm số chủ đề đã tự chạy hôm nay). */
const vnDay = (now: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(now);
function todayCount(now: Date): number {
  try {
    const v = JSON.parse(getSetting(DAY_KEY) ?? "{}") as { day?: string; count?: number };
    return v.day === vnDay(now) ? Number(v.count) || 0 : 0;
  } catch {
    return 0;
  }
}

/**
 * Có chạy được không — KHÔNG gọi gì: tắt tự nghiên cứu / AI Nghiên cứu tắt hoặc chạm trần / không nguồn nào có khoá → lý do để bỏ qua.
 * Có ít nhất một nguồn sẵn sàng (YouTube có khoá + còn hạn mức, hoặc tìm web có khoá hãng) mới chạy.
 */
export function autoReadiness(now = new Date()): { ok: true } | { ok: false; reason: string } {
  if (!autoResearchEnabled()) return { ok: false, reason: "Tự nghiên cứu đang tắt" };
  const allowed = roleAllows(roleById("research")!);
  if (!allowed.ok) return { ok: false, reason: allowed.reason };
  if (!youtubeReadiness(now).ok && !aiReadiness("research", { alsoProvider: webSearchProvider("research") }).ok) return { ok: false, reason: "Chưa có khoá nguồn nào (YouTube / AI tìm web)" };
  return { ok: true };
}

/** Chủ đề đến lượt: chủ đề nghiên cứu (bước 2), không đang chạy, tạo trong AUTO_ACTIVE_DAYS ngày, chưa tự chạy trong AUTO_EVERY_DAYS ngày. Chưa chạy bao giờ trước, rồi lâu nhất. */
export function pickTopicsForAuto(now = new Date(), limit = 1): string[] {
  const t = now.getTime();
  return getDb()
    .select()
    .from(schema.researchTasks)
    .where(eq(schema.researchTasks.purpose, TOPIC_PURPOSE))
    .orderBy(desc(schema.researchTasks.createdAt))
    .all()
    .filter((r) => r.status !== "running" && t - Date.parse(r.createdAt) <= AUTO_ACTIVE_DAYS * DAY)
    .map((r) => ({ id: r.id, last: Date.parse(lastAutoAt(r.id) ?? "") || 0 }))
    .filter((r) => t - r.last >= AUTO_EVERY_DAYS * DAY)
    .sort((a, b) => a.last - b.last)
    .slice(0, limit)
    .map((r) => r.id);
}

/** Còn lượt hôm nay không (chủ đề tạo mới và lịch dùng CHUNG bộ đếm AUTO_PER_DAY). */
export const autoQuotaLeft = (now = new Date()) => Math.max(0, AUTO_PER_DAY - todayCount(now));

/**
 * Tự nghiên cứu MỘT chủ đề (đề xuất chờ duyệt) + ghi nhật ký hoạt động và sync run. Không sẵn sàng / hết lượt hôm nay → bỏ qua, không gọi.
 * Kiểm + giữ lượt (bộ đếm ngày, mốc chủ đề) chạy ĐỒNG BỘ trước lần await đầu tiên: hai lượt cùng lúc trong tiến trình không vượt trần.
 */
export async function autoResearchTopic(taskId: string, opts: { now?: Date; fetch?: typeof fetch } = {}): Promise<{ ran: boolean; message: string }> {
  const now = opts.now ?? new Date();
  const ready = autoReadiness(now);
  if (!ready.ok) return { ran: false, message: ready.reason };
  if (todayCount(now) >= AUTO_PER_DAY) return { ran: false, message: `Đã tự nghiên cứu đủ ${AUTO_PER_DAY} chủ đề hôm nay` };
  const task = getDb().select().from(schema.researchTasks).where(eq(schema.researchTasks.id, taskId)).get();
  if (!task || task.status === "running") return { ran: false, message: "Chủ đề không có hoặc đang chạy" };
  setSetting(atKey(taskId), now.toISOString()); // đánh dấu TRƯỚC khi chạy: lỗi giữa chừng không làm lịch chạy lại liên tục
  setSetting(DAY_KEY, JSON.stringify({ day: vnDay(now), count: todayCount(now) + 1 }));
  const topic = task.question.replace(/^Chủ đề: /, "");
  const run = startRun("research", "auto");
  const r = await runPainResearch(taskId, "AI tự nghiên cứu", { pending: true, fetch: opts.fetch, now });
  const message = `${r.insights} insight đề xuất · ${r.notes.join(" · ")}`.slice(0, 480);
  finishRun(run, r.ok, `“${topic.slice(0, 60)}”: ${message}`, r.insights);
  setSetting(LAST_KEY, JSON.stringify({ at: now.toISOString(), topic: topic.slice(0, 120), notes: message }));
  logActivity("ai", `AI tự nghiên cứu “${topic.slice(0, 80)}”: ${message}`, "research");
  return { ran: true, message };
}

/** Khoảng cách tối thiểu giữa hai lượt THEO LỊCH ("Chạy ngay" trong Cài đặt không kéo thêm lượt trong cùng giờ). */
export const AUTO_SPACING_MS = 55 * 60_000;
const TICK_KEY = "research.autoTickAt";
const g = globalThis as unknown as { __baorAutoResearchRunning?: boolean };

/** Chủ đề sẽ chạy ở lượt lịch này (không gọi gì): đang chạy / chưa đủ giãn cách / hết lượt ngày / chưa sẵn sàng → null. */
export function planAutoResearch(now = new Date()): string | null {
  if (g.__baorAutoResearchRunning) return null;
  if (now.getTime() - (Date.parse(getSetting(TICK_KEY) ?? "") || 0) < AUTO_SPACING_MS) return null;
  if (todayCount(now) >= AUTO_PER_DAY) return null;
  if (!autoReadiness(now).ok) return null;
  return pickTopicsForAuto(now, 1)[0] ?? null;
}

/** Lượt theo lịch, chờ đến khi xong (dùng trong test và nơi cần kết quả). "" = không có việc. */
export async function runAutoResearchTick(now = new Date(), fetchImpl?: typeof fetch): Promise<string> {
  const id = planAutoResearch(now);
  if (!id) return "";
  setSetting(TICK_KEY, now.toISOString());
  g.__baorAutoResearchRunning = true;
  try {
    const r = await autoResearchTopic(id, { now, fetch: fetchImpl });
    return r.ran ? `tự nghiên cứu 1 chủ đề (${r.message.slice(0, 80)})` : "";
  } finally {
    g.__baorAutoResearchRunning = false;
  }
}

/**
 * Cho bộ chạy nền: chạy TÁCH RỜI (không chặn lượt mỗi phút — đăng bài đến giờ vẫn chạy trong lúc AI tìm). Một lượt tại một thời điểm,
 * giãn cách AUTO_SPACING_MS, chung trần ngày. Trả ngay chuỗi tóm tắt ("" = không bắt đầu) + promise để chờ khi cần.
 */
export function kickAutoResearch(now = new Date(), fetchImpl?: typeof fetch): { started: string; done: Promise<string> } {
  if (!planAutoResearch(now)) return { started: "", done: Promise.resolve("") };
  const done = runAutoResearchTick(now, fetchImpl).catch((e) => {
    logActivity("system", `Tự nghiên cứu lỗi: ${e instanceof Error ? e.message : e}`, "research");
    return "";
  });
  return { started: "tự nghiên cứu 1 chủ đề (chạy nền)", done };
}
