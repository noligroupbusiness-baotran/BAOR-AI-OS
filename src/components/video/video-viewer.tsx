"use client";

import { useEffect, useRef, useState } from "react";

// Xem video lớn ngay trong trang: nút "Xem lớn" mở khung, nút ✕ / phím Esc / bấm nền tối để đóng.
export function VideoViewer({ src, title, hdSrc }: { src: string; title: string; hdSrc?: string }) {
  const [open, setOpen] = useState(false);
  const [hd, setHd] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="mt-1 inline-flex h-7 items-center gap-1.5 rounded-full border border-border-2 px-3 text-[12px] font-medium text-ink hover:border-ink-3">
        ⤢ Xem lớn
      </button>
      {open && (
        <div role="dialog" aria-modal="true" data-video-viewer="" aria-label={`Xem video ${title}`} className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-4" onClick={() => setOpen(false)}>
          <div className="relative flex max-h-full flex-col items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <div className="flex w-full items-center justify-between gap-3 text-[13px] text-white">
              <span className="truncate font-semibold">{title}</span>
              <span className="flex items-center gap-2">
                {hdSrc && (
                  <button type="button" onClick={() => setHd((x) => !x)} className="rounded-full border border-white/40 px-2.5 py-0.5 text-[12px] hover:bg-white/10">
                    {hd ? "Bản xem nhanh" : "Bản chính 1080p"}
                  </button>
                )}
                <button type="button" onClick={() => setOpen(false)} aria-label="Đóng" className="grid h-8 w-8 place-items-center rounded-full bg-white/15 text-[18px] leading-none hover:bg-white/25">✕</button>
              </span>
            </div>
            <video ref={ref} key={hd ? "hd" : "sd"} src={hd && hdSrc ? hdSrc : src} controls autoPlay playsInline className="max-h-[82vh] max-w-[92vw] rounded-md bg-black" style={{ aspectRatio: "9 / 16" }} />
          </div>
        </div>
      )}
    </>
  );
}
