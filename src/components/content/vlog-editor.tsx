"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, ChevronDown, CircleAlert, RotateCcw, Sparkles, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AiBlocked } from "@/components/ui/ai-blocked";
import { InfoTip } from "@/components/ui/info-tip";
import { aiWriteDraft, submitForReview } from "@/lib/actions/content";
import { VLOG_MAX_SEC } from "@/lib/content/formats";
import { PATH_STAGES, VLOG_CARDS, experienceChecks, fillFromExperience, isMetaNote, serializeVlog, stageInfo, vlogChecks, vlogTimeline, type PathStage, type VlogCard, type VlogDoc, type VlogKey } from "@/lib/content/vlog-script";
import { CONTENT_SKILL, emptyExperience, hasExperience, interviewQuestions, sceneHash, type ExperienceRef, type ExperienceSuggestion, type OwnerExperience, type Pronouns } from "@/lib/content/experience";
import { ExperienceGate, ExperiencePanel, type ExperiencePanelHandle } from "@/components/content/experience-panel";
import type { AiReadiness } from "@/lib/ai";
import { cn } from "@/lib/format";

// Trình soạn kịch bản vlog < 1 phút bằng 4 thẻ cảnh (OWNER 26/10). Nằm TRONG biểu mẫu lưu nháp của trang Kịch bản: thẻ cảnh được ghi lại
// thành đúng bản chữ cảnh cũ (ô ẩn name="draft"), nên Lưu nháp / Gửi duyệt / AI viết / lịch sử phiên bản dùng nguyên server action hiện có.

const SEG = ["bg-jade", "bg-sky", "bg-violet", "bg-ink-3"];
const DOT = ["bg-jade-soft text-jade-ink", "bg-sky-soft text-sky", "bg-violet-soft text-violet", "bg-ground-2 text-ink-2"];
const field = "w-full rounded-md border border-border-2 bg-surface px-2.5 text-ink outline-none focus-visible:outline-2 focus-visible:outline-jade";

export interface BasisChip {
  kind: "finding" | "knowledge" | "insight";
  label: string;
  href: string | null;
}

const basisLabel = { finding: "Nghiên cứu", knowledge: "Kiến thức", insight: "Insight" } as const;

export interface ExperienceProps {
  topic: string;
  suggestions: ExperienceSuggestion[];
  refStatus: Record<string, string>;
  skillUrl: string | null;
  pronouns: Pronouns;
  /** OWNER / quản lý: được sửa câu trả lời, nguồn, góc và xác nhận chuyện. */
  canEdit: boolean;
  /** Trạng thái "Cần OWNER xác nhận" ở MÁY CHỦ (owner-review.ts) cho bản đã lưu — không nằm trong chữ. */
  review: OwnerReviewView;
}

export interface OwnerReviewView {
  items: string[];
  confirmedBy: string | null;
  confirmedAt: string | null;
  /** Mã nội dung của bản đã lưu lúc xác nhận — chữ đang soạn khác mã này thì phải xác nhận lại. */
  hash: string | null;
}

// Gợi ý trong ô Lời nói theo SK-KNW-01 khi đã có chuyện thật (Hook → Real situation + Common mistake → BAOR observation + Why + Better approach → Lesson + CTA)
const expHint = (k: VlogKey, p: Pronouns) =>
  ({ hook: `Khoảnh khắc thật: “Lần đầu…, ${p.self}…” · ≤ 15 chữ`, story: "Tình huống thật + sai lầm phổ biến", value: `Điều ${p.self} thấy + vì sao + cách tốt hơn`, end: `Bài học một câu + hỏi ${p.audience}` })[k];

export function VlogEditor({ initial, fallbackHook, defaultStage, ready, basis, beats, exp: ex }: { initial: VlogDoc; fallbackHook: string; defaultStage: PathStage; ready: AiReadiness; basis: BasisChip[]; beats: string[]; exp: ExperienceProps }) {
  const [doc, setDoc] = useState<VlogDoc>(() => ({
    ...initial,
    // Chưa có khối kinh nghiệm: hỏi 2 câu đầu theo chủ đề (INTERVIEW MODE — mỗi lần 1–2 câu)
    experience: initial.experience ?? { ...emptyExperience(), qa: interviewQuestions(ex.topic).map((q) => ({ q, a: "" })) },
    cards: initial.cards.map((c, i) => (i === 0 && !c.speech.trim() && fallbackHook ? { ...c, speech: fallbackHook } : c)),
  }));
  const experience = doc.experience ?? emptyExperience();
  // Trang đã tích còn sống? (máy chủ gửi trạng thái; "DEAD" = đã gỡ / ARCHIVED / không còn là tư liệu OWNER; trang vừa tích từ gợi ý = sống)
  const live = (r: ExperienceRef) => (ex.refStatus[`${r.kind}:${r.id}`] ?? "LIVE") !== "DEAD";
  const haveExp = hasExperience(experience, live);
  // Xác nhận gắn với chữ 4 cảnh của bản đã lưu: sửa chữ sau khi xác nhận → phải xác nhận lại (máy chủ cũng kiểm lúc gửi duyệt / duyệt)
  const hash = useMemo(() => sceneHash(doc.cards), [doc.cards]);
  const confirmedNow = !!ex.review.confirmedBy && ex.review.hash === hash;
  const confirmNeeded = ex.review.items.length > 0 && !confirmedNow;
  const [expOpen, setExpOpen] = useState(() => !hasExperience(initial.experience, live));
  const [gate, setGate] = useState(false);
  const panel = useRef<ExperiencePanelHandle>(null);
  const stage = doc.stage ?? defaultStage;
  const draft = useMemo(() => serializeVlog(doc), [doc]);
  const time = vlogTimeline(doc);
  const checks = vlogChecks(doc);
  const draftRefs = experience.refs.filter((r) => (ex.refStatus[`${r.kind}:${r.id}`] ?? ex.suggestions.find((s) => s.kind === r.kind && s.id === r.id)?.status) === "DRAFT").length;
  const skillChecks = experienceChecks(doc, ex.pronouns, { draftRefs, live, review: { items: ex.review.items, valid: confirmedNow } });
  const skillOk = skillChecks.filter((k) => k.ok).length;
  const craftOk = checks.filter((k) => k.ok).length;
  const filled = doc.cards.every((c) => c.speech.trim());
  const { pending, data } = useFormStatus();
  const aiScene = pending ? data?.get("scene") : null; // "" = cả kịch bản, "<cảnh>" = viết lại một cảnh, "save" / "submit" = lưu / gửi duyệt
  const aiOff = !ready.ok || pending;
  const scale = Math.max(VLOG_MAX_SEC, time.seconds);

  const pickScene = (key: VlogKey | "" | "save" | "submit") => (e: React.MouseEvent<HTMLButtonElement>) => {
    const input = e.currentTarget.form?.elements.namedItem("scene");
    if (input instanceof HTMLInputElement) input.value = key;
  };
  const setExperience = (e: OwnerExperience) => setDoc((d) => ({ ...d, experience: e }));
  // Chưa có chuyện thật: "AI viết kịch bản" mở 3 câu hỏi trước (không gửi); "Viết khung trước" mới gửi
  const gateAi = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!haveExp) {
      e.preventDefault();
      setExpOpen(true);
      setGate(true);
      requestAnimationFrame(() => panel.current?.focus());
      return;
    }
    pickScene("")(e);
  };
  const setCard = (key: VlogKey, patch: Partial<VlogCard>) => setDoc((d) => ({ ...d, cards: d.cards.map((c) => (c.key === key ? { ...c, ...patch } : c)) }));
  const cleanBeats = beats.filter((b) => !isMetaNote(b));

  return (
    <div
      className="grid gap-3"
      // Enter trong ô một dòng không gửi biểu mẫu (nút mặc định của biểu mẫu là "AI viết kịch bản")
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target instanceof HTMLInputElement) e.preventDefault();
      }}
    >
      <input type="hidden" name="draft" value={draft} />
      <input type="hidden" name="hook" value={doc.cards[0]?.speech.replace(/\s+/g, " ").trim() || fallbackHook} />
      <input type="hidden" name="stage" value={stage} />
      {/* Cảnh cần AI viết lại: nút gán ngay trước khi gửi (nút có formAction là server action thì React dùng thuộc tính name riêng) */}
      <input type="hidden" name="scene" defaultValue="none" />

      <ExperiencePanel
        ref={panel}
        value={experience}
        onChange={setExperience}
        topic={ex.topic}
        suggestions={ex.suggestions}
        refStatus={ex.refStatus}
        skillUrl={ex.skillUrl}
        open={expOpen}
        onOpenChange={setExpOpen}
        onFill={() => setDoc((d) => fillFromExperience(d, stage, ex.pronouns))}
        review={ex.review}
        confirmedNow={confirmedNow}
        canEdit={ex.canEdit}
        gate={
          gate && !haveExp ? (
            <ExperienceGate>
              <Button type="submit" size="sm" variant="outline" formAction={aiWriteDraft} onClick={pickScene("")} disabled={aiOff} loading={aiScene === ""} className="h-7 min-h-0 px-2 text-[12px]" title="Viết hook, bài học, kết; cảnh Câu chuyện chờ anh kể">
                Viết khung trước
              </Button>
            </ExperienceGate>
          ) : null
        }
      />

      {/* Cho ai (STP) · chặng khách 5A · AI viết */}
      <div className="flex flex-wrap items-end gap-2">
        <label className="block min-w-[200px] flex-1">
          <span className="lbl">Cho ai</span>
          <input
            value={doc.segment}
            onChange={(e) => setDoc((d) => ({ ...d, segment: e.target.value }))}
            placeholder="VD: chủ shop mới bán online, chưa có khách quen"
            className={cn(field, "mt-1 h-8 text-[13px]")}
          />
        </label>
        <div>
          <span className="flex h-[13px] items-center gap-0.5">
            <span className="lbl">Chặng khách</span>
            <InfoTip label="Chặng khách 5A" className="h-4 w-4">Hành trình khách 5A theo nguyên lý marketing của Philip Kotler: Biết → Thích → Hỏi → Làm → Giới thiệu. Cảnh Kết mời đúng một bước tiếp theo.</InfoTip>
          </span>
          <div
            role="radiogroup"
            aria-label="Chặng khách"
            className="mt-1 flex h-8 overflow-hidden rounded-md border border-border-2 text-[12px]"
            // Phím mũi tên đổi chặng như nhóm radio chuẩn (roving tabindex: chỉ chặng đang chọn nhận Tab)
            onKeyDown={(e) => {
              const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
              if (!step) return;
              e.preventDefault();
              const i = PATH_STAGES.findIndex((p) => p.key === stage);
              const next = PATH_STAGES[(i + step + PATH_STAGES.length) % PATH_STAGES.length];
              setDoc((d) => ({ ...d, stage: next.key }));
              (e.currentTarget.querySelector(`[data-stage="${next.key}"]`) as HTMLButtonElement | null)?.focus();
            }}
          >
            {PATH_STAGES.map((p) => (
              <button
                key={p.key}
                type="button"
                role="radio"
                data-stage={p.key}
                tabIndex={stage === p.key ? 0 : -1}
                aria-checked={stage === p.key}
                title={`${p.en}: ${p.cta}`}
                onClick={() => setDoc((d) => ({ ...d, stage: p.key }))}
                className={cn("cursor-pointer border-r border-border-2 px-2.5 last:border-r-0", stage === p.key ? "bg-jade-soft font-semibold text-jade-ink" : "bg-surface text-ink-2 hover:bg-ground-2")}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button type="submit" size="md" variant={filled ? "soft" : "primary"} icon={Sparkles} formAction={aiWriteDraft} onClick={gateAi} disabled={aiOff} loading={aiScene === ""} title={haveExp ? "Bóc tách chuyện của anh rồi viết đủ 4 cảnh (một lần gọi AI)" : "Vlog chia sẻ cần chuyện thật của anh"}>
            {aiScene === "" ? "AI đang viết…" : "AI viết kịch bản"}
          </Button>
          <AiBlocked ready={ready} />
        </div>
      </div>

      {/* Thời lượng ước tính theo cảnh so với 60 giây */}
      <div aria-label={`Thời lượng ước tính ${time.seconds} giây trên ${VLOG_MAX_SEC} giây`}>
        <div className={cn("relative flex h-2 overflow-hidden rounded-full bg-ground-2", time.over && "outline outline-1 outline-amber")}>
          {time.cards.map((c, i) => (c.seconds > 0 ? <span key={c.key} className={cn("h-full border-r border-surface last:border-r-0", time.over ? "bg-amber" : SEG[i])} style={{ width: `${(c.seconds / scale) * 100}%` }} /> : null))}
          {time.over && <span className="absolute inset-y-0 w-0.5 bg-ink" style={{ left: `${(VLOG_MAX_SEC / scale) * 100}%` }} aria-hidden />}
        </div>
        <div className="mt-1 flex items-center justify-between text-[11px] text-ink-3">
          <span className="num">{time.words} chữ</span>
          <span className={cn("num font-semibold", time.over ? "text-amber" : "text-ink-2")}>
            {time.seconds}s / {VLOG_MAX_SEC}s{time.over ? " · nên cắt bớt" : ""}
          </span>
        </div>
      </div>

      {/* 4 thẻ cảnh */}
      <ol className="m-0 grid list-none gap-2 p-0 md:grid-cols-2">
        {VLOG_CARDS.map((def, i) => {
          const c = doc.cards.find((x) => x.key === def.key)!;
          const sec = time.cards[i]?.seconds ?? 0;
          const ownerHint = c.ownerHints.find((h) => h.includes("[OWNER KỂ"));
          // Dòng lạ / Căn cứ / ghi chú ngoài 3 trường: luôn thấy và sửa được ở "Ghi chú khác" (không ẩn chữ của OWNER)
          const extraOpen = !!(c.visual || c.onScreen || c.extra.length);
          const metaNotes = c.notes.filter(isMetaNote).length;
          const hint = haveExp ? expHint(def.key, ex.pronouns) : def.key === "story" ? "Chờ chuyện thật của anh — trả lời ở trên" : def.key === "end" ? `Mời ${stageInfo(stage).cta.replace(/^mời /, "")}` : def.hint;
          return (
            <li key={def.key} className="rounded-lg border border-border bg-surface p-3" data-scene={def.key}>
              <div className="flex items-center gap-2">
                <span className={cn("num inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold", DOT[i])}>{i + 1}</span>
                <span className="whitespace-nowrap font-semibold text-ink">{def.label}</span>
                <span className="num hidden whitespace-nowrap text-[11px] text-ink-3 sm:inline">{def.seconds}</span>
                {ownerHint && (
                  <span title={ownerHint} className="inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-full bg-amber-soft px-2 text-[11px] font-semibold text-amber">
                    <UserRound size={11} aria-hidden /> OWNER kể
                  </span>
                )}
                <span className="num ml-auto text-[11px] text-ink-3" title="Ước tính theo tốc độ nói">{sec}s</span>
                <Button type="submit" size="sm" variant="ghost" icon={RotateCcw} formAction={aiWriteDraft} onClick={pickScene(def.key)} disabled={aiOff} loading={aiScene === def.key} title={`AI viết lại cảnh ${def.label}`} aria-label={`Viết lại cảnh ${def.label}`} className="min-h-0 h-7 px-2 text-[12px]">
                  <span className="hidden sm:inline">Viết lại</span>
                </Button>
              </div>
              <label className="mt-2 block">
                <span className="sr-only">Lời nói – {def.label}</span>
                <textarea
                  value={c.speech}
                  onChange={(e) => setCard(def.key, { speech: e.target.value })}
                  rows={def.key === "hook" ? 2 : 4}
                  placeholder={hint}
                  aria-label={`Lời nói – ${def.label}`}
                  className={cn(field, "py-2 leading-relaxed [field-sizing:content]", def.key === "hook" ? "min-h-[3.5rem] text-[15px] font-semibold" : "min-h-[6.5rem] text-[13.5px]")}
                />
              </label>
              <details className="group mt-1" open={extraOpen || undefined}>
                <summary className="flex cursor-pointer list-none items-center gap-1 text-[11.5px] text-ink-3 hover:text-ink-2 [&::-webkit-details-marker]:hidden">
                  <ChevronDown size={12} className="transition-transform group-open:rotate-180" aria-hidden />
                  Hình ảnh · Chữ trên màn hình
                  {c.notes.length + c.extra.length > 0 && <span> · Ghi chú <span className="num">{c.notes.length + c.extra.length}</span></span>}
                  {metaNotes > 0 && <span className="ml-1 inline-flex h-4 items-center rounded-full bg-amber-soft px-1.5 text-[10.5px] font-semibold text-amber">ghi chú nội bộ</span>}
                </summary>
                <div className="mt-1.5 grid gap-1.5">
                  <input value={c.visual} onChange={(e) => setCard(def.key, { visual: e.target.value })} placeholder="Hình ảnh: cận mặt, nói thẳng vào camera" aria-label={`Hình ảnh – ${def.label}`} className={cn(field, "h-7 text-[12px]")} />
                  <input value={c.onScreen} onChange={(e) => setCard(def.key, { onScreen: e.target.value })} placeholder="Chữ trên màn hình (≤ 8 chữ)" aria-label={`Chữ trên màn hình – ${def.label}`} className={cn(field, "h-7 text-[12px]")} />
                  {c.notes.length > 0 && (
                    <ul className="m-0 grid list-none gap-1 p-0 text-[12px]" aria-label={`Ý chính – ${def.label}`}>
                      {c.notes.map((n, k) => (
                        <li key={k} className="flex items-start gap-1.5 rounded-md bg-ground px-2 py-1 text-ink-2">
                          {isMetaNote(n) && <span className="mt-px shrink-0 rounded-full bg-amber-soft px-1.5 text-[10.5px] font-semibold text-amber">nội bộ</span>}
                          <span className="min-w-0 flex-1">{n}</span>
                          <button type="button" aria-label="Bỏ ý chính này" title="Bỏ" onClick={() => setCard(def.key, { notes: c.notes.filter((_, j) => j !== k) })} className="shrink-0 cursor-pointer rounded text-ink-3 hover:text-ink">
                            <X size={12} aria-hidden />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {c.extra.length > 0 && (
                    <textarea
                      value={c.extra.join("\n")}
                      onChange={(e) => setCard(def.key, { extra: e.target.value.split("\n") })}
                      aria-label={`Ghi chú khác – ${def.label}`}
                      placeholder="Ghi chú khác"
                      className={cn(field, "py-1 text-[12px] [field-sizing:content]")}
                    />
                  )}
                </div>
              </details>
            </li>
          );
        })}
      </ol>

      {/* Kiểm chất lượng: skill của OWNER (SK-KNW-01) trước; luật nghề Kotler / Ogilvy chỉ hiện mục chưa đạt */}
      <div className="flex flex-wrap items-center gap-1.5 text-[11.5px]" data-testid="skill-checks">
        <span className="inline-flex items-center gap-1 text-ink-3">
          {CONTENT_SKILL.code}
          <InfoTip label={CONTENT_SKILL.label}>
            <b>{CONTENT_SKILL.label}</b> — Quality check trước khi dùng: kinh nghiệm thật của BAOR, đã xác nhận, không biến kinh nghiệm thành sự thật chung, có ví dụ thật, bài học áp dụng được, có góc nhìn BAOR, không chung chung, không có phần AI tự thêm.
          </InfoTip>
        </span>
        <span className={cn("num inline-flex h-5 items-center gap-1 rounded-full px-2 font-semibold", skillOk === skillChecks.length ? "bg-jade-soft text-jade-ink" : "bg-ground-2 text-ink-2")} title={skillChecks.filter((k) => k.ok).map((k) => k.label).join(" · ")}>
          <Check size={11} aria-hidden />
          {skillOk}/{skillChecks.length}
        </span>
        {skillChecks
          .filter((k) => !k.ok)
          .map((k) => (
            <span key={k.key} title={k.why} className="inline-flex h-5 items-center gap-1 rounded-full bg-amber-soft px-2 font-semibold text-amber">
              <CircleAlert size={11} aria-hidden />
              {k.label}
            </span>
          ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-[11.5px]" data-testid="craft-checks">
        <span className="inline-flex items-center gap-1 text-ink-3">
          Kotler · Ogilvy
          <InfoTip label="Luật nghề">
            Luật nghề phụ, sau skill của anh. <b>Nói gì</b> — theo nguyên lý marketing của Philip Kotler (lấy khách hàng làm trung tâm): một nhóm khách, MỘT giá trị khách nhận được, một lời mời đúng chặng 5A.
            <br />
            <b>Viết thế nào</b> — theo phong cách copywriting của David Ogilvy: một ý lớn, hook như tiêu đề (cụ thể), dữ kiện thay tính từ, không nói quá, câu ngắn, lời mời trung thực.
          </InfoTip>
        </span>
        <span className={cn("num inline-flex h-5 items-center gap-1 rounded-full px-2 font-semibold", craftOk === checks.length ? "bg-jade-soft text-jade-ink" : "bg-ground-2 text-ink-2")} title={checks.filter((k) => k.ok).map((k) => k.label).join(" · ")}>
          <Check size={11} aria-hidden />
          {craftOk}/{checks.length}
        </span>
        {checks
          .filter((k) => !k.ok)
          .map((k) => (
            <span key={k.key} title={k.why} className="inline-flex h-5 items-center gap-1 rounded-full bg-amber-soft px-2 font-semibold text-amber">
              <CircleAlert size={11} aria-hidden />
              {k.label}
            </span>
          ))}
      </div>

      {(basis.length > 0 || cleanBeats.length > 0) && (
        <details className="group rounded-md border border-border bg-ground px-3 py-2 text-[12px]">
          <summary className="flex cursor-pointer list-none items-center gap-1 text-ink-2 [&::-webkit-details-marker]:hidden">
            <ChevronDown size={12} className="transition-transform group-open:rotate-180" aria-hidden />
            Căn cứ · <span className="num">{basis.length + cleanBeats.length}</span>
          </summary>
          {cleanBeats.length > 0 && (
            <ol className="mt-1.5 list-decimal space-y-0.5 pl-5 text-ink">
              {cleanBeats.map((b, k) => <li key={k}>{b}</li>)}
            </ol>
          )}
          {basis.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {basis.map((b, k) =>
                b.href ? (
                  <Link key={k} href={b.href} title={b.label} className="inline-flex h-5 max-w-full items-center overflow-hidden text-ellipsis whitespace-nowrap rounded-full bg-sky-soft px-2 text-[11px] font-semibold text-sky hover:underline">
                    {basisLabel[b.kind]}: {b.label.slice(0, 48)}
                  </Link>
                ) : (
                  <span key={k} title={b.label} className="inline-flex h-5 max-w-full items-center overflow-hidden text-ellipsis whitespace-nowrap rounded-full bg-sky-soft px-2 text-[11px] font-semibold text-sky">{basisLabel[b.kind]}: {b.label.slice(0, 48)}</span>
                ),
              )}
            </div>
          )}
        </details>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" onClick={pickScene("save")} disabled={pending} loading={aiScene === "save"}>Lưu nháp</Button>
        <Button type="submit" variant={filled && !confirmNeeded ? "primary" : "outline"} formAction={submitForReview} onClick={pickScene("submit")} disabled={pending || confirmNeeded} loading={aiScene === "submit"} title={confirmNeeded ? "Cần anh xác nhận chuyện trước khi gửi duyệt" : undefined}>Gửi duyệt</Button>
      </div>
    </div>
  );
}
