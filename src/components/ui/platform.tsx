import type { Platform } from "@/lib/types";

const label: Record<Platform, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  threads: "Threads",
  youtube: "YouTube",
  zalo: "Zalo OA",
};

export function platformLabel(p: Platform) {
  return label[p];
}

export function platformList(ps: Platform[]) {
  return ps.map(platformLabel).join(" · ");
}
