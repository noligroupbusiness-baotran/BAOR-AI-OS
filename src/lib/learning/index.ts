// CP06: PUBLISHED CONTENT → METRICS → ANALYSIS → IMPROVEMENT → SECOND BRAIN / SKILL.
// Gom số liệu THẬT (bài đã đăng và xác minh, video thật, quảng cáo thật — bỏ dữ liệu mẫu), phân tích theo luật ở analyze.ts,
// lưu đề xuất (giả thuyết) chờ OWNER quyết. Không ghi Second Brain, không sửa Skill: chỉ xuất bản nháp cho hộp chờ duyệt.
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getSetting } from "@/lib/admin";
import { logActivity } from "@/lib/activity";
import { isSampleAd } from "@/lib/ads/authorization";
import { videos as seedVideos } from "@/lib/data/videos";
import { jobVersions, readReport } from "@/lib/video/jobs";
import { adProposals, contentProposals, feedbackPatterns, knowledgeProposals, topicPerformance, videoQaPatterns, type PostRow, type ProposalDraft, type QaReport } from "./analyze";

const SAMPLE_VIDEOS = new Set(seedVideos.map((v) => v.id));
const nowIso = () => new Date().toISOString();
const arr = (s: string): string[] => {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
};

export function gatherPosts(): PostRow[] {
  const db = getDb();
  const posts = db.select().from(schema.scheduledPosts).where(and(eq(schema.scheduledPosts.status, "published"), eq(schema.scheduledPosts.mode, "live"), isNotNull(schema.scheduledPosts.verifiedAt))).all();
  const briefs = db.select({ contentId: schema.contentBriefs.contentId, topic: schema.contentBriefs.topic }).from(schema.contentBriefs).all();
  const contents = new Map(db.select().from(schema.contentItems).all().map((c) => [c.id, c]));
  return posts.map((p) => {
    const brief = briefs.find((b) => b.contentId && b.contentId === p.contentId);
    const c = contents.get(p.contentId);
    return { id: p.id, title: p.title, topic: brief?.topic ?? c?.pillar ?? p.title, platform: p.platform, views: p.views, reach: p.reach, engagement: p.engagement };
  });
}

export function gatherReports(): QaReport[] {
  const out: QaReport[] = [];
  for (const v of getDb().select({ id: schema.videos.id }).from(schema.videos).all()) {
    if (SAMPLE_VIDEOS.has(v.id)) continue;
    for (const n of jobVersions(v.id)) {
      const r = readReport(v.id, n);
      if (r) out.push({ videoId: v.id, version: n, qa: r.qa, blockers: r.blockers });
    }
  }
  return out;
}

export function analyzeAll(): { proposals: ProposalDraft[]; facts: { posts: number; reports: number; feedback: number; ads: number; briefs: number } } {
  const db = getDb();
  const posts = gatherPosts();
  const reports = gatherReports();
  const feedback = db.select().from(schema.videoFeedback).where(eq(schema.videoFeedback.kind, "request_changes")).all().filter((f) => !SAMPLE_VIDEOS.has(f.videoId));
  const ads = db.select().from(schema.adCampaigns).all().filter((a) => !isSampleAd(a.id));
  const briefs = db.select().from(schema.contentBriefs).all();
  const pageStatus = new Map(db.select({ id: schema.knowledgeIndex.id, title: schema.knowledgeIndex.title, status: schema.knowledgeIndex.status }).from(schema.knowledgeIndex).all().map((p) => [p.id, p]));
  const draftUse = new Map<string, { pageId: string; title: string; uses: number }>();
  for (const b of briefs.filter((x) => x.contentId)) {
    let points: { knowledgeIds?: string[] }[] = [];
    try {
      points = JSON.parse(b.points);
    } catch {}
    for (const id of new Set(points.flatMap((p) => p.knowledgeIds ?? []))) {
      const pg = pageStatus.get(id);
      if (pg?.status !== "DRAFT") continue;
      const e = draftUse.get(id) ?? { pageId: id, title: pg.title, uses: 0 };
      e.uses++;
      draftUse.set(id, e);
    }
  }
  const cplTarget = Number(getSetting("ads.autoPauseCplAbove") ?? 60000);
  const proposals = [
    ...contentProposals(topicPerformance(posts)),
    ...videoQaPatterns(reports),
    ...feedbackPatterns(feedback.map((f) => ({ videoId: f.videoId, note: f.note }))),
    ...adProposals(ads, cplTarget),
    ...knowledgeProposals(briefs.flatMap((b) => arr(b.gaps).map((gap) => ({ briefId: b.id, gap }))), [...draftUse.values()]),
  ];
  return { proposals, facts: { posts: posts.length, reports: reports.length, feedback: feedback.length, ads: ads.length, briefs: briefs.length } };
}

/** Chạy phân tích và lưu đề xuất. Cùng khoá thì cập nhật căn cứ; đề xuất OWNER đã quyết giữ nguyên quyết định. */
export function refreshProposals(): { created: number; updated: number } {
  const db = getDb();
  const { proposals } = analyzeAll();
  let created = 0;
  let updated = 0;
  for (const p of proposals) {
    const old = db.select().from(schema.improvementProposals).where(eq(schema.improvementProposals.key, p.key)).get();
    const row = { target: p.target, title: p.title, detail: p.detail, evidence: JSON.stringify(p.evidence), sampleSize: p.sampleSize, confidence: p.confidence, updatedAt: nowIso() };
    if (old) {
      db.update(schema.improvementProposals).set(row).where(eq(schema.improvementProposals.id, old.id)).run();
      updated++;
    } else {
      db.insert(schema.improvementProposals).values({ id: `ip_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`, key: p.key, ...row, status: "proposed", createdAt: nowIso() }).run();
      created++;
    }
  }
  if (created) logActivity("system", `Phân tích kết quả: ${created} đề xuất cải tiến mới chờ OWNER xem.`, "research");
  return { created, updated };
}

export function listProposals() {
  return getDb()
    .select()
    .from(schema.improvementProposals)
    .orderBy(desc(schema.improvementProposals.updatedAt))
    .all()
    .map((p) => ({ ...p, evidence: arr(p.evidence) }));
}

export function decideProposal(id: string, decision: "accepted" | "rejected", by: string, note: string): boolean {
  const db = getDb();
  const p = db.select().from(schema.improvementProposals).where(eq(schema.improvementProposals.id, id)).get();
  if (!p || (p.status !== "proposed" && p.status !== "accepted")) return false;
  db.update(schema.improvementProposals).set({ status: decision, decidedBy: by, decidedAt: nowIso(), note: note.slice(0, 500), updatedAt: nowIso() }).where(eq(schema.improvementProposals.id, id)).run();
  logActivity("human", `${by} ${decision === "accepted" ? "chấp nhận" : "bỏ qua"} đề xuất “${p.title}”.`, "research");
  return true;
}

/**
 * Bản nháp cho "07 HỘP CHỜ DUYỆT" của Second Brain (Markdown). Chỉ gồm đề xuất OWNER đã chấp nhận, ghi rõ là DRAFT,
 * kèm căn cứ. App chưa có quyền ghi Notion: OWNER (hoặc phiên Claude được cấp quyền) dán vào hộp chờ duyệt.
 */
export function secondBrainDraft(): string {
  const items = listProposals().filter((p) => p.status === "accepted" && (p.target === "second_brain" || p.target === "video_skill" || p.target === "content"));
  if (!items.length) return "";
  const lines = [`# Đề xuất từ BAOR AI OS — ${new Date().toISOString().slice(0, 10)}`, "", "Trạng thái: DRAFT · Nhãn: [AI SUY LUẬN] · Nguồn: số liệu đã xác minh trong hệ thống. OWNER duyệt trước khi chuyển vào kho chính.", ""];
  for (const p of items) {
    lines.push(`## ${p.title}`, `Đích: ${p.target === "second_brain" ? "Second Brain" : p.target === "video_skill" ? "Skill Edit video Vlog" : "Kế hoạch nội dung"} · Độ tin cậy: ${p.confidence} · Cỡ mẫu: ${p.sampleSize}`, "", p.detail, "", "Căn cứ:", ...p.evidence.map((e) => `- ${e}`), ...(p.note ? ["", `Ghi chú OWNER: ${p.note}`] : []), "");
  }
  return lines.join("\n");
}

export function markExported(by: string): number {
  const db = getDb();
  const items = listProposals().filter((p) => p.status === "accepted");
  for (const p of items) db.update(schema.improvementProposals).set({ status: "exported", updatedAt: nowIso(), decidedBy: p.decidedBy ?? by }).where(eq(schema.improvementProposals.id, p.id)).run();
  return items.length;
}
