// "Kinh nghiệm của anh" — chuyện thật của OWNER cho vlog chia sẻ (OWNER 26/10: "nó không mang tính chia sẻ kinh nghiệm").
// Skill chi phối: "Skill viết content của anh" — SK-KNW-01 BAOR Content Sales (Second Brain, [OWNER]): "Content là Output. Experience
// Knowledge mới là Source of Truth." Vlog chia sẻ là chuyện NGÔI THỨ NHẤT của OWNER (Trần Thanh Bảo), nhưng hệ thống KHÔNG BAO GIỜ
// giả lập trải nghiệm: chuyện chỉ đến từ câu OWNER trả lời (INTERVIEW MODE: mỗi lần hỏi 1–2 câu khơi lại trải nghiệm thật) hoặc trang
// Second Brain OWNER tự tích "Dùng chuyện này". Trước khi viết, AI BÓC TÁCH trải nghiệm (Experience Extraction) — bản bóc tách lưu cùng
// câu trả lời. Kotler / Ogilvy là luật nghề phụ (nói gì / viết thế nào). Hàm THUẦN (không CSDL, không AI).
//
// LƯU TRỮ: khối "KINH NGHIỆM CỦA OWNER:" nằm trong chính bản chữ kịch bản (trước cảnh 1), cạnh "Khách mục tiêu" / "Chặng khách".
// Lý do chọn cách này thay vì cột / setting riêng: bản chữ là thứ duy nhất đã có lịch sử phiên bản (content_versions), khôi phục
// phiên bản, AI viết (lưu chữ đang gõ trước khi gọi) — nên câu trả lời đi cùng phiên bản mà không cần migration. Khối được viết để
// mọi bộ đọc hạ nguồn bỏ qua an toàn: mọi dòng bắt đầu bằng "- " hoặc "  · " nên không bị đọc thành tiêu đề cảnh (scriptCheck,
// isLegacyScript), lời thoại (speechEstimate), hay cảnh của bản đọc khi quay / bộ dựng video (parseShootingScript).

export const CONTENT_SKILL = { code: "SK-KNW-01", label: "Skill viết content của anh (SK-KNW-01)", knowledgeId: "3fd4ceb9517d81659a3ddd76e614476a" } as const;
export interface InterviewItem {
  q: string;
  a: string;
}

/** Góc nội dung theo SK-KNW-01. */
export const ANGLES = [
  { key: "mistake", label: "Sai lầm", en: "Mistake" },
  { key: "contrarian", label: "Ngược số đông", en: "Contrarian" },
  { key: "story", label: "Câu chuyện", en: "Story" },
  { key: "howto", label: "Cách làm", en: "How-to" },
  { key: "principle", label: "Nguyên tắc", en: "Principle" },
  { key: "psychology", label: "Tâm lý khách", en: "Customer Psychology" },
  { key: "management", label: "Quản lý", en: "Management" },
  { key: "training", label: "Đào tạo", en: "Training" },
] as const;
export type AngleKey = (typeof ANGLES)[number]["key"];
export const angleInfo = (k: string) => ANGLES.find((a) => a.key === k || a.en.toLowerCase() === k.toLowerCase() || a.label.toLowerCase() === k.toLowerCase());

/** Bóc tách trải nghiệm (Experience Extraction) + Point of View BAOR theo SK-KNW-01. */
export const EXTRACTION_FIELDS = [
  { key: "situation", label: "Tình huống", en: "Situation" },
  { key: "customer", label: "Khách", en: "Customer" },
  { key: "problem", label: "Vấn đề thật", en: "Problem" },
  { key: "action", label: "BAOR đã làm", en: "BAOR Action" },
  { key: "result", label: "Kết quả", en: "Result" },
  { key: "lesson", label: "Bài học", en: "Lesson" },
  { key: "principle", label: "Nguyên tắc", en: "Principle" },
  { key: "limitation", label: "Giới hạn", en: "Limitation" },
  { key: "potential", label: "Tiềm năng content", en: "Content Potential" },
  { key: "commonView", label: "Quan niệm phổ biến", en: "Common View" },
  { key: "belief", label: "Niềm tin BAOR", en: "BAOR Belief" },
  { key: "why", label: "Vì sao", en: "Why" },
  { key: "example", label: "Ví dụ thật", en: "Example" },
] as const;
export type ExtractionKey = (typeof EXTRACTION_FIELDS)[number]["key"];
export type Extraction = Partial<Record<ExtractionKey, string>>;

export interface ExperienceRef {
  kind: "knowledge" | "finding";
  id: string;
  /** Tiêu đề trang / câu phát hiện (một dòng) — chỉ để hiển thị; nội dung đọc lại từ CSDL khi AI viết. */
  label: string;
}

export interface OwnerExperience {
  /** Câu phỏng vấn (1–2 mỗi lần) + câu OWNER trả lời. */
  qa: InterviewItem[];
  /** Góc nội dung OWNER chọn (hoặc AI đề xuất khi viết). */
  angle: AngleKey | "";
  /** Bản bóc tách AI làm từ câu trả lời trước khi viết (lưu cùng câu trả lời). */
  extraction: Extraction;
  /** Trang Second Brain / phát hiện OWNER_VIEW OWNER đã tích "Dùng chuyện này". */
  refs: ExperienceRef[];
  /**
   * CHỈ ĐỌC, bản cũ: dòng "- Cần xác nhận: …" từng nằm trong bản chữ (trước khi trạng thái xác nhận chuyển sang lưu riêng ở máy chủ —
   * src/lib/content/owner-review.ts). Máy chủ chuyển các mục này sang trạng thái riêng khi đọc; KHÔNG BAO GIỜ ghi lại vào bản chữ, dấu xác
   * nhận cũ trong chữ bị bỏ (phải xác nhận lại).
   */
  legacyReview?: string[];
}


export const emptyExperience = (): OwnerExperience => ({ qa: [], angle: "", extraction: {}, refs: [] });

/**
 * Có chuyện thật để viết vlog chia sẻ: OWNER đã trả lời ít nhất một câu, hoặc đã tích một trang Second Brain CÒN SỐNG. `live` = trang còn
 * trong chỉ mục, là tư liệu OWNER, chưa ARCHIVED (máy chủ: experienceSources; trình duyệt: trạng thái do máy chủ gửi). Không truyền `live`
 * → mọi trang đã tích đều tính (chỉ dùng cho hiển thị khi chưa biết trạng thái).
 */
export function hasExperience(e: OwnerExperience | null | undefined, live?: (r: ExperienceRef) => boolean): e is OwnerExperience {
  return !!e && (e.qa.some((x) => x.a.trim().length > 0) || e.refs.some((r) => (live ? live(r) : true)));
}

/** Khối trống hoàn toàn (không câu hỏi, không góc, không bóc tách, không trang) — không ghi. */
export const isEmptyExperience = (e: OwnerExperience | null | undefined) =>
  !e || (!e.qa.some((x) => x.q.trim() || x.a.trim()) && !e.angle && !Object.values(e.extraction).some((v) => v?.trim()) && !e.refs.length);

export const answeredCount = (e: OwnerExperience | null | undefined) => (e ? e.qa.filter((x) => x.a.trim()).length : 0);

/** Toàn bộ chữ OWNER trả lời — dùng để kiểm con số / câu trích AI viết có nằm trong chuyện thật không. */
export const experienceText = (e: OwnerExperience | null | undefined) => (e ? e.qa.map((x) => x.a).join("\n") : "");

// ---------- INTERVIEW MODE: câu hỏi khơi trải nghiệm thật (theo luật, theo chủ đề hook) ----------
const fold0 = (s: string) => s.normalize("NFD").replace(/\p{M}+/gu, "").replace(/đ/g, "d").replace(/Đ/g, "d").toLowerCase();
const BANK: { test: RegExp; qs: string[] }[] = [
  {
    test: /gia|tu choi|phan doi|chot|objection|mac ca|dat qua/,
    qs: [
      "Có lần nào khách nói từ chối (vì giá, chưa cần…) nhưng sau đó anh nhận ra lý do thật không? Chuyện đó thế nào?",
      "Lúc đó anh (hoặc Sales của anh) đã xử lý ra sao, chỗ nào chưa đúng?",
    ],
  },
  {
    test: /dao tao|seller moi|nhan vien|doi sales|coaching|huan luyen|nguoi moi/,
    qs: [
      "Trong lúc đào tạo Sales, lỗi nào anh phải nhắc đi nhắc lại nhiều nhất? Một lần cụ thể anh nhớ là gì?",
      "Anh đã sửa lỗi đó cho người ấy bằng cách nào, kết quả ra sao?",
    ],
  },
  {
    test: /bat dau|moi ban|moi lam|lan dau|khoi nghiep|mo shop|online/,
    qs: [
      "Hồi mới bắt đầu, việc đầu tiên anh làm là gì — và có điều gì anh ước mình làm khác đi?",
      "Anh từng thấy người mới (học viên, Sales của anh) sai ở bước nào nhiều nhất? Kể một lần cụ thể.",
    ],
  },
  {
    test: /goi|cuoc goi|telesale|so nong|so cu|nhan tin|inbox|tu van/,
    qs: [
      "Có cuộc gọi / cuộc tư vấn nào anh nhớ mãi không? Lúc đó khách nói gì, anh làm gì?",
      "Sau cuộc đó anh đổi cách làm thế nào, và kết quả khác đi ra sao?",
    ],
  },
  {
    test: /khach hang|khach|tam ly|niem tin|cham soc|sau ban/,
    qs: [
      "Có khách nào làm anh đổi cách nghĩ về khách hàng không? Chuyện gì đã xảy ra?",
      "Từ khách đó anh rút ra điều gì mà giờ anh vẫn làm?",
    ],
  },
  {
    test: /quan ly|doi|team|muc tieu|kpi|ky luat/,
    qs: [
      "Khi quản lý đội, có quyết định nào anh làm sai rồi phải sửa không? Kể ngắn gọn.",
      "Giờ gặp lại tình huống đó anh sẽ làm gì khác?",
    ],
  },
];
const GENERIC_QS = [
  "Anh từng gặp đúng chuyện này chưa? Lúc đó ở đâu, chuyện gì xảy ra?",
  "Anh đã làm gì, chỗ nào sai hoặc chưa đúng?",
  "Kết quả ra sao, anh rút ra điều gì?",
  "Có con số hay câu khách nói nào anh còn nhớ không? (nếu có)",
  "Khi nào cách của anh KHÔNG áp dụng được?",
  "Nhiều người nghĩ thế nào về chuyện này — còn anh thấy khác ở đâu?",
];

/**
 * Câu phỏng vấn tiếp theo (mặc định 2) cho chủ đề / hook — bỏ câu đã hỏi. Câu theo chủ đề trước (giá / từ chối, đào tạo, mới bắt đầu, cuộc
 * gọi, khách hàng, quản lý), rồi câu chung (chuyện · đã làm · kết quả · chi tiết · giới hạn · quan niệm phổ biến).
 */
export function interviewQuestions(topic: string, asked: string[] = [], n = 2): string[] {
  const t = fold0(topic);
  const have = new Set(asked.map((q) => q.trim()));
  const pool = [...BANK.filter((b) => b.test.test(t)).flatMap((b) => b.qs), ...GENERIC_QS];
  return [...new Set(pool)].filter((q) => !have.has(q)).slice(0, n);
}

// ---------- Khối chữ ----------
export const EXPERIENCE_HEADER = "KINH NGHIỆM CỦA OWNER:";
// Chỉ đúng tiêu đề hệ thống ghi — dòng "KINH NGHIỆM:" OWNER tự gõ là chữ thường của phần đầu, không bị nuốt
const HEADER_RE = /^\s*KINH NGHIỆM CỦA OWNER\s*:\s*$/u;
const REVIEW_RE = /^-\s*Cần xác nhận\s*:\s?(.*)$/iu;
const CONFIRM_RE = /^-\s*OWNER xác nhận\s*:\s*có(?:\s*·\s*([^\s·]+)\s*·\s*([^\s·]+)(?:\s*·\s*h:([0-9a-f]{8}))?)?\s*$/iu;
const Q_RE = /^-\s*Hỏi\s*:\s?(.*)$/iu;
const A_RE = /^-\s*Đáp\s*:\s?(.*)$/iu;
const ANGLE_RE = /^-\s*Góc\s*:\s*(.*)$/iu;
const EX_RE = /^-\s*Bóc tách\s*·\s*([^:]{1,40}?)\s*:\s?(.*)$/iu;
const REF_RE = /^-\s*Từ Second Brain\s*:\s*(knowledge|finding):([A-Za-z0-9_-]+)(?:\s*·\s*(.*))?$/iu;
const CONT_RE = /^\s+·\s(.*)$/u;
const CONT_PREFIX = "  · ";

export const isExperienceHeader = (line: string) => HEADER_RE.test(line);

const lines = (s: string) => s.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
const one = (s: string) => s.replace(/\s+/g, " ").trim();
const multi = (label: string, v: string) => {
  const ls = lines(v);
  return ls.length ? [`- ${label}: ${ls[0]}`, ...ls.slice(1).map((l) => `${CONT_PREFIX}${l}`)] : [];
};

/** Khối chữ để ghi (rỗng khi chưa có gì). Chữ nhiều dòng: dòng đầu sau nhãn, dòng sau bắt đầu bằng "  · ". */
export function experienceLines(e: OwnerExperience | null | undefined): string[] {
  if (!e || isEmptyExperience(e)) return [];
  const out = [EXPERIENCE_HEADER];
  for (const x of e.qa) {
    if (!x.q.trim() && !x.a.trim()) continue;
    out.push(`- Hỏi: ${one(x.q)}`, ...multi("Đáp", x.a));
  }
  const ang = e.angle ? angleInfo(e.angle) : undefined;
  if (ang) out.push(`- Góc: ${ang.label} (${ang.en})`);
  for (const f of EXTRACTION_FIELDS) out.push(...multi(`Bóc tách · ${f.label}`, e.extraction[f.key] ?? ""));
  const seen = new Set<string>();
  for (const r of e.refs) {
    const k = `${r.kind}:${r.id}`;
    if (!/^[A-Za-z0-9_-]+$/.test(r.id) || seen.has(k)) continue;
    seen.add(k);
    out.push(`- Từ Second Brain: ${k}${one(r.label) ? ` · ${one(r.label)}` : ""}`);
  }
  return out;
}

/** Khối kinh nghiệm ở BẤT KỲ đâu trong bản chữ (kể cả bản chữ không phải kịch bản thẻ) — cổng duyệt đọc bằng hàm này. */
export function experienceFromDraft(draft: string): OwnerExperience | undefined {
  const all = (draft ?? "").normalize("NFC").split(/\r?\n/);
  const i = all.findIndex((l) => isExperienceHeader(l));
  if (i < 0) return undefined;
  const e = readExperienceBlock(all, i).experience;
  return isEmptyExperience(e) ? undefined : e;
}

/** Bản chữ kịch bản KHÔNG có khối kinh nghiệm (câu trả lời thô, bóc tách) — dùng cho caption / luật caption, để chữ riêng không lọt ra ngoài. */
export function stripExperienceBlock(draft: string): string {
  const all = (draft ?? "").normalize("NFC").split(/\r?\n/);
  const out: string[] = [];
  for (let i = 0; i < all.length; i++) {
    if (isExperienceHeader(all[i])) {
      i = readExperienceBlock(all, i).next - 1;
      continue;
    }
    out.push(all[i]);
  }
  return out.join("\n");
}

/**
 * Đọc khối bắt đầu ở dòng `start` (dòng tiêu đề "KINH NGHIỆM CỦA OWNER:"). Trả về kinh nghiệm và chỉ số dòng ĐẦU TIÊN không thuộc khối
 * (dòng trống / dòng lạ kết thúc khối và được bộ đọc gọi xử lý như thường — không mất chữ).
 */
export function readExperienceBlock(all: string[], start: number): { experience: OwnerExperience; next: number } {
  const e = emptyExperience();
  // Nơi dòng nối tiếp "  · …" được nối vào
  let target: ((v: string) => void) | null = null;
  const add = (cur: string, v: string) => (cur ? (v ? `${cur}\n${v}` : cur) : v);
  let i = start + 1;
  for (; i < all.length; i++) {
    const raw = all[i].replace(/\s+$/u, "");
    let m: RegExpMatchArray | null;
    if ((m = raw.match(Q_RE))) {
      const item: InterviewItem = { q: m[1].trim(), a: "" };
      e.qa.push(item);
      target = null;
      continue;
    }
    if ((m = raw.match(A_RE))) {
      let item = e.qa.at(-1);
      if (!item || (item.a && !target)) e.qa.push((item = { q: "", a: "" }));
      const it = item;
      it.a = add(it.a, m[1].trim());
      target = (v) => (it.a = add(it.a, v));
      continue;
    }
    if ((m = raw.match(ANGLE_RE)) && angleInfo(m[1].replace(/\s*\(.*\)\s*$/u, "").trim())) {
      e.angle = angleInfo(m[1].replace(/\s*\(.*\)\s*$/u, "").trim())!.key;
      target = null;
      continue;
    }
    if ((m = raw.match(EX_RE)) && EXTRACTION_FIELDS.some((f) => f.label.toLowerCase() === m![1].toLowerCase())) {
      const key = EXTRACTION_FIELDS.find((f) => f.label.toLowerCase() === m![1].toLowerCase())!.key;
      e.extraction[key] = add(e.extraction[key] ?? "", m[2].trim());
      target = (v) => (e.extraction[key] = add(e.extraction[key] ?? "", v));
      continue;
    }
    if ((m = raw.match(REVIEW_RE))) {
      target = null;
      if (m[1].trim()) (e.legacyReview ??= []).push(m[1].trim());
      continue;
    }
    if (CONFIRM_RE.test(raw)) {
      // Dấu xác nhận cũ trong chữ: bỏ qua (không tin — xác nhận chỉ còn ở máy chủ)
      target = null;
      continue;
    }
    if ((m = raw.match(REF_RE))) {
      target = null;
      const kind = m[1].toLowerCase() as ExperienceRef["kind"];
      if (!e.refs.some((x) => x.kind === kind && x.id === m![2])) e.refs.push({ kind, id: m[2], label: (m[3] ?? "").trim() });
      continue;
    }
    const c = raw.match(CONT_RE);
    if (c && target) {
      const v = c[1].trim();
      if (v) target(v);
      continue;
    }
    break;
  }
  return { experience: e, next: i };
}

// ---------- Xưng hô ----------
export interface Pronouns {
  /** Người nói (OWNER) tự xưng. */
  self: string;
  /** Gọi người xem. */
  audience: string;
}
export const DEFAULT_PRONOUNS: Pronouns = { self: "em", audience: "anh chị" };

/**
 * Cặp xưng hô từ giọng thương hiệu (Cài đặt › Thương hiệu, brand.voice). Không có setting riêng: đọc câu kiểu "xưng 'em' với khách",
 * "gọi khách là anh chị" trong chữ giọng văn; không nói gì → "em – anh chị".
 */
export function pronounsFromVoice(voice = ""): Pronouns {
  const t = voice.normalize("NFC").toLowerCase();
  const self = t.match(/xưng\s*(?:là\s*)?["'“‘]?\s*(em|mình|tôi)(?![\p{L}])/u)?.[1];
  const aud = t.match(/(?:gọi|với)\s*(?:khách(?:\s*hàng)?|người xem)?\s*(?:là\s*)?["'“‘]?\s*(anh\s*\/?\s*chị|các bạn|bạn|cô chú|quý khách)(?![\p{L}])/u)?.[1];
  const s = self ?? DEFAULT_PRONOUNS.self;
  const a = aud ? aud.replace(/\s*\/\s*/, " ").replace(/\s+/g, " ") : s === "em" ? "anh chị" : "bạn";
  return { self: s, audience: a };
}

// ---------- Gợi ý từ Second Brain ----------
export interface ExperienceCandidate {
  kind: "knowledge" | "finding";
  id: string;
  title: string;
  labels: string[];
  /** Loại trang (Skill, Principle, Case Study…) — phát hiện nghiên cứu: "OWNER_VIEW". */
  pageKind: string;
  area: string;
  section: string;
  status: string;
  text: string;
  /** Điểm bm25 (thấp = khớp hơn); phát hiện không có. */
  score?: number;
  /** Phát hiện cùng chủ đề nghiên cứu với hook. */
  sameTopic?: boolean;
}

export interface ExperienceSuggestion {
  kind: "knowledge" | "finding";
  id: string;
  title: string;
  snippet: string;
  status: string;
  /** DRAFT: dùng được nhưng đánh dấu "nháp". */
  draft: boolean;
  tag: string;
  tier: number;
}

const STATUS_RANK: Record<string, number> = { ACTIVE: 0, VERIFIED: 1, DRAFT: 2 };
const STOP = new Set(
  "và là có không của cho với thì mà này đó kia từ đâu gì sao nào khi được những các một hai người bạn mình em anh chị tôi để ra vào lên rồi đã sẽ đang bị nhé nha ạ thế vậy mới hay rất cũng như nên cần phải trong ngoài trên dưới theo về lại còn chỉ hơn nhất thật ai bao nhiêu"
    .split(" ")
    .map((w) => fold(w)),
);
function fold(s: string): string {
  return s.normalize("NFD").replace(/\p{M}+/gu, "").replace(/đ/g, "d").replace(/Đ/g, "d").toLowerCase();
}
/** Từ khoá của câu hỏi (bỏ dấu, bỏ từ đệm) — cùng cách FTS bỏ dấu. */
export function queryTerms(q: string): string[] {
  return [...new Set(fold(q).split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 2 && !STOP.has(t)))];
}
const termsIn = (terms: string[], text: string) => {
  const words = new Set(fold(text).split(/[^\p{L}\p{N}]+/u));
  return terms.filter((t) => words.has(t)).length;
};

/** Hạng tư liệu kinh nghiệm OWNER (0 = Case Study / OWNER_VIEW, 1 = trang [OWNER], 2 = N1 Đào tạo / N2 Bán hàng); null = không phải. */
export function experienceTier(c: Pick<ExperienceCandidate, "kind" | "title" | "labels" | "pageKind" | "area" | "section" | "status">): { tier: number; tag: string } | null {
  const status = c.status.toUpperCase();
  if (status === "ARCHIVED") return null;
  if (c.kind === "finding") return c.pageKind === "OWNER_VIEW" ? { tier: 0, tag: "Quan điểm OWNER" } : null;
  // Skill là cách vận hành cho bot (dựng video, viết…), không phải chuyện kinh nghiệm
  if (/^02\b/.test(c.section) || /^skill$/i.test(c.pageKind.trim())) return null;
  const labels = c.labels.map((l) => l.toUpperCase());
  if (/\[case study\]/i.test(c.title) || /case study/i.test(c.pageKind) || labels.some((l) => l.includes("CASE STUDY"))) return { tier: 0, tag: "Case Study" };
  const owner = labels.includes("[OWNER]") || c.title.trim().startsWith("[OWNER]");
  if (owner) return { tier: 1, tag: "OWNER" };
  const research = labels.some((l) => l === "[NGHIÊN CỨU]" || l === "[AI SUY LUẬN]");
  const area = c.area.match(/^(N[12])\b\s*(.*)$/u);
  if (area && !research) return { tier: 2, tag: area[1] === "N1" ? "N1 Đào tạo" : "N2 Bán hàng" };
  return null;
}

const META_LINE = /^(?:Nguồn|Trạng thái|Nhóm|Nhãn|Ghi chú|Đã làm sạch|Loại|Status|Labels?)\s*[:：]/iu;

/** Câu trong nội dung khớp nhiều từ khoá nhất, ≤ 220 ký tự. */
export function experienceSnippet(text: string, terms: string[], max = 220): string {
  const parts = text
    .normalize("NFC")
    .split(/\n+|(?<=[.!?…])\s+/u)
    .map((s) => s.replace(/^[#>*\-•\s]+/u, "").replace(/\s+/g, " ").trim())
    // Dòng siêu dữ liệu của trang (Nguồn, Trạng thái, Nhóm, Nhãn…) không phải nội dung chuyện
    .filter((s) => s.length >= 12 && !META_LINE.test(s));
  if (!parts.length) return "";
  let best = parts[0];
  let hit = -1;
  for (const p of parts) {
    const n = termsIn(terms, p);
    if (n > hit) {
      hit = n;
      best = p;
    }
  }
  return best.length > max ? `${best.slice(0, max - 1).trimEnd()}…` : best;
}

/**
 * Xếp gợi ý chuyện thật: chỉ tư liệu OWNER (Case Study / OWNER_VIEW → trang [OWNER] → N1 / N2), trong cùng hạng ACTIVE > VERIFIED > DRAFT,
 * rồi khớp nhiều từ khoá hơn, rồi bm25. Phải khớp ≥ 2 từ khoá (câu chỉ 1 từ khoá: 1) — trừ phát hiện cùng chủ đề nghiên cứu.
 */
export function rankExperience(cands: ExperienceCandidate[], query: string, limit = 3): ExperienceSuggestion[] {
  const terms = queryTerms(query);
  const need = Math.min(2, terms.length);
  const scored = cands
    .map((c) => {
      const t = experienceTier(c);
      const overlap = termsIn(terms, `${c.title}\n${c.text}`);
      return t && (overlap >= need || c.sameTopic) && need > 0 ? { c, ...t, overlap } : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
  scored.sort(
    (a, b) =>
      a.tier - b.tier ||
      Number(!!b.c.sameTopic) - Number(!!a.c.sameTopic) ||
      (STATUS_RANK[a.c.status.toUpperCase()] ?? 3) - (STATUS_RANK[b.c.status.toUpperCase()] ?? 3) ||
      b.overlap - a.overlap ||
      (a.c.score ?? 0) - (b.c.score ?? 0),
  );
  const seen = new Set<string>();
  const out: ExperienceSuggestion[] = [];
  for (const s of scored) {
    const k = `${s.c.kind}:${s.c.id}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const status = s.c.status.toUpperCase();
    out.push({ kind: s.c.kind, id: s.c.id, title: one(s.c.title), snippet: experienceSnippet(s.c.text, terms) || one(s.c.title), status, draft: status !== "ACTIVE" && status !== "VERIFIED", tag: s.tag, tier: s.tier });
    if (out.length >= limit) break;
  }
  return out;
}

// ---------- "Không thêm chuyện": chi tiết AI viết mà không có trong chuyện của anh ----------
const DIGIT_WORD: Record<string, number> = { không: 0, một: 1, hai: 2, ba: 3, bốn: 4, năm: 5, sáu: 6, bảy: 7, tám: 8, chín: 9 };
// Chỉ là chữ số khi đứng sau "mươi" / "mười" ("hai mươi lăm", "mười lăm", "ba mươi mốt", "hai mươi tư")
const TAIL_DIGIT: Record<string, number> = { lăm: 5, mốt: 1, tư: 4, nhăm: 5 };
const MULT: Record<string, number> = { nghìn: 1e3, ngàn: 1e3, triệu: 1e6, tỷ: 1e9, tỉ: 1e9 };
/** Danh từ đếm: "năm bộ", "ba khách" là con số; "năm ngoái", "ba mẹ" thì không. */
const COUNT_NOUN = new Set(
  "bộ cái chiếc khách người đơn lần tháng ngày tuần năm giờ phút cuộc học viên shop cửa hàng sản phẩm món đôi hộp thùng kg ký lít triệu nghìn ngàn trăm tỷ đồng k bạn nhân viên sales seller tin nhắn bình luận video bài buổi lớp".split(" "),
);

/** Mọi con số trong chữ (chữ số và số viết bằng chữ tiếng Việt), đã quy về giá trị: "năm triệu" = "5 triệu" = 5000000; "150" ≠ "5". */
export function numbersIn(text: string): number[] {
  // Dấu câu là một token riêng → cắt cụm số ("1,5 triệu, 50.000 đồng" là hai số)
  const toks = text.normalize("NFC").toLowerCase().match(/\d+(?:[.,]\d+)*|[\p{L}]+|[^\s\p{L}\p{N}]/gu) ?? [];
  const out: number[] = [];
  let i = 0;
  while (i < toks.length) {
    const t = toks[i];
    const isDigitTok = /^\d/.test(t);
    if (!isDigitTok && !(t in DIGIT_WORD) && t !== "mười") {
      i++;
      continue;
    }
    // Đọc một cụm số liên tiếp
    let total = 0;
    let section = 0;
    let cur = 0;
    let hasMult = false;
    let hasDigitTok = false;
    let lastMult = 1;
    let prev = "";
    let j = i;
    for (; j < toks.length; j++) {
      const w = toks[j];
      if (/^\d/.test(w)) {
        if (prev && prev !== "mươi" && prev !== "mười" && !(prev in MULT) && prev !== "trăm") break;
        // 50.000 / 1,5: dấu chấm nhóm nghìn, dấu phẩy (hoặc chấm lẻ) thập phân
        const n = /^\d{1,3}(?:\.\d{3})+$/.test(w) ? Number(w.replace(/\./g, "")) : Number(w.replace(",", "."));
        cur = Number.isFinite(n) ? n : 0;
        hasDigitTok = true;
      } else if (w in DIGIT_WORD && !(prev && /^\d/.test(prev))) {
        if (prev && (prev in DIGIT_WORD || prev in TAIL_DIGIT)) break;
        cur = DIGIT_WORD[w];
      } else if (w in TAIL_DIGIT && (prev === "mươi" || prev === "mười")) {
        cur = TAIL_DIGIT[w];
      } else if (w === "mười") {
        section += 10;
        cur = 0;
        hasMult = true;
      } else if (w === "mươi" && prev in DIGIT_WORD) {
        section += cur * 10;
        cur = 0;
        hasMult = true;
      } else if (w === "trăm" && j > i) {
        section += (cur || 1) * 100;
        cur = 0;
        hasMult = true;
      } else if (w in MULT && j > i) {
        total += (section + cur || 1) * MULT[w];
        lastMult = MULT[w];
        section = 0;
        cur = 0;
        hasMult = true;
      } else if (w === "rưỡi" && hasMult) {
        total += lastMult / 2;
      } else if ((w === "lẻ" || w === "linh") && hasMult) {
        // "một trăm lẻ năm"
      } else break;
      prev = w;
    }
    const value = total + section + cur;
    const next = toks[j] ?? "";
    // Số bằng chữ đứng một mình chỉ tính khi theo sau là danh từ đếm ("năm bộ") — "năm ngoái", "ba mẹ", "một lần" (1) bỏ qua
    if (hasDigitTok || hasMult || (COUNT_NOUN.has(next) && value > 1)) out.push(value);
    i = Math.max(j, i + 1);
  }
  return out;
}

const QUOTE_RE = /[“"«‘]([^”"»’“«‘]{6,})[”"»’]/gu;
/** Tên riêng / chữ viết hoa luôn được phép (thương hiệu, nền tảng). */
const NAME_OK = new Set("baor owner ai sales seller facebook tiktok youtube instagram zalo shopee lazada tiki messenger google cta việt nam vn kpi crm".split(" "));
const looseText = (s: string) => s.normalize("NFC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Cụm tên riêng (từ viết hoa KHÔNG ở đầu câu): "chợ Bến Thành" → "Bến Thành", "chị Lan" → "Lan". */
export function properNames(text: string): string[] {
  const out: string[] = [];
  for (const sentence of text.normalize("NFC").split(/[.!?…:\n;]+|[“"«‘”»’]/u)) {
    const words = sentence.trim().split(/[\s,()–—-]+/u).filter(Boolean);
    let run: string[] = [];
    const flush = () => {
      if (run.length) out.push(run.join(" "));
      run = [];
    };
    words.forEach((w, k) => {
      if (k > 0 && /^\p{Lu}/u.test(w) && !NAME_OK.has(w.toLowerCase())) run.push(w);
      else flush();
    });
    flush();
  }
  return [...new Set(out)];
}

/**
 * Chi tiết trong lời AI viết (lời nói + chữ trên màn hình) KHÔNG có trong nguồn (câu trả lời của anh + trang Second Brain đã tích):
 * con số (kể cả viết bằng chữ, so theo giá trị), câu trích trong ngoặc, tên riêng (người / nơi). Rỗng = không thêm chuyện.
 */
export function addedDetails(told: string, source: string): string[] {
  const clean = told.replace(/\[[^\]]*\]/g, " ");
  const have = new Set(numbersIn(source));
  const nums = [...new Set(numbersIn(clean).filter((n) => !have.has(n)))].map((n) => n.toLocaleString("vi-VN"));
  const src = looseText(source);
  const quotes = [...clean.matchAll(QUOTE_RE)].map((m) => m[1].trim()).filter((q) => !src.includes(looseText(q))).map((q) => `“${q.slice(0, 40)}”`);
  const names = properNames(clean).filter((n) => !src.includes(looseText(n)));
  return [...nums, ...quotes, ...names];
}


// ---------- Xác nhận của OWNER: chỉ máy chủ đóng dấu, gắn với đúng chữ đã xác nhận ----------
/** Mã 8 ký tự (FNV-1a 32 bit) của lời nói + chữ trên màn hình 4 cảnh (chuẩn hoá khoảng trắng) — dấu xác nhận gắn với nội dung này. */
export function sceneHash(cards: { speech: string; onScreen: string }[]): string {
  const text = cards.map((c) => `${c.speech}␟${c.onScreen}`).join("␞").normalize("NFC").replace(/\s+/g, " ").trim();
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Mục "Cần xác nhận" của bản cũ còn nằm trong chữ (để máy chủ chuyển sang trạng thái riêng). */
export function legacyReviewItems(draft: string): string[] {
  return [...new Set((draft ?? "").split(/\r?\n/).map((l) => l.replace(/\s+$/u, "").match(REVIEW_RE)?.[1]?.trim() ?? "").filter(Boolean))];
}

/** Bỏ mọi dòng trạng thái tin cậy ("- Cần xác nhận: …", "- OWNER xác nhận: …") khỏi chữ gửi lên — trạng thái đó chỉ ở máy chủ. */
export function stripTrustLines(text: string): string {
  return (text ?? "")
    .split(/\r?\n/)
    .filter((l) => !REVIEW_RE.test(l.replace(/\s+$/u, "")) && !CONFIRM_RE.test(l.replace(/\s+$/u, "")))
    .join("\n");
}

/** Mục "Cần xác nhận" còn xuất hiện trong chữ hiện tại? (số so theo giá trị, câu trích / tên so chữ bỏ dấu câu). */
export function reviewItemPresent(item: string, told: string): boolean {
  const t = item.trim();
  if (/^\d{1,3}(?:\.\d{3})*(?:,\d+)?$|^\d+$/.test(t)) return numbersIn(told).includes(Number(t.replace(/\./g, "").replace(",", ".")));
  const inner = looseText(t.replace(/^[“"«‘]|[”"»’]$/gu, ""));
  return !!inner && looseText(told).includes(inner);
}

/** Phần "chuyện thật" của khối (câu trả lời có chữ, nguồn đã tích, góc) — chỉ OWNER / quản lý được đổi. */
export const storyKey = (e: OwnerExperience | null | undefined) =>
  JSON.stringify({ qa: (e?.qa ?? []).filter((x) => x.a.trim()).map((x) => [x.q.trim(), x.a.replace(/\s+/g, " ").trim()]), refs: (e?.refs ?? []).map((r) => `${r.kind}:${r.id}`), angle: e?.angle ?? "" });
