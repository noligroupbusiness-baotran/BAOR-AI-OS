// Truy vấn Video Studio. Agent Edit Video thật sẽ ghi vào bảng videos; giao diện chỉ đọc qua đây.
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { VideoStatus } from "@/lib/data/videos";

export interface VideoRecord {
  id: string;
  title: string;
  contentId: string | null;
  contentTitle: string | null;
  agent: string;
  status: VideoStatus;
  platforms: string[];
  version: number;
  note: string;
  uploadId: string | null;
  updatedAt: string;
}

const parse = (s: string): string[] => {
  try {
    return JSON.parse(s) as string[];
  } catch {
    return [];
  }
};

export function listVideos(status?: VideoStatus): VideoRecord[] {
  const db = getDb();
  const rows = db
    .select({ v: schema.videos, contentTitle: schema.contentItems.title })
    .from(schema.videos)
    .leftJoin(schema.contentItems, eq(schema.contentItems.id, schema.videos.contentId))
    .orderBy(desc(schema.videos.updatedAt))
    .all();
  return rows
    .map(({ v, contentTitle }) => ({ ...v, status: v.status as VideoStatus, platforms: parse(v.platforms), contentTitle: contentTitle ?? null }))
    .filter((v) => (status ? v.status === status : true));
}

export function countVideos(status: VideoStatus): number {
  return listVideos(status).length;
}
