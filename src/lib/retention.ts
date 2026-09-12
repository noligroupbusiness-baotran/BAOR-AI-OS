// Dọn dữ liệu cũ để CSDL không phình theo thời gian. Chạy mỗi ngày từ bộ chạy nền (scheduler).
// Chỉ xóa nhật ký kỹ thuật; không đụng tới chiến dịch, khách hàng, đơn hàng, nội dung.
import fs from "node:fs";
import path from "node:path";
import { eq, lt } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getSetting } from "@/lib/admin";
import { listUploads, uploadsDir } from "@/lib/uploads";

export interface RetentionPolicy {
  /** Nhật ký hoạt động, quyết định router, lịch sử automation, lần đồng bộ (ngày). */
  logsDays: number;
  /** Nhật ký chiến dịch (kiểm toán ai làm gì) và chi phí AI: giữ lâu hơn. */
  auditDays: number;
}

export const DEFAULT_RETENTION: RetentionPolicy = { logsDays: 90, auditDays: 365 };

export function retentionPolicy(): RetentionPolicy {
  const n = (k: string, d: number) => {
    const v = Number(getSetting(k) ?? "");
    return Number.isFinite(v) && v >= 7 ? v : d;
  };
  return { logsDays: n("retention.logsDays", DEFAULT_RETENTION.logsDays), auditDays: n("retention.auditDays", DEFAULT_RETENTION.auditDays) };
}

export interface RetentionResult {
  activity: number;
  decisions: number;
  automationRuns: number;
  syncRuns: number;
  campaignLogs: number;
  aiCalls: number;
  orphanFiles: number;
  orphanRows: number;
}

export function pruneOldData(policy: RetentionPolicy = retentionPolicy(), now = Date.now()): RetentionResult {
  const db = getDb();
  const logsBefore = new Date(now - policy.logsDays * 86_400_000).toISOString();
  const auditBefore = new Date(now - policy.auditDays * 86_400_000).toISOString();
  const r: RetentionResult = { activity: 0, decisions: 0, automationRuns: 0, syncRuns: 0, campaignLogs: 0, aiCalls: 0, orphanFiles: 0, orphanRows: 0 };
  r.activity = db.delete(schema.activity).where(lt(schema.activity.at, logsBefore)).run().changes;
  r.decisions = db.delete(schema.marketingDecisions).where(lt(schema.marketingDecisions.at, logsBefore)).run().changes;
  r.automationRuns = db.delete(schema.automationRuns).where(lt(schema.automationRuns.at, logsBefore)).run().changes;
  r.syncRuns = db.delete(schema.syncRuns).where(lt(schema.syncRuns.startedAt, logsBefore)).run().changes;
  r.campaignLogs = db.delete(schema.campaignLogs).where(lt(schema.campaignLogs.at, auditBefore)).run().changes;
  r.aiCalls = db.delete(schema.aiCalls).where(lt(schema.aiCalls.at, auditBefore)).run().changes;
  Object.assign(r, cleanOrphanUploads());
  return r;
}

/** Tệp trong thư mục uploads không có dòng trong bảng (và ngược lại) thì dọn. */
export function cleanOrphanUploads(): { orphanFiles: number; orphanRows: number } {
  const dir = uploadsDir();
  const rows = listUploads();
  const known = new Set(rows.map((u) => u.fileName));
  let orphanFiles = 0;
  for (const f of fs.readdirSync(dir)) {
    if (f.startsWith(".")) continue;
    if (!known.has(f)) {
      const full = path.join(dir, f);
      // Chỉ xóa tệp đã nằm đó hơn 1 giờ, tránh xóa tệp đang được ghi dở.
      if (Date.now() - fs.statSync(full).mtimeMs > 3_600_000) {
        fs.rmSync(full, { force: true });
        orphanFiles++;
      }
    }
  }
  let orphanRows = 0;
  for (const u of rows) {
    if (!fs.existsSync(path.join(dir, u.fileName))) {
      getDb().delete(schema.uploads).where(eq(schema.uploads.id, u.id)).run();
      orphanRows++;
    }
  }
  return { orphanFiles, orphanRows };
}
