// Kiểu dữ liệu và kiểm tra thuần cho việc dựng video (dùng được cả ở client component và test).

/** setup = đã nhận nguồn, chờ người dựng chọn tỷ lệ / khung rồi bấm "Bắt đầu dựng". */
export type JobStatus = "setup" | "queued" | "running" | "done" | "error";

/** Tỷ lệ khung xuất (Skill ESV gốc là 9:16; tỷ lệ khác thu dải chữ về đáy khung). */
export const ASPECTS = ["9:16", "4:5", "1:1", "16:9"] as const;
export type Aspect = (typeof ASPECTS)[number];

/** Cân chỉnh khung cắt: tâm khung theo tỉ lệ nguồn (0–1), phóng ≥ 1. Trống = theo mặt người nói. */
export interface Framing {
  x?: number;
  y?: number;
  zoom?: number;
}

export function parseAspect(v: unknown): Aspect {
  return (ASPECTS as readonly string[]).includes(String(v)) ? (String(v) as Aspect) : "9:16";
}

export function parseFraming(x: unknown, y: unknown, zoom: unknown): Framing | undefined {
  const n = (v: unknown, lo: number, hi: number) => {
    const f = Number(v);
    return v === "" || v === null || v === undefined || !Number.isFinite(f) ? undefined : Math.min(hi, Math.max(lo, f));
  };
  const fr: Framing = { x: n(x, 0, 1), y: n(y, 0, 1), zoom: n(zoom, 1, 3) };
  return fr.x === undefined && fr.y === undefined && (fr.zoom === undefined || fr.zoom === 1) ? undefined : fr;
}

export interface VideoJob {
  videoId: string;
  version: number;
  status: JobStatus;
  sourceUploadId: string;
  cutSilence: boolean;
  aspect?: Aspect;
  framing?: Framing;
  prompt?: string;
  createdAt: string;
  by?: string;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
  note?: string;
  runId?: string;
  masterUploadId?: string;
  /** PID tiến trình dựng (để dừng khi máy chủ khởi động lại). */
  pid?: number;
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
