"use server";

import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { done, logActivity, nowIso } from "./common";
import { setSetting } from "@/lib/admin";
import { getAdGuardrails } from "@/lib/queries";
import { applyRule } from "@/lib/router";
import { campaignRepo } from "@/lib/campaigns/repository";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string) => Number(String(fd.get(k) ?? "").replace(/[^\d]/g, ""));

export async function approveAd(fd: FormData) {
  const id = str(fd, "id");
  const db = getDb();
  const ad = db.select().from(schema.adCampaigns).where(eq(schema.adCampaigns.id, id)).get();
  if (!ad) return done("/publishing", "Không tìm thấy chiến dịch");
  // Luật hạn mức: ngân sách ngày và tổng ngân sách tháng không được vượt trần trong Cài đặt.
  const gate = budgetRule(ad.id, ad.name, ad.dailyBudget);
  if (!gate.ok) return done("/publishing?tone=error", gate.reason);
  db.update(schema.adCampaigns).set({ status: "active", startedAt: nowIso() }).where(eq(schema.adCampaigns.id, id)).run();
  campaignRepo.syncEntityStatus("ad", id, "active");
  logActivity("human", `Bạn đã duyệt chạy quảng cáo “${ad.name}”.`, "ads");
  done("/publishing", "Đã bật chiến dịch");
}

export async function rejectAd(fd: FormData) {
  const id = str(fd, "id");
  getDb().update(schema.adCampaigns).set({ status: "rejected" }).where(eq(schema.adCampaigns.id, id)).run();
  done("/publishing", "Đã từ chối chiến dịch");
}

export async function toggleAd(fd: FormData) {
  const id = str(fd, "id");
  const db = getDb();
  const ad = db.select().from(schema.adCampaigns).where(eq(schema.adCampaigns.id, id)).get();
  if (!ad) return done("/publishing", "Không tìm thấy chiến dịch");
  const next = ad.status === "active" ? "paused" : "active";
  db.update(schema.adCampaigns).set({ status: next }).where(eq(schema.adCampaigns.id, id)).run();
  done("/publishing", next === "active" ? "Đã bật lại chiến dịch" : "Đã tạm dừng chiến dịch");
}

export async function updateBudget(fd: FormData) {
  const id = str(fd, "id");
  const budget = num(fd, "dailyBudget");
  if (!budget) return done("/publishing", "Ngân sách không hợp lệ");
  const ad = getDb().select().from(schema.adCampaigns).where(eq(schema.adCampaigns.id, id)).get();
  if (!ad) return done("/publishing", "Không tìm thấy chiến dịch");
  const gate = budgetRule(ad.id, ad.name, budget);
  if (!gate.ok) return done("/publishing?tone=error", gate.reason);
  getDb().update(schema.adCampaigns).set({ dailyBudget: budget }).where(eq(schema.adCampaigns.id, id)).run();
  done("/publishing", "Đã cập nhật ngân sách");
}

export async function saveGuardrails(fd: FormData) {
  setSetting("ads.dailyCap", String(num(fd, "dailyCap")));
  setSetting("ads.monthlyCap", String(num(fd, "monthlyCap")));
  setSetting("ads.autoPauseCplAbove", String(num(fd, "autoPauseCplAbove")));
  done("/publishing", "Đã lưu hạn mức");
}

function budgetRule(adId: string, name: string, dailyBudget: number) {
  const g = getAdGuardrails();
  return applyRule({ domain: "ads", subject: `Ngân sách quảng cáo “${name}”`, entityType: "ad", entityId: adId }, () => {
    if (dailyBudget > g.dailyCap) return { ok: false, reason: `Ngân sách ${dailyBudget.toLocaleString("vi-VN")} ₫/ngày vượt hạn mức ${g.dailyCap.toLocaleString("vi-VN")} ₫/ngày.` };
    const spentMonth = getDb().select().from(schema.adCampaigns).all().reduce((n, a) => n + a.spent, 0);
    const projected = spentMonth + dailyBudget * 30;
    if (projected > g.monthlyCap) return { ok: false, reason: `Đã chi ${spentMonth.toLocaleString("vi-VN")} ₫ tháng này; thêm ${dailyBudget.toLocaleString("vi-VN")} ₫/ngày sẽ vượt hạn mức tháng ${g.monthlyCap.toLocaleString("vi-VN")} ₫.` };
    return { ok: true, reason: "Trong hạn mức ngày và tháng." };
  });
}

export async function retryPost(fd: FormData) {
  const id = str(fd, "id");
  getDb().update(schema.scheduledPosts).set({ status: "scheduled", error: null }).where(eq(schema.scheduledPosts.id, id)).run();
  done("/publishing", "Đã xếp đăng lại");
}
