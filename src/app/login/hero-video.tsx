"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Pause, Play } from "lucide-react";
import { cn } from "@/lib/format";

// Video nền mảng thương hiệu ở màn đăng nhập (OWNER 25/10/2026 cho phép dùng video của mẫu; tham chiếu URL, không lưu vào repo
// — CSP media-src trong next.config.ts chỉ mở đúng domain này). Không lớp phủ; nền xanh rừng #0f1a14 phía sau để chưa tải / lỗi vẫn tối.
// Nút nhỏ (30 px, vùng bấm 38 px) góc dưới phải bật / tắt; lựa chọn nhớ trong localStorage. prefers-reduced-motion: mặc định tắt, vẫn bật được.
const SRC = "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260818_072341_50851634-bbc3-4c33-9acc-7647d4db44aa.mp4";
const KEY = "baor.heroVideo";
// Chỉ gắn video khi mảng thương hiệu hiện (từ lg = 1024 px; dưới mức đó không tải / phát ngầm trên điện thoại)
// và trình duyệt không do máy điều khiển (navigator.webdriver: E2E không phụ thuộc CDN bên ngoài).
const WIDE = "(min-width: 1024px)";
function useShowVideo() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(WIDE);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(WIDE).matches && navigator.webdriver !== true,
    () => false,
  );
}

function readChoice(): "on" | "off" | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "on" || v === "off" ? v : null;
  } catch {
    return null;
  }
}

function saveChoice(v: "on" | "off") {
  try {
    localStorage.setItem(KEY, v);
  } catch {
    // trình duyệt chặn lưu trữ: vẫn bật / tắt được trong phiên này
  }
}

export function HeroVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  const wide = useShowVideo();
  // null = chưa quyết (lần vẽ đầu ở máy chủ): video ẩn, nền đen
  const [on, setOn] = useState<boolean | null>(null);
  // Chỉ gắn src khi người dùng / mặc định đã BẬT ít nhất một lần: đang tắt thì không tải tệp video
  const [armed, setArmed] = useState(false);

  // Quyết bật / tắt sau khi gắn vào trình duyệt (đọc localStorage + prefers-reduced-motion)
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const choice = readChoice();
    const t = setTimeout(() => {
      const start = choice ? choice === "on" : !reduce;
      setOn(start);
      setArmed(start);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const v = ref.current;
    if (!v || on === null || !wide || !armed) return;
    if (on) v.play().catch(() => undefined);
    else v.pause();
  }, [on, wide, armed]);

  const toggle = () => {
    const next = !on;
    saveChoice(next ? "on" : "off");
    if (next) setArmed(true);
    setOn(next);
  };

  const label = on ? "Tắt video nền" : "Bật video nền";
  if (!wide) return null;
  return (
    <>
      <video
        ref={ref}
        src={armed ? SRC : undefined}
        muted
        loop
        playsInline
        preload="metadata"
        aria-hidden
        tabIndex={-1}
        className={cn("pointer-events-none absolute inset-0 -z-10 h-full w-full object-cover transition-opacity duration-500", on ? "opacity-100" : "opacity-0")}
      />
      {on !== null && (
        <button
          type="button"
          onClick={toggle}
          aria-label={label}
          aria-pressed={on}
          title={label}
          className="absolute bottom-4 right-4 z-10 grid h-[30px] w-[30px] cursor-pointer before:absolute before:-inset-1 before:content-[''] place-items-center rounded-full border border-white/25 bg-white/10 text-white opacity-70 backdrop-blur-md transition-[opacity,border-color,box-shadow] duration-200 hover:border-white/60 hover:opacity-100 hover:shadow-[0_0_18px_rgba(186,208,255,0.3)] focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          {on ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />}
        </button>
      )}
    </>
  );
}
