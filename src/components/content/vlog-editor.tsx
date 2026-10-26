"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, ChevronDown, CircleAlert, Settings2, Sparkles, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AiBlocked } from "@/components/ui/ai-blocked";
import { InfoTip } from "@/components/ui/info-tip";
import { aiWriteDraft, submitForReview } from "@/lib/actions/content";
import { VLOG_MAX_SEC } from "@/lib/content/formats";
import { PATH_STAGES, VLOG_CARDS, applyScriptText, draftHash, editorDraft, scenesShifted, textToSpeeches, experienceChecks, fillFromExperience, hasPlaceholder, isMetaNote, speechesToText, stageInfo, vlogChecks, vlogTimeline, type PathStage, type VlogDoc, type VlogKey } from "@/lib/content/vlog-script";
import { CONTENT_SKILL, emptyExperience, hasExperience, interviewQuestions, type ExperienceRef, type ExperienceSuggestion, type OwnerExperience, type Pronouns } from "@/lib/content/experience";
import { ExperienceGate, ExperiencePanel, type ExperiencePanelHandle } from "@/components/content/experience-panel";
import { vlogHintStore } from "@/lib/client-store";
import type { AiReadiness } from "@/lib/ai";
import { cn } from "@/lib/format";

// Trình soạn kịch bản vlog < 1 phút: MỘT ô chữ chỉ có lời nói (OWNER 26/10: "phải viết thành 1 ô duy nhất chỉ nội dung thôi").
// Đoạn 1 = Hook, 2 = Câu chuyện, 3 = Bài học, 4…n = Kết (applyScriptText); Hình ảnh / Chữ trên màn hình / Ý chính / Gợi ý OWNER / Căn cứ
// vẫn lưu nguyên trong từng cảnh, chỉ không hiện. Nằm TRONG biểu mẫu lưu nháp của trang Kịch bản: ô ẩn name="draft" = đúng bản chữ cảnh
// cũ (serializeVlog), nên Lưu nháp / Gửi duyệt / AI viết / lịch sử phiên bản dùng nguyên server action hiện có.

const field = "w-full rounded-md border border-border-2 bg-surface px-2.5 text-ink outline-none focus-visible:outline-2 focus-visible:outline-jade";
const pop = "absolute left-0 top-full z-30 mt-1.5 w-[min(22rem,100%)] rounded-lg border border-border-2 bg-surface p-3 text-[12.5px] text-ink-2 shadow-[var(--shadow-lift)]";

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

/** Tên đoạn ngắn trong ô (thứ tự = VLOG_CARDS). */
const PARA: Record<VlogKey, string> = { hook: "Hook", story: "Chuyện", value: "Bài học", end: "Kết" };

// Gợi ý theo SK-KNW-01 khi đã có chuyện thật (Hook → Real situation + Common mistake → BAOR observation + Why + Better approach → Lesson + CTA)
const expHint = (k: VlogKey, p: Pronouns) =>
  ({ hook: `Khoảnh khắc thật: “Lần đầu…, ${p.self}…”`, story: "Tình huống thật + sai lầm phổ biến", value: `Điều ${p.self} thấy + vì sao + cách tốt hơn`, end: `Bài học một câu + hỏi ${p.audience}` })[k];

// Câu kiểm theo cảnh → theo đoạn trong ô (người dùng không còn thấy "cảnh")
const asPara = (s: string) =>
  s
    .replace(/Cảnh Câu chuyện/g, "Đoạn 2 (Chuyện)")
    .replace(/Cảnh Giá trị|Cảnh Bài học/g, "Đoạn 3 (Bài học)")
    .replace(/Cảnh Kết/g, "Đoạn 4 (Kết)")
    .replace(/Câu chuyện chưa/g, "Đoạn Chuyện chưa")
    .replace(/Câu chuyện nên/g, "Đoạn Chuyện nên");

/** Đóng lớp nổi khi bấm ra ngoài / Esc (trả focus về nút mở). */
function useDismiss(open: boolean, close: () => void, box: React.RefObject<HTMLElement | null>, trigger: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!box.current?.contains(t) && !trigger.current?.contains(t)) close();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      close();
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open, close, box, trigger]);
}

export function VlogEditor({ initial, raw = "", fallbackHook, defaultStage, ready, basis, beats, exp: ex }: { initial: VlogDoc; /** Bản chữ đã lưu (c.draft) — chưa sửa gì thì gửi lại y hệt. */ raw?: string; fallbackHook: string; defaultStage: PathStage; ready: AiReadiness; basis: BasisChip[]; beats: string[]; exp: ExperienceProps }) {
  const [base] = useState<VlogDoc>(() => ({
    ...initial,
    // Chưa có khối kinh nghiệm: hỏi 2 câu đầu theo chủ đề (INTERVIEW MODE — mỗi lần 1–2 câu)
    experience: initial.experience ?? { ...emptyExperience(), qa: interviewQuestions(ex.topic).map((q) => ({ q, a: "" })) },
    cards: initial.cards.map((c, i) => (i === 0 && !c.speech.trim() && fallbackHook ? { ...c, speech: fallbackHook } : c)),
  }));
  const [doc, setDoc] = useState<VlogDoc>(base);
  // Chữ trong ô giữ đúng như người dùng gõ (không dàn lại khi đang gõ); lời nói từng cảnh tách ra từ đây
  const [text, setText] = useState(() => speechesToText(doc.cards.map((c) => c.speech)));
  const experience = doc.experience ?? emptyExperience();
  // Trang đã tích còn sống? (máy chủ gửi trạng thái; "DEAD" = đã gỡ / ARCHIVED / không còn là tư liệu OWNER; trang vừa tích từ gợi ý = sống)
  const live = (r: ExperienceRef) => (ex.refStatus[`${r.kind}:${r.id}`] ?? "LIVE") !== "DEAD";
  const haveExp = hasExperience(experience, live);
  const [expOpen, setExpOpen] = useState(() => !hasExperience(initial.experience, live));
  const [gate, setGate] = useState(false);
  const [checksOpen, setChecksOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const panel = useRef<ExperiencePanelHandle>(null);
  const checksBtn = useRef<HTMLButtonElement>(null);
  const checksBox = useRef<HTMLDivElement>(null);
  const setupBtn = useRef<HTMLButtonElement>(null);
  const setupBox = useRef<HTMLDivElement>(null);
  const closeChecks = useMemo(() => () => setChecksOpen(false), []);
  const closeSetup = useMemo(() => () => setSetupOpen(false), []);
  useDismiss(checksOpen, closeChecks, checksBox, checksBtn);
  useDismiss(setupOpen, closeSetup, setupBox, setupBtn);
  const hint = vlogHintStore.use();
  const [shifted, setShifted] = useState(false);
  const hasShotNotes = doc.cards.some((c) => c.visual.trim() || c.onScreen.trim() || c.notes.length > 0);

  const stage = doc.stage ?? defaultStage;
  // Mở rồi lưu mà không sửa gì (chữ, thiết lập, chuyện thật) và không tự điền hook dự phòng: gửi lại đúng bản đã lưu (byte-identical)
  const draft = useMemo(() => editorDraft(raw, initial, doc, doc === base), [raw, initial, doc, base]);
  // Xác nhận gắn với chữ 4 cảnh của bản sẽ lưu — băm đúng chữ máy chủ băm (draftHash): sửa chữ sau khi xác nhận → phải xác nhận lại
  const hash = useMemo(() => draftHash(draft), [draft]);
  const confirmedNow = !!ex.review.confirmedBy && ex.review.hash === hash;
  const confirmNeeded = ex.review.items.length > 0 && !confirmedNow;
  const time = vlogTimeline(doc);
  const draftRefs = experience.refs.filter((r) => (ex.refStatus[`${r.kind}:${r.id}`] ?? ex.suggestions.find((s) => s.kind === r.kind && s.id === r.id)?.status) === "DRAFT").length;
  // Kiểm giữ nguyên (SK-KNW-01 trước, luật nghề Kotler / Ogilvy sau) — chỉ hiện các mục chưa đạt, bằng câu thường
  const failing = [...new Set([...experienceChecks(doc, ex.pronouns, { draftRefs, live, review: { items: ex.review.items, valid: confirmedNow } }), ...vlogChecks(doc)].filter((k) => !k.ok).map((k) => asPara(k.why ?? k.label)))];
  const filled = doc.cards.every((c) => c.speech.trim());
  // Còn chỗ anh cần kể: chỗ trống cũ "[OWNER KỂ: …]" trong lời nói, hoặc đoạn Chuyện trống mà AI đã để gợi ý
  const story = doc.cards.find((c) => c.key === "story");
  const tellHint = doc.cards.some((c) => hasPlaceholder(c.speech)) || (!!story && !story.speech.trim() && story.ownerHints.some((h) => h.includes("[OWNER KỂ")));
  const tellWhat = story?.ownerHints.find((h) => h.includes("[OWNER KỂ"))?.replace(/^\[OWNER KỂ:\s*|\]$/gu, "");
  const { pending, data } = useFormStatus();
  const aiScene = pending ? data?.get("scene") : null; // "" = cả kịch bản, "save" / "submit" = lưu / gửi duyệt
  const aiOff = !ready.ok || pending;
  const pct = Math.min(100, (time.seconds / VLOG_MAX_SEC) * 100);
  const segmentShort = doc.segment.trim().replace(/\s+/g, " ");
  const summary = `${segmentShort ? (segmentShort.length > 28 ? `${segmentShort.slice(0, 27)}…` : segmentShort) : "Chưa chọn khách"} · ${stageInfo(stage).label}`;
  const placeholder = VLOG_CARDS.map((d) => `${PARA[d.key]} — ${haveExp ? expHint(d.key, ex.pronouns) : d.key === "story" ? "chuyện thật của anh" : d.key === "end" ? stageInfo(stage).cta : d.hint}`).join("\n\n");

  const pickScene = (key: "" | "save" | "submit") => (e: React.MouseEvent<HTMLButtonElement>) => {
    const input = e.currentTarget.form?.elements.namedItem("scene");
    if (input instanceof HTMLInputElement) input.value = key;
  };
  const setExperience = (e: OwnerExperience) => setDoc((d) => ({ ...d, experience: e }));
  const openStory = () => {
    setExpOpen(true);
    requestAnimationFrame(() => panel.current?.focus());
  };
  // Chưa có chuyện thật: "AI viết kịch bản" mở câu hỏi trước (không gửi); "Viết khung trước" mới gửi
  const gateAi = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!haveExp) {
      e.preventDefault();
      setGate(true);
      openStory();
      return;
    }
    pickScene("")(e);
  };
  const cleanBeats = beats.filter((b) => !isMetaNote(b));

  return (
    <div
      className="grid gap-2.5"
      // Enter trong ô một dòng không gửi biểu mẫu (nút mặc định của biểu mẫu là "AI viết kịch bản")
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target instanceof HTMLInputElement) e.preventDefault();
      }}
    >
      <input type="hidden" name="draft" value={draft} />
      <input type="hidden" name="hook" value={doc.cards[0]?.speech.replace(/\s+/g, " ").trim() || fallbackHook} />
      <input type="hidden" name="stage" value={stage} />
      {/* Việc nút cần làm: nút gán ngay trước khi gửi (nút có formAction là server action thì React dùng thuộc tính name riêng) */}
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
        onFill={() => {
          // Câu trả lời nhiều đoạn: gộp dòng trống trong từng lời nói để ô chữ và thẻ cảnh khớp nhau (gõ tiếp không dồn đoạn)
          const filledDoc = fillFromExperience(doc, stage, ex.pronouns);
          const t = speechesToText(filledDoc.cards.map((c) => c.speech));
          setDoc(applyScriptText(filledDoc, t));
          setText(t);
        }}
        review={ex.review}
        confirmedNow={confirmedNow}
        canEdit={ex.canEdit}
        gate={
          gate && !haveExp ? (
            <ExperienceGate>
              <Button type="submit" size="sm" variant="outline" formAction={aiWriteDraft} onClick={pickScene("")} disabled={aiOff} loading={aiScene === ""} className="h-7 min-h-0 px-2 text-[12px]" title="Viết hook, bài học, kết; đoạn Chuyện chờ anh kể">
                Viết khung trước
              </Button>
            </ExperienceGate>
          ) : null
        }
      />

      {/* Thanh trên: thời lượng · trạng thái kiểm · thiết lập | AI viết · Lưu · Gửi duyệt */}
      <div className="relative">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
          <span className={cn("num whitespace-nowrap text-[12.5px] font-semibold", time.over ? "text-amber" : "text-ink-2")} title={`${time.words} chữ · ước tính theo tốc độ nói`}>
            {time.seconds}s / {VLOG_MAX_SEC}s
          </span>
          {failing.length ? (
            <button
              ref={checksBtn}
              type="button"
              onClick={() => setChecksOpen((o) => !o)}
              aria-expanded={checksOpen}
              aria-controls="vlog-checks"
              data-testid="script-status"
              className="inline-flex h-6 cursor-pointer items-center gap-1 whitespace-nowrap rounded-full bg-amber-soft px-2.5 text-[12px] font-semibold text-amber hover:brightness-95 focus-visible:outline-2 focus-visible:outline-jade"
            >
              <CircleAlert size={12} aria-hidden />
              <span className="num">{failing.length}</span> điểm cần xem
              <ChevronDown size={12} className={cn("transition-transform", checksOpen && "rotate-180")} aria-hidden />
            </button>
          ) : (
            <span data-testid="script-status" role="status" className="inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full bg-jade-soft px-2.5 text-[12px] font-semibold text-jade-ink">
              <Check size={12} aria-hidden /> Sẵn sàng
            </span>
          )}
          <button
            ref={setupBtn}
            type="button"
            onClick={() => setSetupOpen((o) => !o)}
            aria-expanded={setupOpen}
            aria-controls="vlog-setup"
            title="Thiết lập: cho ai · chặng khách"
            className="inline-flex h-6 min-w-0 max-w-full cursor-pointer items-center gap-1 rounded-full bg-ground-2 px-2.5 text-[12px] text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-jade"
          >
            <Settings2 size={12} className="shrink-0" aria-hidden />
            <span className="sr-only">Thiết lập: </span>
            <span className="truncate">{summary}</span>
          </button>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <AiBlocked ready={ready} />
            <Button type="submit" variant={filled ? "soft" : "primary"} icon={Sparkles} formAction={aiWriteDraft} onClick={gateAi} disabled={aiOff} loading={aiScene === ""} title={haveExp ? "Bóc tách chuyện của anh rồi viết đủ kịch bản (một lần gọi AI)" : "Vlog chia sẻ cần chuyện thật của anh"}>
              {aiScene === "" ? "AI đang viết…" : "AI viết kịch bản"}
            </Button>
            <Button type="submit" onClick={(e) => { pickScene("save")(e); vlogHintStore.set("hidden"); }} disabled={pending} loading={aiScene === "save"}>Lưu</Button>
            <Button type="submit" variant={filled && !confirmNeeded ? "primary" : "outline"} formAction={submitForReview} onClick={pickScene("submit")} disabled={pending || confirmNeeded} loading={aiScene === "submit"} title={confirmNeeded ? "Cần anh xác nhận chuyện trước khi gửi duyệt" : undefined}>Gửi duyệt</Button>
          </div>
        </div>
        <div className="mt-2 h-0.5 overflow-hidden rounded-full bg-ground-2" role="meter" aria-label="Thời lượng ước tính" aria-valuemin={0} aria-valuemax={VLOG_MAX_SEC} aria-valuenow={time.seconds} aria-valuetext={`${time.seconds} giây trên ${VLOG_MAX_SEC} giây`}>
          <div className={cn("h-full rounded-full transition-[width]", time.over ? "bg-amber" : "bg-jade")} style={{ width: `${pct}%` }} />
        </div>

        {checksOpen && failing.length > 0 && (
          <div ref={checksBox} id="vlog-checks" className={pop} data-testid="script-checks">
            <ul className="m-0 grid list-none gap-1.5 p-0">
              {failing.map((w) => (
                <li key={w} className="flex items-start gap-1.5 text-ink">
                  <CircleAlert size={12} className="mt-[3px] shrink-0 text-amber" aria-hidden />
                  <span>{w}</span>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex items-center gap-1 border-t border-border pt-1.5 text-[11px] text-ink-3">
              {CONTENT_SKILL.code} · Kotler · Ogilvy
              <InfoTip label="Cách kiểm" className="h-4 w-4">
                <b>{CONTENT_SKILL.label}</b> trước: chuyện thật đã xác nhận, ví dụ thật, bài học áp dụng được, góc nhìn BAOR, không thêm chuyện. Sau đó luật nghề: <b>nói gì</b> theo nguyên lý marketing của Philip Kotler (một nhóm khách, một giá trị, một lời mời đúng chặng 5A), <b>viết thế nào</b> theo phong cách copywriting của David Ogilvy (hook cụ thể, dữ kiện thay tính từ, không nói quá, câu ngắn).
              </InfoTip>
            </div>
          </div>
        )}

        {setupOpen && (
          <div ref={setupBox} id="vlog-setup" className={cn(pop, "grid gap-2.5")} role="group" aria-label="Thiết lập">
            <label className="block">
              <span className="lbl">Cho ai</span>
              <input
                value={doc.segment}
                onChange={(e) => setDoc((d) => ({ ...d, segment: e.target.value }))}
                placeholder="VD: chủ shop mới bán online"
                className={cn(field, "mt-1 h-8 text-[13px]")}
              />
            </label>
            <div>
              <span className="flex h-[13px] items-center gap-0.5">
                <span className="lbl">Chặng khách</span>
                <InfoTip label="Chặng khách 5A" className="h-4 w-4">Hành trình khách 5A theo nguyên lý marketing của Philip Kotler: Biết → Thích → Hỏi → Làm → Giới thiệu. Đoạn Kết mời đúng một bước tiếp theo.</InfoTip>
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
                    className={cn("flex-auto cursor-pointer whitespace-nowrap border-r border-border-2 px-1.5 last:border-r-0", stage === p.key ? "bg-jade-soft font-semibold text-jade-ink" : "bg-surface text-ink-2 hover:bg-ground-2")}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Một ô duy nhất: chỉ lời nói, các đoạn cách nhau một dòng trống */}
      <label className="block">
        <span className="sr-only">Kịch bản — lời nói (đoạn 1 Hook, đoạn 2 Chuyện, đoạn 3 Bài học, đoạn 4 Kết; cách nhau một dòng trống)</span>
        <textarea
          value={text}
          onChange={(e) => {
            const v = e.target.value;
            setText(v);
            // Cả một đoạn dời sang cảnh khác → nhắc ghi chú quay (đang ẩn) có thể lệch lời
            if (!shifted && hasShotNotes && scenesShifted(doc.cards.map((c) => c.speech), textToSpeeches(v, doc.cards.length))) setShifted(true);
            setDoc((d) => applyScriptText(d, v));
          }}
          placeholder={placeholder}
          spellCheck={false}
          data-testid="script-text"
          className="-mx-2 block min-h-[14rem] w-[calc(100%+1rem)] resize-none rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-[15.5px] leading-7 text-ink outline-none transition-colors [field-sizing:content] placeholder:text-ink-3 hover:bg-ground-2/40 focus:border-border-2 focus:bg-[var(--input-bg)] focus:ring-2 focus:ring-jade/20"
        />
      </label>

      {(hint === "show" || tellHint || shifted) && (
        <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-ink-3">
          {tellHint && (
            <button type="button" onClick={openStory} title={tellWhat ? `Anh kể: ${tellWhat}` : undefined} className="inline-flex h-5 cursor-pointer items-center gap-1 rounded-full bg-amber-soft px-2 font-semibold text-amber hover:underline focus-visible:outline-2 focus-visible:outline-jade">
              <UserRound size={11} aria-hidden /> Còn chỗ anh cần kể
            </button>
          )}
          {shifted && (
            <span className="inline-flex h-5 items-center gap-1 rounded-full bg-amber-soft px-2 font-semibold text-amber" role="status">
              <CircleAlert size={11} aria-hidden /> Đoạn đã đổi vị trí — ghi chú quay có thể lệch
            </span>
          )}
          {(hint === "show" || shifted) && (
            <span>
              {VLOG_CARDS.map((d, i) => `Đoạn ${i + 1}: ${PARA[d.key]}`).join(" · ")}
              {hint === "show" && (
                <button type="button" aria-label="Ẩn dòng nhắc" title="Ẩn" onClick={() => vlogHintStore.set("hidden")} className="ml-1 inline-flex cursor-pointer rounded align-[-2px] text-ink-3 hover:text-ink focus-visible:outline-2 focus-visible:outline-jade">
                  <X size={12} aria-hidden />
                </button>
              )}
            </span>
          )}
        </div>
      )}

      {(basis.length > 0 || cleanBeats.length > 0) && (
        <details className="group text-[11.5px]">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-ink-3 hover:text-ink-2 [&::-webkit-details-marker]:hidden">
            <ChevronDown size={12} className="transition-transform group-open:rotate-180" aria-hidden />
            Căn cứ · <span className="num">{basis.length + cleanBeats.length}</span>
          </summary>
          {cleanBeats.length > 0 && (
            <ol className="mt-1.5 list-decimal space-y-0.5 pl-5 text-[12px] text-ink">
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
    </div>
  );
}
