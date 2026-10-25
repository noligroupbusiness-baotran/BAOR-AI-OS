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
  // Fanpage 2–4 (facebook_page_<n>) và kênh mới: không để trống nhãn
  return label[p] ?? (/^facebook_page_(\d+)$/.test(p) ? `Facebook Fanpage ${p.split("_").pop()}` : p);
}

export function platformList(ps: Platform[]) {
  return ps.map(platformLabel).join(" · ");
}
