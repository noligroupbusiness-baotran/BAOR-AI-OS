// CP02: phiên bản nội dung. Mỗi lần chữ thay đổi giữ một bản mới; khôi phục = tạo bản mới từ bản cũ (không ghi đè lịch sử).
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";

export type VersionReason = "brief" | "save" | "submit" | "ai" | "restore";

export const versionReasonLabel: Record<VersionReason, string> = {
  brief: "Tạo từ brief",
  save: "Lưu nháp",
  submit: "Gửi duyệt",
  ai: "AI viết lại",
  restore: "Khôi phục",
};

const newId = () => `cv_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export function listContentVersions(contentId: string) {
  return getDb().select().from(schema.contentVersions).where(eq(schema.contentVersions.contentId, contentId)).orderBy(desc(schema.contentVersions.version)).all();
}

export function getContentVersion(contentId: string, version: number) {
  return getDb()
    .select()
    .from(schema.contentVersions)
    .where(and(eq(schema.contentVersions.contentId, contentId), eq(schema.contentVersions.version, version)))
    .get();
}

/** Ghi phiên bản nếu chữ khác bản gần nhất. Trả về số phiên bản hiện hành. */
export function recordContentVersion(contentId: string, v: { hook: string; draft: string; reason: VersionReason; by: string }): number {
  const db = getDb();
  return db.transaction((tx) => {
    const last = tx.select().from(schema.contentVersions).where(eq(schema.contentVersions.contentId, contentId)).orderBy(desc(schema.contentVersions.version)).limit(1).get();
    if (last && last.draft === v.draft && last.hook === v.hook) return last.version;
    const version = (last?.version ?? 0) + 1;
    tx.insert(schema.contentVersions).values({ id: newId(), contentId, version, hook: v.hook, draft: v.draft, reason: v.reason, by: v.by, at: new Date().toISOString() }).run();
    return version;
  });
}
