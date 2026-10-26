// Chấm điểm ưu tiên 0–100 (OWNER 26/10: "không có đánh giá ưu tiên bài nào hay dở"). Hàm THUẦN, theo luật, không gọi AI, không đọc CSDL:
// mỗi điểm là tổng các phần có trần, kèm lý do ngắn để hiện khi rê / bấm vào ô điểm. Dữ liệu đầu vào do src/lib/content/priority.ts gom.
//
// Insight  = nỗi đau 25 + nhu cầu (số bình luận / nguồn) 25 + nguồn (lời khách Việt > nguồn VN > nước ngoài) 15 + độ mới 10
//            + khớp kiến thức thương hiệu 15 + độ tin cậy 10; chưa đạt kiểm căn cứ: −15.
// Hook     = rõ ràng / độ dài 25 + tò mò / cụ thể 25 + bám insight mạnh 20 + vừa 60 giây 15 + góc mới (so với bài đã làm) 15;
//            mỗi lỗi luật nền tảng: −30; chuyện riêng ("mình từng…") không có căn cứ OWNER: −10 (không thưởng ngôi thứ nhất).
// Chủ đề   = tiềm năng (insight / hook tốt nhất) 60 + nhu cầu (số insight dùng được) 20 + độ mới 20; đã có kịch bản, hết hook chờ: −15.

export interface ScorePart {
  key: string;
  points: number;
  max: number;
  reason: string; // nhãn ngắn ≤ ~6 chữ
}

export interface Scored {
  score: number;
  parts: ScorePart[];
  /** Tối đa 3 lý do chính (cảnh báo trừ điểm đứng đầu). */
  reasons: string[];
}

const nfc = (s: string) => s.normalize("NFC").toLowerCase();
const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const DAY = 86_400_000;

/** Tên chủ đề chuẩn hoá để nhận trùng: NFC, thường, bỏ tiền tố "Chủ đề:", bỏ ký tự lạ, gộp khoảng trắng — GIỮ dấu ("học bơi" ≠ "học bói"). */
export function normalizeTopic(s: string): string {
  return s
    .normalize("NFC")
    .replace(/^\s*chủ đề\s*:\s*/iu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Bỏ dấu (chỉ dùng khi người gõ KHÔNG có dấu: "ban hang" → khớp "bán hàng"). */
export function foldTopic(normalized: string): string {
  return normalized.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").normalize("NFC");
}

/**
 * Tra chủ đề theo tên: trùng khít sau chuẩn hoá (giữ dấu); tên gõ không dấu thì so không dấu. Thứ tự `rows` = ưu tiên (mới nhất trước).
 * Có dấu mà khác dấu ("Bàn hàng" vs "Bán hàng") là hai chủ đề khác nhau.
 */
export function topicIndex(rows: { id: string; name: string }[]): (input: string) => string | null {
  const exact = new Map<string, string>();
  const folded = new Map<string, string>();
  for (const r of rows) {
    const n = normalizeTopic(r.name);
    if (!n) continue;
    if (!exact.has(n)) exact.set(n, r.id);
    if (!folded.has(foldTopic(n))) folded.set(foldTopic(n), r.id);
  }
  return (input) => {
    const n = normalizeTopic(input);
    if (!n) return null;
    return exact.get(n) ?? (foldTopic(n) === n ? (folded.get(n) ?? null) : null);
  };
}

/** Âm tiết (tiếng Việt tách bằng khoảng trắng) — chỉ chữ / số. */
export function syllables(s: string): string[] {
  return nfc(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

const STOP = new Set(
  "là và của có không một những các cho với được này đó thì mà để người bạn mình em anh chị tôi ở trong khi cũng đã đang sẽ ra vào lại rồi nhé ạ ơi nhưng như nào gì bị về từ hay hơn rất quá lắm đây kia ấy nó họ ta vì nên nếu theo đến tới trên dưới sau trước cùng việc bài video bình luận ví dụ ai còn thế sao làm".split(" "),
);

/** Cặp âm tiết liền nhau, bỏ cặp có từ dừng — "bom hàng", "khách mới"… dùng để so khớp ý (trùng / kiến thức). */
export function keyBigrams(s: string): Set<string> {
  const w = syllables(s);
  const out = new Set<string>();
  for (let i = 0; i + 1 < w.length; i++) if (!STOP.has(w[i]) && !STOP.has(w[i + 1]) && !/^\d+$/.test(w[i])) out.add(`${w[i]} ${w[i + 1]}`);
  return out;
}

/** Tập âm tiết không phải từ dừng — tính MỘT lần cho mỗi bài đã làm rồi so với mọi hook. */
export function syllableSet(s: string): Set<string> {
  return new Set(syllables(s).filter((w) => !STOP.has(w)));
}

/** Độ giống hai câu (Jaccard trên âm tiết không phải từ dừng), 0–1. Nhận chuỗi hoặc tập đã tính sẵn. */
export function similarity(a: string | ReadonlySet<string>, b: string | ReadonlySet<string>): number {
  const A = typeof a === "string" ? syllableSet(a) : a;
  const B = typeof b === "string" ? syllableSet(b) : b;
  if (!A.size || !B.size) return 0;
  let both = 0;
  for (const w of A) if (B.has(w)) both++;
  return both / (A.size + B.size - both);
}

/** "3/5 bình luận" hoặc "(4/120 bình luận)" trong câu insight → số bình luận ủng hộ / tổng. */
export function parseSupport(statement: string): { n: number; total: number } | null {
  const m = statement.match(/(\d+)\s*\/\s*(\d+)\s*bình luận/u);
  return m ? { n: Number(m[1]), total: Number(m[2]) } : null;
}

const pickReasons = (parts: ScorePart[], penalties: string[]): string[] =>
  [...penalties, ...parts.filter((p) => p.points > 0 && p.reason).sort((a, b) => b.points - a.points || b.points / b.max - a.points / a.max).map((p) => p.reason)].slice(0, 3);

const total = (parts: ScorePart[], minus: number) => Math.round(clamp(parts.reduce((n, p) => n + p.points, 0) - minus));

const ageDays = (iso: string | null | undefined, now: Date) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? Math.max(0, Math.floor((now.getTime() - t) / DAY)) : null;
};

// ---------------------------------------------------------------- Insight

const PAIN = /(?<![\p{L}])(sợ|ngại|lo lắng|lo|áp lực|mệt|chán|bực|tức|ức chế|khổ|thất bại|thua lỗ|lỗ|mất tiền|tốn|bom hàng|bom|từ chối|cúp máy|khó|không biết|chưa biết|không ra đơn|ế|chê|đắt|rủi ro|đau đầu|hoang mang|bế tắc|than|thờ ơ|hời hợt|chưa có kinh nghiệm)(?![\p{L}])/giu;
const QUESTION = /\?|(?<![\p{L}])(làm sao|làm thế nào|có nên|tại sao|vì sao|bắt đầu từ đâu|cách nào|ai biết)(?![\p{L}])/iu;
const DESIRE = /(?<![\p{L}])(muốn|mong|cần|ước|xin)(?![\p{L}])/iu;

export interface InsightSignals {
  statement: string;
  application?: string;
  /** Loại nguồn đầu tiên: social | official | research | news | blog | other; trống = không có nguồn ngoài. */
  sourceType?: string;
  url?: string;
  grade?: string;
  /** Ngày đăng (nếu nguồn ghi) hoặc ngày đọc nguồn. */
  date?: string | null;
  sourceCount?: number;
  confidence?: string;
  verifyOk: boolean;
  /** Đã có trang Second Brain đi kèm (knowledgeIds) hoặc tri thức OWNER. */
  linkedKnowledge?: boolean;
  /** Số cặp từ khoá của insight có trong kiến thức thương hiệu ACTIVE / VERIFIED. */
  knowledgeHits?: number;
  now?: Date;
}

const isVn = (url = "") => /^https?:\/\/(?:[^/]+\.)?[^/]+\.vn(?:[/:?#]|$)/i.test(url);

export function scoreInsight(s: InsightSignals): Scored {
  const now = s.now ?? new Date();
  // Insight theo luật "N/M bình luận nói về khó khăn / nỗi lo" đã là nỗi đau; bỏ cụm mẫu đó khi tìm từ khoá để lý do là chữ của khách
  const ruleHint = /khó khăn \/ nỗi lo/u.test(s.statement);
  const st = nfc(s.statement).replace(/khó khăn \/ nỗi lo/gu, " ");
  const pains = [...new Set([...st.matchAll(PAIN)].map((m) => m[1]))].sort((a, b) => b.length - a.length);
  const q = QUESTION.test(s.statement);
  const painPts = Math.min(25, Math.min(18, pains.length * 7 + (ruleHint ? 7 : 0)) + (q ? 5 : 0) + (DESIRE.test(s.statement) ? 3 : 0));
  const painReason = pains.length ? `Nỗi đau rõ: “${pains.slice(0, 2).join("”, “")}”` : q ? "Câu hỏi khách hay hỏi" : "";

  const sup = parseSupport(s.statement);
  const social = s.sourceType === "social";
  const many = (s.sourceCount ?? 0) >= 2;
  const demandPts = Math.min(25, (sup ? Math.min(22, 4 + sup.n * 3) : social ? 8 : s.sourceType ? 5 : 3) + (many ? 3 : 0));
  const demandReason = sup ? `${sup.n} bình luận nhắc tới` : many ? `${s.sourceCount} nguồn cùng nói` : social ? "Lời một khách thật" : "";

  const owner = s.linkedKnowledge && !s.sourceType;
  // Nghiên cứu web đánh dấu phát hiện chỉ dựa trên nguồn nước ngoài bằng tiền tố "[Nước ngoài]" (src/lib/research/index.ts)
  const foreign = /^\s*\[nước ngoài\]/iu.test(s.statement);
  const [srcPts, srcReason] = foreign ? [5, "Nguồn nước ngoài"] : social ? [15, "Lời khách Việt"] : isVn(s.url) ? [12, "Nguồn Việt Nam"] : s.sourceType ? [s.grade === "A" || s.grade === "B" ? 7 : 5, "Nguồn nước ngoài"] : owner ? [8, "Tri thức OWNER"] : [2, ""];

  const age = ageDays(s.date, now);
  const recPts = age === null ? 4 : age <= 30 ? 10 : age <= 90 ? 7 : age <= 365 ? 4 : 1;
  const recReason = age !== null && age <= 30 ? "Mới thu thập" : age !== null && age > 365 ? "Dữ liệu cũ" : "";

  const hits = s.knowledgeHits ?? 0;
  const fitPts = s.linkedKnowledge ? 15 : Math.min(15, hits * 3);
  const fitReason = fitPts >= 12 ? "Khớp kiến thức thương hiệu" : fitPts >= 6 ? "Gần kiến thức thương hiệu" : "";

  const conf = s.confidence === "high" ? 10 : s.confidence === "medium" ? 7 : 4;
  const parts: ScorePart[] = [
    { key: "pain", points: painPts, max: 25, reason: painReason },
    { key: "demand", points: demandPts, max: 25, reason: demandReason },
    { key: "source", points: srcPts, max: 15, reason: srcReason },
    { key: "recency", points: recPts, max: 10, reason: recReason },
    { key: "fit", points: fitPts, max: 15, reason: fitReason },
    { key: "confidence", points: conf, max: 10, reason: conf >= 10 ? "Độ tin cậy cao" : "" },
  ];
  const penalties = s.verifyOk ? [] : ["Chưa đủ căn cứ"];
  return { score: total(parts, s.verifyOk ? 0 : 15), parts, reasons: pickReasons(parts, penalties) };
}

// ---------------------------------------------------------------- Hook

const CURIOUS = /(?<![\p{L}])(nhưng|thật ra|sự thật|sai lầm|đừng|bí quyết|lý do|vì sao|tại sao|liệu|có thật|điều|cách|bắt đầu|thay vì|hay là|còn thiếu|đổi lại)(?![\p{L}])/iu;
const NUMBER = /\d|(?<![\p{L}])(một|hai|ba|bốn|năm|sáu|bảy|tám|chín|mười)(?![\p{L}])/iu;
/**
 * Hook / câu nói về TRẢI NGHIỆM RIÊNG ("mình từng mất 5 triệu", "hồi mới bán em…"): hệ thống không được bịa chuyện thay OWNER, nên
 * không cộng điểm cho ngôi thứ nhất; câu kiểu này khi căn cứ không phải tri thức OWNER bị trừ điểm và kịch bản ghi chú để OWNER xác nhận.
 */
export const PERSONAL_CLAIM = /(?<![\p{L}])(?:mình|tôi|em|anh|chị)\s+(?:đã\s+)?(?:từng|mất|lỗ|kiếm|bán được|thử|gặp|bị)(?![\p{L}])|(?<![\p{L}])(?:hồi|lần đầu|năm ngoái|hôm trước)(?![\p{L}])[^.!?\n]{0,40}(?<![\p{L}])(?:mình|tôi|em)(?![\p{L}])/iu;

export interface HookSignals {
  hook: string;
  angle?: string;
  durationSec: number;
  policyIssues: string[];
  /** Điểm insight cao nhất trong căn cứ của hook (null = căn cứ không phải insight nghiên cứu). */
  basisInsightScore?: number | null;
  hasBasis: boolean;
  /** Tiêu đề / hook của bài đã làm (để đo góc mới). */
  existing?: string[];
  /** Như `existing` nhưng đã tách âm tiết sẵn (syllableSet) — dùng khi chấm nhiều hook một lúc. */
  existingSets?: ReadonlySet<string>[];
  /** Căn cứ là tri thức OWNER (trang Second Brain / phát hiện "[OWNER]") — chuyện riêng có căn cứ. */
  ownerBasis?: boolean;
}

export function scoreHook(s: HookSignals): Scored {
  const n = syllables(s.hook).length;
  const clarity = n >= 6 && n <= 12 ? 25 : n <= 15 && n > 12 ? 18 : n >= 4 && n < 6 ? 15 : n <= 20 && n > 15 ? 8 : n > 20 ? 2 : 5;
  const clarityReason = clarity >= 18 ? `Ngắn gọn (${n} chữ)` : n > 15 ? `Dài (${n} chữ)` : "";

  const sig = [/\?/.test(s.hook), CURIOUS.test(s.hook), NUMBER.test(s.hook)];
  const curious = Math.min(25, (sig[0] ? 9 : 0) + (sig[1] ? 9 : 0) + (sig[2] ? 7 : 0));
  const curiousReason = sig[0] || sig[1] ? "Gợi tò mò" : sig[2] ? "Cụ thể" : "";

  const tie = s.basisInsightScore != null ? Math.round(s.basisInsightScore * 0.2) : s.hasBasis ? 10 : 0;
  const tieReason = s.basisInsightScore != null ? (s.basisInsightScore >= 70 ? "Bám insight mạnh" : "Bám insight") : s.hasBasis ? "Có căn cứ" : "";

  const vlog = s.durationSec <= 60 ? 15 : s.durationSec <= 90 ? 8 : 0;
  const vlogReason = s.durationSec <= 60 ? "Vừa 1 phút" : "";
  // Chuyện riêng chưa có căn cứ OWNER: không thưởng, trừ 10 và nhắc xác nhận
  const claim = PERSONAL_CLAIM.test(s.hook) && !s.ownerBasis;

  const mine = syllableSet(s.hook);
  let sim = 0;
  for (const e of s.existingSets ?? []) sim = Math.max(sim, similarity(mine, e));
  for (const e of s.existing ?? []) sim = Math.max(sim, similarity(mine, e));
  const hasExisting = (s.existing?.length ?? 0) + (s.existingSets?.length ?? 0) > 0;
  const novelty = sim >= 0.6 ? 0 : sim >= 0.35 ? 7 : 15;
  const parts: ScorePart[] = [
    { key: "clarity", points: clarity, max: 25, reason: clarityReason },
    { key: "curiosity", points: curious, max: 25, reason: curiousReason },
    { key: "insight", points: tie, max: 20, reason: tieReason },
    { key: "vlog", points: vlog, max: 15, reason: vlogReason },
    { key: "novelty", points: novelty, max: 15, reason: novelty === 15 && hasExisting ? "Góc mới" : "" },
  ];
  const penalties = [...(s.policyIssues.length ? ["Vướng luật nền tảng"] : []), ...(claim ? ["Chuyện riêng — OWNER xác nhận"] : []), ...(sim >= 0.6 ? ["Trùng bài đã làm"] : []), ...(s.durationSec > 90 ? ["Dài hơn 1 phút"] : []), ...(!s.hasBasis ? ["Chưa gắn insight"] : [])];
  return { score: total(parts, s.policyIssues.length * 30 + (claim ? 10 : 0)), parts, reasons: pickReasons(parts, penalties) };
}

// ---------------------------------------------------------------- Chủ đề

export interface TopicSignals {
  bestInsight: number | null;
  bestHook: number | null;
  usableInsights: number;
  pendingInsights: number;
  /** Lần gần nhất có hoạt động (tạo chủ đề / thêm nguồn). */
  lastActivity: string;
  scripts: number;
  hooksNew: number;
  now?: Date;
}

export function scoreTopic(s: TopicSignals): Scored {
  const now = s.now ?? new Date();
  const best = Math.max(s.bestInsight ?? 0, s.bestHook ?? 0);
  const potential = Math.round(best * 0.6);
  const demand = Math.min(20, s.usableInsights * 4 + s.pendingInsights * 2);
  const age = ageDays(s.lastActivity, now) ?? 999;
  const fresh = age <= 7 ? 20 : age <= 30 ? 14 : age <= 90 ? 8 : 3;
  const done = s.scripts > 0 && s.hooksNew === 0;
  const parts: ScorePart[] = [
    { key: "potential", points: potential, max: 60, reason: best >= 70 ? `Insight / hook tốt (${best})` : best > 0 ? `Tiềm năng ${best}` : "" },
    { key: "demand", points: demand, max: 20, reason: s.usableInsights ? `${s.usableInsights} insight dùng được` : s.pendingInsights ? `${s.pendingInsights} insight chờ duyệt` : "" },
    { key: "fresh", points: fresh, max: 20, reason: age <= 7 ? "Mới" : age > 90 ? "Đã lâu" : "" },
  ];
  const penalties = [...(best === 0 ? ["Chưa có insight"] : []), ...(done ? ["Đã có kịch bản"] : [])];
  return { score: total(parts, done ? 15 : 0), parts, reasons: pickReasons(parts, penalties) };
}

/** Id của tối đa `n` mục điểm cao nhất (từ `min` điểm) được gắn nhãn "Nên làm". */
export function topPicks<T extends { id: string; score: number }>(items: T[], n = 3, min = 60): Set<string> {
  return new Set([...items].filter((i) => i.score >= min).sort((a, b) => b.score - a.score).slice(0, n).map((i) => i.id));
}

/** Màu ô điểm. */
export const scoreTone = (n: number): "jade" | "amber" | "neutral" => (n >= 75 ? "jade" : n >= 50 ? "amber" : "neutral");
