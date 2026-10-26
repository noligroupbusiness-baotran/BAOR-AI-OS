"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { cn } from "@/lib/format";

/** Dừng mọi âm thanh / video khác trên trang: chỉ một bài phát cùng lúc (Tư liệu). */
export function pauseOthers(self: HTMLMediaElement) {
  document.querySelectorAll<HTMLMediaElement>("audio, video").forEach((m) => {
    if (m !== self && !m.paused) m.pause();
  });
}

// Nút ▶ / ❚❚ nghe thử (OWNER 26/10/2026: thay thanh <audio controls> dài bằng một nút rõ, to). Thẻ <audio> vẫn nằm trong dòng
// (ẩn) để kiểm thử E2E đọc src và phát được; trạng thái nút theo sự kiện của chính thẻ audio. Vòng mảnh quanh nút = tiến độ.
export function PlayButton({ src, label, size = "md", className }: { src: string; label: string; size?: "sm" | "md"; className?: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const a = ref.current;
    if (!a) return;
    const onPlay = () => {
      pauseOthers(a);
      setPlaying(true);
    };
    const onStop = () => setPlaying(false);
    const onTime = () => setPct(a.duration ? (a.currentTime / a.duration) * 100 : 0);
    const onEnd = () => {
      setPlaying(false);
      setPct(0);
    };
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onStop);
    a.addEventListener("ended", onEnd);
    a.addEventListener("timeupdate", onTime);
    return () => {
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onStop);
      a.removeEventListener("ended", onEnd);
      a.removeEventListener("timeupdate", onTime);
    };
  }, []);
  const toggle = () => {
    const a = ref.current;
    if (!a) return;
    if (a.paused) void a.play().catch(() => setPlaying(false));
    else a.pause();
  };
  const box = size === "sm" ? "h-8 w-8" : "h-10 w-10";
  return (
    <span className={cn("relative inline-grid shrink-0 place-items-center", box, className)}>
      <button
        type="button"
        onClick={toggle}
        aria-label={`${playing ? "Dừng" : "Nghe thử"} ${label}`}
        aria-pressed={playing}
        title={playing ? "Dừng" : "Nghe thử"}
        className={cn(
          "grid cursor-pointer place-items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jade",
          box,
          playing ? "bg-jade text-jade-fg" : "border border-border-2 bg-surface text-ink hover:border-jade hover:text-jade",
        )}
        style={playing ? { backgroundImage: `conic-gradient(rgb(255 255 255 / 0.28) ${pct}%, transparent 0)` } : undefined}
      >
        {playing ? <Pause size={size === "sm" ? 14 : 17} fill="currentColor" aria-hidden /> : <Play size={size === "sm" ? 14 : 17} fill="currentColor" className="translate-x-px" aria-hidden />}
      </button>
      <audio ref={ref} preload="none" src={src} hidden />
    </span>
  );
}
