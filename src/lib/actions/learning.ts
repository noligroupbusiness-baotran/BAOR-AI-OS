"use server";

// CP06: chạy phân tích, OWNER chấp nhận / bỏ qua đề xuất, đánh dấu đã chuyển sang hộp chờ duyệt Second Brain.
import { requirePermission } from "@/lib/permissions";
import { decideProposal, markExported, refreshProposals } from "@/lib/learning";
import { done } from "./common";
import { aiReviewResults } from "@/lib/learning/ai-review";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function refreshLearningAction() {
  await requirePermission("manager", "/insights/learning");
  const r = refreshProposals();
  done("/insights/learning", `Đã phân tích: ${r.created} đề xuất mới, cập nhật ${r.updated}`);
}

export async function decideProposalAction(fd: FormData) {
  const actor = await requirePermission("admin", "/insights/learning");
  const decision = str(fd, "decision") === "accepted" ? "accepted" : "rejected";
  if (!decideProposal(str(fd, "id"), decision, actor.name, str(fd, "note"))) return done("/insights/learning?tone=error", "Không đổi được đề xuất này");
  done("/insights/learning", decision === "accepted" ? "Đã chấp nhận đề xuất" : "Đã bỏ qua đề xuất");
}

export async function markExportedAction() {
  const actor = await requirePermission("admin", "/insights/learning");
  const n = markExported(actor.name);
  done("/insights/learning", n ? `Đã đánh dấu ${n} đề xuất đã chuyển sang hộp chờ duyệt` : "Không có đề xuất nào để đánh dấu");
}

// Bước 8.2: AI Đo lường (qua Đội AI — công tắc / trần / mô hình theo vị trí), chạy SAU kiểm theo skill
export async function aiReviewAction() {
  const actor = await requirePermission("manager", "/insights/learning");
  refreshProposals();
  const r = await aiReviewResults(actor.name);
  if (!r.ok) return done("/insights/learning?tone=error", r.error);
  done("/insights/learning", `AI Đo lường: ${r.saved} đề xuất (mới hoặc cập nhật)${r.dropped ? ` (bỏ ${r.dropped} đề xuất không dẫn bài có thật)` : ""}`);
}
