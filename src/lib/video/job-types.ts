// Kiểu dữ liệu và kiểm tra thuần cho việc dựng video (dùng được cả ở client component và test).

export type JobStatus = "queued" | "running" | "done" | "error";

export interface VideoJob {
  videoId: string;
  version: number;
  status: JobStatus;
  sourceUploadId: string;
  cutSilence: boolean;
  prompt?: string;
  createdAt: string;
  by?: string;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
  note?: string;
  runId?: string;
  masterUploadId?: string;
}

export interface JobProgress {
  step: string;
  label: string;
  pct: number;
  updatedAt: string;
}

export type QaStatus = "pass" | "fail" | "risk" | "blocker" | "na" | "unmeasured" | "info";

export interface QaItem {
  id: string;
  name: string;
  status: QaStatus;
  detail: string;
}

export interface VideoReport {
  skill: { skillId: string; name: string; version: string; sourceUrl: string };
  output: { seconds: number; frames: number; cutSilence: boolean; cuts: number };
  transcript: { words: number; uncertain: { t: number; text: string; p: number }[] };
  captions: { units: number };
  emphasis: { t: number; text: string; kind: string }[];
  audio: { lufs: number | null; truePeak: number; previewTruePeak: number; music: { used: boolean; license?: string; reason?: string } | null };
  qa: QaItem[];
  failed: string[];
  blockers: string[];
  elapsedSec: number;
}

/** Tệp được phép phục vụ từ thư mục một lần dựng (không cho đi ra ngoài thư mục). */
export function isJobFile(name: string): boolean {
  return /^(preview\.mp4|contact\.jpg|compare\.jpg|phu-de\.srt|transcript\.txt|report\.json|checksums\.sha256)$/.test(name) || /^snapshots\/\d{3}\.jpg$/.test(name);
}

export const qaTone: Record<QaStatus, "jade" | "amber" | "brick" | "neutral"> = {
  pass: "jade",
  info: "neutral",
  na: "neutral",
  unmeasured: "amber",
  risk: "amber",
  blocker: "amber",
  fail: "brick",
};

export const qaLabel: Record<QaStatus, string> = {
  pass: "Đạt",
  info: "Thông tin",
  na: "Không áp dụng",
  unmeasured: "Cần người xem",
  risk: "Rủi ro",
  blocker: "Chặn đăng",
  fail: "Chưa đạt",
};
