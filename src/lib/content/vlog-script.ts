// Trình soạn kịch bản vlog chia sẻ < 1 phút theo THẺ CẢNH (OWNER 26/10: "phần AI viết kịch bản vẫn khó hiểu… làm lại giao diện,
// viết với công thức hay hơn"). Hàm THUẦN (không CSDL, không AI) — chạy được trong trình duyệt và trong test.
//
// Lưu trữ KHÔNG đổi: thẻ cảnh được ghi lại đúng dạng chữ cảnh hiện có ("1. HOOK (0–3s)" / "Hình ảnh:" / "Lời thoại:" /
// "Chữ trên màn hình:") nên scriptCheck, bản đọc khi quay (parseShootingScript), bộ dựng video và dữ liệu cũ vẫn chạy.
// Kịch bản khung cũ 5 cảnh và kịch bản quay từ brief (CP02) KHÔNG đi qua đây (parseVlogDraft trả null → ô chữ như cũ).
//
// Công thức viết: theo nguyên lý marketing của Philip Kotler (lấy khách hàng làm trung tâm — STP, tuyên bố giá trị, hành trình 5A).
// Đây là cách BAOR áp dụng nguyên lý, không phải khung do Kotler soạn.
import { VLOG_MAX_SEC, VLOG_WORDS_PER_SEC, isLegacyScript } from "./formats";
import { policyIssues } from "./policy";
import { PLACEHOLDER_RE } from "./shooting-script";
import { ANGLES, CONTENT_SKILL, DEFAULT_PRONOUNS, addedDetails, answeredCount, experienceLines, sceneHash, experienceFromDraft, storyKey, stripTrustLines, stripExperienceBlock, type ExperienceRef, experienceText, hasExperience, isEmptyExperience, isExperienceHeader, pronounsFromVoice, readExperienceBlock, type OwnerExperience, type Pronouns } from "./experience";

export type VlogKey = "hook" | "story" | "value" | "end";

export interface VlogCardDef {
  key: VlogKey;
  /** Tên cảnh ghi trong bản chữ — giữ đúng tên VLOG_SCENES để scriptCheck nhận. */
  heading: string;
  seconds: string;
  /** Nhãn trên thẻ. */
  label: string;
  /** Gợi ý ngắn (≤ 10 chữ) theo công thức — hiện làm chữ mờ trong ô Lời nói. */
  hint: string;
}

export const VLOG_CARDS: VlogCardDef[] = [
  { key: "hook", heading: "HOOK", seconds: "0–3s", label: "Hook", hint: "Nỗi đau của khách + điều cụ thể · ≤ 15 chữ" },
  { key: "story", heading: "CÂU CHUYỆN", seconds: "3–25s", label: "Câu chuyện", hint: "Lúc khách gặp đúng chuyện này — họ thấy gì" },
  { key: "value", heading: "BÀI HỌC", seconds: "25–50s", label: "Giá trị / Bài học", hint: "MỘT lợi ích cụ thể + một lý do để tin" },
  { key: "end", heading: "KẾT", seconds: "50–60s", label: "Kết", hint: "MỘT lời mời nhẹ, đúng chặng khách" },
];

export interface VlogCard {
  key: VlogKey;
  speech: string;
  visual: string;
  onScreen: string;
  /** Dòng "Ý chính:" (dàn ý từ hook) — không hiện như đoạn văn; dùng làm gợi ý mờ. */
  notes: string[];
  /** Dòng "Gợi ý OWNER: [OWNER KỂ: …]" — giữ nguyên (luật chống bịa chuyện). */
  ownerHints: string[];
  /** Dòng "Căn cứ:" và dòng lạ trong cảnh — giữ nguyên khi lưu, không mất chữ. */
  extra: string[];
}

export interface VlogDoc {
  /** Dòng trước cảnh 1 (tiêu đề, "Dạng: …") — giữ nguyên. */
  head: string[];
  /** Khách mục tiêu (STP) — dòng "Khách mục tiêu: …". */
  segment: string;
  /** Chặng hành trình khách (5A) — dòng "Chặng khách (5A): …". */
  stage: PathStage | null;
  cards: VlogCard[];
  /** Từ "Nhạc nền:" / "Ghi chú dựng:" trở đi — giữ nguyên. */
  tail: string[];
  /** Khối "KINH NGHIỆM CỦA OWNER:" (src/lib/content/experience.ts) — chỉ có khi OWNER đã trả lời / tích chuyện; không có thì không có khoá. */
  experience?: OwnerExperience;
}

// ---------- Hành trình khách 5A (Kotler, Marketing 4.0): Biết → Thích → Hỏi → Làm → Giới thiệu ----------
export type PathStage = "aware" | "appeal" | "ask" | "act" | "advocate";

export const PATH_STAGES: { key: PathStage; label: string; en: string; cta: string }[] = [
  { key: "aware", label: "Biết", en: "Aware", cta: "mời theo dõi kênh để xem phần tiếp theo" },
  { key: "appeal", label: "Thích", en: "Appeal", cta: "mời lưu video lại để dùng khi cần" },
  { key: "ask", label: "Hỏi", en: "Ask", cta: "mời bình luận câu hỏi hoặc tình huống của chính người xem" },
  { key: "act", label: "Làm", en: "Act", cta: "mời nhắn tin để trao đổi thêm — không chào giá, không chốt đơn" },
  { key: "advocate", label: "Giới thiệu", en: "Advocate", cta: "mời gửi video cho một người đang gặp đúng chuyện này" },
];

export const DEFAULT_STAGE: PathStage = "ask";

export function stageInfo(s: PathStage) {
  return PATH_STAGES.find((p) => p.key === s)!;
}

/**
 * Chặng 5A từ mục tiêu nội dung (mục tiêu kênh / chiến dịch đã gắn: kiểu thực thi, mục tiêu, chỉ số). Không có / không rõ → Hỏi
 * (vlog chia sẻ: bình luận vừa tạo tương tác vừa trả insight về bước nghiên cứu).
 */
export function stageFromGoal(text?: string | null): PathStage {
  const t = (text ?? "").normalize("NFC").toLowerCase();
  if (!t.trim()) return DEFAULT_STAGE;
  if (/lead_gen|\blead|leads|messages|forms|inbox|nhắn tin|tin nhắn|đăng ký|chuyển đổi|conversion|đặt lịch|tư vấn/u.test(t)) return "act";
  if (/nurture|contacts|chăm sóc|khách cũ|giới thiệu|chia sẻ|advoca|share|referral/u.test(t)) return "advocate";
  if (/engagement|tương tác|bình luận|comment|hỏi đáp/u.test(t)) return "ask";
  if (/reach|views|nhận biết|awareness|tiếp cận|lượt xem|độ phủ/u.test(t)) return "aware";
  if (/follow|theo dõi|quan tâm|yêu thích|lưu/u.test(t)) return "appeal";
  return DEFAULT_STAGE;
}

function stageFromLabel(s: string): PathStage | null {
  const t = s.trim().toLowerCase();
  const hit = PATH_STAGES.find((p) => t === p.key || t.startsWith(p.label.toLowerCase()) || t.includes(`(${p.en.toLowerCase()})`) || t === p.en.toLowerCase());
  return hit?.key ?? null;
}

// ---------- Công thức viết (đưa vào prompt AI và gợi ý theo luật) ----------
/** Luật công thức cho AI Nội dung khi viết kịch bản vlog — theo nguyên lý marketing của Philip Kotler (lấy khách hàng làm trung tâm). */
export function vlogFormulaRules(stage: PathStage, brandVoice = "", pronouns: Pronouns = pronounsFromVoice(brandVoice)): string {
  const st = stageInfo(stage);
  const p = pronouns;
  return [
    "CÔNG THỨC (theo nguyên lý marketing của Philip Kotler: lấy khách hàng làm trung tâm, nói giá trị khách nhận được, không nói tính năng):",
    "0. STP — chọn MỘT nhóm khách cụ thể trong căn cứ (ai, đang ở tình huống nào) và chỉ nói với đúng nhóm đó. Ghi nhóm này vào trường segment.",
    "1. HOOK (0–3s): nói thẳng nhu cầu / nỗi đau của nhóm khách đó bằng chính lời của khách (lấy từ insight, bình luận). Một câu, tối đa 12–15 chữ, không chào, không giới thiệu bản thân.",
    "2. CÂU CHUYỆN (3–25s): đây là chỗ của chuyện thật của OWNER. Hiện CHƯA có chuyện thật (OWNER chưa trả lời, chưa chọn trang Second Brain): " +
      "để TRỐNG lời nói cảnh này và ghi vào trường ownerHint đúng một gợi ý \"[OWNER KỂ: …]\" nói rõ chuyện cần kể (lúc nào, đã làm gì, kết quả). " +
      "TUYỆT ĐỐI không đặt [OWNER KỂ: …] hay chỗ trống nào trong lời nói; không bịa trải nghiệm; không lấy lời người trên diễn đàn / mạng xã hội làm câu chuyện.",
    "3. GIÁ TRỊ / BÀI HỌC (25–50s): tuyên bố giá trị — MỘT thay đổi / lợi ích cụ thể khách nhận được, một ý duy nhất, làm được ngay. Nói lợi ích (khách được gì), không liệt kê tính năng. " +
      "Có bằng chứng trong căn cứ thì dẫn ngắn \"theo …\"; không có thì không nêu số liệu.",
    `4. KẾT (50–60s): MỘT lời mời nhẹ đúng chặng hành trình khách 5A (Biết → Thích → Hỏi → Làm → Giới thiệu). Chặng hiện tại: ${st.label} (${st.en}) → ${st.cta}. Không chào bán, không nêu giá, không hứa thu nhập.`,
    `Xưng hô: OWNER xưng "${p.self}", gọi người xem là "${p.audience}" — nhất quán mọi cảnh (không lẫn "mình" / "tôi" / "bạn" khác cặp này).`,
    "Lời lẽ của khách (bình luận, diễn đàn) chỉ được làm MỘT câu dẫn chứng phụ ở cảnh Giá trị khi thật sự liên quan, dạng \"Có bạn chia sẻ…\" — không bao giờ là câu chuyện chính.",
    `Tổng lời thoại ~110–150 chữ (dưới ${VLOG_MAX_SEC} giây), câu ngắn, giọng nói chuyện tự nhiên. Chữ trên màn hình tối đa 8 chữ mỗi cảnh. Hình ảnh: một câu ngắn, quay được bằng điện thoại.`,
    "Lời thoại là câu nói với người xem — TUYỆT ĐỐI không có ghi chú về dữ liệu, độ tin cậy hay quy trình nội bộ (\"AI suy luận\", \"chưa kiểm chứng\", \"bản nháp nội bộ\", \"chưa phải căn cứ\"…). " +
      "Căn cứ yếu thì nói ít hơn, không rào đón.",
    "",
    ...ogilvyCopyRules(brandVoice, p),
  ].join("\n");
}

/**
 * CÔNG THỨC VLOG CHIA SẺ KINH NGHIỆM — dùng thay công thức chung khi OWNER đã có chuyện thật (câu trả lời / trang Second Brain đã tích).
 * Skill CHI PHỐI: "Skill viết content của anh" — SK-KNW-01 BAOR Content Sales (Second Brain [OWNER]); Kotler (nói gì) và Ogilvy (viết thế
 * nào) chỉ là luật nghề PHỤ. Mọi sự thật chỉ từ khối KINH NGHIỆM — không giả lập kinh nghiệm.
 */
export function experienceFormulaRules(stage: PathStage, brandVoice = "", pronouns: Pronouns = pronounsFromVoice(brandVoice)): string {
  const st = stageInfo(stage);
  const p = pronouns;
  const Aud = p.audience.charAt(0).toUpperCase() + p.audience.slice(1);
  return [
    `SKILL CHI PHỐI: ${CONTENT_SKILL.label} — "Content là Output. Experience Knowledge mới là Source of Truth."`,
    "NGUỒN SỰ THẬT DUY NHẤT: mục \"KINH NGHIỆM THẬT CỦA OWNER\" (câu OWNER trả lời phỏng vấn + trang Second Brain OWNER đã chọn). Nghiên cứu / insight bên ngoài chỉ để kiểm chứng, bổ sung, so sánh — KHÔNG thay kinh nghiệm. " +
      "KHÔNG thêm sự việc, con số, thời gian, địa điểm, tên người, câu khách nói, cảm xúc hay kết quả nào không có trong mục đó. Thiếu thì nói chung hơn — không giả lập kinh nghiệm.",
    "BƯỚC 1 — BÓC TÁCH TRƯỚC KHI VIẾT (trường extraction, chỉ từ câu trả lời; không có thì để trống): Situation (tình huống) · Customer (khách ở trạng thái nào) · Problem (vấn đề thật) · BAOR Action · Result · Lesson · Principle · Limitation (khi nào đúng / không đúng) · Content Potential; " +
      "và POINT OF VIEW: Common View (số đông nghĩ gì) · BAOR Belief · Why · Example (ví dụ thật).",
    "BƯỚC 2 — QUALITY GATE (trường quality): kinh nghiệm có thật sự đến từ BAOR? có ví dụ thật? có bài học thực tế? có POV? Chuyện chưa đủ để kể (không có tình huống thật) → enough=false, KHÔNG viết chuyện, để trống lời nói cảnh Câu chuyện, ghi gợi ý vào ownerHint và đặt MỘT câu hỏi phỏng vấn tiếp (followUp, hỏi OWNER, xưng \"anh\", không thuật ngữ).",
    `BƯỚC 3 — GÓC (angle): ${ANGLES.map((a) => a.en).join(" · ")}. OWNER đã chọn thì theo; chưa chọn thì chọn góc hợp nhất với chuyện.`,
    "BƯỚC 4 — VIẾT 4 THẺ (≤ 60 giây) theo cấu trúc mặc định của skill: HOOK → REAL SITUATION → COMMON MISTAKE → BAOR OBSERVATION → WHY → BETTER APPROACH → EXAMPLE → LESSON → CTA (CTA không ép):",
    `1. HOOK (0–3s): sai lầm / ngược số đông / khoảnh khắc thật, ngôi thứ nhất, như một tiêu đề cụ thể. Dạng gợi ý: "Lần đầu [làm X], ${p.self} [sai lầm / kết quả cụ thể]." — chỉ chi tiết có trong câu trả lời. Một câu, tối đa 12–15 chữ, không chào.`,
    `2. CÂU CHUYỆN (3–25s): tình huống thật + sai lầm phổ biến — lúc đó ${p.self} gặp gì, đã làm gì, sai ở đâu. Câu ngắn; chi tiết cụ thể CHỈ khi OWNER đã kể.`,
    `3. BÀI HỌC (25–50s): điều ${p.self} quan sát được + vì sao + cách làm tốt hơn (+ ví dụ ngắn nếu OWNER đã kể) — MỘT bài học ${p.audience} áp dụng được ngay, có POV của BAOR (\"Nhiều người nghĩ… nhưng ${p.self} thấy…\"). Kotler: nói giá trị cho đúng nhóm khách đã chọn.`,
    `4. KẾT (50–60s): bài học trong một câu + hỏi ${p.audience} về trải nghiệm của chính họ (\"${Aud} đã từng…?\") hoặc MỘT lời mời đúng chặng 5A — chặng hiện tại: ${st.label} (${st.en}) → ${st.cta}. Không chào bán, không nêu giá, không hứa thu nhập.`,
    "0. STP — chọn MỘT nhóm khách cụ thể đang gặp đúng tình huống trong chuyện; ghi vào trường segment.",
    `KHÔNG biến trải nghiệm cá nhân thành sự thật toàn thị trường: không \"90% khách…\", \"ai cũng…\", \"mọi khách…\" khi không có bằng chứng; giữ phạm vi (\"Trong đội Sales của ${p.self}…\", \"${p.self} thấy…\").`,
    "Tránh nội dung kiến thức chung kiểu \"5 cách chốt sales\" — người xem phải thấy \"người này đã làm Sales thật\", không phải \"vừa đọc một cuốn sách Sales\".",
    `Giọng: ngôi thứ nhất xuyên suốt; OWNER xưng "${p.self}", gọi người xem là "${p.audience}" — nhất quán mọi cảnh; đúng giọng thương hiệu.`,
    "Lời người trên diễn đàn / bình luận KHÔNG phải câu chuyện; nếu thật sự liên quan chỉ được làm MỘT câu dẫn chứng phụ ở cảnh Bài học, dạng \"Có bạn chia sẻ…\".",
    "Lời nói KHÔNG BAO GIỜ chứa chỗ trống / ghi chú như \"[OWNER KỂ: …]\", \"[…]\", \"(chèn …)\". Thiếu ý cho cảnh nào thì viết bằng ý đã có và ghi gợi ý \"[OWNER KỂ: …]\" vào trường ownerHint của cảnh đó.",
    `Tổng lời thoại ~110–150 chữ (dưới ${VLOG_MAX_SEC} giây), câu ngắn, giọng nói chuyện tự nhiên. Chữ trên màn hình tối đa 8 chữ mỗi cảnh. Hình ảnh: một câu ngắn, quay được bằng điện thoại.`,
    "Lời thoại là câu nói với người xem — không có ghi chú về dữ liệu, độ tin cậy hay quy trình nội bộ (\"AI suy luận\", \"chưa kiểm chứng\", \"bản nháp nội bộ\"…).",
    "",
    "LUẬT NGHỀ PHỤ (sau skill của OWNER):",
    ...ogilvyCopyRules(brandVoice, p),
  ].join("\n");
}

/**
 * CÁCH VIẾT — theo phong cách copywriting của David Ogilvy (Kotler quyết định NÓI GÌ: nhóm khách, nhu cầu, giá trị, chặng 5A;
 * phần này quyết định VIẾT THẾ NÀO). Là cách BAOR áp dụng phong cách, không trích lời, không phải khung do Ogilvy soạn.
 */
export function ogilvyCopyRules(brandVoice = "", pronouns: Pronouns = DEFAULT_PRONOUNS): string[] {
  return [
    "CÁCH VIẾT (theo phong cách copywriting của David Ogilvy):",
    "- Một ý lớn duy nhất (big idea) cho cả video; mọi cảnh phục vụ ý đó.",
    `- Hook như một tiêu đề: cụ thể, mang lợi ích hoặc điều mới cho người xem, nói với MỘT người (\"${pronouns.audience}\"); không chơi chữ cho vui. Con số / chi tiết cụ thể thắng lời chung chung — chỉ dùng sự thật có trong căn cứ.`,
    "- Dữ kiện thay cho tính từ: không so sánh nhất, không thổi phồng (\"nhất\", \"tuyệt vời\", \"đỉnh cao\"… khi không có bằng chứng). Cụ thể: ai, làm gì, bao nhiêu — chỉ từ căn cứ.",
    "- Lời nói đời thường, câu ngắn (phần lớn ≤ 20 chữ), như nói với một người bạn; tôn trọng trí thông minh của người xem.",
    "- Cho thấy lợi ích và đưa MỘT lý do để tin (bằng chứng / lời khách trong căn cứ); không có thì không nêu — gợi ý \"[OWNER KỂ: …]\" chỉ ở trường ownerHint, không trong lời nói; không bịa.",
    `- Giữ đúng giọng thương hiệu${brandVoice.trim() ? ` (${brandVoice.trim()})` : ""} — hình ảnh thương hiệu lâu dài hơn mẹo câu view ngắn hạn.`,
    "- Lời mời cuối rõ ràng, trung thực.",
  ];
}

// ---------- Ghi chú nội bộ lọt vào dàn ý / lời thoại ----------
// Dàn ý hook từng chứa lời bình của AI về CHÍNH dữ liệu / bản nháp của hệ thống ("…được gắn nhãn AI suy luận, chưa kiểm chứng",
// "bản nháp nội bộ", "chưa phải căn cứ…", "nêu rõ cần dữ liệu…") — không phải nội dung nói với người xem. Mẫu chỉ nhắm câu TỰ NÓI VỀ
// dữ liệu / bản nháp của mình (phản biện 26/10: "Thông tin chưa kiểm chứng trên mạng…", "Đừng gắn nhãn khách khó tính",
// "Giả thuyết sai khiến bạn mất khách" là nội dung thật, không được bắt).
const META_PATTERNS: RegExp[] = [
  /(?<![\p{L}])AI\s+suy luận/iu,
  /(?:gắn\s+)?nhãn\s+(?:là\s+)?(?:DRAFT|AI\b|nội bộ|chưa kiểm chứng)/iu,
  /bản nháp nội bộ|(?:tài liệu|dữ liệu|ghi chú)\s+nội bộ/iu,
  /(?:căn cứ|phát hiện|insight|bản ghi|dữ liệu (?:này|đó|trên|được nhắc)|nguồn này)[^.!?\n]{0,40}(?:chưa|không)\s+(?:được\s+)?kiểm chứng/iu,
  /(?<![\p{L}])(?:chưa|không)\s+(?:phải|là)\s+căn cứ/iu,
  /(?<![\p{L}])(?:chưa|không)\s+(?:có|đủ)\s+(?:căn cứ|bằng chứng|dữ liệu phù hợp)\s+(?:để|cho)\s+(?:nói|kết luận|khuyên|khẳng định)/iu,
  /không trực tiếp chứng minh|chưa chứng minh được kết luận/iu,
  /không đại diện (?:cho )?(?:tất cả|toàn bộ)/iu,
  /(?:^|[;,.:]\s*)(?:nói rõ|nêu rõ|giải thích|lưu ý biên tập)\s*(?::|rằng|cần)/iu,
];

export function isMetaNote(text: string): boolean {
  const t = text.normalize("NFC");
  return META_PATTERNS.some((re) => re.test(t));
}

/** Bỏ nhịp dàn ý là ghi chú nội bộ (chỉ dùng cho dàn ý AI tạo; dàn ý OWNER nhập tay không lọc). */
export function cleanBeats(beats: string[]): { beats: string[]; dropped: number } {
  const keep = beats.map((b) => b.trim()).filter(Boolean);
  const out = keep.filter((b) => !isMetaNote(b));
  return { beats: out, dropped: keep.length - out.length };
}

// ---------- Đọc / ghi bản chữ ----------
// LUẬT KHÔNG MẤT CHỮ (phản biện 26/10, P1): ô ẩn "draft" luôn gửi serializeVlog(parseVlogDraft(bản cũ)), nên chỉ cần mở rồi Lưu là
// mọi chữ của OWNER phải còn. Chuẩn hoá ĐƯỢC PHÉP (và chỉ những thứ này):
//  - tiêu đề cảnh / nhãn trường viết lại dạng chuẩn ("**1. HOOK**" → "1. HOOK (0–3s)", "Lời thoại (giọng ấm):" → "Lời thoại:" + ghi chú
//    "(Lời thoại: giọng ấm)" trong Ghi chú khác); thứ tự trường trong cảnh theo dạng chuẩn; "Nhạc nền / Ghi chú dựng" dời xuống cuối;
//  - trường lặp trong một cảnh được NỐI (lời thoại: xuống dòng; hình ảnh / chữ trên màn hình: dấu cách), không ghi đè;
//  - lời thoại giữ xuống dòng; dòng trống giữa lời thoại gộp thành một lần xuống dòng (hạ nguồn coi dòng nối tiếp là lời thoại);
//  - hình ảnh / chữ trên màn hình nhiều dòng gộp bằng dấu cách; "Ý chính: a · b" tách thành từng dòng;
//  - dòng "Chặng khách (5A)" nhận ra được viết lại theo nhãn chuẩn; dòng lạ (chặng không rõ, "Khách mục tiêu" thứ hai…) giữ nguyên.
const HEADING = /^[#*_\s]*(?:\d+\s*[.)]\s*)?(hook|câu chuyện|bài học|giá trị(?:\s*\/\s*bài học)?|kết(?:\s*\/\s*cta)?)\s*(?:\(([^)]*)\))?[\s*_:]*$/iu;
const FIELD = /^[-•*\s]*\**\s*(hình ảnh|lời thoại|lời nói|chữ trên màn hình|gợi ý owner|ý chính|căn cứ)\s*(?:\(([^)]*)\))?\s*\**\s*:\s*\**\s*(.*?)\s*$/iu;
const TAIL = /^\s*(?:nhạc nền|ghi chú dựng)\s*:/iu;
const SEGMENT = /^\s*khách mục tiêu\s*:\s*(.*)$/iu;
const STAGE = /^\s*chặng khách(?:\s*\(5a\))?\s*:\s*(.*)$/iu;
/** Dòng lời thoại mà đứng riêng sẽ bị đọc sai (tiêu đề cảnh, nhãn trường, nhạc nền, "2. …" của bản đọc khi quay) → nối vào dòng trước. */
const UNSAFE_SPEECH_LINE = /^\s*(?:[#*_]*\s*\d+\s*[.)]|[-•*]*\s*\**\s*(?:hình ảnh|lời thoại|lời nói|chữ trên màn hình|gợi ý owner|ý chính|căn cứ|nhạc nền|ghi chú dựng|khách mục tiêu|chặng khách)\b[^:]{0,40}:)/iu;

const keyOf = (name: string): VlogKey => {
  const n = name.toLowerCase();
  if (n === "hook") return "hook";
  if (n.startsWith("câu chuyện")) return "story";
  if (n.startsWith("kết")) return "end";
  return "value";
};

const emptyCard = (key: VlogKey): VlogCard => ({ key, speech: "", visual: "", onScreen: "", notes: [], ownerHints: [], extra: [] });

export function emptyVlogDoc(title = ""): VlogDoc {
  return { head: title ? [`KỊCH BẢN VLOG: ${title}`] : [], segment: "", stage: null, cards: VLOG_CARDS.map((c) => emptyCard(c.key)), tail: [] };
}

/** Bỏ MỘT cặp ngoặc kép bao trọn câu — chỉ dùng cho lời AI vừa viết (AI hay bọc “…”); chữ OWNER giữ nguyên ngoặc. */
export function unquoteAi(s: string): string {
  const t = s.trim();
  const m = t.match(/^[“"]([^“”"]*)[”"]$/u);
  return m ? m[1].trim() : t;
}

const oneLine = (s: string) => s.replace(/\s*\n+\s*/g, " ").replace(/[ \t]+/g, " ").trim();
/** Lời thoại: giữ xuống dòng, bỏ dòng trống, gộp khoảng trắng trong dòng. */
const speechLines = (s: string) => s.split(/\r?\n/).map((l) => l.replace(/[ \t]+/g, " ").trim()).filter(Boolean);
const join = (a: string, b: string, sep: string) => (a.trim() ? (b.trim() ? `${a}${sep}${b}` : a) : b);
const segmentLine = (v: string) => `Khách mục tiêu: ${oneLine(v)}`;
const stageLine = (st: PathStage) => `Chặng khách (5A): ${stageInfo(st).label} (${stageInfo(st).en})`;

/**
 * Bản chữ → thẻ cảnh. Trả null khi KHÔNG phải kịch bản vlog soạn được bằng thẻ: khung cũ 5 cảnh, chữ tự do không có tiêu đề cảnh,
 * hoặc một cảnh xuất hiện hai lần (không đoán). Bản trống → bộ thẻ trống.
 */
export function parseVlogDraft(draft: string): VlogDoc | null {
  const text = (draft ?? "").normalize("NFC");
  if (!text.trim()) return emptyVlogDoc();
  if (isLegacyScript(text)) return null;
  const doc: VlogDoc = { head: [], segment: "", stage: null, cards: [], tail: [] };
  const found = new Map<VlogKey, VlogCard>();
  let cur: VlogCard | null = null;
  let field: "speech" | "visual" | "onScreen" | null = null;
  let afterBlank = false;
  let inTail = false;
  let haveSegment = false;
  const all = text.split(/\r?\n/);
  for (let li = 0; li < all.length; li++) {
    const line = all[li].replace(/\s+$/u, "");
    const h = line.trim().length <= 60 ? line.match(HEADING) : null;
    if (h) {
      // Tiêu đề cảnh kết thúc cả phần "Nhạc nền / Ghi chú dựng" đặt giữa các cảnh (phần đó dời xuống cuối khi ghi)
      inTail = false;
      const key = keyOf(h[1]);
      if (found.has(key)) return null;
      cur = emptyCard(key);
      found.set(key, cur);
      field = null;
      afterBlank = false;
      continue;
    }
    if (inTail) {
      doc.tail.push(line);
      continue;
    }
    if (TAIL.test(line)) {
      inTail = true;
      if (doc.tail.length && doc.tail.at(-1)) doc.tail.push("");
      doc.tail.push(line.trim());
      continue;
    }
    if (!cur) {
      // Khối kinh nghiệm OWNER (một khối, trước cảnh 1): dòng trống / dòng lạ kết thúc khối và được đọc như thường
      if (!doc.experience && isExperienceHeader(line)) {
        const r = readExperienceBlock(all, li);
        if (!isEmptyExperience(r.experience)) doc.experience = r.experience;
        li = r.next - 1;
        continue;
      }
      const seg = line.match(SEGMENT);
      const stg = line.match(STAGE);
      const st = stg ? stageFromLabel(stg[1]) : null;
      if (seg && !haveSegment) {
        haveSegment = true;
        doc.segment = seg[1].trim();
        doc.head.push(segmentLine(doc.segment));
      } else if (st && !doc.stage) {
        doc.stage = st;
        doc.head.push(stageLine(st));
      } else doc.head.push(line.trim()); // dòng lạ (kể cả chặng không rõ, khách mục tiêu thứ hai) giữ nguyên
      continue;
    }
    const f = line.match(FIELD);
    if (f) {
      const k = f[1].toLowerCase();
      const qualifier = f[2]?.trim();
      const v = f[3].trim();
      if (qualifier) cur.extra.push(`(${f[1].trim()}: ${qualifier})`);
      afterBlank = false;
      if (k === "lời thoại" || k === "lời nói") {
        field = "speech";
        cur.speech = join(cur.speech, v, "\n");
      } else if (k === "hình ảnh") {
        field = "visual";
        cur.visual = join(cur.visual, v, " ");
      } else if (k === "chữ trên màn hình") {
        field = "onScreen";
        cur.onScreen = join(cur.onScreen, v, " ");
      } else {
        field = null;
        // Không xoá "Ý chính" nào khi đọc (kể cả ghi chú nội bộ) — trình soạn đánh dấu để OWNER tự bỏ
        if (k === "ý chính") cur.notes.push(...v.split(/\s+·\s+/u).map((x) => x.trim()).filter(Boolean));
        else if (k === "gợi ý owner") cur.ownerHints.push(v);
        else cur.extra.push(`Căn cứ: ${v}`);
      }
      continue;
    }
    if (!line.trim()) {
      afterBlank = true;
      continue;
    }
    // Dòng nối tiếp: sau lời thoại thì vẫn là lời thoại (kể cả sau một dòng trống); sau hình ảnh / chữ thì nối nếu chưa có dòng trống
    if (field === "speech") cur.speech = join(cur.speech, line.trim(), "\n");
    else if (field && !afterBlank) cur[field] = join(cur[field], line.trim(), " ");
    else {
      field = null;
      cur.extra.push(line.trim());
    }
    afterBlank = false;
  }
  if (!found.size) return null;
  doc.cards = VLOG_CARDS.map((c) => found.get(c.key) ?? emptyCard(c.key));
  while (doc.head.length && !doc.head.at(-1)) doc.head.pop();
  while (doc.head.length && !doc.head[0]) doc.head.shift();
  while (doc.tail.length && !doc.tail.at(-1)) doc.tail.pop();
  return doc;
}

/** Lời thoại → các dòng an toàn để ghi (dòng có thể bị đọc nhầm thành tiêu đề / nhãn thì nối vào dòng trước). */
function speechOut(speech: string): string[] {
  const out: string[] = [];
  for (const l of speechLines(speech)) {
    if (out.length && (UNSAFE_SPEECH_LINE.test(l) || (l.length <= 60 && HEADING.test(l)))) out[out.length - 1] = `${out[out.length - 1]} ${l}`;
    else out.push(l);
  }
  return out;
}

/** Thẻ cảnh → bản chữ cảnh (định dạng lưu trữ hiện có). parseVlogDraft(serializeVlog(d)) trả lại đúng d (sau lần chuẩn hoá đầu). */
export function serializeVlog(doc: VlogDoc): string {
  const out: string[] = [];
  let segDone = false;
  let stageDone = false;
  for (const [i, l] of doc.head.entries()) {
    if (!l && !(i > 0 && doc.head[i - 1])) continue;
    const seg = l.match(SEGMENT);
    const stg = l.match(STAGE);
    if (seg && !segDone) {
      segDone = true;
      if (doc.segment.trim()) out.push(segmentLine(doc.segment));
    } else if (stg && stageFromLabel(stg[1]) && !stageDone) {
      stageDone = true;
      if (doc.stage) out.push(stageLine(doc.stage));
    } else out.push(l);
  }
  if (!segDone && doc.segment.trim()) out.push(segmentLine(doc.segment));
  if (!stageDone && doc.stage) out.push(stageLine(doc.stage));
  out.push(...experienceLines(doc.experience));
  if (out.length) out.push("");
  VLOG_CARDS.forEach((def, i) => {
    const c = doc.cards.find((x) => x.key === def.key) ?? emptyCard(def.key);
    out.push(`${i + 1}. ${def.heading} (${def.seconds})`);
    for (const n of c.notes) out.push(`Ý chính: ${oneLine(n)}`);
    // Dòng lạ / Căn cứ ngay sau tiêu đề cảnh (chưa vào trường nào) — đặt sau "Chữ trên màn hình:" thì bị đọc là chữ nối tiếp
    out.push(...c.extra.map(oneLine).filter(Boolean));
    out.push(`Hình ảnh: ${oneLine(c.visual)}`);
    for (const h of c.ownerHints) out.push(`Gợi ý OWNER: ${oneLine(h)}`);
    const sp = speechOut(c.speech);
    out.push(`Lời thoại: ${sp[0] ?? ""}`, ...sp.slice(1));
    out.push(`Chữ trên màn hình: ${oneLine(c.onScreen)}`);
    out.push("");
  });
  out.push(...doc.tail);
  return out.join("\n").replace(/\n+$/u, "");
}

// ---------- Thời lượng + kiểm nhanh ----------
/** Số từ (âm tiết) nói thành lời — bỏ phần trong [ ] như speechEstimate. */
export function spokenWords(s: string): number {
  return s.normalize("NFC").replace(/\[[^\]]*\]/g, " ").split(/[^\p{L}\p{N}]+/u).filter(Boolean).length;
}

export function vlogTimeline(doc: VlogDoc): { cards: { key: VlogKey; words: number; seconds: number }[]; words: number; seconds: number; over: boolean } {
  const cards = doc.cards.map((c) => {
    const words = spokenWords(c.speech);
    return { key: c.key, words, seconds: Math.round(words / VLOG_WORDS_PER_SEC) };
  });
  const words = cards.reduce((n, c) => n + c.words, 0);
  const seconds = Math.round(words / VLOG_WORDS_PER_SEC);
  return { cards, words, seconds, over: seconds > VLOG_MAX_SEC };
}

export interface VlogCheck {
  key: "hook" | "idea" | "benefit" | "cta" | "policy" | "specific" | "hype" | "short" | "owner" | "meta";
  ok: boolean;
  label: string;
  /** Lý do khi chưa đạt (hiện khi rê chuột). */
  why?: string;
}

const BENEFIT = /(?<![\p{L}])(?:giúp|bớt|đỡ|nhanh hơn|dễ hơn|rõ hơn|chắc hơn|nhẹ hơn|không còn|không phải|tiết kiệm|biết ngay|làm được|giữ được|thay vì|nhờ vậy|nhờ đó|nhờ thế|tăng|có ngay)(?![\p{L}])/iu;
const CTA = /(?<![\p{L}])(?:lưu|theo dõi|follow|bình luận|comment|nhắn|inbox|chia sẻ|share|gửi|kể cho mình|hỏi mình|để lại|xem tiếp)(?![\p{L}])/iu;
const HARD_SELL = /(?<![\p{L}])(?:mua ngay|chốt đơn|đặt hàng|giảm giá|khuyến mãi|ưu đãi|giá chỉ|giá (?:tốt|rẻ)|chỉ còn|số lượng có hạn|inbox (?:để )?(?:mua|đặt))(?![\p{L}])/iu;
// Hook cụ thể (tiêu đề kiểu Ogilvy): có con số / chi tiết đếm được hoặc nói rõ lợi ích
const SPECIFIC = /\p{N}|(?<![\p{L}])(?:hai|ba|bốn|năm|sáu|bảy|tám|chín|mười|trăm|nghìn|ngàn|triệu|nửa|một nửa|mỗi ngày|mỗi tuần|phút|giây|giờ|ngày|tuần|tháng)(?![\p{L}])/iu;
// So sánh nhất / thổi phồng. "nhất" trong "thống nhất", "duy nhất" (luật nền tảng), "thứ nhất", "nhất định", "nhất là", "nhất quán" không tính.
const SUPERLATIVE = /(?<![\p{L}])(?:(?<!(?:thống|duy|đồng|hợp|thứ|độc)\s)nhất(?!\s*(?:định|là|quán|thời|loạt))|tuyệt vời|đỉnh cao|đỉnh nhất|siêu đỉnh|hoàn hảo|thần thánh|bá đạo|cực phẩm|không thể tin|kỳ diệu|thần kỳ)(?![\p{L}])/iu;
const PROOF = /(?<![\p{L}])(?:theo|khảo sát|số liệu|nghiên cứu)(?![\p{L}])|\[[SK]\d+\]/iu;
const LONG_SENTENCE = 20;

/** Câu lời nói (tách theo . ! ? … ; xuống dòng), bỏ phần trong [ ]. */
export function spokenSentences(text: string): string[] {
  return text.replace(/\[[^\]]*\]/g, " ").split(/[.!?…;\n]+/u).map((x) => x.trim()).filter((x) => spokenWords(x) > 0);
}

const LIST_MARK = /(?<![\p{L}])(?:thứ hai|thứ ba|bước 2|bước hai|cách 2|cách thứ hai|điều thứ hai)(?![\p{L}])/iu;

/**
 * Kiểm nhanh theo công thức (theo luật, không AI): hook ≤ 15 chữ, một ý, nêu lợi ích, có lời mời, không chào bán / hứa hẹn (Kotler);
 * hook cụ thể, không nói quá, câu ngắn (phong cách copywriting của David Ogilvy).
 */
export function vlogChecks(doc: VlogDoc): VlogCheck[] {
  const card = (k: VlogKey) => doc.cards.find((c) => c.key === k) ?? emptyCard(k);
  const hookWords = spokenWords(card("hook").speech);
  const value = card("value").speech;
  const sentences = value.split(/[.!?…]+/u).map((s) => s.trim()).filter(Boolean).length;
  const all = doc.cards.map((c) => `${c.speech}\n${c.onScreen}`).join("\n");
  const policy = policyIssues(all, ["facebook", "instagram", "tiktok", "youtube"]);
  const sell = HARD_SELL.test(all);
  const hookSpeech = card("hook").speech;
  const sentencesAll = doc.cards.flatMap((c) => spokenSentences(c.speech));
  const hype = sentencesAll.filter((x) => SUPERLATIVE.test(x) && !PROOF.test(x)).map((x) => x.match(SUPERLATIVE)![0]);
  const long = sentencesAll.filter((x) => spokenWords(x) > LONG_SENTENCE).length;
  const longShare = sentencesAll.length ? long / sentencesAll.length : 0;
  const out: VlogCheck[] = [
    { key: "hook", ok: hookWords > 0 && hookWords <= 15, label: hookWords ? `Hook ${hookWords} chữ` : "Hook trống", why: hookWords > 15 ? "Hook nên ≤ 12–15 chữ" : hookWords ? undefined : "Chưa có câu hook" },
    { key: "idea", ok: !!value.trim() && sentences <= 4 && !LIST_MARK.test(value), label: "Một ý chính", why: !value.trim() ? "Cảnh Giá trị còn trống" : "Cảnh Giá trị nên chỉ một ý" },
    { key: "benefit", ok: BENEFIT.test(value), label: "Nêu lợi ích", why: "Nói rõ khách được gì / đổi được gì" },
    { key: "cta", ok: CTA.test(card("end").speech), label: "Có lời mời", why: "Cảnh Kết cần một lời mời nhẹ (lưu, bình luận, nhắn…)" },
    { key: "policy", ok: !policy.length && !sell, label: "Không chào bán", why: [...policy, ...(sell ? ["giọng chào bán (mua ngay, giảm giá…)"] : [])].join("; ") || undefined },
    // Phong cách copywriting của David Ogilvy: hook cụ thể, không nói quá, câu ngắn
    { key: "specific", ok: !!hookSpeech.trim() && (SPECIFIC.test(hookSpeech) || BENEFIT.test(hookSpeech)), label: "Hook cụ thể", why: "Hook nên có lợi ích hoặc chi tiết cụ thể (con số, thời gian…) từ căn cứ" },
    { key: "hype", ok: !hype.length, label: "Không nói quá", why: hype.length ? `Bỏ từ thổi phồng không có bằng chứng: “${hype.slice(0, 2).join("”, “")}”` : undefined },
    { key: "short", ok: longShare <= 0.25, label: "Câu ngắn", why: `Phần lớn câu nên ≤ ${LONG_SENTENCE} chữ (${long} câu dài)` },
  ];
  if (doc.cards.some((c) => hasPlaceholder(c.speech))) out.push({ key: "owner", ok: false, label: "Chờ OWNER kể", why: "Thay [OWNER KỂ: …] bằng chuyện thật của anh" });
  if (doc.cards.some((c) => isMetaNote(c.speech))) out.push({ key: "meta", ok: false, label: "Có ghi chú nội bộ", why: "Lời nói có câu về dữ liệu / quy trình nội bộ — bỏ đi" });
  return out;
}

/**
 * Bộ lọc sau khi AI tạo hook: bỏ nhịp dàn ý là ghi chú nội bộ; câu hook là ghi chú, hoặc mọi nhịp đều là ghi chú → bỏ cả hook
 * (căn cứ yếu thì thà ít hook hơn, không giữ lời rào đón).
 */
export function stripMetaHooks<T extends { hook: string; angle?: string; beats?: string[] }>(items: T[]): { items: T[]; metaBeats: number; metaHooks: number } {
  let metaBeats = 0;
  let metaHooks = 0;
  const out: T[] = [];
  for (const it of items) {
    const raw = (it.beats ?? []).map((b) => b.trim()).filter(Boolean);
    const { beats, dropped } = cleanBeats(raw);
    metaBeats += dropped;
    // Góc tiếp cận (angle) chỉ là ghi chú biên tập, không bao giờ là lý do bỏ cả hook
    if (isMetaNote(it.hook) || (raw.length > 0 && beats.length === 0)) {
      metaHooks++;
      continue;
    }
    out.push({ ...it, beats });
  }
  return { items: out, metaBeats, metaHooks };
}

// ---------- Vlog chia sẻ kinh nghiệm: chỗ trống ngoài lời nói, kiểm nhanh, điền theo luật ----------
// Chỗ trống trong lời nói, nhận lỏng (hoa thường, có dấu hay không — cùng cách OWNER_RE của shooting-script.ts): "[OWNER KỂ: …]",
// "[owner ke: …]", "(chèn …)", "[…]" / "[...]".
export const hasPlaceholder = (s: string) => new RegExp(PLACEHOLDER_RE.source, "iu").test(s.normalize("NFC"));

// ---------- Câu kể trải nghiệm riêng (chuyện đã xảy ra với người nói) ----------
// Động từ kể chuyện / dấu quá khứ đi sau đại từ người nói: "em nhập 300 bộ", "anh lỗ 5 triệu", "mình đã từng sai".
const NARRATIVE = "(?:đã\\s+)?(?:từng|đã|mất|lỗ|lời|kiếm|bán được|bán|thử|gặp|bị|nhập|tồn|gọi|chốt|làm|mở|học|sai|run|thua|phá sản|đóng cửa|thuê|tuyển|đuổi)";
const SELF_CLAIM = new RegExp(`(?<![\\p{L}])(?:mình|tôi|em)\\s+${NARRATIVE}(?![\\p{L}])`, "iu");
// "anh" / "chị" là người nói chỉ khi KHÔNG phải lời gọi người xem "anh chị" / "anh em" và câu không phải câu hỏi
const ANH_CHI_CLAIM = new RegExp(`(?<![\\p{L}])(?:anh(?!\\s+(?:chị|em|ấy)(?![\\p{L}]))|(?<!anh\\s)chị(?!\\s+(?:em|ấy)(?![\\p{L}])))\\s+${NARRATIVE}(?![\\p{L}])`, "iu");
const PAST_MARK = /(?<![\p{L}])(?:hồi đó|hồi mới|hồi|lần đầu|năm ngoái|hôm trước|tháng đầu|ngày đầu|tuần đầu|trước đây|có lần|dạo đó)(?![\p{L}])/iu;
const ANY_SPEAKER = /(?<![\p{L}])(?:mình|tôi|em|anh(?!\s+chị)|(?<!anh\s)chị)(?![\p{L}])/iu;

/** Câu có kể trải nghiệm riêng của người nói (em / mình / tôi; "anh" / "chị" khi không phải lời gọi người xem và câu không là câu hỏi). */
export function isFirstPersonClaim(text: string): boolean {
  for (const raw of text.normalize("NFC").split(/(?<=[.!?…])\s+|\n+/u)) {
    const sent = raw.trim();
    if (!sent) continue;
    const question = /\?\s*$/u.test(sent);
    if (SELF_CLAIM.test(sent)) return true;
    if (!question && ANH_CHI_CLAIM.test(sent)) return true;
    // Dấu quá khứ + đại từ người nói trong cùng câu ("Hồi đó em…", "Lần đầu bán online, anh…")
    if (!question && PAST_MARK.test(sent) && ANY_SPEAKER.test(sent)) return true;
  }
  return false;
}
/** Dạng có .test() như RegExp — dùng chung cho trình soạn, AI viết kịch bản, lưu hook AI. */
export const FIRST_PERSON_CLAIM = { test: isFirstPersonClaim };

/** Bỏ chỗ trống khỏi lời nói (luật: không bao giờ có chỗ trống giữa câu nói) — trả về dạng "[OWNER KỂ: …]" để ghi vào dòng Gợi ý OWNER. */
export function moveOwnerMarks(speech: string): { speech: string; marks: string[] } {
  const text = speech.normalize("NFC");
  const found = [...text.matchAll(PLACEHOLDER_RE)].map((m) => m[0]);
  if (!found.length) return { speech, marks: [] };
  const marks = found.map((m) => {
    const inner = m.replace(/^[[(]\s*(?:owner\s+k\S*\s*:|ch[eè]n\b)?/iu, "").replace(/[\])]$/u, "").replace(/\s+/g, " ").trim().replace(/^(?:…|\.{2,})$/u, "");
    return `[OWNER KỂ: ${inner || "bổ sung chỗ còn thiếu"}]`;
  });
  const clean = text
    .replace(PLACEHOLDER_RE, " ")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").replace(/\s+([.,!?…;:])/gu, "$1").trim())
    .filter(Boolean)
    .join("\n");
  return { speech: clean, marks };
}

export interface ExperienceCheck {
  key: "real" | "confirmed" | "scope" | "example" | "lesson" | "pov" | "generic" | "added" | "first" | "pronoun";
  ok: boolean;
  label: string;
  why?: string;
}

const FIRST_PERSON = ["em", "mình", "tôi"];
const REFLEXIVE_PREV = new Set(["tự", "chính", "thân", "điều", "của", "việc", "cái"]);
const THIRD_BAN = new Set(["có", "nhiều", "một", "vài", "mấy", "những", "người", "hai", "ba", "các"]);
const LESSON = /(?<![\p{L}])(?:hãy|thử|nên|trước khi|đừng|bắt đầu|mỗi lần|thay vì|chỉ cần|ghi lại|hỏi|chọn|tránh|làm ngay)(?![\p{L}])/iu;
// Point of View BAOR: quan niệm phổ biến ↔ điều BAOR thấy / tin
const POV = /(?<![\p{L}])(?:em|mình|tôi)\s+(?:thấy|tin|nghĩ|cho rằng|rút ra|học được|nhận ra|luôn)|(?:nhiều người|ai cũng|người ta|số đông)\s+(?:nghĩ|tưởng|cho rằng|hay)|(?<![\p{L}])(?:thật ra|thực ra|với em|theo em|theo mình|điều em|điều mình)(?![\p{L}])/iu;
// Biến kinh nghiệm cá nhân thành sự thật toàn thị trường (SK-KNW-01)
const UNIVERSAL = /\d+\s*%\s*(?:khách|người|sales|seller|shop)|(?<![\p{L}])(?:ai cũng|mọi khách|tất cả (?:khách|mọi người|người bán|sales)|mọi người đều|khách nào cũng|100\s*%\s*khách|luôn luôn|không bao giờ sai)(?![\p{L}])/iu;
const SCOPE = /(?<![\p{L}])(?:theo em|em thấy|mình thấy|tôi thấy|trong đội|ở đội|với em|kinh nghiệm của em|theo khảo sát|theo số liệu|nghiên cứu)(?![\p{L}])/iu;
// Kiến thức chung kiểu "5 cách chốt sales"
const GENERIC = /(?:\d+|hai|ba|bốn|năm|sáu|bảy|tám|chín|mười)\s+(?:cách|bí quyết|mẹo|bước|tuyệt chiêu|kỹ năng|nguyên tắc vàng)(?![\p{L}])/iu;
const words = (s: string) => s.normalize("NFC").toLowerCase().replace(/\[[^\]]*\]/g, " ").split(/[^\p{L}]+/u).filter(Boolean);

/** Xưng hô lệch cặp đã chọn trong lời nói (VD: xưng "em" mà có "mình" / "tôi"; gọi "anh chị" mà có "bạn" — trừ "có bạn chia sẻ…"). */
export function pronounSlips(text: string, p: Pronouns): string[] {
  const w = words(text);
  const out = new Set<string>();
  const selfOthers = FIRST_PERSON.filter((x) => x !== p.self);
  w.forEach((t, i) => {
    const prev = w[i - 1] ?? "";
    // "mình" phản thân ("tự mình", "điều mình đoán", "shop của mình") không phải đại từ xưng hô
    if (selfOthers.includes(t) && !(t === "mình" && REFLEXIVE_PREV.has(prev))) out.add(t);
    if (p.audience !== "bạn" && p.audience !== "các bạn" && t === "bạn" && !THIRD_BAN.has(prev) && w[i + 1] !== "bè") out.add("bạn");
    if (!p.audience.startsWith("anh") && t === "anh" && w[i + 1] === "chị") out.add("anh chị");
  });
  // Xưng "em" mà lại kể "anh / chị + việc đã làm" (tự xưng anh / chị) — trừ câu hỏi người xem
  if (p.self === "em") {
    for (const sent of text.normalize("NFC").split(/(?<=[.!?…])\s+|\n+/u)) {
      const m = !/\?\s*$/u.test(sent.trim()) && sent.match(ANH_CHI_CLAIM);
      if (m) out.add(m[0].trim().split(/\s+/)[0].toLowerCase());
    }
  }
  return [...out];
}

/**
 * QUALITY CHECK của "Skill viết content của anh" (SK-KNW-01) — theo luật, không AI: kinh nghiệm đến từ BAOR · đã xác nhận (OWNER tự kể, hoặc
 * trang ACTIVE / VERIFIED) · không biến kinh nghiệm thành sự thật toàn thị trường · có ví dụ thật · bài học áp dụng được · có POV BAOR ·
 * không chung chung · không có phần AI tự thêm (con số / câu trích không có trong câu trả lời) · ngôi thứ nhất · xưng hô nhất quán.
 * `draftRefs`: số trang đã tích còn DRAFT (chưa xác nhận).
 */
export function experienceChecks(doc: VlogDoc, pronouns: Pronouns = DEFAULT_PRONOUNS, opts: { draftRefs?: number; live?: (r: ExperienceRef) => boolean; review?: { items: string[]; valid: boolean } } = {}): ExperienceCheck[] {
  const card = (k: VlogKey) => doc.cards.find((c) => c.key === k) ?? emptyCard(k);
  const exp = doc.experience;
  const have = hasExperience(exp, opts.live);
  const dead = (exp?.refs ?? []).filter((r) => opts.live && !opts.live(r)).length;
  const answers = experienceText(exp);
  const source = `${answers}\n${(exp?.refs ?? []).map((r) => r.label).join("\n")}`;
  const speechAll = doc.cards.map((c) => c.speech).join("\n");
  const told = doc.cards.map((c) => `${c.speech}\n${c.onScreen}`).join("\n");
  // Trang Second Brain đã tích: nội dung trang không có ở trình duyệt → chỉ kiểm khi chuyện hoàn toàn từ câu trả lời (máy chủ kiểm cả
  // nội dung trang sau mỗi lần AI viết và ghi vào review)
  const verifiable = have && !exp.refs.some((r) => (opts.live ? opts.live(r) : true));
  // Trạng thái "Cần xác nhận" của máy chủ (owner-review.ts) — chưa xác nhận hợp lệ thì tính vào "Không thêm chuyện"
  const pending = opts.review && opts.review.items.length && !opts.review.valid ? opts.review.items : [];
  const added = [...pending, ...(verifiable ? addedDetails(told, source) : [])];
  const story = card("story").speech;
  const firstOk = words(story).some((t) => FIRST_PERSON.includes(t));
  const slips = pronounSlips(speechAll, pronouns);
  const value = card("value").speech;
  const universal = doc.cards.flatMap((c) => spokenSentences(c.speech)).filter((s) => UNIVERSAL.test(s) && !SCOPE.test(s));
  const draftRefs = opts.draftRefs ?? 0;
  const liveRefs = (exp?.refs.length ?? 0) - dead;
  const confirmed = have && !dead && !pending.length && (answeredCount(exp) > 0 || draftRefs < liveRefs);
  const generic = [card("hook").speech, ...doc.head].some((t) => GENERIC.test(t));
  return [
    { key: "real", ok: have, label: "Có chuyện thật", why: have ? undefined : "Trả lời câu hỏi ở Kinh nghiệm của anh" },
    {
      key: "confirmed",
      ok: confirmed,
      label: "Đã xác nhận",
      why: confirmed
        ? undefined
        : dead
          ? "Có nguồn đã gỡ khỏi Second Brain — bỏ nguồn đó"
          : pending.length
            ? "Có chi tiết ngoài chuyện của anh — OWNER xác nhận hoặc sửa"
            : have
              ? "Chỉ dựa trên trang Second Brain còn nháp — anh xác nhận hoặc kể thêm"
              : "Chưa có chuyện của anh",
    },
    { key: "added", ok: !added.length, label: "Không thêm chuyện", why: added.length ? `Có chi tiết không có trong chuyện của anh: ${[...new Set(added)].slice(0, 4).join(", ")}` : undefined },
    { key: "scope", ok: !universal.length, label: "Không phổ quát hoá", why: universal.length ? `Kinh nghiệm riêng nói như sự thật chung: “${universal[0].slice(0, 50)}” — giữ phạm vi (“${pronouns.self} thấy…”)` : undefined },
    { key: "example", ok: have && !!story.trim(), label: "Ví dụ thật", why: story.trim() ? "Câu chuyện chưa dựa trên chuyện thật của anh" : "Cảnh Câu chuyện còn trống" },
    { key: "lesson", ok: !!value.trim() && (LESSON.test(value) || BENEFIT.test(value)), label: "Bài học áp dụng được", why: value.trim() ? "Bài học nên nói rõ người xem làm gì / tránh gì" : "Cảnh Bài học còn trống" },
    { key: "pov", ok: POV.test(`${value}\n${story}`) || !!exp?.extraction.belief?.trim(), label: "Góc nhìn BAOR", why: "Nói rõ điều anh thấy / tin khác số đông" },
    { key: "generic", ok: !generic, label: "Không chung chung", why: generic ? "Tránh dạng “5 cách…” — kể chuyện thật + bài học" : undefined },
    { key: "first", ok: !!story.trim() && firstOk, label: "Ngôi thứ nhất", why: story.trim() ? `Câu chuyện nên kể ngôi thứ nhất (“${pronouns.self}…”)` : "Cảnh Câu chuyện còn trống" },
    { key: "pronoun", ok: !slips.length, label: "Xưng hô nhất quán", why: slips.length ? `Đang xưng “${pronouns.self}” – “${pronouns.audience}”, có lẫn: ${slips.join(", ")}` : undefined },
  ];
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const STAGE_LINE: Record<PathStage, (p: Pronouns) => string> = {
  aware: (p) => `${cap(p.audience)} theo dõi ${p.self} để xem phần tiếp nhé.`,
  appeal: (p) => `${cap(p.audience)} lưu video lại để dùng khi cần nhé.`,
  ask: (p) => `${cap(p.audience)} đã từng gặp chuyện này chưa? Kể ${p.self} nghe ở phần bình luận nhé.`,
  act: (p) => `Cần trao đổi thêm, ${p.audience} nhắn tin cho ${p.self} nhé.`,
  advocate: (p) => `${cap(p.audience)} gửi video này cho một người đang gặp đúng chuyện này nhé.`,
};

/**
 * Điền theo luật (không AI) từ câu trả lời của OWNER — CHỈ vào cảnh còn trống, bằng đúng chữ OWNER đã gõ: Câu chuyện = các câu trả lời đầu;
 * Bài học = bài học đã bóc tách, không có thì câu trả lời cuối (khi có ≥ 2); Kết = câu hỏi / lời mời đúng chặng 5A theo cặp xưng hô;
 * Hook trống = câu đầu của câu trả lời đầu (≤ 15 chữ).
 */
export function fillFromExperience(doc: VlogDoc, stage: PathStage, pronouns: Pronouns = DEFAULT_PRONOUNS): VlogDoc {
  const e = doc.experience;
  if (!hasExperience(e)) return doc;
  const ans = e.qa.map((x) => x.a.trim()).filter(Boolean);
  if (!ans.length) return doc;
  const firstSentence = ans[0].split(/(?<=[.!?…])\s+|\n/u)[0]?.trim() ?? "";
  const lesson = e.extraction.lesson?.trim() || (ans.length >= 2 ? ans.at(-1)! : "");
  const storyAns = ans.length >= 2 && !e.extraction.lesson?.trim() ? ans.slice(0, -1) : ans;
  const fill: Partial<Record<VlogKey, string>> = {
    hook: firstSentence && spokenWords(firstSentence) <= 15 ? firstSentence : "",
    story: storyAns.join("\n"),
    value: lesson,
    end: STAGE_LINE[stage](pronouns),
  };
  return {
    ...doc,
    cards: doc.cards.map((c) => {
      const v = fill[c.key];
      if (c.speech.trim() || !v) return c;
      return { ...c, speech: v, ownerHints: c.ownerHints.filter((h) => !h.includes("[OWNER KỂ")) };
    }),
  };
}

/**
 * Chữ kịch bản để đưa ra NGOÀI trình soạn (caption AI, luật caption): kịch bản thẻ cảnh → chỉ lời nói + chữ trên màn hình từng cảnh (không
 * khối KINH NGHIỆM, không bóc tách, không gợi ý OWNER); bản chữ khác → bỏ khối kinh nghiệm nếu có. Câu trả lời thô / tên khách không lọt ra caption.
 */
export function spokenScriptText(draft: string): string {
  const doc = draft.trim() ? parseVlogDraft(draft) : null;
  if (!doc) return stripExperienceBlock(draft ?? "");
  return VLOG_CARDS.map((def) => {
    const c = doc.cards.find((x) => x.key === def.key)!;
    const speech = moveOwnerMarks(c.speech).speech.replace(/\n/g, " ").trim();
    return [speech && `${def.label}: ${speech}`, c.onScreen.trim() && `Chữ trên màn hình: ${c.onScreen.trim()}`].filter(Boolean).join("\n");
  })
    .filter(Boolean)
    .join("\n");
}


/**
 * Lưu bản nháp vlog có khối KINH NGHIỆM (máy chủ, mọi đường lưu: Lưu nháp / Gửi duyệt / AI viết / khôi phục phiên bản). Trạng thái tin cậy
 * ("Cần xác nhận", dấu xác nhận) KHÔNG nằm trong chữ — ở máy chủ (owner-review.ts); dòng kiểu đó trong chữ gửi lên bị bỏ. Câu trả lời / nguồn
 * / góc / bóc tách là nguồn sự thật: chỉ OWNER / quản lý (`actor.allowed`) được đổi — người khác: lấy lại từ bản đã lưu (kể cả khi gửi lên chữ
 * trống, chữ tự do hay đã xoá khối) và trả `note`.
 */
export function settleOwnerDraft(prevDraft: string, typed: string, actor: { email: string; allowed: boolean }): { draft: string; note?: string } {
  const clean = stripTrustLines(typed ?? "");
  const prevExp = experienceFromDraft(prevDraft);
  const postedExp = experienceFromDraft(clean);
  const changed = storyKey(postedExp) !== storyKey(prevExp);
  const note = !actor.allowed && changed ? "Chỉ OWNER sửa được kinh nghiệm" : undefined;
  const doc = clean.trim() ? parseVlogDraft(clean) : null;
  if (!doc) {
    // Chữ trống / chữ tự do: OWNER / quản lý → giữ đúng chữ gửi lên; người khác → giữ khối kinh nghiệm đã lưu ở đầu
    if (actor.allowed || !changed) return { draft: clean, note };
    const body = stripExperienceBlock(clean).replace(/^\s+/u, "");
    return { draft: prevExp ? [...experienceLines(prevExp), "", body].join("\n").replace(/\n+$/u, "") : body, note };
  }
  if (actor.allowed || !changed) return { draft: serializeVlog(doc), note };
  const { experience: posted, ...rest } = doc;
  const keep: OwnerExperience | undefined = prevExp ? { ...(posted ?? prevExp), qa: prevExp.qa, refs: prevExp.refs, angle: prevExp.angle, extraction: prevExp.extraction } : undefined;
  return { draft: serializeVlog(keep && !isEmptyExperience(keep) ? { ...rest, experience: keep } : rest), note };
}

/** Lời nói + chữ trên màn hình (kịch bản thẻ) hoặc chữ không có khối kinh nghiệm (bản chữ khác) — phần được kiểm "chi tiết ngoài chuyện". */
export function draftTold(draft: string): string {
  const doc = draft.trim() ? parseVlogDraft(draft) : null;
  return doc ? doc.cards.map((c) => `${c.speech}\n${c.onScreen}`).join("\n") : stripExperienceBlock(stripTrustLines(draft ?? ""));
}

/** Mã nội dung để gắn dấu xác nhận: kịch bản thẻ → sceneHash 4 cảnh; bản chữ khác → mã của toàn bộ chữ (không khối kinh nghiệm). */
export function draftHash(draft: string): string {
  const doc = draft.trim() ? parseVlogDraft(draft) : null;
  return sceneHash(doc ? doc.cards : [{ speech: draftTold(draft), onScreen: "" }]);
}
