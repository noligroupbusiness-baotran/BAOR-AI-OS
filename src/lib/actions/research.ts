"use server";

import { requirePermission } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { syncSecondBrain } from "@/lib/knowledge/sync";
import { importKnowledgeSnapshot, type KnowledgeSnapshot } from "@/lib/knowledge";
import { getResearchTask } from "@/lib/research";
import { done } from "./common";
import { SOCIAL_KINDS, detectPlatform, type SocialKind } from "@/lib/research/social";
import { addSourceToTopic, analyzeLink, approveInsight, createTopic, deleteInsight, lastLinkKey, researchAiOn, runPainResearch } from "@/lib/research/topic";
import { autoQuotaLeft, autoReadiness, autoResearchTopic, setAutoResearch } from "@/lib/research/auto";
import { setSetting } from "@/lib/admin";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const fail = (path: string, msg: string): never => done(`${path}${path.includes("?") ? "&" : "?"}tone=error`, msg);

// ---------- Second Brain ----------

export async function syncKnowledgeNow() {
  const actor = await requirePermission("manager", "/settings#second-brain");
  const r = await syncSecondBrain();
  logActivity("human", `${actor.name} đồng bộ kho kiến thức từ Notion: ${r.message}`, "research");
  if (!r.ok) return fail("/settings#second-brain", r.message);
  done("/settings#second-brain", r.message);
}

export async function importKnowledgeSnapshotAction(fd: FormData) {
  const actor = await requirePermission("admin", "/settings#second-brain");
  let snap: KnowledgeSnapshot;
  try {
    snap = JSON.parse(str(fd, "json")) as KnowledgeSnapshot;
  } catch {
    return fail("/settings#second-brain", "Ảnh chụp không phải JSON hợp lệ");
  }
  try {
    const r = importKnowledgeSnapshot(snap);
    logActivity("human", `${actor.name} nhập ảnh chụp kho kiến thức (${r.pages} trang, cập nhật ${r.changed}).`, "research");
    done("/settings#second-brain", `Đã nhập ${r.pages} trang, cập nhật ${r.changed}`);
  } catch (e) {
    return fail("/settings#second-brain", e instanceof Error ? e.message : "Nhập ảnh chụp lỗi");
  }
}

// ---------- Nghiên cứu (Personal Brand System bước 1 → 2), bản đơn giản ----------

const topicOf = (t: NonNullable<ReturnType<typeof getResearchTask>>) => t.task.question.replace(/^Chủ đề: /, "");

// 1. OWNER đề xuất chủ đề → AI tự tìm nỗi đau khách ngay (đề xuất chờ duyệt) nếu đã có khoá + AI Nghiên cứu bật
export async function createTopicAction(fd: FormData) {
  const actor = await requirePermission("manager", "/insights/research");
  let id: string;
  try {
    id = createTopic(str(fd, "topic"), actor.name);
  } catch (e) {
    return fail("/insights/research", e instanceof Error ? e.message : "Không tạo được chủ đề");
  }
  logActivity("human", `${actor.name} đề xuất chủ đề nghiên cứu “${str(fd, "topic").slice(0, 120)}”.`, "research");
  const auto = autoReadiness().ok && autoQuotaLeft() > 0; // chung trần ngày với lịch (autoResearchTopic tự kiểm lại)
  // Chạy nền trong tiến trình (không chặn chuyển trang); lỗi đã ghi vào nhật ký / sync run trong autoResearchTopic
  if (auto) void autoResearchTopic(id).catch((e) => logActivity("system", `Tự nghiên cứu lỗi: ${e instanceof Error ? e.message : e}`, "research"));
  done(`/insights/research/${id}`, auto ? "Đã tạo chủ đề — AI đang tự tìm nỗi đau khách, insight sẽ chờ bạn duyệt" : "Đã tạo chủ đề — dán link bài / video để lấy insight");
}

// 2. Link (+ nền tảng, tự nhận từ link) → hệ thống tự đọc bình luận; có chữ dán tay → phân tích phần dán
export async function analyzeSourceAction(fd: FormData) {
  const actor = await requirePermission("manager", "/insights/research");
  const id = str(fd, "id");
  const back = `/insights/research/${id}`;
  const url = str(fd, "url");
  if (!/^https?:\/\/\S+$/i.test(url)) return fail(back, "Cần link bài / video (https://…)");
  const picked = str(fd, "kind");
  const kind: SocialKind = picked in SOCIAL_KINDS ? (picked as SocialKind) : detectPlatform(url);
  const t = getResearchTask(id);
  if (!t) return fail("/insights/research", "Không tìm thấy chủ đề");
  const paste = String(fd.get("paste") ?? "");
  const useAi = researchAiOn();
  const r = paste.trim()
    ? await addSourceToTopic({ taskId: id, kind, url, paste, topic: topicOf(t), useAi, by: actor.name })
    : await analyzeLink({ taskId: id, url, kind, topic: topicOf(t), by: actor.name });
  if (!r.ok) {
    if ("needPaste" in r && r.needPaste) {
      setSetting(lastLinkKey(id), JSON.stringify({ url, kind }));
      return fail(`${back}?paste=1`, r.error);
    }
    return fail(back, r.error);
  }
  setSetting(lastLinkKey(id), "");
  logActivity(useAi ? "ai" : "human", `${actor.name} phân tích ${r.comments} bình luận (${SOCIAL_KINDS[kind]}): ${r.ruleInsights} insight theo luật, ${r.aiInsights} insight AI.`, "research");
  done(back, `Đã phân tích ${r.comments} bình luận: ${r.ruleInsights + r.aiInsights} insight${r.aiError ? ` (AI lỗi: ${r.aiError.slice(0, 80)})` : ""}`);
}

// "AI tìm nỗi đau khách": YouTube + web Việt Nam một lần; nguồn thiếu khoá thì bỏ qua kèm ghi chú
export async function painResearchAction(fd: FormData) {
  const actor = await requirePermission("manager", "/insights/research");
  const id = str(fd, "id");
  const back = `/insights/research/${id}`;
  const r = await runPainResearch(id, actor.name);
  logActivity("ai", `AI tìm nỗi đau khách: ${r.notes.join(" · ").slice(0, 200)}`, "research");
  if (!r.ok) return fail(back, r.notes.join(" · ") || "Chưa chạy được nguồn nào");
  done(back, `${r.insights} insight mới · ${r.notes.join(" · ")}`.slice(0, 240));
}

export async function approveInsightAction(fd: FormData) {
  await requirePermission("manager", "/insights/research");
  const id = str(fd, "id");
  if (!approveInsight(id, str(fd, "finding"))) return fail(`/insights/research/${id}`, "Không tìm thấy insight");
  done(`/insights/research/${id}`, "Đã duyệt insight");
}

export async function deleteInsightAction(fd: FormData) {
  await requirePermission("manager", "/insights/research");
  const id = str(fd, "id");
  deleteInsight(id, str(fd, "finding"));
  done(`/insights/research/${id}`, "Đã bỏ insight");
}

// Công tắc "Tự nghiên cứu" (chung cho mọi chủ đề, mặc định bật). Công tắc AI Nghiên cứu nằm ở Cài đặt › Đội AI.
export async function toggleAutoResearchAction(fd: FormData) {
  await requirePermission("admin", "/insights/research");
  const on = str(fd, "on") === "1";
  setAutoResearch(on);
  done(str(fd, "back") || "/insights/research", on ? "Đã bật tự nghiên cứu" : "Đã tắt tự nghiên cứu");
}
