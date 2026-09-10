"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { campaignRepo } from "@/lib/campaigns/repository";
import { checkBudget, isValidDateRange } from "@/lib/campaigns/results";
import { channelDef, EXECUTION_TYPES, METRICS } from "@/config/channels";
import { people } from "@/lib/data/people";
import { products } from "@/lib/data/products";
import type { CampaignStatus, ChannelGoalStatus, NewCampaignInput, NewChannelGoalInput } from "@/lib/campaigns/types";
import { campaignStatusLabel } from "@/lib/campaigns/labels";
import { logActivity } from "./common";

// Mọi hành động: kiểm tra đăng nhập, chống lặp bằng idem key, kiểm tra trạng thái hợp lệ, ghi nhật ký.
// AI chỉ đề xuất; phê duyệt, kích hoạt, tạm dừng đều do người bấm.

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string) => Number(String(fd.get(k) ?? "").replace(/[^\d]/g, "")) || 0;

async function actor(): Promise<string> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u.email;
}

function finish(path: string, toast: string, tone: "ok" | "error" = "ok"): never {
  revalidatePath("/", "layout");
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}toast=${encodeURIComponent(toast)}${tone === "error" ? "&tone=error" : ""}`);
}

// Chuyển trạng thái hợp lệ của chiến dịch.
const transitions: Record<string, CampaignStatus[]> = {
  submit: ["draft", "needs_changes"],
  approve: ["pending_approval"],
  request_changes: ["pending_approval"],
  activate: ["approved", "paused"],
  pause: ["active"],
  end: ["active", "paused", "approved"],
};

// ---------- Tạo chiến dịch (4 bước, gửi từ CampaignWizard) ----------

export interface CreateCampaignState {
  error?: string;
}

function parseGoal(raw: unknown, fallbackStart: string, fallbackEnd: string): NewChannelGoalInput | string {
  if (!raw || typeof raw !== "object") return "Mục tiêu kênh không hợp lệ.";
  const g = raw as Record<string, unknown>;
  const def = channelDef(String(g.channel ?? ""));
  if (!def) return "Kênh không nằm trong cấu hình kênh.";
  const executionType = String(g.executionType ?? "");
  if (!EXECUTION_TYPES.some((e) => e.key === executionType) || !def.executionTypes.includes(executionType as NewChannelGoalInput["executionType"])) return `Loại thực thi không phù hợp với kênh ${def.label}.`;
  const primaryMetric = String(g.primaryMetric ?? "");
  if (!(primaryMetric in METRICS)) return "Chỉ số chính không hợp lệ.";
  const objective = String(g.objective ?? "").trim();
  if (!objective) return `Mục tiêu kênh ${def.label} cần mô tả mục tiêu.`;
  const targetValue = Number(g.targetValue);
  if (!Number.isFinite(targetValue) || targetValue <= 0) return `Mục tiêu kênh ${def.label} cần chỉ tiêu lớn hơn 0.`;
  const budget = Number(g.budget);
  if (!Number.isFinite(budget) || budget < 0) return `Ngân sách kênh ${def.label} không hợp lệ.`;
  const ownerId = String(g.ownerId ?? "");
  if (!people.some((p) => p.id === ownerId)) return `Mục tiêu kênh ${def.label} cần người phụ trách.`;
  const startDate = String(g.startDate ?? "") || fallbackStart;
  const endDate = String(g.endDate ?? "") || fallbackEnd;
  if (!isValidDateRange(startDate, endDate)) return `Thời gian của mục tiêu kênh ${def.label} không hợp lệ.`;
  const accountId = g.accountId ? String(g.accountId) : def.integrationKey;
  return { channel: def.key, accountId, executionType: executionType as NewChannelGoalInput["executionType"], objective, primaryMetric: primaryMetric as NewChannelGoalInput["primaryMetric"], targetValue: Math.round(targetValue), budget: Math.round(budget), ownerId, startDate, endDate };
}

function parseCampaign(raw: unknown): NewCampaignInput | string {
  if (!raw || typeof raw !== "object") return "Dữ liệu gửi lên không hợp lệ.";
  const c = raw as Record<string, unknown>;
  const name = String(c.name ?? "").trim();
  if (!name) return "Cần nhập tên chiến dịch.";
  const objective = String(c.objective ?? "").trim();
  if (!objective) return "Cần nhập mục tiêu chung.";
  const ownerId = String(c.ownerId ?? "");
  if (!people.some((p) => p.id === ownerId)) return "Cần chọn người quản lý chiến dịch.";
  const productIds = Array.isArray(c.productIds) ? c.productIds.map(String).filter((id) => products.some((p) => p.id === id)) : [];
  if (productIds.length === 0) return "Cần chọn ít nhất một sản phẩm hoặc dịch vụ.";
  const startDate = String(c.startDate ?? "");
  const endDate = String(c.endDate ?? "");
  if (!isValidDateRange(startDate, endDate)) return "Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.";
  const totalBudget = Number(c.totalBudget);
  if (!Number.isFinite(totalBudget) || totalBudget < 0) return "Tổng ngân sách không hợp lệ.";
  const targetRaw = c.targetValue === "" || c.targetValue === null || c.targetValue === undefined ? null : Number(c.targetValue);
  const targetValue = targetRaw !== null && Number.isFinite(targetRaw) && targetRaw > 0 ? Math.round(targetRaw) : null;
  const goalsRaw = Array.isArray(c.goals) ? c.goals : [];
  const goals: NewChannelGoalInput[] = [];
  for (const g of goalsRaw) {
    const parsed = parseGoal(g, startDate, endDate);
    if (typeof parsed === "string") return parsed;
    goals.push(parsed);
  }
  return {
    name,
    objective,
    targetMetric: String(c.targetMetric ?? "").trim(),
    targetValue,
    description: String(c.description ?? "").trim(),
    productIds,
    audience: String(c.audience ?? "").trim(),
    location: String(c.location ?? "").trim(),
    ownerId,
    startDate,
    endDate,
    totalBudget: Math.round(totalBudget),
    budgetNote: String(c.budgetNote ?? "").trim(),
    goals,
  };
}

export async function createCampaignAction(_prev: CreateCampaignState, fd: FormData): Promise<CreateCampaignState> {
  const by = await actor();
  const intent = str(fd, "intent") === "submit" ? "submit" : "draft";
  const idem = str(fd, "idem");
  if (idem && campaignRepo.hasIdem(idem)) return { error: "Chiến dịch này đã được tạo. Vui lòng xem lại danh sách." };

  let raw: unknown;
  try {
    raw = JSON.parse(str(fd, "payload") || "{}");
  } catch {
    return { error: "Dữ liệu gửi lên không đọc được." };
  }
  const input = parseCampaign(raw);
  if (typeof input === "string") return { error: input };

  const budget = checkBudget(input.totalBudget, input.goals);
  if (budget.over && intent === "submit") {
    return { error: `Ngân sách kênh (${budget.allocated.toLocaleString("vi-VN")} ₫) vượt ngân sách tổng (${budget.total.toLocaleString("vi-VN")} ₫). Điều chỉnh trước khi gửi phê duyệt.` };
  }
  if (intent === "submit" && input.goals.length === 0) return { error: "Cần ít nhất một mục tiêu kênh trước khi gửi phê duyệt." };

  const status = intent === "submit" ? "pending_approval" : "draft";
  const campaign = campaignRepo.create(input, by, status);
  campaignRepo.log(campaign.id, by, "Tạo chiến dịch", `${input.goals.length} mục tiêu kênh · ngân sách ${input.totalBudget.toLocaleString("vi-VN")} ₫`, idem || null);
  if (intent === "submit") {
    campaignRepo.addApproval({ campaignId: campaign.id, channelGoalId: null, type: "campaign_change", title: `Phê duyệt chiến dịch “${campaign.name}”`, entityType: null, entityId: null, requestedBy: by, note: `Ngân sách ${input.totalBudget.toLocaleString("vi-VN")} ₫, ${input.goals.length} mục tiêu kênh.` });
    campaignRepo.log(campaign.id, by, "Gửi phê duyệt");
    logActivity("human", `Gửi phê duyệt chiến dịch “${campaign.name}”.`, "campaigns");
  } else {
    logActivity("human", `Tạo bản nháp chiến dịch “${campaign.name}”.`, "campaigns");
  }
  finish(`/campaigns/${campaign.id}`, intent === "submit" ? "Đã tạo và gửi phê duyệt. Chiến dịch chưa chạy cho tới khi được duyệt và kích hoạt." : "Đã lưu bản nháp chiến dịch");
}

// ---------- Chuyển trạng thái ----------

async function transition(fd: FormData, kind: keyof typeof transitions, next: CampaignStatus, actionLabel: string, toast: string) {
  const by = await actor();
  const id = str(fd, "id");
  const idem = str(fd, "idem");
  const c = campaignRepo.get(id);
  if (!c) finish("/campaigns", "Không tìm thấy chiến dịch", "error");
  if (idem && campaignRepo.hasIdem(idem)) finish(`/campaigns/${id}`, "Thao tác này đã được thực hiện, không lặp lại.", "error");
  if (!transitions[kind].includes(c.status)) {
    finish(`/campaigns/${id}`, `Không thể ${actionLabel.toLowerCase()} khi chiến dịch đang ở trạng thái “${campaignStatusLabel[c.status].label}”.`, "error");
  }
  const note = str(fd, "note");
  const extra = next === "approved" ? { approvedBy: by, approvedAt: new Date().toISOString() } : {};
  campaignRepo.setStatus(id, next, by, extra);
  if (kind === "submit") {
    campaignRepo.addApproval({ campaignId: id, channelGoalId: null, type: "campaign_change", title: `Phê duyệt chiến dịch “${c.name}”`, entityType: null, entityId: null, requestedBy: by, note: "" });
  }
  if (kind === "approve") campaignRepo.decideApprovals(id, "campaign_change", "approved", by, note);
  if (kind === "request_changes") campaignRepo.decideApprovals(id, "campaign_change", "rejected", by, note);
  if (kind === "activate") {
    for (const g of campaignRepo.goals(id)) if (g.status === "planned" || g.status === "paused") campaignRepo.updateGoal(g.id, { status: "active" });
  }
  if (kind === "pause") {
    for (const g of campaignRepo.goals(id)) if (g.status === "active") campaignRepo.updateGoal(g.id, { status: "paused" });
  }
  if (kind === "end") {
    for (const g of campaignRepo.goals(id)) if (g.status === "active" || g.status === "paused" || g.status === "planned") campaignRepo.updateGoal(g.id, { status: "done" });
  }
  campaignRepo.log(id, by, actionLabel, note, idem || null);
  logActivity("human", `${actionLabel} chiến dịch “${c.name}”.`, "campaigns");
  finish(`/campaigns/${id}`, toast);
}

export async function submitCampaign(fd: FormData) {
  await transition(fd, "submit", "pending_approval", "Gửi phê duyệt", "Đã gửi phê duyệt");
}
export async function approveCampaign(fd: FormData) {
  await transition(fd, "approve", "approved", "Phê duyệt", "Đã phê duyệt. Bấm “Kích hoạt” khi sẵn sàng chạy.");
}
export async function requestCampaignChanges(fd: FormData) {
  await transition(fd, "request_changes", "needs_changes", "Yêu cầu chỉnh sửa", "Đã trả về để chỉnh sửa");
}
export async function activateCampaign(fd: FormData) {
  await transition(fd, "activate", "active", "Kích hoạt", "Chiến dịch đang thực hiện. Bài đăng và quảng cáo vẫn cần phê duyệt riêng.");
}
export async function pauseCampaign(fd: FormData) {
  await transition(fd, "pause", "paused", "Tạm dừng", "Đã tạm dừng chiến dịch và các mục tiêu kênh");
}
export async function endCampaign(fd: FormData) {
  await transition(fd, "end", "ended", "Kết thúc", "Đã kết thúc chiến dịch");
}

// ---------- Mục tiêu kênh ----------

function goalFromForm(fd: FormData, campaignStart: string, campaignEnd: string): NewChannelGoalInput | string {
  return parseGoal(
    {
      channel: str(fd, "channel"),
      accountId: str(fd, "accountId") || null,
      executionType: str(fd, "executionType"),
      objective: str(fd, "objective"),
      primaryMetric: str(fd, "primaryMetric"),
      targetValue: num(fd, "targetValue"),
      budget: num(fd, "budget"),
      ownerId: str(fd, "ownerId"),
      startDate: str(fd, "startDate"),
      endDate: str(fd, "endDate"),
    },
    campaignStart,
    campaignEnd,
  );
}

export async function addChannelGoal(fd: FormData) {
  const by = await actor();
  const campaignId = str(fd, "campaignId");
  const idem = str(fd, "idem");
  const c = campaignRepo.get(campaignId);
  if (!c) finish("/campaigns", "Không tìm thấy chiến dịch", "error");
  const back = `/campaigns/${campaignId}?tab=goals`;
  if (idem && campaignRepo.hasIdem(idem)) finish(back, "Mục tiêu kênh này đã được thêm.", "error");
  if (c.status === "ended") finish(back, "Chiến dịch đã kết thúc, không thêm mục tiêu kênh.", "error");
  const input = goalFromForm(fd, c.startDate, c.endDate);
  if (typeof input === "string") finish(`${back}&add=1`, input, "error");
  const budget = checkBudget(c.totalBudget, [...campaignRepo.goals(campaignId), input]);
  if (budget.over) finish(`${back}&add=1`, `Ngân sách kênh sau khi thêm (${budget.allocated.toLocaleString("vi-VN")} ₫) vượt ngân sách tổng (${budget.total.toLocaleString("vi-VN")} ₫).`, "error");

  // Chiến dịch đang chạy: mục tiêu mới cần phê duyệt trước khi chạy.
  const needsApproval = c.status === "active" || c.status === "approved" || c.status === "paused";
  const goal = campaignRepo.addGoal(campaignId, input, "planned");
  const label = channelDef(goal.channel)?.label ?? goal.channel;
  if (needsApproval) {
    campaignRepo.addApproval({ campaignId, channelGoalId: goal.id, type: "channel_goal", title: `Thêm mục tiêu kênh ${label}: ${goal.objective}`, entityType: null, entityId: null, requestedBy: by, note: `Ngân sách ${goal.budget.toLocaleString("vi-VN")} ₫.` });
  }
  campaignRepo.log(campaignId, by, "Thêm mục tiêu kênh", `${label} · ${goal.objective}`, idem || null);
  finish(back, needsApproval ? `Đã thêm mục tiêu kênh ${label}, đang chờ phê duyệt.` : `Đã thêm mục tiêu kênh ${label}.`);
}

export async function updateChannelGoal(fd: FormData) {
  const by = await actor();
  const id = str(fd, "goalId");
  const idem = str(fd, "idem");
  const g = campaignRepo.goal(id);
  if (!g) finish("/campaigns", "Không tìm thấy mục tiêu kênh", "error");
  const c = campaignRepo.get(g.campaignId);
  if (!c) finish("/campaigns", "Không tìm thấy chiến dịch", "error");
  const back = `/campaigns/${c.id}?tab=goals`;
  if (idem && campaignRepo.hasIdem(idem)) finish(back, "Thay đổi này đã được lưu.", "error");
  const input = goalFromForm(fd, c.startDate, c.endDate);
  if (typeof input === "string") finish(`${back}&edit=${id}`, input, "error");
  const others = campaignRepo.goals(c.id).filter((x) => x.id !== id);
  const budget = checkBudget(c.totalBudget, [...others, input]);
  if (budget.over) finish(`${back}&edit=${id}`, `Ngân sách kênh (${budget.allocated.toLocaleString("vi-VN")} ₫) vượt ngân sách tổng (${budget.total.toLocaleString("vi-VN")} ₫).`, "error");

  const budgetChanged = input.budget !== g.budget;
  const accountChanged = (input.accountId ?? null) !== (g.accountId ?? null);
  campaignRepo.updateGoal(id, { objective: input.objective, primaryMetric: input.primaryMetric, targetValue: input.targetValue, budget: input.budget, ownerId: input.ownerId, startDate: input.startDate, endDate: input.endDate, executionType: input.executionType, accountId: input.accountId });
  const label = channelDef(g.channel)?.label ?? g.channel;
  // Đổi ngân sách hoặc tài khoản trên chiến dịch đang chạy: ghi yêu cầu phê duyệt để có nhật ký xác nhận.
  if ((budgetChanged || accountChanged) && (c.status === "active" || c.status === "approved")) {
    campaignRepo.addApproval({ campaignId: c.id, channelGoalId: id, type: "budget", title: `${budgetChanged ? `Ngân sách ${label}: ${g.budget.toLocaleString("vi-VN")} → ${input.budget.toLocaleString("vi-VN")} ₫` : `Đổi tài khoản ${label}`}`, entityType: null, entityId: null, requestedBy: by, note: "" });
  }
  campaignRepo.log(c.id, by, "Sửa mục tiêu kênh", `${label} · ${input.objective}`, idem || null);
  finish(back, `Đã cập nhật mục tiêu kênh ${label}.`);
}

async function setGoalStatus(fd: FormData, next: ChannelGoalStatus, allowed: ChannelGoalStatus[], actionLabel: string) {
  const by = await actor();
  const id = str(fd, "goalId");
  const idem = str(fd, "idem");
  const g = campaignRepo.goal(id);
  if (!g) finish("/campaigns", "Không tìm thấy mục tiêu kênh", "error");
  const back = `/campaigns/${g.campaignId}?tab=goals`;
  if (idem && campaignRepo.hasIdem(idem)) finish(back, "Thao tác này đã được thực hiện.", "error");
  if (!allowed.includes(g.status)) finish(back, `Không thể ${actionLabel.toLowerCase()} mục tiêu đang ở trạng thái hiện tại.`, "error");
  campaignRepo.updateGoal(id, { status: next });
  const label = channelDef(g.channel)?.label ?? g.channel;
  campaignRepo.log(g.campaignId, by, `${actionLabel} mục tiêu kênh`, label, idem || null);
  finish(back, `Đã ${actionLabel.toLowerCase()} mục tiêu kênh ${label}.`);
}

export async function pauseChannelGoal(fd: FormData) {
  await setGoalStatus(fd, "paused", ["active", "planned"], "Tạm dừng");
}
export async function resumeChannelGoal(fd: FormData) {
  await setGoalStatus(fd, "active", ["paused"], "Chạy lại");
}
