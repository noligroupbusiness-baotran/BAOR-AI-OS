// Đọc / ghi cấu hình kết nối. Giá trị bí mật mã hóa khi lưu, giải mã khi dùng, không bao giờ trả ra giao diện.
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { decryptSecret, encryptSecret, maskSecret } from "@/lib/secrets";
import { connectorFor } from "./registry";
import type { ConnectorContext } from "./types";

export function readIntegrationConfig(key: string): Record<string, string> {
  const row = getDb().select().from(schema.integrations).where(eq(schema.integrations.key, key)).get();
  if (!row) return {};
  const raw = JSON.parse(row.config || "{}") as Record<string, string>;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) out[k] = decryptSecret(String(v ?? ""));
  return out;
}

// Gộp trường mới vào cấu hình cũ; trường secret được mã hóa. Trả về cấu hình đã giải mã.
export function writeIntegrationConfig(key: string, fields: Record<string, string>): Record<string, string> {
  const connector = connectorFor(key);
  const secretKeys = new Set((connector?.fields ?? []).filter((f) => f.secret).map((f) => f.key));
  const current = readIntegrationConfig(key);
  const merged = { ...current, ...fields };
  const stored: Record<string, string> = {};
  for (const [k, v] of Object.entries(merged)) stored[k] = secretKeys.has(k) ? encryptSecret(v) : v;
  getDb().update(schema.integrations).set({ config: JSON.stringify(stored) }).where(eq(schema.integrations.key, key)).run();
  return merged;
}

// Bản che để hiển thị trong Cài đặt ("đã có" / 4 ký tự cuối), không lộ giá trị.
export function maskedIntegrationConfig(key: string): Record<string, string> {
  const connector = connectorFor(key);
  const secretKeys = new Set((connector?.fields ?? []).filter((f) => f.secret).map((f) => f.key));
  const cfg = readIntegrationConfig(key);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(cfg)) out[k] = secretKeys.has(k) ? maskSecret(v) : v;
  return out;
}

export function connectorContext(key: string): ConnectorContext {
  return { config: readIntegrationConfig(key), fetch: globalThis.fetch.bind(globalThis) };
}

export function setIntegrationStatus(key: string, patch: { connected?: boolean; account?: string | null; lastCheckedAt?: string; lastCheckOk?: boolean; lastError?: string | null; lastSyncAt?: string }) {
  getDb().update(schema.integrations).set(patch).where(eq(schema.integrations.key, key)).run();
}

export function listIntegrationStatus() {
  return getDb()
    .select({
      key: schema.integrations.key,
      name: schema.integrations.name,
      description: schema.integrations.description,
      connected: schema.integrations.connected,
      account: schema.integrations.account,
      lastCheckedAt: schema.integrations.lastCheckedAt,
      lastCheckOk: schema.integrations.lastCheckOk,
      lastError: schema.integrations.lastError,
      lastSyncAt: schema.integrations.lastSyncAt,
    })
    .from(schema.integrations)
    .all();
}

// ---------- Nhật ký đồng bộ ----------

const newId = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function startRun(integrationKey: string, kind: string): string {
  const id = newId("run");
  getDb().insert(schema.syncRuns).values({ id, integrationKey, kind, startedAt: new Date().toISOString(), ok: false, message: "đang chạy", items: 0 }).run();
  return id;
}

export function finishRun(id: string, ok: boolean, message: string, items = 0) {
  getDb().update(schema.syncRuns).set({ ok, message: message.slice(0, 500), items, finishedAt: new Date().toISOString() }).where(eq(schema.syncRuns.id, id)).run();
}

export function listRuns(limit = 30) {
  return getDb().select().from(schema.syncRuns).orderBy(desc(schema.syncRuns.startedAt)).limit(limit).all();
}
