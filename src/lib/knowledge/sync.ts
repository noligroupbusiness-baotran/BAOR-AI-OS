// Đồng bộ Notion → chỉ mục (một chiều, chỉ đọc). Gọi từ nút "Đồng bộ ngay" và bộ chạy nền mỗi 6 giờ khi đã có token.
import { connectorContext, finishRun, readIntegrationConfig, setIntegrationStatus, startRun } from "@/lib/connectors/config";
import { getDb, schema } from "@/db";
import { readSecondBrain } from "./notion";
import { upsertPages } from "./index";

export function notionConfigured(): boolean {
  return Boolean(readIntegrationConfig("notion").token);
}

export async function syncSecondBrain(): Promise<{ ok: boolean; message: string }> {
  if (!notionConfigured()) return { ok: false, message: "Chưa có token Notion. Nhập ở Cài đặt › Kết nối › Notion." };
  const run = startRun("notion", "sync");
  try {
    const known = new Map(getDb().select({ id: schema.knowledgeIndex.id, at: schema.knowledgeIndex.notionEditedAt, origin: schema.knowledgeIndex.origin }).from(schema.knowledgeIndex).all().filter((r) => r.origin === "notion_sync").map((r) => [r.id, r.at]));
    const res = await readSecondBrain(connectorContext("notion"), known);
    const up = upsertPages(res.pages, "notion_sync");
    const msg = `Đọc ${res.pages.length} trang (tải nội dung ${res.fetchedBodies}, không đổi ${res.skipped}); chỉ mục cập nhật ${up.changed}.${res.errors.length ? ` Lỗi ${res.errors.length}: ${res.errors.slice(0, 2).join("; ")}` : ""}`;
    finishRun(run, res.errors.length === 0, msg, up.changed);
    setIntegrationStatus("notion", { lastSyncAt: new Date().toISOString(), ...(res.errors.length === 0 ? { connected: true, lastCheckOk: true, lastError: null } : { lastError: res.errors[0] }) });
    return { ok: res.errors.length === 0, message: msg };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    finishRun(run, false, msg);
    setIntegrationStatus("notion", { lastError: msg });
    return { ok: false, message: msg };
  }
}
