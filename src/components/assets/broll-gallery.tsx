"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, ImageOff, Laptop, PenLine, Play, Sparkles, X } from "lucide-react";
import { Pill } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field";
import { SubmitButton } from "@/components/campaigns/submit-button";
import { AiBlocked } from "@/components/ui/ai-blocked";
import type { AiReadiness } from "@/lib/ai";
import { cn } from "@/lib/format";
import { ChipRow } from "./chip-tabs";
import { pauseOthers } from "./play-button";
import { NoDescTag, ORIGIN_LABEL, OriginTag, PendingTag, pendingLabel, type AssetOrigin } from "./asset-tags";
import { CancelTrashButton, DeleteAssetButton, OWNER_MAC_TRASH_NOTE } from "./delete-asset-button";
import { describeBrollAction, setBrollDescAction, trashAssetAction } from "@/lib/actions/asset-catalog";

export interface GalleryItem {
  /** Khoá duy nhất (AssetEntry.id). */
  id: string;
  /** Đường dẫn tệp — chỉ hiện trong "Tệp & giấy phép" của ô xem lớn. */
  file: string;
  kind: "image" | "video";
  keywords: string[];
  license: string;
  desc: string;
  topic: string;
  usable: boolean;
  /** Nhãn trạng thái ngắn ("Dùng được" / "Chưa dùng được" / …). */
  status: string;
  /** Ảnh thu nhỏ (ảnh / khung clip); null → ô hiện biểu tượng. */
  thumbUrl: string | null;
  /** Bản xem lớn: ảnh gốc / clip; null → chỉ có ảnh thu nhỏ (vd clip trên máy của anh). */
  previewUrl: string | null;
  origin: AssetOrigin;
  pendingDecision?: boolean;
  /** Hành động đang chờ máy dựng ("trash" = chờ xoá trên máy của anh). */
  pendingAction?: string;
  /** Xoá được (máy chủ, hoặc máy của anh qua máy dựng). Thiếu → như cũ: chỉ mục máy chủ. */
  canTrash?: boolean;
}

const PAGE = 28;
const useMounted = () => useSyncExternalStore(() => () => {}, () => true, () => false);

// Tư liệu › Ảnh / B-roll (OWNER 26/10/2026: "hiển thị dư thừa mà tôi đâu trực tiếp xem được"): lưới ảnh thu nhỏ thay danh
// sách đường dẫn. Bấm ô → xem lớn (Esc / bấm nền / ✕ để đóng, ← → chuyển ảnh). Đường dẫn tệp và giấy phép chỉ nằm trong ô xem lớn.
// Lọc theo nguồn (Máy chủ / Máy của anh — hiện khi máy của anh đã từng đồng bộ hoặc có cả hai nguồn), chủ đề, từ khoá.
// `canDelete` (OWNER): thùng rác trên ô (rê chuột) và trong ô xem lớn → chuyển vào "Đã xoá" (khôi phục được 30 ngày); ô "Máy của anh"
// → lệnh xoá cho máy dựng ("Chờ máy dựng xoá", huỷ được). OWNER sửa mô tả / "Tự mô tả bằng AI" (ảnh máy chủ) trong ô xem lớn;
// chip "Chưa có mô tả" lọc ra ảnh bộ dựng chỉ chọn được theo tên tệp.
export function BrollGallery({ items, showOrigin = false, canDelete = false, aiReady }: { items: GalleryItem[]; showOrigin?: boolean; canDelete?: boolean; aiReady?: AiReadiness }) {
  const [origin, setOrigin] = useState<"all" | AssetOrigin>("all");
  const [filter, setFilter] = useState<{ type: "all" | "topic" | "kw"; value: string }>({ type: "all", value: "" });
  const [noDesc, setNoDesc] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<number | null>(null);
  const [broken, setBroken] = useState<Set<string>>(() => new Set());

  const byOrigin = useMemo(() => items.filter((it) => origin === "all" || it.origin === origin), [items, origin]);
  const topics = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of byOrigin) m.set(it.topic, (m.get(it.topic) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [byOrigin]);
  const shown = useMemo(
    () => byOrigin.filter((it) => (!noDesc || !it.desc.trim()) && (filter.type === "all" || (filter.type === "topic" ? it.topic === filter.value : it.keywords.includes(filter.value)))),
    [byOrigin, filter, noDesc],
  );
  const missing = byOrigin.filter((it) => !it.desc.trim()).length;
  const pick = (f: typeof filter) => {
    setFilter(f);
    setLimit(PAGE);
  };
  const markBroken = (id: string) => setBroken((s) => (s.has(id) ? s : new Set(s).add(id)));
  const both = new Set(items.map((it) => it.origin)).size > 1;

  return (
    <div className="grid gap-3">
      {(showOrigin || both) && (
        <ChipRow
          label="Nguồn"
          active={origin}
          onPick={(k) => {
            setOrigin(k as typeof origin);
            pick({ type: "all", value: "" });
          }}
          items={[
            { key: "all", label: "Tất cả", count: String(items.length) },
            ...(["server", "owner_mac"] as const).map((o) => ({ key: o, label: ORIGIN_LABEL[o], count: String(items.filter((it) => it.origin === o).length) })),
          ]}
        />
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <ChipRow
          label="Lọc theo chủ đề"
          active={filter.type === "topic" ? filter.value : filter.type === "all" ? "all" : ""}
          onPick={(k) => pick(k === "all" ? { type: "all", value: "" } : { type: "topic", value: k })}
          items={[{ key: "all", label: "Tất cả", count: String(byOrigin.length) }, ...topics.map(([t, n]) => ({ key: t, label: t, count: String(n) }))]}
        />
        {(missing > 0 || noDesc) && (
          <button
            type="button"
            aria-pressed={noDesc}
            onClick={() => {
              setNoDesc((v) => !v);
              setLimit(PAGE);
            }}
            className={cn("inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium focus-visible:outline-2 focus-visible:outline-jade", noDesc ? "border-transparent bg-amber text-white" : "border-amber/40 bg-amber-soft text-amber hover:border-amber")}
          >
            <PenLine size={12} aria-hidden />Chưa có mô tả <span className="num text-[11px] opacity-80">{missing}</span>
          </button>
        )}
        {filter.type === "kw" && (
          <button type="button" onClick={() => pick({ type: "all", value: "" })} className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-full bg-ink px-2.5 text-[12px] font-medium text-surface" aria-label={`Bỏ lọc từ khoá ${filter.value}`}>
            “{filter.value}” <X size={12} aria-hidden />
          </button>
        )}
      </div>
      {shown.length === 0 && <p className="m-0 text-[12.5px] text-ink-3">Không có mục nào.</p>}
      <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-2 p-0 sm:grid-cols-[repeat(auto-fill,minmax(128px,1fr))]">
        {shown.slice(0, limit).map((it, i) => {
          const dot = it.pendingDecision ? pendingLabel(it.pendingAction) : it.status;
          const trashPending = it.pendingAction === "trash";
          return (
            <li key={it.id} data-broll={it.file} className="group relative">
              <button
                type="button"
                onClick={() => setOpen(i)}
                aria-label={`Xem lớn: ${it.desc || it.keywords.join(", ") || it.file}`}
                className="group relative block aspect-square w-full cursor-pointer overflow-hidden rounded-lg border border-border bg-ground-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jade"
              >
                {it.thumbUrl && !broken.has(it.id) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.thumbUrl} alt="" loading="lazy" decoding="async" onError={() => markBroken(it.id)} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]" />
                ) : it.kind === "video" && it.previewUrl ? (
                  <video src={`${it.previewUrl}#t=0.5`} preload="metadata" muted playsInline className="h-full w-full object-cover" />
                ) : (
                  <span className="grid h-full w-full place-items-center text-ink-3"><ImageOff size={20} aria-hidden /></span>
                )}
                {it.kind === "video" && (
                  <span className="pointer-events-none absolute inset-0 grid place-items-center">
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-black/55 text-white"><Play size={16} fill="currentColor" className="translate-x-px" aria-hidden /></span>
                  </span>
                )}
                <span className={cn("absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-white/80", trashPending ? "bg-amber" : it.pendingDecision ? "bg-sky" : it.usable ? "bg-jade" : "bg-brick")} title={dot}>
                  <span className="sr-only">{dot}</span>
                </span>
                {!it.desc.trim() && (
                  <span data-no-desc className="absolute right-5 top-1 grid h-4 w-4 place-items-center rounded-full bg-amber text-white ring-2 ring-white/80" title="Chưa có mô tả">
                    <PenLine size={9} aria-hidden /><span className="sr-only">Chưa có mô tả</span>
                  </span>
                )}
                {it.origin === "owner_mac" && (
                  <span className="absolute left-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-black/55 text-white" title="Máy của anh">
                    <Laptop size={11} aria-hidden /><span className="sr-only">Máy của anh</span>
                  </span>
                )}
                {it.keywords.length > 0 && (
                  <span className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap gap-1 bg-gradient-to-t from-black/65 to-transparent px-1.5 pb-1.5 pt-5">
                    {it.keywords.slice(0, 2).map((k) => (
                      <span key={k} className="max-w-full truncate rounded-full bg-black/45 px-1.5 py-px text-[10.5px] font-medium leading-4 text-white">{k}</span>
                    ))}
                  </span>
                )}
              </button>
              {canDelete && trashPending && (
                <span className={cn("absolute top-1.5", it.origin === "owner_mac" ? "left-8" : "left-1.5")}>
                  <CancelTrashButton overlay action={trashAssetAction} id={it.id} name={it.file.replace(/^broll\//, "")} />
                </span>
              )}
              {canDelete && !trashPending && (it.canTrash ?? it.origin === "server") && (
                <DeleteAssetButton overlay action={trashAssetAction} fields={{ id: it.id }} name={it.file.replace(/^broll\//, "")} note={it.origin === "owner_mac" ? OWNER_MAC_TRASH_NOTE : undefined} className={cn("absolute top-1.5", it.origin === "owner_mac" ? "left-8" : "left-1.5")} />
              )}
            </li>
          );
        })}
      </ul>
      {shown.length > limit && (
        <div>
          <button type="button" onClick={() => setLimit((l) => l + PAGE)} className="btn btn-glass inline-flex h-7 cursor-pointer items-center px-3 text-[12px] font-medium">
            Xem thêm {Math.min(PAGE, shown.length - limit)} / còn {shown.length - limit}
          </button>
        </div>
      )}
      {open !== null && shown[open] && (
        <Lightbox
          item={shown[open]}
          canDelete={canDelete}
          aiReady={aiReady}
          index={open}
          total={shown.length}
          onClose={() => setOpen(null)}
          onMove={(d) => setOpen((i) => (i === null ? i : (i + d + shown.length) % shown.length))}
          onKeyword={(k) => {
            setOpen(null);
            pick({ type: "kw", value: k });
          }}
        />
      )}
    </div>
  );
}

/** Phím ← → không chuyển ảnh khi đang thao tác trên trình phát / ô nhập (← → là tua video). */
const keepsArrows = (el: Element | null) => !!el && (el.tagName === "VIDEO" || el.tagName === "AUDIO" || el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT");

function Lightbox({ item, canDelete, aiReady, index, total, onClose, onMove, onKeyword }: { item: GalleryItem; canDelete: boolean; aiReady?: AiReadiness; index: number; total: number; onClose: () => void; onMove: (d: number) => void; onKeyword: (k: string) => void }) {
  const mounted = useMounted();
  const closeRef = useRef<HTMLButtonElement>(null);
  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && !keepsArrows(e.target as Element) && !keepsArrows(document.activeElement)) onMove(e.key === "ArrowRight" ? 1 : -1);
    },
    [onClose, onMove],
  );
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, []);
  useEffect(() => {
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onKey]);
  if (!mounted) return null;
  const nav = "grid h-10 w-10 cursor-pointer place-items-center rounded-full bg-black/50 text-white hover:bg-black/70 focus-visible:outline-2 focus-visible:outline-white";
  const big = item.previewUrl ?? item.thumbUrl;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={item.desc || item.file}
      data-lightbox
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-3 sm:p-6"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <button ref={closeRef} type="button" onClick={onClose} aria-label="Đóng" className={cn(nav, "absolute right-3 top-3 z-10")}>
        <X size={18} aria-hidden />
      </button>
      {total > 1 && (
        <>
          <button type="button" onClick={() => onMove(-1)} aria-label="Ảnh trước" className={cn(nav, "absolute left-2 top-1/2 z-10 -translate-y-1/2 sm:left-4")}><ChevronLeft size={20} aria-hidden /></button>
          <button type="button" onClick={() => onMove(1)} aria-label="Ảnh sau" className={cn(nav, "absolute right-2 top-1/2 z-10 -translate-y-1/2 sm:right-4")}><ChevronRight size={20} aria-hidden /></button>
        </>
      )}
      <figure className="m-0 flex max-h-full w-full max-w-[1100px] flex-col items-center gap-3" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        {item.kind === "video" && item.previewUrl ? (
          <video key={item.id} src={item.previewUrl} controls autoPlay playsInline onPlay={(e) => pauseOthers(e.currentTarget)} className="max-h-[70vh] max-w-full rounded-lg bg-black" />
        ) : big ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={item.id} src={big} alt={item.desc || item.keywords.join(", ")} className="max-h-[70vh] max-w-full rounded-lg object-contain" />
        ) : (
          <span className="grid h-48 w-48 place-items-center rounded-lg bg-ground-2 text-ink-3"><ImageOff size={28} aria-hidden /></span>
        )}
        <figcaption className="w-full max-w-[720px] rounded-lg bg-surface px-3.5 py-3 text-[12.5px] text-ink-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Pill tone={item.usable ? "jade" : "brick"}>{item.status}</Pill>
            <PendingTag pending={item.pendingDecision} action={item.pendingAction} />
            {!item.desc.trim() && <NoDescTag />}
            {item.origin === "owner_mac" && <OriginTag origin="owner_mac" />}
            {item.kind === "video" && !item.previewUrl && <Pill>Chỉ có ảnh xem trước</Pill>}
            <Pill>{item.topic}</Pill>
            {item.keywords.map((k) => (
              <button key={k} type="button" onClick={() => onKeyword(k)} title={`Lọc theo “${k}”`} className="inline-flex h-5 cursor-pointer items-center rounded-full border border-border-2 px-2 text-[11px] font-medium text-ink hover:border-jade hover:text-jade">
                {k}
              </button>
            ))}
            <span className="num ml-auto text-[11px] text-ink-3">{index + 1}/{total}</span>
            {canDelete && item.pendingAction === "trash" && <CancelTrashButton action={trashAssetAction} id={item.id} name={item.file.replace(/^broll\//, "")} />}
            {canDelete && item.pendingAction !== "trash" && (item.canTrash ?? item.origin === "server") && (
              <DeleteAssetButton action={trashAssetAction} fields={{ id: item.id }} name={item.file.replace(/^broll\//, "")} note={item.origin === "owner_mac" ? OWNER_MAC_TRASH_NOTE : undefined} always />
            )}
          </div>
          {canDelete && item.origin === "server" ? <DescEditor key={item.id} item={item} aiReady={aiReady} /> : item.desc && <p className="m-0 mt-2 text-ink">{item.desc}</p>}
          <details className="mt-2 text-[11.5px]">
            <summary className="cursor-pointer text-ink-3 hover:text-ink">Tệp & giấy phép</summary>
            <div className="mt-1.5 grid gap-1 text-ink-2">
              <code className="break-all text-ink">{item.file}</code>
              <span>{item.license || "Chưa có giấy phép"}</span>
            </div>
          </details>
        </figcaption>
      </figure>
    </div>,
    document.body,
  );
}

/** Mô tả trong ô xem lớn (OWNER, ảnh máy chủ): hiện mô tả + "Sửa mô tả" (một dòng, ≤ 200 ký tự) + "Tự mô tả bằng AI" (chỉ khi gọi AI
 *  được; không thì nhãn AiBlocked dẫn tới Cài đặt › Đội AI). Ô nhập giữ phím ← → (không chuyển ảnh khi đang gõ). */
function DescEditor({ item, aiReady }: { item: GalleryItem; aiReady?: AiReadiness }) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="mt-2 grid gap-1.5">
      {item.desc && !editing && <p className="m-0 text-ink">{item.desc}</p>}
      {editing ? (
        <form action={setBrollDescAction} className="flex flex-wrap items-center gap-1.5">
          <input type="hidden" name="id" value={item.id} />
          <input name="desc" defaultValue={item.desc} maxLength={200} autoFocus aria-label="Mô tả ảnh" placeholder="Tả nội dung nhìn thấy, 1 câu" className={cn(inputClass, "min-w-0 flex-1 basis-56")} />
          <SubmitButton variant="primary" pendingText="Đang lưu…">Lưu</SubmitButton>
          <Button type="button" variant="ghost" onClick={() => setEditing(false)}>Huỷ</Button>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          <Button type="button" variant="outline" onClick={() => setEditing(true)}>
            <PenLine size={13} aria-hidden />
            {item.desc ? "Sửa mô tả" : "Thêm mô tả"}
          </Button>
          {aiReady && !aiReady.ok ? (
            <AiBlocked ready={aiReady} />
          ) : aiReady?.ok ? (
            <form action={describeBrollAction}>
              <input type="hidden" name="id" value={item.id} />
              <SubmitButton variant="ghost" pendingText="AI đang xem ảnh…" title="Gọi AI một lần (tính phí theo Đội AI)"><Sparkles size={13} aria-hidden />Tự mô tả bằng AI</SubmitButton>
            </form>
          ) : null}
        </div>
      )}
    </div>
  );
}
