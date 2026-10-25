// Tổng kho video ngắn (Personal Brand System, bước 5): mọi video đã sẵn sàng đăng — video AI edit sau khi OWNER duyệt và video
// OWNER tự edit tải lên — nằm chung một kho, chia Chưa đăng / Đã đăng. Video đã đăng THẬT (bài live đã xác minh trên nền tảng)
// chuyển vào mục xoá; quá hạn (mặc định 1 ngày) thì gỡ tệp video ĐÃ ĐĂNG (bản dựng) để giảm dung lượng. Tệp quay gốc (RAW), bản ghi,
// kế hoạch, báo cáo, link bài giữ nguyên.
// Chế độ thử (dry-run) không bao giờ tính là đã đăng.
import fs from "node:fs";
import path from "node:path";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getSetting, setSetting } from "@/lib/admin";
import { logActivity } from "@/lib/activity";
import { getUpload, uploadPath } from "@/lib/uploads";
import { jobsRoot } from "@/lib/video/jobs";

export type LibraryFilter = "unposted" | "posted" | "purged";

export interface LibraryPost {
  platform: string;
  permalink: string | null;
  publishedAt: string | null;
}

export interface LibraryRow {
  id: string;
  title: string;
  origin: "ai_edit" | "self_edit";
  uploadId: string | null;
  updatedAt: string;
  posts: LibraryPost[];
  postedAt: string | null; // lần đăng thật đầu tiên
  purgeDueAt: string | null; // lúc sẽ gỡ tệp (khi đã đăng, chưa gỡ)
  filesPurgedAt: string | null;
  state: LibraryFilter;
}

export function purgeAfterHours(): number {
  const h = Number(getSetting("video.purgeAfterPostHours") ?? 24);
  return Number.isFinite(h) && h > 0 ? h : 24;
}

export function purgeEnabled(): boolean {
  return getSetting("video.purgePosted") !== "0";
}

/** Mốc bật tự gỡ: chỉ gỡ video đăng SAU mốc này (không áp về trước cho video đã đăng từ trước khi có tính năng). */
export function purgeSince(): string {
  let since = getSetting("video.purgeSince");
  if (!since) {
    since = new Date().toISOString();
    setSetting("video.purgeSince", since);
  }
  return since;
}

// Bài còn cần tệp video: đang chờ / đang đăng / đang xác minh, hoặc lỗi chưa lên nền tảng (còn "Thử lại")
const PENDING = new Set(["scheduled", "publishing", "verifying"]);

export function libraryRows(): LibraryRow[] {
  const db = getDb();
  const videos = db.select().from(schema.videos).where(eq(schema.videos.status, "approved")).all();
  if (!videos.length) return [];
  const allPosts = db.select().from(schema.scheduledPosts).where(inArray(schema.scheduledPosts.videoId, videos.map((v) => v.id))).all();
  const posts = allPosts.filter((p) => p.status === "published" && p.mode === "live");
  const pending = new Set(allPosts.filter((p) => p.mode === "live" && (PENDING.has(p.status) || (p.status === "failed" && !p.externalId))).map((p) => p.videoId));
  const since = purgeSince();
  const hours = purgeAfterHours();
  return videos
    .map((v) => {
      const mine = posts.filter((p) => p.videoId === v.id).map((p) => ({ platform: p.platform, permalink: p.permalink ?? null, publishedAt: p.publishedAt ?? null }));
      const postedAt = mine.map((p) => p.publishedAt).filter((x): x is string => !!x).sort()[0] ?? (mine.length ? v.updatedAt : null);
      const state: LibraryFilter = v.filesPurgedAt ? "purged" : mine.length ? "posted" : "unposted";
      return {
        id: v.id,
        title: v.title,
        origin: v.origin === "self_edit" ? "self_edit" : "ai_edit",
        uploadId: v.uploadId,
        updatedAt: v.updatedAt,
        posts: mine,
        postedAt,
        // Không hẹn gỡ khi: tự gỡ tắt, video còn bài khác cần tệp, hoặc đăng trước mốc bật tính năng
        purgeDueAt: state === "posted" && postedAt && purgeEnabled() && !pending.has(v.id) && postedAt >= since ? new Date(Date.parse(postedAt) + hours * 3_600_000).toISOString() : null,
        filesPurgedAt: v.filesPurgedAt,
        state,
      } satisfies LibraryRow;
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function rmVideoFile(file: string | null | undefined): number {
  if (!file || !fs.existsSync(file)) return 0;
  const size = fs.statSync(file).size;
  fs.rmSync(file, { force: true });
  return size;
}

/** Gỡ tệp video của các video đã đăng thật quá hạn. Trả số video đã gỡ và dung lượng giải phóng. */
export function purgePostedVideos(now = Date.now()): { videos: number; bytes: number } {
  if (!purgeEnabled()) return { videos: 0, bytes: 0 };
  const db = getDb();
  let videos = 0;
  let bytes = 0;
  for (const r of libraryRows()) {
    if (r.state !== "posted" || !r.purgeDueAt || Date.parse(r.purgeDueAt) > now) continue;
    const ids = new Set<string>();
    if (r.uploadId) ids.add(r.uploadId);
    const root = path.join(jobsRoot(), r.id);
    if (fs.existsSync(root)) {
      for (const d of fs.readdirSync(root)) {
        const dir = path.join(root, d);
        if (!/^v\d+$/.test(d) || !fs.statSync(dir).isDirectory()) continue;
        try {
          // Chỉ bản dựng (bản chính từng phiên bản); tệp quay gốc (RAW, sourceUploadId) GIỮ để còn dựng lại được
          const job = JSON.parse(fs.readFileSync(path.join(dir, "job.json"), "utf8")) as { masterUploadId?: string };
          if (job.masterUploadId) ids.add(job.masterUploadId);
        } catch {
          // thư mục bản dựng không có job.json: vẫn gỡ tệp video bên trong
        }
        for (const f of fs.readdirSync(dir)) if (/\.(mp4|mov|m4v|webm)$/i.test(f)) bytes += rmVideoFile(path.join(dir, f));
      }
    }
    for (const id of ids) {
      const u = getUpload(id);
      if (u && u.kind === "video") bytes += rmVideoFile(uploadPath(u));
    }
    const at = new Date(now).toISOString();
    db.update(schema.videos).set({ filesPurgedAt: at }).where(and(eq(schema.videos.id, r.id), isNull(schema.videos.filesPurgedAt))).run();
    logActivity("system", `Tổng kho: gỡ tệp video “${r.title}” (đã đăng ${r.posts.map((p) => p.platform).join(", ")}, quá ${purgeAfterHours()} giờ) — bài đăng, báo cáo, kế hoạch giữ nguyên.`, "video");
    videos++;
  }
  return { videos, bytes };
}
