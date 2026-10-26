"use client";

import { useState } from "react";
import { inputClass } from "@/components/ui/field";
import { detectPlatform, type SocialKind } from "@/lib/research/social";

// Nền tảng + link trên một hàng: gõ / dán link là ô nền tảng tự đổi theo link (vẫn chọn tay được).
export const PLATFORM_OPTIONS: { value: SocialKind; label: string }[] = [
  { value: "youtube", label: "YouTube" },
  { value: "facebook", label: "Facebook" },
  { value: "fb_group", label: "Nhóm Facebook" },
  { value: "tiktok", label: "TikTok" },
  { value: "instagram", label: "Instagram" },
  { value: "threads", label: "Threads" },
  { value: "web", label: "Diễn đàn / web" },
  { value: "other", label: "Khác" },
];

export function SourceLinkFields({ defaultUrl = "", defaultKind }: { defaultUrl?: string; defaultKind?: SocialKind }) {
  const [url, setUrl] = useState(defaultUrl);
  const [kind, setKind] = useState<SocialKind | "">(defaultKind ?? (defaultUrl ? detectPlatform(defaultUrl) : ""));
  return (
    <>
      <select name="kind" value={kind} onChange={(e) => setKind(e.target.value as SocialKind)} className={inputClass} aria-label="Nền tảng">
        <option value="">Tự nhận</option>
        {PLATFORM_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <input
        name="url"
        type="url"
        required
        value={url}
        onChange={(e) => {
          setUrl(e.target.value);
          if (/^https?:\/\/\S+\.\S+/i.test(e.target.value.trim())) setKind(detectPlatform(e.target.value));
        }}
        placeholder="Link bài / video (https://…)"
        aria-label="Link bài / video"
        className={inputClass}
      />
    </>
  );
}
