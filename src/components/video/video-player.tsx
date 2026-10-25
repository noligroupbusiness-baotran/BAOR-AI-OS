"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";

/** Điều khiển từ ngoài (Video Review): tua tới mốc, đọc mốc đang xem. */
export type PlayerControl = { seek: (t: number) => void; time: () => number; pause: () => void };

const fmt = (s: number) => {
  if (!Number.isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};

// Trình phát với thanh điều khiển riêng (phát, thời gian, tua, âm lượng, ⛶) — một nút phóng to duy nhất ở thanh dưới.
// ⛶: thử toàn màn hình thật; nơi chặn toàn màn hình (vd khung trình duyệt nhúng trong app) thì phủ kín cửa sổ.
// Thoát: bấm lại nút (✕), phím Esc, hoặc bấm vùng nền đen.
// Bề rộng theo tỷ lệ khung (Quay & edit video 25/10): video dọc giữ hẹp, video ngang dùng hết cột.
const maxWidth: Record<string, string> = { "16:9": "max-w-full", "1:1": "max-w-[440px]", "4:5": "max-w-[380px]" };

export function VideoPlayer({ src, hdSrc, control, onTime, label, aspect }: { src: string; hdSrc?: string; control?: Ref<PlayerControl>; onTime?: (t: number) => void; label?: string; aspect?: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const vid = useRef<HTMLVideoElement>(null);
  const [mode, setMode] = useState<"normal" | "native" | "fill">("normal");
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [d, setD] = useState(0);
  const [muted, setMuted] = useState(false);
  const [hd, setHd] = useState(false);
  const resume = useRef<{ t: number; play: boolean } | null>(null);
  useImperativeHandle(control, () => ({
    seek: (to: number) => {
      const v = vid.current;
      if (v) v.currentTime = Math.max(0, Math.min(to, Number.isFinite(v.duration) ? v.duration : to));
    },
    time: () => vid.current?.currentTime ?? 0,
    pause: () => vid.current?.pause(),
  }));

  // Đổi chất lượng: giữ đúng chỗ đang xem và trạng thái phát.
  function setQuality(next: boolean) {
    if (!hdSrc || next === hd) return;
    const v = vid.current;
    resume.current = v ? { t: v.currentTime, play: !v.paused } : null;
    setHd(next);
  }

  // Video có thể đã nạp xong thông tin TRƯỚC khi React gắn sự kiện (trang dựng sẵn ở máy chủ): đọc lại thời lượng khi gắn.
  useEffect(() => {
    const v = vid.current;
    if (v && v.readyState >= 1 && Number.isFinite(v.duration)) setD(v.duration);
  }, []);
  useEffect(() => {
    const onFs = () => setMode((m) => (document.fullscreenElement ? "native" : m === "native" ? "normal" : m));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);
  useEffect(() => {
    if (mode !== "fill") return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMode("normal");
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [mode]);

  async function toggleFull() {
    if (mode === "native") return void document.exitFullscreen().catch(() => setMode("normal"));
    if (mode === "fill") return setMode("normal");
    const el = wrap.current;
    if (el?.requestFullscreen && document.fullscreenEnabled) {
      // Có nơi lời gọi bị chặn âm thầm và không bao giờ trả về: chờ tối đa 400 ms rồi phủ kín cửa sổ.
      const ok = await Promise.race([el.requestFullscreen().then(() => true, () => false), new Promise<boolean>((r) => setTimeout(() => r(false), 400))]);
      if (ok && document.fullscreenElement) return setQuality(true);
    }
    setMode("fill");
    setQuality(true);
  }
  function togglePlay() {
    const v = vid.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  }

  const big = mode !== "normal";
  return (
    <div
      ref={wrap}
      data-video-fullscreen={big ? "" : undefined}
      className={big ? "fixed inset-0 z-[90] flex items-center justify-center bg-black" : `relative w-full ${maxWidth[aspect ?? ""] ?? "max-w-[300px]"} overflow-hidden rounded-md border border-border bg-black`}
      onClick={big ? (e) => e.target === e.currentTarget && toggleFull() : undefined}
    >
      <div className={big ? "relative max-h-full" : "relative"} style={big ? { height: "100%", aspectRatio: "auto" } : undefined}>
        <video
          ref={vid}
          src={hd && hdSrc ? hdSrc : src}
          playsInline
          preload="metadata"
          onClick={togglePlay}
          onDoubleClick={toggleFull}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          aria-label={label}
          onTimeUpdate={(e) => {
            setT(e.currentTarget.currentTime);
            onTime?.(e.currentTarget.currentTime);
          }}
          onSeeked={(e) => onTime?.(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            setD(v.duration);
            const r = resume.current;
            if (r) {
              v.currentTime = r.t;
              if (r.play) void v.play();
              resume.current = null;
            }
          }}
          className={big ? "h-full max-h-screen w-auto max-w-[100vw] object-contain" : "block max-h-[520px] w-full object-contain"}
        />
        <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/80 to-transparent px-2 pb-1.5 pt-5 text-[12px] text-white">
          <button type="button" onClick={togglePlay} aria-label={playing ? "Tạm dừng" : "Phát"} className="grid h-7 w-7 place-items-center rounded-full hover:bg-white/15">
            {playing ? "❚❚" : "▶"}
          </button>
          <span className="num shrink-0 tabular-nums">{fmt(t)} / {fmt(d)}</span>
          <input
            type="range"
            aria-label="Tua"
            min={0}
            max={d || 0}
            step={0.1}
            value={t}
            onChange={(e) => {
              const v = vid.current;
              if (v) v.currentTime = Number(e.target.value);
            }}
            className="h-1 min-w-0 flex-1 accent-white"
          />
          <button type="button" onClick={() => { const v = vid.current; if (v) { v.muted = !v.muted; setMuted(v.muted); } }} aria-label={muted ? "Bật tiếng" : "Tắt tiếng"} className="grid h-7 w-7 place-items-center rounded-full hover:bg-white/15">
            {muted ? "🔇" : "🔊"}
          </button>
          {hdSrc && (
            <button type="button" onClick={() => setQuality(!hd)} aria-label="Chất lượng video" title={hd ? "Đang xem bản chính 1080p — bấm để về bản xem nhanh" : "Đang xem bản xem nhanh 540p — bấm để xem bản chính 1080p"}
              className="h-6 shrink-0 rounded border border-white/40 px-1.5 text-[11px] font-semibold hover:bg-white/15">
              {hd ? "1080p" : "540p"}
            </button>
          )}
          <button
            type="button"
            onClick={toggleFull}
            aria-label={big ? "Thoát toàn màn hình" : "Xem toàn màn hình"}
            title={big ? "Thoát (Esc)" : "Xem toàn màn hình (bấm đúp vào video cũng được)"}
            className="grid h-7 w-7 place-items-center rounded-full text-[15px] hover:bg-white/15"
          >
            {big ? "✕" : "⛶"}
          </button>
        </div>
      </div>
    </div>
  );
}
