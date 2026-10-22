"use server";

import { deleteRule, getRule, saveFaq, saveRule, setFaqActive, setRuleStatus, listFaqs } from "@/lib/automation/repository";
import { actionLabel, triggerLabel, type Action, type Condition, type Params, type RuleStatus, type Trigger } from "@/lib/automation/types";
import { requirePermission } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { done } from "./common";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string) => Number(String(fd.get(k) ?? "").replace(/[^\d]/g, "")) || 0;
const fail = (path: string, msg: string): never => done(`${path}${path.includes("?") ? "&" : "?"}tone=error`, msg);

export async function saveRuleAction(fd: FormData) {
  await requirePermission("manager", "/automation");
  const id = str(fd, "id") || undefined;
  const name = str(fd, "name");
  const trigger = str(fd, "trigger") as Trigger;
  const action = str(fd, "action") as Action;
  const back = id ? `/automation?edit=${id}` : "/automation?add=1";
  if (!name) return fail(back, "Cần đặt tên quy tắc");
  if (!(trigger in triggerLabel)) return fail(back, "Điều kiện kích hoạt không hợp lệ");
  if (!(action in actionLabel)) return fail(back, "Hành động không hợp lệ");
  const condition: Condition = {};
  const match = str(fd, "match");
  if (trigger === "message_received") {
    if (!["complaint", "phone", "price", "faq", "keyword", "any"].includes(match)) return fail(back, "Cần chọn cách khớp tin nhắn");
    condition.match = match as Condition["match"];
    if (match === "keyword") {
      if (!str(fd, "keyword")) return fail(back, "Cần nhập từ khóa");
      condition.keyword = str(fd, "keyword");
    }
  }
  if (trigger === "lead_stale") condition.hours = num(fd, "hours") || 24;
  if (trigger === "lead_stale" || trigger === "lead_created") condition.stages = fd.getAll("stages").map(String).filter(Boolean);
  if (trigger === "post_engagement_high") condition.engagementRate = Number(str(fd, "engagementRate").replace(",", ".")) || 3;
  if (trigger === "campaign_behind") condition.behindPct = num(fd, "behindPct") || 20;
  if (trigger === "ad_cpl_high" && str(fd, "cplAbove")) condition.cplAbove = num(fd, "cplAbove");

  const params: Params = {};
  if (action === "set_stage") params.stage = (str(fd, "stage") || "contacted") as Params["stage"];
  if (action === "tag_lead") {
    if (!str(fd, "tag")) return fail(back, "Cần nhập nhãn");
    params.tag = str(fd, "tag");
  }
  if (action === "notify" || action === "request_approval") params.message = str(fd, "message");
  if (action === "propose_ad") params.dailyBudget = num(fd, "dailyBudget") || 150000;

  // Hành động tiêu tiền luôn cần phê duyệt, không phụ thuộc lựa chọn.
  const requiresApproval = actionLabel[action].spends ? true : str(fd, "requiresApproval") === "1";
  const rule = saveRule({ id, name, description: str(fd, "description"), trigger, condition, action, params, priority: num(fd, "priority") || 100, requiresApproval, campaignId: str(fd, "campaignId") || null });
  logActivity("human", `${id ? "Sửa" : "Tạo"} quy tắc Automation “${rule.name}”.`, "automation");
  done(`/automation`, id ? "Đã lưu quy tắc" : "Đã tạo quy tắc ở trạng thái bản nháp. Bật khi sẵn sàng.");
}

export async function setRuleStatusAction(fd: FormData) {
  await requirePermission("manager", "/automation");
  const id = str(fd, "id");
  const status = str(fd, "status") as RuleStatus;
  const rule = getRule(id);
  if (!rule) return fail("/automation", "Không tìm thấy quy tắc");
  if (!["active", "paused", "draft"].includes(status)) return fail("/automation", "Trạng thái không hợp lệ");
  setRuleStatus(id, status);
  logActivity("human", `${status === "active" ? "Bật" : status === "paused" ? "Tạm dừng" : "Chuyển về nháp"} quy tắc “${rule.name}”.`, "automation");
  done("/automation", status === "active" ? `Đã bật “${rule.name}”` : status === "paused" ? `Đã tạm dừng “${rule.name}”` : "Đã chuyển về bản nháp");
}

export async function deleteRuleAction(fd: FormData) {
  await requirePermission("admin", "/automation");
  const id = str(fd, "id");
  const rule = getRule(id);
  if (!rule) return fail("/automation", "Không tìm thấy quy tắc");
  deleteRule(id);
  logActivity("human", `Xóa quy tắc “${rule.name}”.`, "automation");
  done("/automation", "Đã xóa quy tắc và lịch sử chạy của nó");
}

// ---------- Kho câu trả lời chuẩn ----------

export async function saveFaqAction(fd: FormData) {
  await requirePermission("manager", "/settings#faq");
  const id = str(fd, "id") || undefined;
  const question = str(fd, "question");
  const answer = str(fd, "answer");
  const keywords = str(fd, "keywords").split(",").map((k) => k.trim()).filter(Boolean);
  if (!question || !answer) return fail("/settings#faq", "Cần nhập câu hỏi và câu trả lời");
  if (keywords.length === 0) return fail("/settings#faq", "Cần ít nhất một từ khóa để nhận diện");
  const f = saveFaq({ id, question, keywords, answer });
  logActivity("human", `${id ? "Sửa" : "Thêm"} câu trả lời chuẩn “${f.question}”.`, "settings");
  done("/settings#faq", id ? "Đã cập nhật câu trả lời chuẩn" : "Đã thêm câu trả lời chuẩn. Quy tắc “Khớp câu chuẩn” sẽ dùng ngay.");
}

export async function toggleFaqAction(fd: FormData) {
  await requirePermission("manager", "/settings#faq");
  const id = str(fd, "id");
  const f = listFaqs(true).find((x) => x.id === id);
  if (!f) return fail("/settings#faq", "Không tìm thấy câu trả lời");
  setFaqActive(id, !f.active);
  done("/settings#faq", f.active ? "Đã tắt câu trả lời" : "Đã bật câu trả lời");
}
