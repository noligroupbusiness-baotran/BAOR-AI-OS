// CP03: lịch sử phản hồi video theo từng bản dựng. Chỉ thêm, không sửa, không xoá.
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";

export type FeedbackKind = "upload" | "send_review" | "send_approval" | "request_changes" | "approve" | "rerender";

export const feedbackLabel: Record<FeedbackKind, string> = {
  upload: "Thêm nguồn",
  send_review: "Gửi kiểm tra",
  send_approval: "Gửi phê duyệt",
  request_changes: "Yêu cầu chỉnh sửa",
  approve: "Phê duyệt",
  rerender: "Dựng lại",
};

export function addVideoFeedback(f: { videoId: string; version: number; kind: FeedbackKind; note?: string; by: string }) {
  getDb()
    .insert(schema.videoFeedback)
    .values({ id: `vf_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`, videoId: f.videoId, version: f.version, kind: f.kind, note: (f.note ?? "").slice(0, 2000), by: f.by, at: new Date().toISOString() })
    .run();
}

export function listVideoFeedback(videoId: string) {
  return getDb().select().from(schema.videoFeedback).where(eq(schema.videoFeedback.videoId, videoId)).orderBy(desc(schema.videoFeedback.at)).all();
}
