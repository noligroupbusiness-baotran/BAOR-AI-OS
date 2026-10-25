"use server";

import { requirePermission } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { syncSecondBrain } from "@/lib/knowledge/sync";
import { importKnowledgeSnapshot, type KnowledgeSnapshot } from "@/lib/knowledge";
import { PURPOSE_KINDS, type PurposeKind } from "@/lib/knowledge/types";
import { buildBriefDeterministic, createContentFromBrief, createResearchTask, runResearchWithAi, saveResearchResult, ResearchResultSchema } from "@/lib/research";
import { done } from "./common";
import { SOCIAL_KINDS, parseSocialPaste, socialToResearch, type SocialKind } from "@/lib/research/social";

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

export async function createResearchTaskAction(fd: FormData) {
  const actor = await requirePermission("manager", "/insights/research");
  const kind = str(fd, "purposeKind") as PurposeKind;
  if (!PURPOSE_KINDS.includes(kind)) return fail("/insights/research", "Chọn mục tiêu sử dụng");
  let id: string;
  try {
    id = createResearchTask({ question: str(fd, "question"), purposeKind: kind, purpose: str(fd, "purpose"), contentId: str(fd, "contentId") || null, campaignId: str(fd, "campaignId") || null, by: actor.name });
  } catch (e) {
    return fail("/insights/research", e instanceof Error ? e.message : "Không tạo được nhiệm vụ");
  }
  logActivity("human", `${actor.name} tạo nhiệm vụ nghiên cứu: ${str(fd, "question").slice(0, 120)}`, "research");
  done(`/insights/research/${id}`, "Đã tạo nhiệm vụ nghiên cứu");
}

export async function runResearchAction(fd: FormData) {
  const actor = await requirePermission("manager", "/insights/research");
  const id = str(fd, "id");
  const back = `/insights/research/${id}`;
  const r = await runResearchWithAi(id, actor.name);
  if (!r.ok) return fail(back, r.error);
  logActivity("ai", `AI nghiên cứu xong: ${r.summary.slice(0, 140)}`, "research");
  done(back, "Đã nghiên cứu xong, kiểm tra nguồn và phát hiện bên dưới");
}

export async function importResearchAction(fd: FormData) {
  const actor = await requirePermission("admin", "/insights/research");
  const id = str(fd, "id");
  const back = `/insights/research/${id}`;
  let parsed;
  try {
    parsed = ResearchResultSchema.parse(JSON.parse(str(fd, "json")));
  } catch (e) {
    return fail(back, `Kết quả không đúng định dạng: ${e instanceof Error ? e.message.slice(0, 200) : ""}`);
  }
  const r = saveResearchResult(id, parsed, { runner: "import", by: actor.name });
  logActivity("human", `${actor.name} nhập kết quả nghiên cứu: ${r.sources} nguồn, ${r.findings} phát hiện (${r.verified} đạt kiểm).`, "research");
  done(back, `Đã nhập ${r.sources} nguồn, ${r.findings} phát hiện (${r.verified} đạt kiểm)${r.dropped.length ? `, bỏ ${r.dropped.length} tham chiếu` : ""}`);
}

export async function buildBriefAction(fd: FormData) {
  const actor = await requirePermission("manager", "/insights/research");
  const id = str(fd, "id");
  const back = `/insights/research/${id}`;
  if (!str(fd, "topic")) return fail(back, "Cần chủ đề cho brief");
  try {
    buildBriefDeterministic(id, { topic: str(fd, "topic"), goal: str(fd, "goal"), audience: str(fd, "audience") }, actor.name);
  } catch (e) {
    return fail(back, e instanceof Error ? e.message : "Không tạo được brief");
  }
  done(`${back}#brief`, "Đã gom brief từ các phát hiện đạt kiểm. Điền thông điệp chính trước khi chuyển sang viết.");
}

export async function createContentFromBriefAction(fd: FormData) {
  const actor = await requirePermission("manager", "/insights/research");
  const briefId = str(fd, "briefId");
  const back = str(fd, "back") || "/insights/research";
  let contentId: string;
  try {
    contentId = createContentFromBrief(briefId, actor.name);
  } catch (e) {
    return fail(back, e instanceof Error ? e.message : "Không tạo được nội dung");
  }
  logActivity("human", `${actor.name} tạo kịch bản từ brief nghiên cứu.`, "content");
  done(`/content?tab=mine&open=${contentId}`, "Đã tạo kịch bản từ brief, đang ở mục Đang viết");
}

// Nghiên cứu theo nền tảng (bước 2.1–2.4): dán bình luận → nhiệm vụ nghiên cứu RIÊNG (không đè nghiên cứu web), phân tích theo luật.
export async function importSocialAction(fd: FormData) {
  const actor = await requirePermission("admin", "/insights/research");
  const back = "/insights/research#nen-tang";
  const kind = str(fd, "kind") as SocialKind;
  if (!(kind in SOCIAL_KINDS)) return fail(back, "Chọn nguồn bình luận");
  const url = str(fd, "url");
  if (!/^https?:\/\/\S+$/i.test(url)) return fail(back, "Cần link bài / video / nhóm (http…, không có khoảng trắng) làm nguồn");
  const topic = str(fd, "topic");
  let comments: string[];
  try {
    comments = parseSocialPaste(String(fd.get("paste") ?? ""));
  } catch (e) {
    return fail(back, e instanceof Error ? e.message : "Không đọc được dữ liệu dán");
  }
  if (comments.length < 3) return fail(back, "Cần ít nhất 3 bình luận (mỗi dòng một bình luận, hoặc CSV / JSON có cột nội dung)");
  const id = createResearchTask({ question: `${SOCIAL_KINDS[kind]}: ${topic || url}`.slice(0, 500), purposeKind: "audience", purpose: `Insight từ ${SOCIAL_KINDS[kind].toLowerCase()} cho hook / kịch bản (Personal Brand System bước 2)`, by: actor.name });
  const r = saveResearchResult(id, socialToResearch(kind, url, comments, topic), { runner: "import", by: actor.name });
  logActivity("human", `${actor.name} nhập ${comments.length} bình luận (${SOCIAL_KINDS[kind]}): ${r.findings} phát hiện, ${r.verified} đạt kiểm.`, "research");
  done(`/insights/research/${id}`, `Đã phân tích ${comments.length} bình luận: ${r.findings} phát hiện (${r.verified} đạt kiểm)`);
}
