// Thư mục đã duyệt trên máy OWNER (2.BAOR.vn/7.VIDEO-DA-DUYET): OWNER edit xong, kéo video vào đó là máy dựng (scripts/video/
// render-worker.mts › approved-intake.mts) gửi lên máy chủ bằng khoá máy dựng → video vào thẳng Kho (đã duyệt) → tự viết bài đăng.
// Phần máy chủ: mở phiên nhận (chống trùng theo mã băm), nhận từng khúc (dùng lại src/lib/video/resumable.ts), ghi dấu lần nhận cuối.
import { getDb, schema } from "@/db";
import { getAdminEmail, getSetting, setSetting } from "@/lib/admin";
import { openSession } from "./resumable";
import type { IntakeMeta } from "./source-intake";

export const APPROVED_SOURCE = "approved-folder";
const LAST_KEY = "video.approvedIntakeLast";

/** Video CÒN TỆP trong kho với cùng mã băm (tệp kéo vào hai lần / đổi tên) → không nhận lại. Video đã đăng và đã gỡ tệp thì nhận lại được. */
export function findVideoBySha(sha256: string): { videoId: string; title: string } | null {
  if (!/^[a-f0-9]{64}$/.test(sha256)) return null;
  const db = getDb();
  const needle = `"sha256":"${sha256}"`;
  const ups = new Set(db.select().from(schema.uploads).all().filter((u) => u.kind === "video" && u.meta.includes(needle)).map((u) => u.id));
  if (!ups.size) return null;
  const v = db.select().from(schema.videos).all().find((x) => x.uploadId && ups.has(x.uploadId) && !x.filesPurgedAt);
  return v ? { videoId: v.id, title: v.title } : null;
}

// Máy dựng báo tình trạng thư mục đã duyệt mỗi lần gọi claim (header x-baor-approved-dir: ok | missing). Thiếu header = mã cũ.
const FOLDER_KEY = "video.approvedFolder";
export type ApprovedFolderState = "ok" | "missing" | "outdated";

export function recordApprovedFolder(state: ApprovedFolderState): void {
  setSetting(FOLDER_KEY, JSON.stringify({ state, at: new Date().toISOString() }));
}

export function approvedFolderState(): ApprovedFolderState | null {
  try {
    const j = JSON.parse(getSetting(FOLDER_KEY) ?? "null") as { state?: ApprovedFolderState } | null;
    return j?.state ?? null;
  } catch {
    return null;
  }
}

export type OpenIntakeResult =
  | { ok: true; duplicate: true; videoId: string; title: string }
  | { ok: true; duplicate: false; sid: string; offset: number; resumed: boolean }
  | { ok: false; error: string; status: number };

/** Mở phiên nhận một video từ thư mục đã duyệt. Tệp vào Kho dưới danh nghĩa tài khoản quản trị (OWNER duyệt bằng cách kéo vào thư mục). */
export function openApprovedIntake(i: { name: string; size: number; sha256: string; worker: string; transcript?: string; note?: string }): OpenIntakeResult {
  const sha = (i.sha256 ?? "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(sha)) return { ok: false, error: "Thiếu mã băm sha256 của tệp", status: 400 };
  const dup = findVideoBySha(sha);
  if (dup) return { ok: true, duplicate: true, ...dup };
  const owner = getAdminEmail();
  if (!owner) return { ok: false, error: "Chưa có tài khoản quản trị để nhận video", status: 409 };
  const meta: IntakeMeta = { sha256: sha, transcript: i.transcript, note: i.note, source: APPROVED_SOURCE };
  const r = openSession({
    original: i.name,
    size: i.size,
    key: `sha:${sha}`,
    params: { cut: false, contentId: null, final: true, meta },
    by: { name: `Máy dựng ${i.worker}`, email: owner },
  });
  if (!r.ok) return r;
  return { ok: true, duplicate: false, sid: r.sid, offset: r.offset, resumed: r.resumed };
}

export interface ApprovedIntakeMark {
  at: string;
  worker: string;
  videoId: string;
  name: string;
}

export function recordApprovedIntake(m: Omit<ApprovedIntakeMark, "at">): void {
  setSetting(LAST_KEY, JSON.stringify({ ...m, at: new Date().toISOString() }));
}

export function lastApprovedIntake(): ApprovedIntakeMark | null {
  try {
    return JSON.parse(getSetting(LAST_KEY) ?? "null");
  } catch {
    return null;
  }
}

/** Số video từ thư mục đã duyệt đã nhận trong N giờ gần nhất (hiện ở Kho video). */
export function approvedIntakeCount(hours = 24, now = Date.now()): number {
  const since = new Date(now - hours * 3_600_000).toISOString();
  return getDb()
    .select()
    .from(schema.uploads)
    .all()
    .filter((u) => u.kind === "video" && u.createdAt >= since && u.meta.includes(`"source":"${APPROVED_SOURCE}"`)).length;
}
