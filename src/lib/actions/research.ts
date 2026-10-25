"use server";

import { requirePermission } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { syncSecondBrain } from "@/lib/knowledge/sync";
import { importKnowledgeSnapshot, type KnowledgeSnapshot } from "@/lib/knowledge";
import { getResearchTask, runResearchWithAi } from "@/lib/research";
import { done } from "./common";
import { SOCIAL_KINDS, type SocialKind } from "@/lib/research/social";
import { addSourceToTopic, createTopic, deleteInsight } from "@/lib/research/topic";
import { roleAllows, roleById, saveRoleSettings } from "@/lib/ai-roster";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const fail = (path: string, msg: string): never => done(`${path}${path.includes("?") ? "&" : "?"}tone=error`, msg);

// ---------- Second Brain ----------

export async function syncKnowledgeNow() {
  const actor = await requirePermission("manager", "/settings#second-brain");
  const r = await syncSecondBrain();
  logActivity("human", `${actor.name} đồng bộ Second Brain từ Notion: ${r.message}`, "research");
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
    logActivity("human", `${actor.name} nhập ảnh chụp Second Brain (${r.pages} trang, cập nhật ${r.changed}).`, "research");
    done("/settings#second-brain", `Đã nhập ${r.pages} trang, cập nhật ${r.changed}`);
  } catch (e) {
    return fail("/settings#second-brain", e instanceof Error ? e.message : "Nhập ảnh chụp lỗi");
  }
}

// ---------- Nghiên cứu ----------

// ---------- Nghiên cứu (Personal Brand System bước 1 → 2), bản đơn giản ----------

// 1. OWNER đề xuất chủ đề
export async function createTopicAction(fd: FormData) {
  const actor = await requirePermission("manager", "/insights/research");
  let id: string;
  try {
    id = createTopic(str(fd, "topic"), actor.name);
  } catch (e) {
    return fail("/insights/research", e instanceof Error ? e.message : "Không tạo được chủ đề");
  }
  logActivity("human", `${actor.name} đề xuất chủ đề nghiên cứu “${str(fd, "topic").slice(0, 120)}”.`, "research");
  done(`/insights/research/${id}`, "Đã tạo chủ đề — thêm bình luận từ nền tảng để lấy insight");
}

// 2.1–2.4: dán bình luận / kiến thức → luật trước, AI Nghiên cứu sau (khi được phép)
export async function addSourceAction(fd: FormData) {
  const actor = await requirePermission("manager", "/insights/research");
  const id = str(fd, "id");
  const back = `/insights/research/${id}`;
  const kind = str(fd, "kind") as SocialKind;
  if (!(kind in SOCIAL_KINDS)) return fail(back, "Chọn nguồn");
  const url = str(fd, "url");
  if (!/^https?:\/\/\S+$/i.test(url)) return fail(back, "Cần link bài / video / nhóm (http…) làm nguồn");
  const t = getResearchTask(id);
  if (!t) return fail("/insights/research", "Không tìm thấy chủ đề");
  const useAi = fd.get("ai") === "on" && roleAllows(roleById("research")!).ok;
  const r = await addSourceToTopic({ taskId: id, kind, url, paste: String(fd.get("paste") ?? ""), topic: t.task.question.replace(/^Chủ đề: /, ""), useAi, by: actor.name });
  if (!r.ok) return fail(back, r.error);
  logActivity(useAi ? "ai" : "human", `${actor.name} thêm ${r.comments} bình luận (${SOCIAL_KINDS[kind]}): ${r.ruleInsights} insight theo luật, ${r.aiInsights} insight AI.`, "research");
  done(back, `Đã phân tích ${r.comments} bình luận: ${r.ruleInsights} insight theo luật${useAi ? `, ${r.aiInsights} insight AI` : ""}${r.aiError ? ` (AI lỗi: ${r.aiError.slice(0, 80)})` : ""}`);
}

// 2.4 Kiến thức trên social / web: AI Nghiên cứu tìm nguồn ngoài (cộng dồn vào chủ đề)
export async function webResearchAction(fd: FormData) {
  const actor = await requirePermission("manager", "/insights/research");
  const id = str(fd, "id");
  const back = `/insights/research/${id}`;
  const r = await runResearchWithAi(id, actor.name, { append: true });
  if (!r.ok) return fail(back, r.error);
  logActivity("ai", `AI Nghiên cứu tìm kiến thức trên mạng: ${r.summary.slice(0, 140)}`, "research");
  done(back, "AI đã tìm xong, insight mới ở bên dưới");
}

export async function deleteInsightAction(fd: FormData) {
  await requirePermission("manager", "/insights/research");
  const id = str(fd, "id");
  deleteInsight(id, str(fd, "finding"));
  done(`/insights/research/${id}`, "Đã bỏ insight");
}

// "Cho phép gọi AI" của bước 2 ngay trên trang (cùng công tắc với Cài đặt › Đội AI › AI Nghiên cứu)
export async function toggleResearchAiAction(fd: FormData) {
  await requirePermission("admin", "/insights/research");
  saveRoleSettings("research", { enabled: str(fd, "on") === "1" });
  done(str(fd, "back") || "/insights/research", str(fd, "on") === "1" ? "Đã cho phép AI Nghiên cứu" : "Đã tắt AI Nghiên cứu — chỉ phân tích theo luật");
}
