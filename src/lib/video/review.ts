// Video Review (máy chủ): góp ý theo mốc thời gian trên bản dựng → yêu cầu sửa cụ thể → dựng lại có phạm vi → kiểm bản mới.
// Góp ý chỉ thêm và đổi trạng thái, không xoá (lịch sử). "Dựng lại có phạm vi": kế hoạch bản mới chỉ khác bản cũ đúng các mục
// được góp ý (applyFix); bộ dựng vẫn dựng lại toàn bộ khung hình từ nguồn (không ghép mảnh) để không lệch tiếng / mốc cắt.
import fs from "node:fs";
import path from "node:path";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { logActivity } from "@/lib/activity";
import { toSourceTime } from "./job-types";
import { applyFix, validateFix, verifyFix, type CommentFix, type CommentStatus, type RenderOutput } from "./review-types";
import { jobDir, latestJob, readEditorPlan, readJob, readReport, rerenderVideo, writeEditorPlan } from "./jobs";

const newId = () => `vc_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const round = (n: number) => Math.round(n * 100) / 100;

export type VideoComment = Omit<typeof schema.videoComments.$inferSelect, "fix" | "status"> & { fix: CommentFix | null; status: CommentStatus };

function parse(row: typeof schema.videoComments.$inferSelect): VideoComment {
  let fix: CommentFix | null = null;
  try {
    fix = row.fix ? (JSON.parse(row.fix) as CommentFix) : null;
  } catch {
    fix = null;
  }
  return { ...row, fix, status: row.status as CommentStatus };
}

export function listComments(videoId: string): VideoComment[] {
  return getDb().select().from(schema.videoComments).where(eq(schema.videoComments.videoId, videoId)).orderBy(asc(schema.videoComments.t), asc(schema.videoComments.at)).all().map(parse);
}

function getComment(id: string): VideoComment | null {
  const r = getDb().select().from(schema.videoComments).where(eq(schema.videoComments.id, id)).get();
  return r ? parse(r) : null;
}

/** Thêm góp ý tại mốc / đoạn (giây theo bản dựng `version`). Đổi sang mốc gốc bằng bản đồ cắt lặng của chính bản đó. */
export function addComment(i: { videoId: string; version: number; t: number; tEnd?: number | null; text: string; fix?: CommentFix | null; by: string }): { ok: true; id: string } | { ok: false; error: string } {
  const text = i.text.replace(/\s+/g, " ").trim().slice(0, 1000);
  if (!text) return { ok: false, error: "Nhập nội dung góp ý" };
  const report = readReport(i.videoId, i.version);
  if (!report) return { ok: false, error: `Không tìm thấy bản dựng ${i.version}` };
  const dur = report.output.seconds;
  if (!Number.isFinite(i.t) || i.t < 0 || i.t > dur + 0.5) return { ok: false, error: "Mốc thời gian ngoài video" };
  let tEnd = i.tEnd ?? null;
  if (tEnd !== null && (!Number.isFinite(tEnd) || tEnd <= i.t)) tEnd = null;
  if (tEnd !== null) tEnd = Math.min(tEnd, dur);
  if (i.fix) {
    const e = validateFix(i.fix);
    if (e) return { ok: false, error: e };
  }
  const keep = report.output.keep ?? null;
  const id = newId();
  getDb()
    .insert(schema.videoComments)
    .values({ id, videoId: i.videoId, version: i.version, t: round(i.t), tEnd: tEnd === null ? null : round(tEnd), srcT: round(toSourceTime(keep, i.t)), srcTEnd: tEnd === null ? null : round(toSourceTime(keep, tEnd)), text, fix: i.fix ? JSON.stringify(i.fix) : null, status: "open", by: i.by, at: new Date().toISOString() })
    .run();
  logActivity("human", `${i.by} góp ý video ${i.videoId} bản ${i.version} tại ${i.t.toFixed(1)} s${i.fix ? " (kèm yêu cầu sửa)" : ""}.`, "video");
  return { ok: true, id };
}

/** Đổi góp ý thành yêu cầu sửa cụ thể (hoặc bỏ yêu cầu: fix = null). Chỉ khi góp ý còn mở / chưa áp dụng được. */
export function setCommentFix(id: string, fix: CommentFix | null, by: string): { ok: true } | { ok: false; error: string } {
  const c = getComment(id);
  if (!c) return { ok: false, error: "Không tìm thấy góp ý" };
  if (c.status !== "open" && c.status !== "failed") return { ok: false, error: "Góp ý đang dựng lại / đã áp dụng: không đổi yêu cầu được" };
  if (fix) {
    const e = validateFix(fix);
    if (e) return { ok: false, error: e };
  }
  getDb().update(schema.videoComments).set({ fix: fix ? JSON.stringify(fix) : null, status: "open", verifyNote: "" }).where(eq(schema.videoComments.id, id)).run();
  logActivity("human", `${by} ${fix ? "đặt" : "bỏ"} yêu cầu sửa cho góp ý ${id}.`, "video");
  return { ok: true };
}

/**
 * Dựng lại theo góp ý: áp mọi yêu cầu sửa còn mở vào kế hoạch cấp video (chỉ đổi đúng mục được góp ý), ghi lịch sử phản hồi,
 * xếp hàng dựng bản mới; góp ý chuyển "Đang dựng lại" gắn với bản mới. Góp ý không có yêu cầu sửa giữ nguyên (ghi chú cho người).
 */
export function applyComments(videoId: string, by: string): { ok: true; version: number; applied: number } | { ok: false; error: string } {
  const open = listComments(videoId).filter((c) => (c.status === "open" || c.status === "failed") && c.fix);
  if (!open.length) return { ok: false, error: "Chưa có góp ý nào kèm yêu cầu sửa cụ thể" };
  let plan = readEditorPlan(videoId).plan as Parameters<typeof applyFix>[0];
  const failedById = new Map<string, string>();
  const used: VideoComment[] = [];
  for (const c of open) {
    const r = applyFix(plan, c.fix!);
    if (r.error) failedById.set(c.id, r.error);
    else {
      plan = r.plan;
      used.push(c);
    }
  }
  const errors = [...failedById.values()];
  if (!used.length) return { ok: false, error: `Không áp được yêu cầu nào: ${errors.join("; ")}` };
  const w = writeEditorPlan(videoId, plan, by);
  if (!w.ok) return w;
  const note = `Dựng lại theo ${used.length} góp ý: ${used.map((c) => `${c.t.toFixed(1)} s “${c.text.slice(0, 60)}”`).join("; ")}${errors.length ? `. Không áp được: ${errors.join("; ")}` : ""}`;
  const r = rerenderVideo(videoId, by, undefined, undefined, note);
  if (!r.ok) return { ok: false, error: `Đã lưu kế hoạch theo góp ý; chưa dựng lại được: ${r.error}` };
  getDb().update(schema.videoComments).set({ status: "planned", appliedVersion: r.version, verifyNote: "" }).where(inArray(schema.videoComments.id, used.map((c) => c.id))).run();
  for (const [id, err] of failedById) getDb().update(schema.videoComments).set({ status: "failed", verifyNote: err }).where(eq(schema.videoComments.id, id)).run();
  return { ok: true, version: r.version, applied: used.length };
}

/** Kiểm các góp ý đang dựng lại khi bản dựng của chúng đã xong / lỗi. Gọi khi bộ dựng xong và khi mở Video Studio (lặp an toàn). */
export function verifyComments(videoId: string): number {
  const planned = listComments(videoId).filter((c) => c.status === "planned" && c.appliedVersion);
  let n = 0;
  for (const c of planned) {
    const v = c.appliedVersion!;
    const job = readJob(videoId, v);
    if (!job || job.status === "queued" || job.status === "running" || job.status === "setup") continue;
    let res: { ok: boolean; note: string };
    if (job.status === "error") res = { ok: false, note: `Bản ${v} dựng lỗi: ${(job.error ?? "").slice(0, 200)}` };
    else {
      const dir = jobDir(videoId, v);
      let jobPlan: Parameters<typeof verifyFix>[1] = null;
      try {
        jobPlan = JSON.parse(fs.readFileSync(path.join(dir, "plan.json"), "utf8"));
      } catch {
        jobPlan = null;
      }
      res = verifyFix(c.fix!, jobPlan, readReport(videoId, v) as unknown as RenderOutput | null);
      res.note = `Bản ${v}: ${res.note}`;
    }
    getDb().update(schema.videoComments).set({ status: res.ok ? "applied" : "failed", verifyNote: res.note.slice(0, 500) }).where(and(eq(schema.videoComments.id, c.id), eq(schema.videoComments.status, "planned"))).run();
    n++;
  }
  return n;
}

/** OWNER / người duyệt xác nhận góp ý đã xong (hoặc mở lại nếu chưa đạt). */
export function resolveComment(id: string, by: string, reopen = false): { ok: true } | { ok: false; error: string } {
  const c = getComment(id);
  if (!c) return { ok: false, error: "Không tìm thấy góp ý" };
  if (reopen) {
    if (c.status !== "applied" && c.status !== "resolved") return { ok: false, error: "Chỉ mở lại góp ý đã áp dụng / đã xác nhận" };
    getDb().update(schema.videoComments).set({ status: "open", resolvedBy: null, resolvedAt: null }).where(eq(schema.videoComments.id, id)).run();
  } else {
    if (c.status === "planned") return { ok: false, error: "Bản dựng theo góp ý chưa xong" };
    getDb().update(schema.videoComments).set({ status: "resolved", resolvedBy: by, resolvedAt: new Date().toISOString() }).where(eq(schema.videoComments.id, id)).run();
  }
  logActivity("human", `${by} ${reopen ? "mở lại" : "xác nhận xong"} góp ý ${id} (video ${c.videoId}).`, "video");
  return { ok: true };
}

/** Bản dựng xem được để so (có preview.mp4), mới nhất trước. */
export function comparableVersions(videoId: string): number[] {
  const j = latestJob(videoId);
  if (!j) return [];
  const out: number[] = [];
  for (let v = j.job.version; v >= 1; v--) {
    try {
      if (fs.existsSync(path.join(jobDir(videoId, v), "preview.mp4")) && readJob(videoId, v)?.status === "done") out.push(v);
    } catch {
      /* bản lỗi tên */
    }
  }
  return out;
}
