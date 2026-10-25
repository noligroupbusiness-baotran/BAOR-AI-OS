// Dữ liệu MẪU (demo nạp ban đầu) — cùng danh sách ID mà "Xóa dữ liệu mẫu" (src/db/seed.ts clearSampleOnly) dùng.
// Số liệu mẫu không bao giờ được cộng vào số thật: giao diện tách riêng và gắn nhãn "Mẫu" (kiểm toán 26/10/2026).
// Chỉ import từ src/lib/data (không CSDL) để dùng được ở mọi nơi.
import { adCampaigns as seedAds } from "@/lib/data/ads";
import { campaigns as seedCampaigns, channelGoals as seedGoals, linkedRows } from "@/lib/data/campaigns";
import { contentItems as seedContent, scheduledPosts as seedPosts } from "@/lib/data/content";
import { conversations as seedConvs, leads as seedLeads } from "@/lib/data/customers";
import { emailSequences as seedSeqs } from "@/lib/data/email";
import { insights as seedInsights, personas as seedPersonas } from "@/lib/data/insights";
import { competitors as seedCompetitors } from "@/lib/data/competitors";
import { videos as seedVideos } from "@/lib/data/videos";

const ids = (...lists: { id: string }[][]) => new Set(lists.flat().map((x) => x.id));

const SAMPLE = {
  ad: ids(seedAds, linkedRows.ads),
  campaign: ids(seedCampaigns),
  goal: ids(seedGoals),
  content: ids(seedContent, linkedRows.content),
  post: ids(seedPosts, linkedRows.posts),
  lead: ids(seedLeads, linkedRows.leads),
  conversation: ids(seedConvs),
  sequence: ids(seedSeqs),
  insight: ids(seedInsights, linkedRows.insights),
  persona: ids(seedPersonas),
  competitor: ids(seedCompetitors),
  video: ids(seedVideos),
} as const;

export type SampleKind = keyof typeof SAMPLE;

export function isSample(kind: SampleKind, id: string | null | undefined): boolean {
  return !!id && SAMPLE[kind].has(id);
}

/** Tách một danh sách thành phần thật và phần mẫu (để tổng số thật không lẫn số mẫu). */
export function splitSample<T>(kind: SampleKind, items: T[], idOf: (x: T) => string = (x) => (x as { id: string }).id): { real: T[]; sample: T[] } {
  const real: T[] = [];
  const sample: T[] = [];
  for (const x of items) (isSample(kind, idOf(x)) ? sample : real).push(x);
  return { real, sample };
}


/** Bài đăng mẫu: bài mẫu, bài từ nội dung mẫu, hoặc bài của video mẫu (video THẬT quay theo kịch bản mẫu không tính là mẫu). */
export function isSamplePost(p: { id: string; contentId?: string | null; videoId?: string | null }): boolean {
  if (isSample("post", p.id)) return true;
  if (p.videoId) return isSample("video", p.videoId);
  return isSample("content", p.contentId);
}
