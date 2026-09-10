import type { Platform } from "@/lib/types";
import { Pill, type Tone } from "./pill";

const meta: Record<Platform, { label: string; short: string; tone: Tone; emoji: string }> = {
  facebook: { label: "Facebook", short: "FB", tone: "blue", emoji: "📘" },
  instagram: { label: "Instagram", short: "IG", tone: "purple", emoji: "📸" },
  tiktok: { label: "TikTok", short: "TT", tone: "slate", emoji: "🎵" },
  threads: { label: "Threads", short: "TH", tone: "neutral", emoji: "🧵" },
  youtube: { label: "YouTube", short: "YT", tone: "red", emoji: "▶️" },
  zalo: { label: "Zalo OA", short: "ZL", tone: "teal", emoji: "💬" },
};

export function platformMeta(p: Platform) {
  return meta[p];
}

export function PlatformPill({ platform, short }: { platform: Platform; short?: boolean }) {
  const m = meta[platform];
  return (
    <Pill tone={m.tone} size="xs">
      <span aria-hidden>{m.emoji}</span> {short ? m.short : m.label}
    </Pill>
  );
}
