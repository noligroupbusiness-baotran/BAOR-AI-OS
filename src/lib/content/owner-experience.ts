// Gợi ý chuyện thật của OWNER từ Second Brain cho vlog chia sẻ (đọc CSDL, không AI). Luật xếp hạng thuần ở ./experience.ts › rankExperience:
// Case Study / phát hiện OWNER_VIEW → trang [OWNER] → N1 Đào tạo / N2 Bán hàng; trong cùng hạng ACTIVE > VERIFIED > DRAFT (DRAFT hiện "nháp").
// Không gì được dùng cho tới khi OWNER tích "Dùng chuyện này".
import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getKnowledgePages, searchKnowledge } from "@/lib/knowledge";
import { CONTENT_SKILL, experienceTier, rankExperience, type ExperienceCandidate, type ExperienceRef, type ExperienceSuggestion } from "./experience";

export function experienceCandidates(query: string, opts: { researchId?: string | null } = {}): ExperienceCandidate[] {
  const hits = query.trim() ? searchKnowledge(query, { limit: 60, anyWord: true }) : [];
  const out: ExperienceCandidate[] = hits.map((h) => ({
    kind: "knowledge",
    id: h.page.id,
    title: h.page.title,
    labels: h.page.labels,
    pageKind: h.page.kind,
    area: h.page.area,
    section: h.page.section,
    status: h.page.status,
    text: h.page.body,
    score: h.score,
  }));
  // Phát hiện "Quan điểm OWNER" đã duyệt (đề xuất AI chờ duyệt không dùng)
  const findings = getDb()
    .select()
    .from(schema.researchFindings)
    .where(and(eq(schema.researchFindings.classification, "OWNER_VIEW"), eq(schema.researchFindings.reviewStatus, "approved")))
    // Mới nhất trước (bảng không có cột thời gian: thứ tự ghi = rowid)
    .orderBy(sql`rowid DESC`)
    .limit(50)
    .all();
  for (const f of findings) {
    out.push({
      kind: "finding",
      id: f.id,
      title: f.statement.slice(0, 140),
      labels: [],
      pageKind: "OWNER_VIEW",
      area: "",
      section: "",
      status: f.verifyOk ? "VERIFIED" : "DRAFT",
      text: `${f.statement}\n${f.application}`,
      sameTopic: !!opts.researchId && f.taskId === opts.researchId,
    });
  }
  return out;
}

/** Tối đa `limit` gợi ý chuyện thật cho hook / chủ đề. */
export function experienceSuggestions(query: string, opts: { researchId?: string | null; limit?: number } = {}): ExperienceSuggestion[] {
  return rankExperience(experienceCandidates(query, opts), query, opts.limit ?? 3);
}

export interface ExperienceSource {
  ref: ExperienceRef;
  title: string;
  status: string;
  body: string;
}

/**
 * Nội dung các trang / phát hiện OWNER đã tích (đưa cho AI). CHỈ tư liệu kinh nghiệm OWNER còn sống: trang phải còn trong chỉ mục, không
 * ARCHIVED, đúng hạng experienceTier (không trang [NGHIÊN CỨU] / Skill, kể cả khi bị sửa tay vào khối); phát hiện phải là OWNER_VIEW đã duyệt.
 */
export function experienceSources(refs: ExperienceRef[]): ExperienceSource[] {
  const pages = new Map(getKnowledgePages(refs.filter((r) => r.kind === "knowledge").map((r) => r.id)).map((p) => [p.id, p]));
  const fIds = refs.filter((r) => r.kind === "finding").map((r) => r.id);
  const db = getDb();
  const out: ExperienceSource[] = [];
  for (const r of refs) {
    if (r.kind === "knowledge") {
      const p = pages.get(r.id.replace(/-/g, "").toLowerCase());
      if (p && experienceTier({ kind: "knowledge", title: p.title, labels: p.labels, pageKind: p.kind, area: p.area, section: p.section, status: p.status }))
        out.push({ ref: r, title: p.title, status: p.status, body: p.body });
    } else if (fIds.includes(r.id)) {
      const f = db.select().from(schema.researchFindings).where(eq(schema.researchFindings.id, r.id)).get();
      if (f && f.classification === "OWNER_VIEW" && f.reviewStatus === "approved") out.push({ ref: r, title: f.statement.slice(0, 140), status: f.verifyOk ? "VERIFIED" : "DRAFT", body: `${f.statement}\n${f.application}` });
    }
  }
  return out;
}

/** Trang skill viết content của OWNER (SK-KNW-01) trong chỉ mục: tiêu đề, link Notion, trạng thái, nội dung đã đồng bộ. */
export function contentSkillPage(): { title: string; url: string; status: string; body: string } | null {
  const p = getKnowledgePages([CONTENT_SKILL.knowledgeId])[0];
  return p && p.status !== "ARCHIVED" ? { title: p.title, url: p.url, status: p.status, body: p.body } : null;
}
