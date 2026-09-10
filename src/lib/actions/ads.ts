"use server";

import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { done, logActivity, nowIso } from "./common";
import { setSetting } from "@/lib/admin";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string) => Number(String(fd.get(k) ?? "").replace(/[^\d]/g, ""));

export async function approveAd(fd: FormData) {
  const id = str(fd, "id");
  const db = getDb();
  const ad = db.select().from(schema.adCampaigns).where(eq(schema.adCampaigns.id, id)).get();
  if (!ad) return done("/publishing", "Không tìm thấy chiến dịch");
  db.update(schema.adCampaigns).set({ status: "active", startedAt: nowIso() }).where(eq(schema.adCampaigns.id, id)).run();
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
  getDb().update(schema.adCampaigns).set({ dailyBudget: budget }).where(eq(schema.adCampaigns.id, id)).run();
  done("/publishing", "Đã cập nhật ngân sách");
}

export async function saveGuardrails(fd: FormData) {
  setSetting("ads.dailyCap", String(num(fd, "dailyCap")));
  setSetting("ads.monthlyCap", String(num(fd, "monthlyCap")));
  setSetting("ads.autoPauseCplAbove", String(num(fd, "autoPauseCplAbove")));
  done("/publishing", "Đã lưu hạn mức");
}

export async function retryPost(fd: FormData) {
  const id = str(fd, "id");
  getDb().update(schema.scheduledPosts).set({ status: "scheduled", error: null }).where(eq(schema.scheduledPosts.id, id)).run();
  done("/publishing", "Đã xếp đăng lại");
}
