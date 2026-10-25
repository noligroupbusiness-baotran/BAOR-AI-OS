"use client";

import { useMemo, useRef, useState } from "react";
import { cn } from "@/lib/format";
import { addVideoCommentAction, applyVideoCommentsAction, resolveVideoCommentAction, setVideoCommentFixAction } from "@/lib/actions/videos";
import { SubmitButton } from "@/components/campaigns/submit-button";
import { Pill } from "@/components/ui/pill";
import { VideoPlayer, type PlayerControl } from "@/components/video/video-player";
import { toCutTime } from "@/lib/video/job-types";
import { candidatesNear, commentStatusLabel, fixActionLabel, STYLES, type Candidate, type CommentFix, type CommentStatus, type FixAction } from "@/lib/video/review-types";

type Obj = Record<string, unknown>;
export type ReviewComment = {
  id: string;
  version: number;
  t: number;
  tEnd: number | null;
  srcT: number;
  srcTEnd: number | null;
  text: string;
  fix: CommentFix | null;
  status: CommentStatus;
  appliedVersion: number | null;
  verifyNote: string;
  by: string;
  at: string;
};

const STYLE_LABEL: Record<string, string> = { fade: "Hiện mờ", blur: "Nhoè vào", shine: "Ánh kim" };
const mmss = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
const input = "h-8 rounded border border-border-2 bg-surface px-2 text-[12.5px] text-ink";

/** Chọn mục kế hoạch gần mốc + cách sửa → CommentFix (hoặc null = chỉ ghi chú). */
function FixPicker({ candidates, onChange }: { candidates: Candidate[]; onChange: (f: CommentFix | null) => void }) {
  const [idx, setIdx] = useState(-1);
  const [action, setAction] = useState<FixAction>("off");
  const [field, setField] = useState("");
  const [value, setValue] = useState("");
  const c = idx >= 0 ? candidates[idx] : undefined;
  const emit = (i: number, a: FixAction, f: string, v: string) => {
    const cc = i >= 0 ? candidates[i] : undefined;
    onChange(cc ? { target: { kind: cc.kind, t: cc.t, label: cc.label, ...(cc.type ? { type: cc.type } : {}), ...(f ? { field: f } : {}) }, action: a, ...(a === "text" || a === "style" ? { value: v } : {}) } : null);
  };
  const actions: FixAction[] = c ? [c.off ? "on" : "off", ...(c.fields.length ? (["text"] as FixAction[]) : []), ...(c.kind === "emphasis" ? (["style"] as FixAction[]) : [])] : [];
  return (
    <div className="grid gap-1.5">
      <label className="grid gap-0.5">
        <span className="text-[11px] font-semibold uppercase text-ink-3">Yêu cầu sửa cụ thể (tuỳ chọn)</span>
        <select
          aria-label="Mục cần sửa"
          value={idx}
          onChange={(e) => {
            const i = Number(e.target.value);
            const cc = candidates[i];
            const a: FixAction = cc?.off ? "on" : "off";
            setIdx(i);
            setAction(a);
            setField(cc?.fields[0]?.field ?? "");
            setValue(cc?.fields[0]?.value ?? "");
            emit(i, a, "", "");
          }}
          className={input}
        >
          <option value={-1}>Chỉ ghi chú cho người dựng</option>
          {candidates.map((x, i) => (
            <option key={`${i}-${x.kind}-${x.type ?? ""}-${x.t}`} value={i}>{`${mmss(x.cutT)} · ${x.label}${x.off ? " (đang tắt)" : ""}`}</option>
          ))}
        </select>
      </label>
      {candidates.length === 0 && <span className="text-[12px] text-ink-3">Không có chữ nhấn / sơ đồ / ảnh minh hoạ quanh mốc này — góp ý sẽ là ghi chú.</span>}
      {c && (
        <div className="flex flex-wrap items-center gap-1.5">
          <select aria-label="Cách sửa" value={action} onChange={(e) => { const a = e.target.value as FixAction; const v = a === "style" ? "fade" : (c.fields.find((f) => f.field === field)?.value ?? ""); setAction(a); setValue(v); emit(idx, a, a === "text" ? field : "", v); }} className={input}>
            {actions.map((a) => <option key={a} value={a}>{fixActionLabel[a]}</option>)}
          </select>
          {action === "text" && c.fields.length > 1 && (
            <select aria-label="Ô chữ" value={field} onChange={(e) => { const f = e.target.value; const v = c.fields.find((x) => x.field === f)?.value ?? ""; setField(f); setValue(v); emit(idx, action, f, v); }} className={input}>
              {c.fields.map((f) => <option key={f.field} value={f.field}>{f.label}</option>)}
            </select>
          )}
          {action === "text" && <input aria-label="Chữ mới" value={value} onChange={(e) => { setValue(e.target.value); emit(idx, action, field, e.target.value); }} placeholder="đúng nguyên lời nói" className={cn(input, "min-w-0 flex-1")} />}
          {action === "style" && (
            <select aria-label="Kiểu mới" value={value} onChange={(e) => { setValue(e.target.value); emit(idx, action, "", e.target.value); }} className={input}>
              {STYLES.map((s) => <option key={s} value={s}>{STYLE_LABEL[s]}</option>)}
            </select>
          )}
        </div>
      )}
    </div>
  );
}

function fixSummary(f: CommentFix): string {
  return `${f.target.label} → ${fixActionLabel[f.action]}${f.value ? ` “${STYLE_LABEL[f.value] ?? f.value}”` : ""}`;
}

/**
 * Video Review: xem bản dựng, góp ý tại mốc / đoạn đang xem, gắn yêu cầu sửa cụ thể vào mục kế hoạch gần đó,
 * "Dựng lại theo góp ý", theo dõi kết quả kiểm từng góp ý ở bản mới, xác nhận / mở lại. Lịch sử góp ý không xoá.
 */
export function ReviewWorkspace(props: { videoId: string; version: number; back: string; src: string; hdSrc?: string; plan: Obj; keep: [number, number][] | null; comments: ReviewComment[]; canApply: boolean; aspect?: string }) {
  const player = useRef<PlayerControl>(null);
  const [now, setNow] = useState(0);
  const [mark, setMark] = useState<{ t: number; tEnd: number | null } | null>(null);
  const [text, setText] = useState("");
  const [fix, setFix] = useState<CommentFix | null>(null);
  const [fixFor, setFixFor] = useState<string | null>(null);
  const [laterFix, setLaterFix] = useState<CommentFix | null>(null);
  const cands = useMemo(() => (mark ? candidatesNear(props.plan, props.keep, mark.t, mark.tEnd) : []), [mark, props.plan, props.keep]);
  const pending = props.comments.filter((c) => (c.status === "open" || c.status === "failed") && c.fix).length;
  // Mốc trên bản đang xem: đổi từ mốc gốc (góp ý trên bản khác có thể lệch do cắt lặng khác)
  const seekTo = (c: ReviewComment) => player.current?.seek(toCutTime(props.keep, c.srcT));

  return (
    <div className={props.aspect === "16:9" ? "grid gap-3" : "grid gap-3 sm:grid-cols-[minmax(0,300px)_minmax(0,1fr)]"} data-testid="review-workspace">
      <div>
        <VideoPlayer src={props.src} hdSrc={props.hdSrc} control={player} onTime={setNow} label={`Bản dựng ${props.version}`} aspect={props.aspect} />
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px]">
          <button type="button" onClick={() => { player.current?.pause(); setMark({ t: Math.round(now * 10) / 10, tEnd: null }); setFix(null); }} className="h-7 rounded-full border border-border-2 px-2.5 font-medium text-ink hover:border-ink-3">
            Góp ý tại {mmss(now)}
          </button>
          {mark && (
            <button type="button" disabled={now <= mark.t} onClick={() => { player.current?.pause(); setMark({ ...mark, tEnd: Math.round(now * 10) / 10 }); setFix(null); }} className="h-7 rounded-full border border-border-2 px-2.5 font-medium text-ink hover:border-ink-3 disabled:opacity-40">
              Kết thúc đoạn tại {mmss(now)}
            </button>
          )}
        </div>
      </div>

      <div className="grid content-start gap-2">
        {mark && (
          <form action={addVideoCommentAction} className="grid gap-2 rounded-md border border-jade/40 bg-surface p-2.5" aria-label="Góp ý mới">
            <div className="flex items-center justify-between text-[12.5px]">
              <span className="font-semibold text-ink">Góp ý bản {props.version} · {mark.tEnd ? `đoạn ${mmss(mark.t)} – ${mmss(mark.tEnd)}` : `tại ${mmss(mark.t)}`}</span>
              <button type="button" onClick={() => setMark(null)} aria-label="Huỷ góp ý" className="text-ink-3 hover:text-ink">✕</button>
            </div>
            <input type="hidden" name="id" value={props.videoId} />
            <input type="hidden" name="version" value={props.version} />
            <input type="hidden" name="back" value={props.back} />
            <input type="hidden" name="t" value={mark.t} />
            <input type="hidden" name="tEnd" value={mark.tEnd ?? ""} />
            <input type="hidden" name="fix" value={fix ? JSON.stringify(fix) : ""} />
            <textarea name="text" aria-label="Nội dung góp ý" required rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="VD: chữ nhấn này thừa, ảnh không hợp câu nói…" className="rounded border border-border-2 bg-surface px-2 py-1.5 text-[13px] text-ink" />
            <FixPicker key={`${mark.t}-${mark.tEnd}`} candidates={cands} onChange={setFix} />
            <div><SubmitButton pendingText="Đang lưu…">Lưu góp ý</SubmitButton></div>
          </form>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[12.5px] font-semibold text-ink">Góp ý theo mốc · {props.comments.length}</span>
          {pending > 0 && props.canApply && (
            <form action={applyVideoCommentsAction}>
              <input type="hidden" name="id" value={props.videoId} />
              <input type="hidden" name="back" value={props.back} />
              <SubmitButton pendingText="Đang xếp hàng…">Dựng lại theo {pending} góp ý</SubmitButton>
            </form>
          )}
        </div>
        {props.comments.length === 0 && <p className="m-0 text-[12.5px] text-ink-3">Chưa có góp ý. Xem video, dừng ở chỗ cần sửa rồi bấm “Góp ý tại …”.</p>}
        <ol className="m-0 grid list-none gap-1.5 p-0">
          {props.comments.map((c) => {
            const st = commentStatusLabel[c.status];
            return (
              <li key={c.id} className="grid gap-1 rounded-md border border-border bg-surface px-2.5 py-2 text-[12.5px]" data-testid="review-comment">
                <div className="flex flex-wrap items-center gap-1.5">
                  <button type="button" onClick={() => seekTo(c)} className="num rounded bg-ground-2 px-1.5 py-0.5 font-semibold text-ink hover:bg-jade-soft" title="Tua tới mốc này">
                    {mmss(toCutTime(props.keep, c.srcT))}{c.srcTEnd !== null ? ` – ${mmss(toCutTime(props.keep, c.srcTEnd))}` : ""}
                  </button>
                  <Pill tone={st.tone}>{st.label}</Pill>
                  <span className="text-ink-3">bản {c.version} · {c.by}</span>
                </div>
                <div className="whitespace-pre-line text-ink">{c.text}</div>
                {c.fix && <div className="text-ink-2">Yêu cầu sửa: {fixSummary(c.fix)}{c.appliedVersion ? ` · dựng lại ở bản ${c.appliedVersion}` : ""}</div>}
                {c.verifyNote && <div className={cn("text-[12px]", c.status === "failed" ? "text-brick" : "text-ink-2")}>Kiểm: {c.verifyNote}</div>}
                <div className="flex flex-wrap gap-1.5">
                  {(c.status === "open" || c.status === "failed") && fixFor !== c.id && (
                    <button type="button" onClick={() => { setFixFor(c.id); setLaterFix(null); }} className="h-6 rounded-full border border-border-2 px-2 text-[12px] text-ink hover:border-ink-3">{c.fix ? "Đổi yêu cầu sửa" : "Thành yêu cầu sửa"}</button>
                  )}
                  {(c.status === "applied" || c.status === "failed" || c.status === "open") && (
                    <form action={resolveVideoCommentAction}>
                      <input type="hidden" name="commentId" value={c.id} />
                      <input type="hidden" name="back" value={props.back} />
                      <SubmitButton variant="outline" pendingText="…">Xác nhận xong</SubmitButton>
                    </form>
                  )}
                  {(c.status === "applied" || c.status === "resolved") && (
                    <form action={resolveVideoCommentAction}>
                      <input type="hidden" name="commentId" value={c.id} />
                      <input type="hidden" name="back" value={props.back} />
                      <input type="hidden" name="reopen" value="1" />
                      <SubmitButton variant="ghost" pendingText="…">Chưa đạt, mở lại</SubmitButton>
                    </form>
                  )}
                </div>
                {fixFor === c.id && (
                  <form action={setVideoCommentFixAction} className="grid gap-1.5 rounded border border-border bg-ground p-2">
                    <input type="hidden" name="commentId" value={c.id} />
                    <input type="hidden" name="back" value={props.back} />
                    <input type="hidden" name="fix" value={laterFix ? JSON.stringify(laterFix) : ""} />
                    <FixPicker candidates={candidatesNear(props.plan, props.keep, toCutTime(props.keep, c.srcT), c.srcTEnd !== null ? toCutTime(props.keep, c.srcTEnd) : null)} onChange={setLaterFix} />
                    <div className="flex gap-1.5">
                      <SubmitButton pendingText="Đang lưu…">Lưu yêu cầu sửa</SubmitButton>
                      <button type="button" onClick={() => setFixFor(null)} className="h-[26px] rounded-full px-2.5 text-[12px] text-ink-2 hover:text-ink">Huỷ</button>
                    </div>
                  </form>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

/** So hai phiên bản cạnh nhau: chọn bản, phát / tua đồng bộ cả hai. */
export function CompareVersions({ videoId, versions }: { videoId: string; versions: number[] }) {
  const [a, setA] = useState(versions[1] ?? versions[0]);
  const [b, setB] = useState(versions[0]);
  const left = useRef<HTMLVideoElement>(null);
  const right = useRef<HTMLVideoElement>(null);
  const both = (fn: (v: HTMLVideoElement) => void) => [left.current, right.current].forEach((v) => v && fn(v));
  const src = (n: number) => `/api/video-jobs/${videoId}/v${n}/preview.mp4`;
  if (versions.length < 2) return null;
  return (
    <div className="grid gap-2 rounded-md border border-border bg-ground p-2.5" data-testid="compare-versions">
      <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
        <span className="font-semibold text-ink">So phiên bản</span>
        <select aria-label="Bản bên trái" value={a} onChange={(e) => setA(Number(e.target.value))} className={input}>{versions.map((n) => <option key={n} value={n}>Bản {n}</option>)}</select>
        <span className="text-ink-3">với</span>
        <select aria-label="Bản bên phải" value={b} onChange={(e) => setB(Number(e.target.value))} className={input}>{versions.map((n) => <option key={n} value={n}>Bản {n}</option>)}</select>
        <button type="button" onClick={() => both((v) => void v.play())} className="h-7 rounded-full border border-border-2 px-2.5 text-ink hover:border-ink-3">▶ Phát cùng lúc</button>
        <button type="button" onClick={() => both((v) => v.pause())} className="h-7 rounded-full border border-border-2 px-2.5 text-ink hover:border-ink-3">❚❚ Dừng</button>
        <button type="button" onClick={() => { const t = left.current?.currentTime ?? 0; both((v) => { v.currentTime = t; }); }} className="h-7 rounded-full border border-border-2 px-2.5 text-ink hover:border-ink-3">Khớp mốc</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[{ n: a, ref: left }, { n: b, ref: right }].map(({ n, ref }, i) => (
          <figure key={i} className="m-0">
            <video ref={ref} src={src(n)} controls playsInline preload="metadata" aria-label={`So sánh bản ${n}`} className="block max-h-[420px] w-full rounded bg-black object-contain"
              onSeeked={(e) => { const other = i === 0 ? right.current : left.current; if (other && Math.abs(other.currentTime - e.currentTarget.currentTime) > 0.3) other.currentTime = e.currentTarget.currentTime; }} />
            <figcaption className="mt-0.5 text-center text-[12px] text-ink-2">Bản {n}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
