// Nhận một tệp nguồn đã nằm trọn trên đĩa → bản ghi tải lên + video (dựng tự động, hoặc "dựng sẵn" vào thẳng Chờ kiểm tra).
// Dùng chung cho tải một lần (/api/video-sources) và tải nối tiếp (/api/video-sources/resumable).
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { uploadsDir } from "@/lib/uploads";
import { APPROVED_SCRIPT, createVideoFromSource } from "./jobs";
import { parseAspect, parseQuality } from "./job-types";
import { addVideoFeedback } from "./feedback";
import { campaignRepo } from "@/lib/campaigns/repository";
import { getAdminEmail } from "@/lib/admin";

export const MAX_SOURCE_BYTES = 8 * 1024 * 1024 * 1024; // 8 GB: RAW 4K vài phút
export const EXT_MIME: Record<string, string> = { ".mp4": "video/mp4", ".mov": "video/quicktime", ".m4v": "video/mp4", ".webm": "video/webm" };

export interface IntakeParams {
  cut: boolean;
  contentId: string | null;
  final: boolean;
  aspect?: string | null;
  /** "1080" | "4k" (chọn ở Thêm video gốc) */
  quality?: string | null;
  start?: boolean;
  /** Kèm theo tệp (máy dựng gửi từ thư mục đã duyệt): mã băm để chống trùng, lời nói đã chuyển chữ tại máy, ghi chú OWNER. */
  meta?: IntakeMeta;
}

export interface IntakeMeta {
  sha256?: string;
  transcript?: string;
  note?: string;
  /** "approved-folder" = từ thư mục 7.VIDEO-DA-DUYET trên máy OWNER */
  source?: string;
}

export function newUploadId(): string {
  return `up_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Tệp `tmpPath` (đã đủ byte) → chuyển vào kho tải lên với tên `<uploadId><ext>`, tạo bản ghi + video.
 * Chỉ kịch bản đã duyệt mới gắn được (cùng cổng với "Gắn kịch bản").
 */
export function registerSource(i: { tmpPath: string; uploadId: string; original: string; ext: string; size: number; params: IntakeParams; by: { name: string; email: string } }): { videoId: string; approved: boolean } {
  const db = getDb();
  const fileName = `${i.uploadId}${i.ext}`;
  const full = path.join(uploadsDir(), fileName);
  if (path.resolve(i.tmpPath) !== path.resolve(full)) fs.renameSync(i.tmpPath, full);
  const title = i.original.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim() || "Video quay thô";
  const m = i.params.meta ?? {};
  const meta: Record<string, string> = { title, role: i.params.final ? "final" : "raw" };
  if (m.sha256 && /^[a-f0-9]{64}$/.test(m.sha256)) meta.sha256 = m.sha256;
  if (m.transcript?.trim()) meta.transcript = m.transcript.trim().slice(0, 20_000);
  if (m.note?.trim()) meta.note = m.note.trim().slice(0, 2_000);
  if (m.source) meta.source = m.source.slice(0, 40);
  db.insert(schema.uploads)
    .values({ id: i.uploadId, kind: "video", name: i.original || fileName, fileName, mime: EXT_MIME[i.ext] ?? "video/mp4", size: i.size, meta: JSON.stringify(meta), uploadedBy: i.by.email, createdAt: new Date().toISOString() })
    .run();
  const found = i.params.contentId ? db.select().from(schema.contentItems).where(eq(schema.contentItems.id, i.params.contentId)).get() : undefined;
  const content = found && APPROVED_SCRIPT.includes(found.status) ? found : undefined;
  // Video đã dựng sẵn (dựng ngoài hệ thống): không dựng lại. Tệp nằm trong kho tải lên (bản OWNER tự edit đã đăng thật sẽ được
  // Tổng kho gỡ tệp sau hạn — src/lib/videos/library.ts).
  // OWNER tự edit rồi tải lên (Personal Brand System 4.1 → 5.1) → vào thẳng Tổng kho (đã duyệt); người khác tải → Chờ kiểm tra.
  if (i.params.final) {
    const videoId = `v_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    const owner = !!i.by.email && i.by.email.toLowerCase() === getAdminEmail().toLowerCase();
    const status = owner ? "approved" : "review";
    db.insert(schema.videos)
      .values({ id: videoId, title: (content?.title ?? title).slice(0, 200), contentId: content?.id ?? null, agent: i.by.name, status, origin: "self_edit", platforms: JSON.stringify(["tiktok", "facebook"]), version: 1, note: m.source === "approved-folder" ? "OWNER duyệt trong thư mục VIDEO-DA-DUYET trên máy — máy dựng gửi lên." : owner ? "OWNER tự edit, tải lên — vào Tổng kho video ngắn." : "Video dựng sẵn, tải lên tay.", uploadId: i.uploadId, updatedAt: new Date().toISOString() })
      .run();
    if (content) campaignRepo.inheritLinks("content", content.id, "video", videoId, status);
    addVideoFeedback({ videoId, version: 1, kind: "upload", note: `Video dựng sẵn: ${i.original}`, by: i.by.name });
    return { videoId, approved: status === "approved" };
  }
  const videoId = createVideoFromSource({ title, sourceUploadId: i.uploadId, cutSilence: i.params.cut, aspect: parseAspect(i.params.aspect), quality: parseQuality(i.params.quality), by: i.by.name, contentId: content?.id ?? null, start: !!i.params.start });
  return { videoId, approved: false };
}
