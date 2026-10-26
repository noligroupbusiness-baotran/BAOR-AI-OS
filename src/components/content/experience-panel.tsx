"use client";

import { forwardRef, useImperativeHandle, useRef } from "react";
import { BookOpen, Check, ChevronDown, CircleAlert, MessageCirclePlus, UserRound, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmStory } from "@/lib/actions/content";
import { InfoTip } from "@/components/ui/info-tip";
import { ANGLES, CONTENT_SKILL, EXTRACTION_FIELDS, answeredCount, interviewQuestions, type AngleKey, type ExperienceSuggestion, type OwnerExperience } from "@/lib/content/experience";
import { cn } from "@/lib/format";

// "Kinh nghiệm của anh" (SK-KNW-01 — Skill viết content của anh): INTERVIEW MODE hỏi 1–2 câu mỗi lần để khơi lại chuyện thật,
// gợi ý chuyện từ Second Brain (chỉ dùng khi anh tích), góc nội dung, bản bóc tách AI làm trước khi viết. Nằm trên 4 thẻ cảnh; gọn lại khi đã có chuyện.

const field = "w-full rounded-md border border-border-2 bg-surface px-2.5 text-ink outline-none focus-visible:outline-2 focus-visible:outline-jade";

export interface ExperiencePanelHandle {
  focus: () => void;
}

interface Props {
  value: OwnerExperience;
  onChange: (e: OwnerExperience) => void;
  topic: string;
  suggestions: ExperienceSuggestion[];
  refStatus: Record<string, string>;
  skillUrl: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Bấm "AI viết kịch bản" khi chưa có chuyện: hiện một dòng nhắc + nút "Viết khung trước". */
  gate: React.ReactNode | null;
  onFill: () => void;
  /** Trạng thái xác nhận ở máy chủ (bản đã lưu). */
  review: { items: string[]; confirmedBy: string | null; confirmedAt: string | null };
  /** Đã xác nhận và chữ đang soạn vẫn đúng bản đã xác nhận. */
  confirmedNow: boolean;
  /** Chỉ OWNER / quản lý sửa được kinh nghiệm — người khác chỉ xem. */
  canEdit: boolean;
}

export const ExperiencePanel = forwardRef<ExperiencePanelHandle, Props>(function ExperiencePanel({ value: e, onChange, topic, suggestions, refStatus, skillUrl, open, onOpenChange, gate, onFill, review, confirmedNow, canEdit }, ref) {
  const first = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => ({ focus: () => first.current?.focus() }), []);
  const answered = answeredCount(e);
  const more = interviewQuestions(topic, e.qa.map((x) => x.q), 1);
  const used = (s: { kind: string; id: string }) => e.refs.some((r) => r.kind === s.kind && r.id === s.id);
  const toggle = (s: ExperienceSuggestion) =>
    onChange({ ...e, refs: used(s) ? e.refs.filter((r) => !(r.kind === s.kind && r.id === s.id)) : [...e.refs, { kind: s.kind, id: s.id, label: s.title }] });
  const extra = e.refs.filter((r) => !suggestions.some((s) => s.kind === r.kind && s.id === r.id));
  const extracted = EXTRACTION_FIELDS.filter((f) => e.extraction[f.key]?.trim());
  const dead = (r: { kind: string; id: string }) => refStatus[`${r.kind}:${r.id}`] === "DEAD";
  const liveRefs = e.refs.filter((r) => !dead(r)).length;
  const filled = answered > 0 || liveRefs > 0;
  const confirm = review.items.length > 0;

  return (
    <section className={cn("rounded-lg border bg-surface", filled ? "border-border" : "border-amber/50")} aria-label="Kinh nghiệm của anh" data-testid="experience-panel">
      <div className="flex items-center gap-2 px-3 py-2">
        <button type="button" onClick={() => onOpenChange(!open)} aria-expanded={open} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left">
          <UserRound size={15} className="shrink-0 text-violet" aria-hidden />
          <span className="whitespace-nowrap font-semibold text-ink">Kinh nghiệm của anh</span>
          {filled ? (
            <span className="inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-full bg-jade-soft px-2 text-[11px] font-semibold text-jade-ink">
              <Check size={11} aria-hidden />
              <span className="num">{answered}</span> trả lời{liveRefs ? <> · <span className="num">{liveRefs}</span> nguồn</> : null}
            </span>
          ) : (
            <span className="inline-flex h-5 items-center whitespace-nowrap rounded-full bg-amber-soft px-2 text-[11px] font-semibold text-amber">cần chuyện thật</span>
          )}
          <ChevronDown size={14} className={cn("ml-auto shrink-0 text-ink-3 transition-transform", open && "rotate-180")} aria-hidden />
        </button>
        <InfoTip label={CONTENT_SKILL.label} className="h-5 w-5">
          <b>{CONTENT_SKILL.label}</b> — kinh nghiệm thật của anh là nguồn sự thật; content chỉ là đầu ra. Hệ thống hỏi 1–2 câu mỗi lần, AI bóc tách chuyện rồi mới viết, không bao giờ tự thêm trải nghiệm.
          {skillUrl && (
            <>
              <br />
              <a href={skillUrl} target="_blank" rel="noreferrer" className="font-semibold text-sky hover:underline">Mở skill trong Second Brain ›</a>
            </>
          )}
        </InfoTip>
      </div>

      {/* AI viết chi tiết ngoài chuyện của anh → luôn thấy (kể cả khi bảng thu gọn), chặn gửi duyệt tới khi anh tích xác nhận */}
      {confirm && (
        <div className="mx-3 mb-2 grid gap-1 rounded-md bg-amber-soft px-2.5 py-1.5 text-[12.5px] text-amber" data-testid="owner-confirm">
          <span className="inline-flex items-start gap-1.5 font-semibold">
            <CircleAlert size={13} className="mt-0.5 shrink-0" aria-hidden />
            <span>{confirmedNow ? "Chi tiết ngoài chuyện" : "Cần anh xác nhận"}: {review.items.slice(0, 4).join(", ")}</span>
          </span>
          {confirmedNow ? (
            <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-jade-ink">
              <Check size={12} aria-hidden /> Đã xác nhận · <span className="font-normal text-ink-3">{review.confirmedBy} · {(review.confirmedAt ?? "").slice(0, 16).replace("T", " ")}</span>
            </span>
          ) : canEdit ? (
            // Lưu chữ đang soạn rồi xác nhận đúng bản đã lưu (máy chủ: confirmStory — chỉ OWNER / quản lý)
            <Button type="submit" size="sm" variant="outline" icon={Check} formAction={confirmStory} className="h-7 min-h-0 justify-self-start px-2 text-[12px]">
              Tôi xác nhận chuyện này đúng
            </Button>
          ) : (
            <span className="text-[11.5px] font-semibold">Chờ OWNER xác nhận</span>
          )}
        </div>
      )}

      {open && (
        <div className="grid gap-2.5 border-t border-border px-3 pb-3 pt-2.5">
          {gate}
          {!canEdit && <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-amber"><CircleAlert size={12} aria-hidden /> Chỉ OWNER sửa được kinh nghiệm</span>}

          {e.qa.map((x, i) => (
            <label key={i} className="block">
              <span className="flex items-start gap-1 text-[12.5px] font-medium text-ink-2">
                <span className="min-w-0 flex-1">{x.q || "Anh kể thêm"}</span>
                {canEdit && !x.a.trim() && i >= 2 && (
                  <button type="button" aria-label="Bỏ câu hỏi này" title="Bỏ" onClick={() => onChange({ ...e, qa: e.qa.filter((_, j) => j !== i) })} className="cursor-pointer rounded text-ink-3 hover:text-ink">
                    <X size={12} aria-hidden />
                  </button>
                )}
              </span>
              <textarea
                ref={i === 0 ? first : undefined}
                value={x.a}
                readOnly={!canEdit}
                onChange={(ev) => onChange({ ...e, qa: e.qa.map((y, j) => (j === i ? { ...y, a: ev.target.value } : y)) })}
                rows={2}
                placeholder="1–3 dòng, lời của anh"
                aria-label={x.q || "Anh kể thêm"}
                className={cn(field, "mt-1 min-h-[3.25rem] py-1.5 text-[13px] leading-relaxed [field-sizing:content]")}
              />
            </label>
          ))}

          <div className="flex flex-wrap items-center gap-2">
            {canEdit && more.length > 0 && (
              <Button type="button" size="sm" variant="ghost" icon={MessageCirclePlus} onClick={() => onChange({ ...e, qa: [...e.qa, { q: more[0], a: "" }] })} className="h-7 min-h-0 px-2 text-[12px]">
                Hỏi thêm
              </Button>
            )}
            <label className="flex items-center gap-1.5 text-[12px] text-ink-3">
              Góc
              <select
                value={e.angle}
                onChange={(ev) => onChange({ ...e, angle: ev.target.value as AngleKey | "" })}
                aria-label="Góc nội dung"
                disabled={!canEdit}
                className={cn(field, "h-7 w-auto py-0 text-[12px]")}
              >
                <option value="">AI chọn</option>
                {ANGLES.map((a) => (
                  <option key={a.key} value={a.key}>{a.label}</option>
                ))}
              </select>
            </label>
            {answered > 0 && (
              <Button type="button" size="sm" variant="ghost" icon={Wand2} onClick={onFill} title="Điền câu trả lời của anh vào thẻ còn trống (không AI)" className="ml-auto h-7 min-h-0 px-2 text-[12px]">
                Điền vào thẻ
              </Button>
            )}
          </div>

          {suggestions.length > 0 && (
            <div>
              <div className="flex items-center gap-1 text-[11.5px] text-ink-3">
                <BookOpen size={12} aria-hidden /> Từ Second Brain
              </div>
              <ul className="m-0 mt-1 grid list-none gap-1.5 p-0 md:grid-cols-3" data-testid="experience-suggestions">
                {suggestions.map((s) => {
                  const on = used(s);
                  return (
                    <li key={`${s.kind}:${s.id}`} className={cn("flex min-w-0 flex-col gap-1 rounded-md border p-2 text-[12px]", on ? "border-jade/50 bg-jade-soft/40" : "border-border bg-ground")}>
                      <div className="flex min-w-0 items-center gap-1">
                        <span className="shrink-0 rounded-full bg-violet-soft px-1.5 text-[10.5px] font-semibold text-violet">{s.tag}</span>
                        {s.draft && <span className="shrink-0 rounded-full bg-amber-soft px-1.5 text-[10.5px] font-semibold text-amber">nháp</span>}
                        <span className="min-w-0 truncate font-semibold text-ink" title={s.title}>{s.title}</span>
                      </div>
                      <p className="m-0 line-clamp-3 text-ink-2">{s.snippet}</p>
                      <Button type="button" size="sm" variant={on ? "soft" : "outline"} icon={on ? Check : undefined} onClick={() => toggle(s)} disabled={!canEdit} className="mt-auto h-7 min-h-0 self-start px-2 text-[12px]" aria-pressed={on}>
                        {on ? "Đã dùng" : "Dùng chuyện này"}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {extra.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {extra.map((r) => (
                <span key={`${r.kind}:${r.id}`} className={cn("inline-flex h-6 max-w-full items-center gap-1 rounded-full px-2 text-[11px] font-semibold", dead(r) ? "bg-amber-soft text-amber" : "bg-jade-soft text-jade-ink")}>
                  <span className="truncate">{r.label || r.id}</span>
                  {refStatus[`${r.kind}:${r.id}`] === "DRAFT" && <span className="text-amber">· nháp</span>}
                  {dead(r) && <span className="text-amber">· đã gỡ, không dùng</span>}
                  {canEdit && <button type="button" aria-label="Bỏ nguồn này" onClick={() => onChange({ ...e, refs: e.refs.filter((x) => x !== r) })} className="cursor-pointer text-ink-3 hover:text-ink">
                    <X size={11} aria-hidden />
                  </button>}
                </span>
              ))}
            </div>
          )}

          {extracted.length > 0 && (
            <details className="group text-[12px]">
              <summary className="flex cursor-pointer list-none items-center gap-1 text-ink-3 hover:text-ink-2 [&::-webkit-details-marker]:hidden">
                <ChevronDown size={12} className="transition-transform group-open:rotate-180" aria-hidden />
                Bóc tách · <span className="num">{extracted.length}</span>
              </summary>
              <dl className="m-0 mt-1 grid gap-0.5 sm:grid-cols-[auto_1fr] sm:gap-x-3">
                {extracted.map((f) => (
                  <div key={f.key} className="contents">
                    <dt className="font-semibold text-ink-2">{f.label}</dt>
                    <dd className="m-0 text-ink">{e.extraction[f.key]}</dd>
                  </div>
                ))}
              </dl>
            </details>
          )}
        </div>
      )}
    </section>
  );
});

/** Dòng nhắc khi bấm "AI viết kịch bản" mà chưa có chuyện thật. */
export function ExperienceGate({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md bg-amber-soft px-2.5 py-1.5 text-[12.5px] font-semibold text-amber" role="status">
      <CircleAlert size={13} aria-hidden />
      <span className="mr-auto">Vlog chia sẻ cần chuyện thật của anh</span>
      {children}
    </div>
  );
}
