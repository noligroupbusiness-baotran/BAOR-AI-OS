// Kiểu dữ liệu và luật thuần cho Second Brain + nghiên cứu (dùng được ở client component và test, không đụng CSDL).

export type KnowledgeStatus = "ACTIVE" | "VERIFIED" | "DRAFT" | "ARCHIVED";

export interface KnowledgePage {
  id: string;
  title: string;
  url: string;
  section: string;
  area: string;
  kind: string;
  status: KnowledgeStatus | string;
  labels: string[];
  sourceGrade: string;
  notionEditedAt: string | null;
  body: string;
  origin: "notion_sync" | "snapshot" | string;
  syncedAt: string;
}

export interface KnowledgeHit {
  page: KnowledgePage;
  snippet: string;
  score: number;
}

/** Thứ tự đọc theo 00 QUẢN TRỊ KIẾN THỨC: ACTIVE → VERIFIED → DRAFT; ARCHIVED không dùng làm nguồn. */
export const statusRank: Record<string, number> = { ACTIVE: 0, VERIFIED: 1, DRAFT: 2, ARCHIVED: 9 };
export const usableStatus = (s: string) => s === "ACTIVE" || s === "VERIFIED";

export const CLASSIFICATIONS = ["FACT", "OWNER_VIEW", "HYPOTHESIS", "OBSERVATION", "BUSINESS_DECISION", "PROCEDURE"] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];

export const classificationLabel: Record<Classification, { label: string; hint: string; tone: "jade" | "sky" | "amber" | "violet" | "neutral" }> = {
  FACT: { label: "Sự thật", hint: "Có bằng chứng", tone: "jade" },
  OWNER_VIEW: { label: "Quan điểm OWNER", hint: "Lời / kinh nghiệm của Trần Thanh Bảo", tone: "violet" },
  HYPOTHESIS: { label: "Giả thuyết", hint: "Cần kiểm chứng", tone: "amber" },
  OBSERVATION: { label: "Quan sát", hint: "Từ dữ liệu thực tế", tone: "sky" },
  BUSINESS_DECISION: { label: "Quyết định", hint: "Đã được OWNER xác nhận", tone: "violet" },
  PROCEDURE: { label: "Quy trình", hint: "Quy trình chính thức", tone: "neutral" },
};

export const SOURCE_TYPES = ["official", "research", "news", "blog", "social", "other"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];
export const sourceTypeLabel: Record<SourceType, string> = { official: "Chính thức", research: "Nghiên cứu", news: "Báo chí", blog: "Blog / chuyên gia", social: "Mạng xã hội", other: "Khác" };

export const PURPOSE_KINDS = ["content", "audience", "verify", "trend", "gap", "result"] as const;
export type PurposeKind = (typeof PURPOSE_KINDS)[number];
export const purposeLabel: Record<PurposeKind, string> = {
  content: "Phục vụ một nội dung",
  audience: "Hiểu một nhóm khán giả",
  verify: "Kiểm chứng một chủ đề",
  trend: "Xu hướng ảnh hưởng thương hiệu",
  gap: "Lấp khoảng trống Second Brain",
  result: "Giải thích một kết quả content",
};

export interface SourceRef {
  id: string;
  grade: string; // A | B | C | D
}

export interface FindingInput {
  statement: string;
  classification: Classification;
  sourceIds: string[];
  knowledgeIds: string[];
}

export interface VerifyResult {
  ok: boolean;
  notes: string[];
}

const hasNumber = (s: string) => /\d/.test(s);

/**
 * Luật kiểm một phát hiện (chỉ thị mục 5.2). Không dùng AI.
 * - FACT cần ≥ 1 nguồn ngoài hạng A/B hoặc trang Second Brain ACTIVE/VERIFIED.
 * - OWNER_VIEW chỉ khi có trang Second Brain mang nhãn [OWNER]; nguồn ngoài không bao giờ là quan điểm OWNER.
 * - BUSINESS_DECISION cần trang trong 03 QUYẾT ĐỊNH OWNER còn hiệu lực.
 * - PROCEDURE cần trang SOP/Skill; chỉ có DRAFT thì ghi rõ là nháp.
 * - Câu có số liệu phải có ít nhất một nguồn.
 */
export function verifyFinding(f: FindingInput, sources: SourceRef[], pages: Pick<KnowledgePage, "id" | "status" | "labels" | "section" | "kind">[]): VerifyResult {
  const notes: string[] = [];
  let ok = true;
  const srcs = sources.filter((s) => f.sourceIds.includes(s.id));
  const kps = pages.filter((p) => f.knowledgeIds.includes(p.id) && p.status !== "ARCHIVED");
  const missingSrc = f.sourceIds.length - srcs.length;
  const missingKp = f.knowledgeIds.length - kps.length;
  if (missingSrc > 0) notes.push(`${missingSrc} nguồn ngoài không tồn tại trong hồ sơ`);
  if (missingKp > 0) notes.push(`${missingKp} trang Second Brain không có trong chỉ mục hoặc đã lưu trữ`);
  const strongSrc = srcs.some((s) => s.grade === "A" || s.grade === "B");
  const usableKp = kps.some((p) => usableStatus(p.status));
  const ownerKp = kps.filter((p) => p.labels.includes("[OWNER]"));

  switch (f.classification) {
    case "FACT":
      if (!strongSrc && !usableKp) {
        ok = false;
        notes.push("Sự thật cần ít nhất 1 nguồn hạng A/B hoặc trang Second Brain ACTIVE/VERIFIED");
      }
      break;
    case "OWNER_VIEW":
      if (ownerKp.length === 0) {
        ok = false;
        notes.push("Quan điểm OWNER phải dẫn về trang Second Brain có nhãn [OWNER]; không gán kiến thức bên ngoài thành quan điểm OWNER");
      } else if (!ownerKp.some((p) => usableStatus(p.status))) {
        notes.push("Trang OWNER đang là DRAFT: dùng được nhưng phải ghi là nháp");
      }
      break;
    case "BUSINESS_DECISION":
      if (!kps.some((p) => p.section.includes("03") && usableStatus(p.status))) {
        ok = false;
        notes.push("Quyết định cần trang trong 03 QUYẾT ĐỊNH OWNER còn hiệu lực (ACTIVE/VERIFIED)");
      }
      break;
    case "PROCEDURE":
      if (kps.length === 0) {
        ok = false;
        notes.push("Quy trình cần dẫn về trang SOP hoặc Skill trong Second Brain");
      } else if (!usableKp) {
        notes.push("Quy trình chỉ có bản DRAFT: phải ghi là nháp");
      }
      break;
    case "OBSERVATION":
      if (srcs.length === 0 && kps.length === 0) notes.push("Quan sát nên kèm dữ liệu hoặc nguồn");
      break;
    case "HYPOTHESIS":
      break;
  }
  if (hasNumber(f.statement) && srcs.length === 0 && kps.length === 0) {
    ok = false;
    notes.push("Câu có số liệu nhưng không có nguồn");
  }
  if (ok && notes.length === 0) notes.push("Đạt");
  return { ok, notes };
}

export interface BriefPoint {
  text: string;
  classification: Classification;
  findingIds: string[];
  knowledgeIds: string[];
  sourceIds: string[];
}

export interface BriefQa {
  ok: boolean;
  issues: string[];
}

/** Kiểm brief: mọi luận điểm qua luật; có ít nhất một nguồn Second Brain và một nguồn ngoài (nghiệm thu CP01). */
export function verifyBrief(points: BriefPoint[], sources: SourceRef[], pages: Pick<KnowledgePage, "id" | "status" | "labels" | "section" | "kind">[], keyMessage: string): BriefQa {
  const issues: string[] = [];
  if (!keyMessage.trim()) issues.push("Chưa có thông điệp chính");
  if (points.length === 0) issues.push("Brief chưa có luận điểm");
  points.forEach((p, i) => {
    const r = verifyFinding({ statement: p.text, classification: p.classification, sourceIds: p.sourceIds, knowledgeIds: p.knowledgeIds }, sources, pages);
    if (!r.ok) issues.push(`Luận điểm ${i + 1}: ${r.notes.join("; ")}`);
  });
  if (!points.some((p) => p.knowledgeIds.length > 0)) issues.push("Không luận điểm nào dùng tri thức Second Brain");
  if (!points.some((p) => p.sourceIds.length > 0)) issues.push("Không luận điểm nào dùng nguồn ngoài");
  return { ok: issues.length === 0, issues };
}

/** Biến chuỗi người dùng gõ thành truy vấn FTS5 an toàn: mỗi từ là một cụm trong ngoặc kép, có tiền tố. */
export function ftsQuery(input: string, mode: "and" | "or" = "and"): string {
  const toks = input
    .normalize("NFC")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 2)
    .slice(0, 12)
    .map((t) => `"${t.replace(/"/g, "")}"*`);
  return toks.join(mode === "and" ? " AND " : " OR ");
}
