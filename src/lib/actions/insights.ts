"use server";

import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { extractInsights } from "@/lib/ai";
import { requirePermission, currentActor } from "@/lib/permissions";
import { recordDecision } from "@/lib/router";
import { logActivity } from "@/lib/activity";
import { done } from "./common";
import { deleteCompetitor, getCompetitor, parseChannels, parseOffers, saveCompetitor as saveCompetitorRow, splitLines } from "@/lib/insights/competitors";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const fail = (path: string, msg: string): never => done(`${path}${path.includes("?") ? "&" : "?"}tone=error`, msg);

// AI đọc inbox, lead, số liệu bài đăng để rút insight kèm bằng chứng; insight ở trạng thái chờ duyệt.
export async function aiExtractInsights() {
  await requirePermission("manager", "/insights");
  const r = await extractInsights();
  if (!r.ok) return fail("/insights#proposed", r.error);
  logActivity("ai", `AI rút ra ${r.count} insight mới từ dữ liệu, chờ duyệt.`, "insights");
  done("/insights#proposed", r.count ? `AI rút ra ${r.count} insight, kèm nguồn. Duyệt trước khi dùng.` : "AI không tìm thấy insight mới đủ tin cậy.");
}

export async function decideInsight(fd: FormData) {
  const actor = await requirePermission("manager", "/insights#proposed");
  const id = str(fd, "id");
  const decision = str(fd, "decision") === "approve" ? "approved" : "rejected";
  const db = getDb();
  const i = db.select().from(schema.insights).where(eq(schema.insights.id, id)).get();
  if (!i) return fail("/insights#proposed", "Không tìm thấy insight");
  db.update(schema.insights).set({ status: decision }).where(eq(schema.insights.id, id)).run();
  recordDecision({ lane: "human", domain: "research", subject: `Insight “${i.title}”`, outcome: decision === "approved" ? "đã duyệt để dùng" : "từ chối", reason: `Do ${actor.name} quyết định.`, entityType: "insight", entityId: id, needsApproval: false });
  logActivity("human", `${decision === "approved" ? "Duyệt" : "Từ chối"} insight “${i.title}”.`, "insights");
  done("/insights#insights", decision === "approved" ? "Đã duyệt insight, nội dung có thể dùng ngay" : "Đã từ chối insight");
}

// Insight nhập tay (từ khảo sát, quan sát tại quầy): làn người, ghi nguồn rõ.
export async function createInsight(fd: FormData) {
  const actor = await currentActor();
  const title = str(fd, "title");
  const detail = str(fd, "detail");
  const source = str(fd, "source");
  if (!title || !source) return fail("/insights?add=1", "Cần nhập insight và nguồn phát hiện");
  const confidence = Math.min(100, Math.max(0, Number(str(fd, "confidence")) || 70));
  const id = `i_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  getDb().insert(schema.insights).values({ id, title, detail, confidence, source, personaId: str(fd, "personaId") || null, createdAt: new Date().toISOString(), usedInContent: 0, status: "approved", origin: "manual", evidence: JSON.stringify(str(fd, "evidence") ? [str(fd, "evidence")] : []) }).run();
  logActivity("human", `${actor.name} thêm insight “${title}” (nguồn: ${source}).`, "insights");
  done("/insights#insights", "Đã thêm insight");
}

// ---------- Đối thủ (theo dõi thủ công) ----------

export async function saveCompetitor(fd: FormData) {
  const actor = await requirePermission("manager", "/insights#competitors");
  const id = str(fd, "id") || undefined;
  const name = str(fd, "name");
  if (!name) return fail(`/insights?competitor=${id ?? "new"}#competitors`, "Cần nhập tên đối thủ.");
  const lastChecked = str(fd, "lastCheckedAt");
  const c = saveCompetitorRow({
    id,
    name,
    brand: str(fd, "brand"),
    positioning: str(fd, "positioning"),
    channels: parseChannels(str(fd, "channels")),
    offers: parseOffers(str(fd, "offers")),
    strengths: splitLines(str(fd, "strengths")),
    weaknesses: splitLines(str(fd, "weaknesses")),
    note: str(fd, "note"),
    lastCheckedAt: /^\d{4}-\d{2}-\d{2}$/.test(lastChecked) ? lastChecked : null,
  });
  logActivity("human", `${actor.name} ${id ? "cập nhật" : "thêm"} đối thủ “${c.name}” (${c.offers.length} gói giá).`, "insights");
  done("/insights#competitors", id ? "Đã cập nhật đối thủ" : "Đã thêm đối thủ");
}

export async function removeCompetitor(fd: FormData) {
  const actor = await requirePermission("manager", "/insights#competitors");
  const id = str(fd, "id");
  const c = getCompetitor(id);
  if (!c) return fail("/insights#competitors", "Không tìm thấy đối thủ.");
  deleteCompetitor(id);
  logActivity("human", `${actor.name} xóa đối thủ “${c.name}”.`, "insights");
  done("/insights#competitors", "Đã xóa đối thủ");
}
