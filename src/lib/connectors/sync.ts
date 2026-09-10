// Các việc chạy nền qua lớp connector: kiểm tra kết nối, đồng bộ số liệu về mục tiêu kênh,
// đăng bài đến giờ, tự dừng quảng cáo theo luật CPL. Mọi lần chạy đều ghi sync_runs.
import { and, eq, inArray, lte } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { channelDef } from "@/config/channels";
import { campaignRepo } from "@/lib/campaigns/repository";
import { getAdGuardrails, getAutomation } from "@/lib/queries";
import { applyRule, recordDecision } from "@/lib/router";
import { logActivity } from "@/lib/activity";
import { connectorContext, finishRun, setIntegrationStatus, startRun } from "./config";
import { connectorFor, connectors } from "./registry";
import type { CheckResult } from "./types";

const nowIso = () => new Date().toISOString();

// ---------- Kiểm tra kết nối thật ----------

export async function checkIntegration(key: string): Promise<CheckResult> {
  const connector = connectorFor(key);
  const runId = startRun(key, "check");
  if (!connector) {
    finishRun(runId, false, "Chưa có connector cho kết nối này.");
    return { ok: false, message: "Chưa có connector cho kết nối này." };
  }
  const res = await connector.check(connectorContext(key));
  setIntegrationStatus(key, { connected: res.ok, account: res.account ?? undefined, lastCheckedAt: nowIso(), lastCheckOk: res.ok, lastError: res.ok ? null : res.message });
  finishRun(runId, res.ok, res.message);
  recordDecision({ lane: "rule", domain: "sync", subject: `Kiểm tra kết nối ${key}`, outcome: res.ok ? "kết nối được" : "lỗi", reason: res.message, needsApproval: false });
  return res;
}

// ---------- Đồng bộ số liệu về mục tiêu kênh ----------

// Với mỗi mục tiêu kênh đang chạy: hỏi connector của kênh đó số liệu từ ngày bắt đầu tới hôm nay,
// ghi vào currentValue / spent. Chỉ số không khớp thì bỏ qua, không đoán.
export async function syncChannelMetrics(): Promise<{ updated: number; errors: string[] }> {
  const db = getDb();
  const goals = db.select().from(schema.channelGoals).where(inArray(schema.channelGoals.status, ["active"])).all();
  const today = new Date().toISOString().slice(0, 10);
  let updated = 0;
  const errors: string[] = [];
  const byKey = new Map<string, typeof goals>();
  for (const g of goals) {
    const key = g.accountId ?? channelDef(g.channel)?.integrationKey;
    if (!key) continue;
    byKey.set(key, [...(byKey.get(key) ?? []), g]);
  }
  for (const [key, list] of byKey) {
    const connector = connectorFor(key);
    if (!connector?.metrics) continue;
    const integration = db.select().from(schema.integrations).where(eq(schema.integrations.key, key)).get();
    if (!integration?.connected) continue;
    const runId = startRun(key, "metrics");
    try {
      const since = list.reduce((min, g) => (g.startDate < min ? g.startDate : min), today);
      const snaps = await connector.metrics(connectorContext(key), since, today);
      let n = 0;
      for (const g of list) {
        const snap = snaps.find((s) => s.metric === g.primaryMetric);
        if (!snap) continue;
        db.update(schema.channelGoals).set({ currentValue: snap.value, ...(snap.spent !== undefined ? { spent: snap.spent } : {}), updatedAt: nowIso() }).where(eq(schema.channelGoals.id, g.id)).run();
        n++;
      }
      updated += n;
      setIntegrationStatus(key, { lastSyncAt: nowIso() });
      finishRun(runId, true, `Cập nhật ${n} mục tiêu kênh.`, n);
    } catch (e) {
      const msg = e instanceof Error ? e.message : JSON.stringify(e).slice(0, 200);
      errors.push(`${key}: ${msg}`);
      finishRun(runId, false, msg);
      setIntegrationStatus(key, { lastError: msg });
    }
  }
  return { updated, errors };
}

// ---------- Đăng bài đến giờ ----------

export async function publishDuePosts(): Promise<{ published: number; failed: number; skipped: number }> {
  const db = getDb();
  const automation = getAutomation();
  const out = { published: 0, failed: 0, skipped: 0 };
  if (automation.auto_publish === false) return out;
  const due = db
    .select()
    .from(schema.scheduledPosts)
    .where(and(eq(schema.scheduledPosts.status, "scheduled"), lte(schema.scheduledPosts.scheduledFor, nowIso())))
    .all();
  for (const post of due) {
    const content = db.select().from(schema.contentItems).where(eq(schema.contentItems.id, post.contentId)).get();
    // Luật: chỉ đăng nội dung đã duyệt / đã lên lịch, và phải có kết nối.
    const gate = applyRule({ domain: "publish", subject: `Đăng “${post.title}” lên ${post.platform}`, entityType: "publication", entityId: post.id }, () => {
      if (!content || !["approved", "scheduled", "published"].includes(content.status)) return { ok: false, reason: "Nội dung chưa được phê duyệt." };
      const key = post.platform === "facebook" ? "facebook_page" : post.platform === "instagram" ? "instagram" : post.platform;
      const c = connectorFor(key);
      if (!c?.publish) return { ok: false, reason: `Chưa có connector đăng bài cho ${post.platform}.` };
      const integration = db.select().from(schema.integrations).where(eq(schema.integrations.key, key)).get();
      if (!integration?.connected) return { ok: false, reason: `Tài khoản ${integration?.name ?? key} chưa kết nối.` };
      return { ok: true, value: key, reason: "Đủ điều kiện đăng." };
    });
    if (!gate.ok || !gate.value) {
      // Không có kết nối thì giữ nguyên "chờ đăng" và ghi lý do, không đánh dấu lỗi để khỏi spam.
      out.skipped++;
      db.update(schema.scheduledPosts).set({ error: gate.reason }).where(eq(schema.scheduledPosts.id, post.id)).run();
      continue;
    }
    const key = gate.value;
    const connector = connectorFor(key)!;
    const runId = startRun(key, "publish");
    db.update(schema.scheduledPosts).set({ status: "publishing" }).where(eq(schema.scheduledPosts.id, post.id)).run();
    const res = await connector.publish!(connectorContext(key), { postId: post.id, contentId: post.contentId, title: post.title, message: content?.draft || `${post.title}\n\n${content?.hook ?? ""}`.trim(), platform: post.platform });
    if (res.ok) {
      db.update(schema.scheduledPosts).set({ status: "published", error: null }).where(eq(schema.scheduledPosts.id, post.id)).run();
      db.update(schema.contentItems).set({ status: "published" }).where(eq(schema.contentItems.id, post.contentId)).run();
      campaignRepo.syncEntityStatus("publication", post.id, "published");
      logActivity("system", `Đã đăng “${post.title}” lên ${post.platform}.`, "publishing");
      finishRun(runId, true, res.message, 1);
      out.published++;
    } else {
      db.update(schema.scheduledPosts).set({ status: "failed", error: res.message }).where(eq(schema.scheduledPosts.id, post.id)).run();
      logActivity("system", `Đăng “${post.title}” thất bại: ${res.message}`, "publishing");
      finishRun(runId, false, res.message);
      out.failed++;
    }
  }
  return out;
}

// ---------- Luật CPL: tự tạm dừng quảng cáo ----------

export function autoPauseAdsByCpl(): number {
  const db = getDb();
  const g = getAdGuardrails();
  let paused = 0;
  for (const ad of db.select().from(schema.adCampaigns).where(eq(schema.adCampaigns.status, "active")).all()) {
    const cpl = ad.leads > 0 ? Math.round(ad.spent / ad.leads) : 0;
    const r = applyRule({ domain: "ads", subject: `CPL quảng cáo “${ad.name}”`, entityType: "ad", entityId: ad.id }, () => {
      if (ad.leads < 10) return { ok: true, reason: "Chưa đủ 10 lead để đánh giá." };
      if (cpl > g.autoPauseCplAbove) return { ok: false, reason: `CPL ${cpl.toLocaleString("vi-VN")} ₫ vượt ngưỡng ${g.autoPauseCplAbove.toLocaleString("vi-VN")} ₫.` };
      return { ok: true, reason: `CPL ${cpl.toLocaleString("vi-VN")} ₫ trong ngưỡng.` };
    });
    if (!r.ok) {
      db.update(schema.adCampaigns).set({ status: "paused", aiNote: `Tự tạm dừng: ${r.reason}` }).where(eq(schema.adCampaigns.id, ad.id)).run();
      campaignRepo.syncEntityStatus("ad", ad.id, "paused");
      logActivity("system", `Tự tạm dừng quảng cáo “${ad.name}”: ${r.reason}`, "ads");
      paused++;
    }
  }
  return paused;
}

// Danh sách connector đã có adapter thật (để hiển thị trong Cài đặt).
export function connectorCapabilities(): Record<string, { check: boolean; metrics: boolean; publish: boolean; webhook: boolean }> {
  const out: Record<string, { check: boolean; metrics: boolean; publish: boolean; webhook: boolean }> = {};
  for (const c of connectors) out[c.key] = { check: !!(c.metrics || c.publish || c.parseWebhook), metrics: !!c.metrics, publish: !!c.publish, webhook: !!c.parseWebhook };
  return out;
}
