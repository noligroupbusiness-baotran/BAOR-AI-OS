"use server";

// CP06: chạy phân tích, OWNER chấp nhận / bỏ qua đề xuất, đánh dấu đã chuyển sang hộp chờ duyệt Second Brain.
import { requirePermission } from "@/lib/permissions";
import { decideProposal, markExported, refreshProposals } from "@/lib/learning";
import { done } from "./common";

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
