// Video vừa vào Kho (vừa Duyệt) → tự viết bài đăng (TIÊU ĐỀ + NỘI DUNG) để lên lịch ngay (OWNER 25/10/2026).
// Chạy NỀN sau khi duyệt (server action dùng `after`), không chặn thao tác duyệt. Gọi AI Viết bài đăng qua cổng AI (tôn trọng công tắc,
// trần riêng, trần chung); AI tắt / thiếu khoá / lỗi → bản nháp theo luật (buildCaption + buildPostTitle) và ghi rõ nguồn.
// Bản nháp OWNER đã có (đã sửa / đã viết) thì giữ nguyên, không ghi đè.
import { generateCaption } from "@/lib/ai";
import { buildCaption, buildPostTitle, captionDraft, saveCaptionDraft, savePostTitle, setPostDraftSource } from "@/lib/publishing/caption";
import { getSetting, setSetting } from "@/lib/admin";

const pendingKey = (videoId: string) => `publishing.postDraftPending.${videoId}`;

/** Đang chờ AI viết (để Kho hiện "AI đang viết…" và tự làm mới). Quá 3 phút coi như xong / hỏng. */
export function postDraftPending(videoId: string, now = Date.now()): boolean {
  const at = Date.parse(getSetting(pendingKey(videoId)) ?? "");
  return Number.isFinite(at) && now - at < 180_000;
}

export function markPostDraftPending(videoId: string): void {
  setSetting(pendingKey(videoId), new Date().toISOString());
}

export async function draftPostForApprovedVideo(videoId: string): Promise<{ source: "ai" | "rule" | "kept"; reason?: string }> {
  try {
    if (captionDraft(videoId)) return { source: "kept" };
    let reason = "";
    try {
      const r = await generateCaption(videoId, { keepExisting: true });
      if (r.ok) return { source: "ai" };
      reason = r.error;
    } catch (e) {
      reason = e instanceof Error ? e.message : String(e);
    }
    // AI chạy nền chậm: trong lúc chờ, OWNER có thể đã bấm "Viết lại bằng AI" → không ghi đè bản nháp vừa có (phản biện 25/10 P2-2)
    if (captionDraft(videoId)) return { source: "kept" };
    const base = buildCaption(videoId);
    if (base.text) {
      saveCaptionDraft(videoId, base.text);
      savePostTitle(videoId, buildPostTitle(videoId));
      setPostDraftSource(videoId, `rule: ${reason || "AI không viết được"}`);
    }
    return { source: "rule", reason };
  } finally {
    setSetting(pendingKey(videoId), "");
  }
}
