import fs from "node:fs";
import path from "node:path";
import { streamToFile } from "@/lib/video/stream-to-file";
import { getDb, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { actorFor } from "@/lib/permissions";
import { uploadsDir } from "@/lib/uploads";
import { createVideoFromSource } from "@/lib/video/jobs";
import { parseAspect } from "@/lib/video/job-types";
import { addVideoFeedback } from "@/lib/video/feedback";
import { campaignRepo } from "@/lib/campaigns/repository";
import { eq } from "drizzle-orm";

// Thêm nguồn quay thô cho Video Studio. Nhận thân yêu cầu dạng luồng, ghi thẳng xuống đĩa:
// không qua bộ đệm 10 MB của proxy (đường dẫn này loại khỏi matcher trong src/proxy.ts), không nạp cả tệp vào bộ nhớ.
export const runtime = "nodejs";

const MAX_BYTES = 8 * 1024 * 1024 * 1024; // 8 GB: RAW 4K vài phút
const EXT_MIME: Record<string, string> = { ".mp4": "video/mp4", ".mov": "video/quicktime", ".m4v": "video/mp4", ".webm": "video/webm" };

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ ok: false, error: "Chưa đăng nhập" }, { status: 401 });
  // Chống gửi chéo trang: chỉ nhận yêu cầu từ chính giao diện hệ thống.
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) return Response.json({ ok: false, error: "Nguồn yêu cầu không hợp lệ" }, { status: 403 });
  const actor = actorFor(user.email);

  const url = new URL(req.url);
  const original = (url.searchParams.get("name") ?? "").slice(0, 200);
  const ext = path.extname(original).toLowerCase();
  const mime = EXT_MIME[ext];
  if (!mime) return Response.json({ ok: false, error: "Chỉ nhận MP4, MOV, M4V, WebM" }, { status: 415 });
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_BYTES) return Response.json({ ok: false, error: "Tệp vượt 8 GB" }, { status: 413 });
  if (!req.body) return Response.json({ ok: false, error: "Không có dữ liệu tệp" }, { status: 400 });

  const id = `up_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const fileName = `${id}${ext}`;
  const full = path.join(uploadsDir(), fileName);
  const w = await streamToFile(req.body, full, MAX_BYTES, "Tệp vượt 8 GB");
  if (!w.ok) return Response.json({ ok: false, error: w.error }, { status: 400 });
  const size = w.size;
  if (declared && size !== declared) {
    fs.rmSync(full, { force: true });
    return Response.json({ ok: false, error: `Tải lên chưa trọn (${size}/${declared} byte)` }, { status: 400 });
  }
  const title = original.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim() || "Video quay thô";
  getDb()
    .insert(schema.uploads)
    .values({ id, kind: "video", name: original || fileName, fileName, mime, size, meta: JSON.stringify({ title, role: "raw" }), uploadedBy: actor.email, createdAt: new Date().toISOString() })
    .run();
  const contentId = (url.searchParams.get("content") ?? "").slice(0, 80) || null;
  const content = contentId ? getDb().select().from(schema.contentItems).where(eq(schema.contentItems.id, contentId)).get() : undefined;
  // Video đã dựng sẵn (dựng ngoài hệ thống): vào thẳng Chờ kiểm tra, không dựng lại. Tệp gốc giữ nguyên trong kho tải lên.
  if (url.searchParams.get("mode") === "final") {
    const videoId = `v_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    getDb()
      .insert(schema.videos)
      .values({ id: videoId, title: (content?.title ?? title).slice(0, 200), contentId: content?.id ?? null, agent: actor.name, status: "review", platforms: JSON.stringify(["tiktok", "facebook"]), version: 1, note: "Video dựng sẵn, tải lên tay.", uploadId: id, updatedAt: new Date().toISOString() })
      .run();
    if (content) campaignRepo.inheritLinks("content", content.id, "video", videoId, "review");
    addVideoFeedback({ videoId, version: 1, kind: "upload", note: `Video dựng sẵn: ${original}`, by: actor.name });
    return Response.json({ ok: true, videoId, size });
  }
  const videoId = createVideoFromSource({ title, sourceUploadId: id, cutSilence: url.searchParams.get("cut") === "1", aspect: parseAspect(url.searchParams.get("aspect")), by: actor.name, contentId: content?.id ?? null, start: url.searchParams.get("start") === "1" });
  return Response.json({ ok: true, videoId, size });
}
