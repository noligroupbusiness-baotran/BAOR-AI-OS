"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/format";
import { rerenderVideoAction, startVideoAction } from "@/lib/actions/videos";
import { SubmitButton } from "@/components/campaigns/submit-button";

const RATIOS: Record<string, number> = { "9:16": 9 / 16, "4:5": 4 / 5, "1:1": 1, "16:9": 16 / 9 };

// Khung hình: chọn tỷ lệ xuất và kéo khung cắt trên ảnh của video gốc (tâm + độ phóng), rồi dựng lại với khung đó.
// Cùng công thức với frame_crop trong scripts/video/esv_render.py: khung lớn nhất đúng tỷ lệ nằm trong nguồn, chia cho độ phóng.
export function FramingEditor(props: { videoId: string; back: string; sourceUrl: string; aspect: string; fx?: number; fy?: number; fz?: number; mode?: "rerender" | "start"; cut?: boolean }) {
  const start = props.mode === "start";
  const [open, setOpen] = useState(start);
  const [cut, setCut] = useState(props.cut ?? true);
  const [aspect, setAspect] = useState(props.aspect);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(props.fx !== undefined || props.fy !== undefined ? { x: props.fx ?? 0.5, y: props.fy ?? 0.5 } : null);
  const [zoom, setZoom] = useState(props.fz ?? 1);
  const [dims, setDims] = useState<{ w: number; h: number; d: number } | null>(null);
  const [t, setT] = useState(3);
  const box = useRef<HTMLDivElement>(null);
  const vid = useRef<HTMLVideoElement>(null);
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  const ar = RATIOS[aspect] ?? 9 / 16;
  let rect = null as null | { l: number; t: number; w: number; h: number };
  if (dims) {
    let cw = dims.w / dims.h > ar ? dims.h * ar : dims.w;
    let ch = dims.w / dims.h > ar ? dims.h : dims.w / ar;
    cw /= zoom;
    ch /= zoom;
    const cx = (pos?.x ?? 0.5) * dims.w;
    const cy = (pos?.y ?? 0.5) * dims.h;
    const l = Math.min(Math.max(cx - cw / 2, 0), dims.w - cw);
    const tp = Math.min(Math.max(cy - ch / 2, 0), dims.h - ch);
    rect = { l: (l / dims.w) * 100, t: (tp / dims.h) * 100, w: (cw / dims.w) * 100, h: (ch / dims.h) * 100 };
  }

  function onDown(e: React.PointerEvent) {
    if (!box.current) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, x: pos?.x ?? 0.5, y: pos?.y ?? 0.5 };
  }
  function onMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || !box.current) return;
    const r = box.current.getBoundingClientRect();
    setPos({ x: Math.min(1, Math.max(0, d.x + (e.clientX - d.px) / r.width)), y: Math.min(1, Math.max(0, d.y + (e.clientY - d.py) / r.height)) });
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex h-[26px] items-center gap-1.5 rounded-full border border-border-2 px-2.5 text-[12px] font-medium text-ink hover:border-ink-3">
        Khung hình · {props.aspect}
      </button>
    );
  }
  return (
    <div className="grid w-full max-w-[460px] gap-2 rounded-md border border-border bg-ground p-3 text-[12.5px]">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-ink">{start ? "Chọn tỷ lệ và khung hình" : "Khung hình"}</span>
        {!start && <button type="button" onClick={() => setOpen(false)} aria-label="Đóng" className="text-ink-3 hover:text-ink">✕</button>}
      </div>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Tỷ lệ khung hình">
        {Object.keys(RATIOS).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={aspect === k} onClick={() => setAspect(k)} className={cn("h-7 rounded-md border px-2.5 font-medium", aspect === k ? "border-jade bg-jade-soft text-ink" : "border-border-2 text-ink-2 hover:border-ink-3")}>
            {k}
          </button>
        ))}
      </div>
      <div ref={box} className="relative w-full select-none overflow-hidden rounded bg-black" style={{ aspectRatio: dims ? `${dims.w} / ${dims.h}` : "16 / 9" }}>
        <video
          ref={vid}
          src={props.sourceUrl}
          muted
          playsInline
          preload="metadata"
          className="absolute inset-0 h-full w-full object-contain"
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            setDims({ w: v.videoWidth, h: v.videoHeight, d: v.duration });
            v.currentTime = Math.min(3, v.duration / 2);
          }}
        />
        {rect && (
          <div
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={() => (drag.current = null)}
            className="absolute cursor-move touch-none border-2 border-[#D4AF37]"
            style={{ left: `${rect.l}%`, top: `${rect.t}%`, width: `${rect.w}%`, height: `${rect.h}%`, boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)" }}
            aria-label="Khung cắt, kéo để đổi vị trí"
          />
        )}
        {!dims && <div className="absolute inset-0 grid place-items-center text-white/70">Đang tải khung hình gốc…</div>}
      </div>
      {dims && (
        <label className="grid gap-0.5 text-ink-2">
          <span>Xem tại giây <span className="num">{Math.round(t)}</span> / <span className="num">{Math.round(dims.d)}</span></span>
          <input type="range" min={0} max={Math.max(1, Math.floor(dims.d))} step={1} value={t} onChange={(e) => { const v = Number(e.target.value); setT(v); if (vid.current) vid.current.currentTime = v; }} />
        </label>
      )}
      <label className="grid gap-0.5 text-ink-2">
        <span>Phóng ×<span className="num">{zoom.toFixed(2)}</span></span>
        <input type="range" min={1} max={2.5} step={0.05} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
      </label>
      <p className="m-0 text-ink-3">Kéo khung vàng để chọn vị trí. {pos ? "" : "Đang để tự động: tâm ngang theo mặt người nói."}</p>
      {start && (
        <label className="flex items-center gap-2 text-ink-2">
          <input type="checkbox" checked={cut} onChange={(e) => setCut(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--jade)]" />
          Cắt khoảng lặng
        </label>
      )}
      <form action={start ? startVideoAction : rerenderVideoAction} className="flex flex-wrap items-center gap-2">
        {start && <input type="hidden" name="cut" value={cut ? "1" : "0"} />}
        <input type="hidden" name="id" value={props.videoId} />
        <input type="hidden" name="back" value={props.back} />
        <input type="hidden" name="aspect" value={aspect} />
        <input type="hidden" name="fx" value={pos ? pos.x.toFixed(4) : ""} />
        <input type="hidden" name="fy" value={pos ? pos.y.toFixed(4) : ""} />
        <input type="hidden" name="fz" value={zoom.toFixed(2)} />
        <SubmitButton pendingText="Đang xếp hàng…">{start ? "Bắt đầu dựng" : "Dựng lại với khung này"}</SubmitButton>
        {pos && <button type="button" onClick={() => { setPos(null); setZoom(1); }} className="text-[12px] text-ink-2 underline">Về tự động</button>}
      </form>
    </div>
  );
}
