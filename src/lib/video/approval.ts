// CP03: cổng chuyển trạng thái video. Điểm chặn đăng lấy từ ĐÚNG bản dựng đang gắn với tệp video (masterUploadId),
// không phải bản mới nhất. Bản mới nhất lỗi / đang dựng thì không chuyển bước. Video dựng ngoài hệ thống (không có bảng kiểm)
// cũng phải ghi chú khi duyệt.
import { jobVersions, latestJob, readJob, readReport } from "./jobs";
import type { VideoReport } from "./job-types";

const NO_QA = "Video không qua bảng kiểm A–Q của hệ thống (dựng ngoài hoặc tải tay): OWNER tự kiểm phụ đề, âm thanh, giấy phép nhạc/font trước khi duyệt";

export interface VideoLike {
  id: string;
  status: string;
  uploadId: string | null;
}

export function reportForMaster(videoId: string, uploadId: string | null): VideoReport | null {
  if (!uploadId) return null;
  for (const v of jobVersions(videoId)) {
    if (readJob(videoId, v)?.masterUploadId === uploadId) return readReport(videoId, v);
  }
  return null;
}

/** Điểm chặn đăng của tệp video hiện tại. */
export function blockersForVideo(v: VideoLike): string[] {
  if (!v.uploadId) return [];
  const r = reportForMaster(v.id, v.uploadId);
  return r ? r.blockers : [NO_QA];
}

/** Lý do không cho chuyển bước (null = cho phép). */
export function transitionBlock(v: VideoLike, kind: string, note: string): string | null {
  if (kind === "request_changes") return note ? null : "Cần ghi rõ điều cần chỉnh sửa";
  const last = latestJob(v.id);
  if (last && (last.job.status === "queued" || last.job.status === "running")) return "Video đang dựng, chờ dựng xong";
  if (last && last.job.status === "error") return "Bản dựng mới nhất bị lỗi: dựng lại thành công (hoặc tải bản dựng tay) trước khi chuyển bước";
  if (!v.uploadId) return "Video chưa có tệp";
  if (kind === "approve") {
    const b = blockersForVideo(v);
    if (b.length && note.trim().length < 10) return `Bản dựng còn ${b.length} điểm chặn đăng. Ghi rõ cách xử lý trong ghi chú phê duyệt.`;
  }
  return null;
}
