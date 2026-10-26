"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Film, Play, X } from "lucide-react";
import { cn } from "@/lib/format";

// Xem nhanh (OWNER 25/10/2026: "phải có nút xem ngay"): bấm ảnh / ▶ trên thẻ → khung xem lớn phát ngay. OWNER bỏ các nút
// "Kích thước gốc / Toàn màn hình / Mở chi tiết": toàn màn hình dùng nút sẵn của trình phát, bấm tên để mở chi tiết. Esc / bấm nền để đóng.

function useMounted() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

type ViewProps = { src: string; title: string; detailHref?: string; action?: ReactNode };

// Chỉ giữ thứ cần: tên (bấm để mở chi tiết), trình phát có thanh điều khiển sẵn (đã có toàn màn hình), nút chính của trạng thái.
function QuickViewModal({ src, title, detailHref, action, onClose }: ViewProps & { onClose: () => void }) {
  const closeBtn = useRef<HTMLButtonElement>(null);
  const vid = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.fullscreenElement) return;
      // Hộp xác nhận (nút chính) đang mở trên khung xem: Esc chỉ đóng hộp đó
      if (document.querySelector('[aria-labelledby="dlg-title"]')) return;
      onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeBtn.current?.focus();
    // Phát ngay; trình duyệt chặn tự phát có tiếng thì phát không tiếng (bấm loa để bật)
    const v = vid.current;
    v?.play().catch(() => {
      v.muted = true;
      v.play().catch(() => {});
    });
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/80 p-2 backdrop-blur-sm sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={`Xem ngay: ${title}`} className="flex max-h-full w-full max-w-[1100px] flex-col gap-2.5">
        <div className="flex items-center gap-2">
          {detailHref ? (
            <Link href={detailHref} title="Mở chi tiết" className="min-w-0 flex-1 truncate text-[14px] font-semibold text-white hover:underline">{title}</Link>
          ) : (
            <h2 className="min-w-0 flex-1 truncate text-[14px] font-semibold text-white">{title}</h2>
          )}
          {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
          <button ref={closeBtn} type="button" onClick={onClose} aria-label="Đóng" className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-full text-white/80 hover:bg-white/10 hover:text-white">
            <X size={18} aria-hidden />
          </button>
        </div>
        <div className="grid min-h-0 place-items-center overflow-hidden rounded-lg bg-black">
          <video ref={vid} src={src} controls playsInline className="block max-h-[calc(100dvh-120px)] w-auto max-w-full" />
        </div>
      </div>
    </div>
  );
}

function useQuickView(props: ViewProps) {
  const [open, setOpen] = useState(false);
  const mounted = useMounted();
  const close = useCallback(() => setOpen(false), []);
  const modal = open && mounted ? createPortal(<QuickViewModal {...props} onClose={close} />, document.body) : null;
  return { show: () => setOpen(true), modal };
}

/** Ảnh xem trước của thẻ: khung 16:9, video dọc có nền mờ cùng khung hình phía sau (không còn hai dải đen); bấm để xem ngay. */
export function VideoThumb({ src, title, detailHref, action, cover, badges }: ViewProps & { cover?: boolean; badges?: ReactNode }) {
  const { show, modal } = useQuickView({ src, title, detailHref, action });
  const vid = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  // Nền mờ: chép một khung hình nhỏ của chính video vào canvas (cùng nguồn) rồi làm mờ bằng CSS
  useEffect(() => {
    if (cover) return;
    const v = vid.current;
    const c = canvas.current;
    if (!v || !c) return;
    const draw = () => {
      try {
        // Cắt giữa khung theo tỷ lệ 16:9 (kiểu "cover") để nền mờ không bị bóp méo
        const w = v.videoWidth || c.width;
        const h = v.videoHeight || c.height;
        const sw = Math.min(w, (h * 16) / 9);
        const sh = Math.min(h, (w * 9) / 16);
        c.getContext("2d")?.drawImage(v, (w - sw) / 2, (h - sh) / 2, sw, sh, 0, 0, c.width, c.height);
        c.style.opacity = "1";
      } catch {
        /* chưa có khung hình — giữ nền tối */
      }
    };
    if (v.readyState >= 2) draw();
    v.addEventListener("loadeddata", draw);
    v.addEventListener("seeked", draw);
    return () => {
      v.removeEventListener("loadeddata", draw);
      v.removeEventListener("seeked", draw);
    };
  }, [cover, src]);

  return (
    <>
      <button type="button" onClick={show} aria-label={`Xem ngay: ${title}`} className="group relative block aspect-video w-full cursor-pointer overflow-hidden rounded-t-[inherit] bg-black focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-jade">
        {!cover && <canvas ref={canvas} width={32} height={18} aria-hidden className="absolute inset-0 h-full w-full scale-125 opacity-0 blur-xl brightness-[0.7] saturate-150 transition-opacity duration-300" />}
        <video ref={vid} src={`${src}#t=0.5`} preload="metadata" muted playsInline aria-hidden className={cn("pointer-events-none relative h-full w-full transition-transform duration-300 group-hover:scale-[1.02]", cover ? "object-cover" : "object-contain")} />
        <span className="absolute left-1/2 top-1/2 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white opacity-90 ring-1 ring-white/25 transition group-hover:scale-110 group-hover:bg-jade group-hover:opacity-100">
          <Play size={18} className="translate-x-px" fill="currentColor" aria-hidden />
        </span>
        {badges}
      </button>
      {modal}
    </>
  );
}

/** Ô trống khi video chưa có tệp. */
export function EmptyThumb({ badges }: { badges?: ReactNode }) {
  return (
    <div className="relative grid aspect-video w-full place-items-center overflow-hidden rounded-t-[inherit] bg-black text-white/40">
      <Film size={28} aria-hidden />
      {badges}
    </div>
  );
}

/** Đổi cỡ lưới thẻ Lớn ↔ Nhỏ; nhớ lựa chọn trên máy này (localStorage, bọc try/catch). */
const GRID_KEY = "baor.videoStudio.grid";
const GRID_EVENT = "baor:video-grid";
function readGrid(): "large" | "small" {
  try {
    return localStorage.getItem(GRID_KEY) === "small" ? "small" : "large";
  } catch {
    return "large"; // trình duyệt chặn lưu trữ
  }
}
function subscribeGrid(cb: () => void) {
  window.addEventListener(GRID_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(GRID_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
export function GridSizeToggle({ target }: { target: string }) {
  const size = useSyncExternalStore(subscribeGrid, readGrid, () => "large" as const);
  useEffect(() => {
    document.getElementById(target)?.setAttribute("data-size", size);
  }, [target, size]);
  function pick(s: "large" | "small") {
    try {
      localStorage.setItem(GRID_KEY, s);
    } catch {
      document.getElementById(target)?.setAttribute("data-size", s); // không lưu được: vẫn đổi cho lần xem này
    }
    window.dispatchEvent(new Event(GRID_EVENT));
  }
  const btn = (s: "large" | "small", label: string) => (
    <button type="button" onClick={() => pick(s)} aria-pressed={size === s} className={cn("h-6 cursor-pointer px-2.5 text-[12px] font-medium", size === s ? "metal-pill" : "tab-pill text-ink-2 hover:text-ink")}>
      {label}
    </button>
  );
  return (
    <div role="group" aria-label="Cỡ thẻ" className="inline-flex gap-0.5 rounded-[9px] border border-border-2 bg-surface p-0.5">
      {btn("large", "Lớn")}
      {btn("small", "Nhỏ")}
    </div>
  );
}
