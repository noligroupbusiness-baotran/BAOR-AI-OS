// Số liệu cho trang Hành trình (8 thẻ bước): mỗi bước một con số chính + một dòng trạng thái + nút bấm.
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { JOURNEY, type JourneyStep } from "@/config/journey";
import { listTopics } from "@/lib/research/topic";
import { libraryRows } from "@/lib/videos/library";
import { getBrandPipeline, type StageState } from "./pipeline";

export interface JourneyCard extends JourneyStep {
  value: number;
  unit: string;
  note: string;
  state: StageState;
  go: string; // nút chính dẫn tới đâu
}

export function journeyCards(): JourneyCard[] {
  const db = getDb();
  const p = getBrandPipeline();
  const stage = (k: string) => p.stages.find((s) => s.key === k);
  const topics = listTopics();
  const insights = topics.reduce((n, t) => n + t.insights, 0);
  const noInsight = topics.find((t) => t.insights === 0);
  const hooksNew = db.select({ id: schema.hookIdeas.id }).from(schema.hookIdeas).where(eq(schema.hookIdeas.status, "new")).all().length;
  const scripts = db.select({ id: schema.contentItems.id }).from(schema.contentItems).where(and(eq(schema.contentItems.format, "script"), inArray(schema.contentItems.status, ["in_progress", "review"]))).all().length;
  const lib = libraryRows();
  const unposted = lib.filter((r) => r.state === "unposted").length;
  const vid = stage("video");
  const pub = stage("publish");
  const ads = stage("ads");
  const measure = stage("measure");
  const proposals = db.select({ id: schema.improvementProposals.id }).from(schema.improvementProposals).where(eq(schema.improvementProposals.status, "proposed")).all().length;
  const line = (s: ReturnType<typeof stage>, i: number) => s?.lines[i]?.value ?? 0;
  const data: Record<number, Omit<JourneyCard, keyof JourneyStep>> = {
    1: { value: topics.length, unit: "chủ đề", note: topics.length ? "Thêm chủ đề mới bất cứ lúc nào" : "Bắt đầu từ đây", state: topics.length ? "done" : "not_started", go: "/insights/research" },
    2: { value: insights, unit: "insight", note: noInsight ? `“${noInsight.topic.slice(0, 40)}” chưa có insight` : topics.length ? "Mọi chủ đề đã có insight" : "Cần chủ đề trước", state: noInsight ? "waiting" : insights ? "done" : "not_started", go: noInsight ? `/insights/research/${noInsight.id}` : "/insights/research" },
    3: { value: hooksNew, unit: "hook chờ chọn", note: scripts ? `${scripts} kịch bản đang viết / chờ duyệt` : "Chọn hook để thành kịch bản", state: hooksNew || scripts ? "working" : "not_started", go: "/content/hooks" },
    4: { value: line(vid, 0) + line(vid, 1), unit: "video đang dựng / chờ duyệt", note: vid?.summary ?? "", state: vid?.state ?? "not_started", go: "/video-studio" },
    5: { value: unposted, unit: "video chưa đăng", note: `${lib.length} video trong kho`, state: unposted ? "waiting" : lib.length ? "done" : "not_started", go: "/video-library" },
    6: { value: line(pub, 0), unit: "bài chờ đăng", note: pub?.summary ?? "", state: pub?.state ?? "not_started", go: "/publishing" },
    7: { value: line(ads, 1), unit: "quảng cáo đang chạy", note: ads?.summary ?? "", state: ads?.state ?? "not_started", go: "/ads" },
    8: { value: proposals, unit: "đề xuất chờ xem", note: measure?.summary ?? "", state: proposals ? "waiting" : measure?.state ?? "not_started", go: "/insights/learning" },
  };
  return JOURNEY.map((s) => ({ ...s, ...data[s.n] }));
}
