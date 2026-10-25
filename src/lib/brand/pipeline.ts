// Dây chuyền thương hiệu cá nhân: Second Brain → Nghiên cứu → Kịch bản → Video → Đăng → Quảng cáo → Đo lường.
// Mỗi chặng chỉ đếm bản ghi thật trong CSDL; bản ghi mẫu (ID nạp ban đầu) được đếm riêng để không lẫn vào kết quả.
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { notionConfigured } from "@/lib/knowledge/sync";
import { aiConfigured } from "@/lib/ai";
import { contentItems as seedContent, scheduledPosts as seedPosts } from "@/lib/data/content";
import { adCampaigns as seedAds } from "@/lib/data/ads";
import { videos as seedVideos } from "@/lib/data/videos";
import { listVideos } from "@/lib/videos/repository";
import { videosAwaitingOwner, videosRenderFailed, videosRendering } from "@/lib/attention";
import { linkedRows } from "@/lib/data/campaigns";

export type StageState = "done" | "working" | "waiting" | "not_started";

export const stageStateLabel: Record<StageState, string> = {
  done: "Đã xong",
  working: "Đang làm",
  waiting: "Đang chờ",
  not_started: "Chưa bắt đầu",
};

export interface StageLine {
  label: string;
  value: number;
}

export interface Stage {
  key: string;
  step: number;
  name: string;
  href: string;
  state: StageState;
  /** Một câu mô tả tình trạng thật của chặng. */
  summary: string;
  lines: StageLine[];
  /** Số bản ghi mẫu đang có ở chặng này (không tính vào lines). */
  sample: number;
}

export interface OwnerAction {
  stage: string;
  text: string;
  href: string;
  /** Việc thuộc 4 điểm dừng của CEO (credential, chi phí, dữ liệu mật, production). */
  ceo?: boolean;
}

export interface BrandPipeline {
  stages: Stage[];
  actions: OwnerAction[];
}

const ids = <T extends { id: string }>(...lists: T[][]) => new Set(lists.flat().map((x) => x.id));

function countBy<T>(rows: T[], key: (r: T) => string): Record<string, number> {
  return rows.reduce<Record<string, number>>((m, r) => ((m[key(r)] = (m[key(r)] ?? 0) + 1), m), {});
}

export function getBrandPipeline(): BrandPipeline {
  const db = getDb();
  const connected = new Set(db.select({ key: schema.integrations.key, connected: schema.integrations.connected }).from(schema.integrations).all().filter((i) => i.connected).map((i) => i.key));
  const actions: OwnerAction[] = [];

  // Second Brain không hiển thị trong app (OWNER 25/10/2026): hệ thống đọc ngầm; chỉ nhắc OWNER cấp token khi chưa tự đồng bộ.
  if (!notionConfigured()) actions.push({ stage: "Second Brain", text: "Cấp token Notion chỉ đọc để hệ thống tự đồng bộ kho tri thức 6 giờ một lần.", href: "/settings#integrations", ceo: true });

  // 1. Nghiên cứu (đơn giản): chủ đề → insight từ nền tảng → hook
  const tasks = db.select({ id: schema.researchTasks.id, question: schema.researchTasks.question }).from(schema.researchTasks).all();
  const findings = db.select({ taskId: schema.researchFindings.taskId }).from(schema.researchFindings).all();
  const hooked = new Set(db.select({ researchId: schema.hookIdeas.researchId }).from(schema.hookIdeas).all().map((h) => h.researchId));
  const withInsight = tasks.filter((t) => findings.some((f) => f.taskId === t.id));
  const noInsight = tasks.filter((t) => !findings.some((f) => f.taskId === t.id));
  const noHook = withInsight.filter((t) => !hooked.has(t.id));
  const ai = aiConfigured();
  const research: Stage = {
    key: "research",
    step: 1,
    name: "Nghiên cứu",
    href: "/insights/research",
    state: tasks.length === 0 ? "not_started" : noHook.length ? "waiting" : noInsight.length ? "working" : "done",
    summary: tasks.length === 0 ? "Chưa có chủ đề." : noHook.length ? `${noHook.length} chủ đề có insight chưa tạo hook.` : noInsight.length ? `${noInsight.length} chủ đề chưa có insight.` : "Mọi chủ đề đã có insight và hook.",
    lines: [
      { label: "Chủ đề", value: tasks.length },
      { label: "Insight", value: findings.length },
      { label: "Chủ đề chưa tạo hook", value: noHook.length },
    ],
    sample: 0,
  };
  for (const t of noHook.slice(0, 2)) actions.push({ stage: "Nghiên cứu", text: `Chủ đề “${t.question.replace(/^Chủ đề: /, "")}” đã có insight — tạo 10 hook.`, href: `/insights/research/${t.id}` });
  if (!ai) actions.push({ stage: "Nghiên cứu", text: "Cấp Claude API key nếu muốn AI Nghiên cứu phân tích bình luận và tìm kiến thức trên mạng (phát sinh chi phí theo lượt). Hiện phân tích theo luật.", href: "/settings#integrations", ceo: true });

  // 3. Kịch bản / nội dung
  const sampleContent = ids(seedContent, linkedRows.content);
  const content = db.select({ id: schema.contentItems.id, status: schema.contentItems.status }).from(schema.contentItems).all();
  const realContent = content.filter((c) => !sampleContent.has(c.id));
  const cs = countBy(realContent, (c) => c.status);
  const script: Stage = {
    key: "content",
    step: 2,
    name: "Kịch bản",
    href: "/content?tab=mine",
    state: realContent.length === 0 ? "not_started" : cs.review ? "waiting" : cs.in_progress ? "working" : "done",
    summary: realContent.length === 0 ? "Chưa có kịch bản thật." : cs.review ? `${cs.review} nội dung chờ anh duyệt.` : cs.in_progress ? `${cs.in_progress} kịch bản đang viết.` : "Không có kịch bản tồn.",
    lines: [
      { label: "Đang viết", value: cs.in_progress ?? 0 },
      { label: "Chờ duyệt", value: cs.review ?? 0 },
      { label: "Đã duyệt, chờ ghi hình", value: cs.approved ?? 0 },
    ],
    sample: content.length - realContent.length,
  };
  if (cs.review) actions.push({ stage: "Kịch bản", text: `Duyệt ${cs.review} nội dung đang chờ. Kịch bản chỉ được ghi hình sau khi anh duyệt.`, href: "/content?tab=mine" });
  if (cs.in_progress) actions.push({ stage: "Kịch bản", text: `Hoàn thiện ${cs.in_progress} kịch bản đang viết: chèn câu chuyện thật của anh vào chỗ đánh dấu, hệ thống không tự viết thay.`, href: "/content?tab=mine" });

  // 4. Ghi hình & dựng video
  const sampleVideos = ids(seedVideos);
  // Cùng định nghĩa với badge Video Studio và Việc cần làm (src/lib/attention.ts): chờ duyệt = video thật CÓ tệp ở Chờ kiểm tra /
  // Chờ phê duyệt; đang dựng = có bản dựng đang chạy / chờ dựng / chờ chọn khung (video "editing" có bản lỗi KHÔNG tính là đang dựng).
  const allVideos = listVideos();
  const videos = allVideos.map((v) => ({ id: v.id, status: v.status }));
  const realVideos = videos.filter((v) => !sampleVideos.has(v.id));
  const vs = countBy(realVideos, (v) => v.status);
  const toReview = videosAwaitingOwner(allVideos).length;
  const working = videosRendering(allVideos).length + (vs.needs_changes ?? 0);
  // Dựng lỗi / đã dừng thật: video thật "editing" có bản dựng mới nhất ở trạng thái lỗi (video chưa có job / tệp không tính)
  const renderFailed = videosRenderFailed(allVideos).length;
  const video: Stage = {
    key: "video",
    step: 3,
    name: "Video",
    href: "/video-studio",
    state: realVideos.length === 0 ? "not_started" : toReview ? "waiting" : working ? "working" : renderFailed > 0 ? "waiting" : "done",
    summary: realVideos.length === 0 ? "Chưa có video thật trong Video Studio. Bộ dựng tự động đang được anh chỉnh." : toReview ? `${toReview} video chờ anh xem và duyệt.` : working ? "Đang dựng hoặc sửa video." : renderFailed > 0 ? `${renderFailed} video dựng lỗi / đã dừng — mở Video Studio để dựng lại.` : "Không có video tồn.",
    lines: [
      { label: "Đang dựng / sửa", value: working },
      { label: "Chờ duyệt", value: toReview },
      { label: "Đã duyệt", value: vs.approved ?? 0 },
    ],
    sample: videos.length - realVideos.length,
  };
  if (toReview) actions.push({ stage: "Video", text: `Xem và duyệt ${toReview} video. Video chưa duyệt sẽ không được đăng.`, href: "/video-studio" });

  // 5. Đăng bài
  const samplePosts = ids(seedPosts, linkedRows.posts);
  const posts = db.select({ id: schema.scheduledPosts.id, status: schema.scheduledPosts.status }).from(schema.scheduledPosts).all();
  const realPosts = posts.filter((p) => !samplePosts.has(p.id));
  const ps = countBy(realPosts, (p) => p.status);
  const publishPlatforms = ["facebook_page", "instagram", "tiktok", "youtube", "zalo_oa"].filter((k) => connected.has(k));
  const publish: Stage = {
    key: "publish",
    step: 4,
    name: "Đăng bài",
    href: "/publishing",
    state: publishPlatforms.length === 0 ? "waiting" : ps.failed ? "waiting" : ps.scheduled ? "working" : realPosts.length ? "done" : "not_started",
    summary: publishPlatforms.length === 0 ? "Chưa kết nối nền tảng đăng nào; chỉ ghi nhận PUBLISHED khi có bằng chứng đăng thành công." : ps.failed ? `${ps.failed} bài đăng lỗi.` : `${publishPlatforms.length} nền tảng đã kết nối.`,
    lines: [
      { label: "Đã lên lịch", value: ps.scheduled ?? 0 },
      { label: "Đã đăng (có bằng chứng)", value: ps.published ?? 0 },
      { label: "Lỗi", value: ps.failed ?? 0 },
    ],
    sample: posts.length - realPosts.length,
  };
  if (publishPlatforms.length === 0) actions.push({ stage: "Đăng bài", text: "Kết nối Fanpage, TikTok hoặc YouTube (cấp quyền tài khoản thật) khi sẵn sàng đăng.", href: "/settings#integrations", ceo: true });

  // 6. Quảng cáo
  const sampleAds = ids(seedAds, linkedRows.ads);
  const ads = db.select({ id: schema.adCampaigns.id, status: schema.adCampaigns.status }).from(schema.adCampaigns).all();
  const realAds = ads.filter((a) => !sampleAds.has(a.id));
  const as = countBy(realAds, (a) => a.status);
  const metaAds = connected.has("meta_ads");
  const adStage: Stage = {
    key: "ads",
    step: 5,
    name: "Quảng cáo",
    href: "/ads",
    state: !metaAds ? "waiting" : as.pending_approval ? "waiting" : as.active ? "working" : "not_started",
    summary: !metaAds ? "Chưa kết nối tài khoản quảng cáo Meta; không có chi tiêu thật." : as.pending_approval ? `${as.pending_approval} quảng cáo chờ duyệt ngân sách.` : `${as.active ?? 0} quảng cáo đang chạy.`,
    lines: [
      { label: "Chờ duyệt ngân sách", value: as.pending_approval ?? 0 },
      { label: "Đang chạy", value: as.active ?? 0 },
      { label: "Tạm dừng", value: as.paused ?? 0 },
    ],
    sample: ads.length - realAds.length,
  };
  if (!metaAds) actions.push({ stage: "Quảng cáo", text: "Kết nối Meta Ads và chốt hạn mức ngân sách tháng trước khi chạy quảng cáo (phát sinh chi phí).", href: "/settings#integrations", ceo: true });
  if (as.pending_approval) actions.push({ stage: "Quảng cáo", text: `Duyệt ngân sách cho ${as.pending_approval} quảng cáo.`, href: "/ads" });

  // 7. Đo lường & học
  const measuredPosts = db.select({ id: schema.scheduledPosts.id, reach: schema.scheduledPosts.reach, views: schema.scheduledPosts.views }).from(schema.scheduledPosts).all().filter((p) => !samplePosts.has(p.id) && (p.reach != null || p.views != null)).length;
  const waitingProposals = db.select({ id: schema.improvementProposals.id }).from(schema.improvementProposals).where(eq(schema.improvementProposals.status, "proposed")).all().length;
  if (waitingProposals) actions.push({ stage: "Đo lường", text: `Xem ${waitingProposals} đề xuất cải tiến (giả thuyết từ số liệu thật): chấp nhận hoặc bỏ qua.`, href: "/insights/learning" });
  const measure: Stage = {
    key: "measure",
    step: 6,
    name: "Đo lường",
    href: waitingProposals ? "/insights/learning" : "/reports",
    state: waitingProposals ? "waiting" : measuredPosts ? "working" : "not_started",
    summary: measuredPosts ? `${measuredPosts} bài thật đã có số liệu.` : "Chưa có số liệu thật; báo cáo hiện ghi rõ phần dữ liệu mẫu.",
    lines: [
      { label: "Bài thật có số liệu", value: measuredPosts },
      { label: "Đề xuất cải tiến chờ OWNER", value: waitingProposals },
    ],
    sample: posts.length - realPosts.length,
  };

  return { stages: [research, script, video, publish, adStage, measure], actions };
}
