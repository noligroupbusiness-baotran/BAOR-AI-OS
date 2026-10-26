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
export function vlogFormulaRules(stage: PathStage, brandVoice = ""): string {
  const st = stageInfo(stage);
  return [
    "CÔNG THỨC (theo nguyên lý marketing của Philip Kotler: lấy khách hàng làm trung tâm, nói giá trị khách nhận được, không nói tính năng):",
    "0. STP — chọn MỘT nhóm khách cụ thể trong căn cứ (ai, đang ở tình huống nào) và chỉ nói với đúng nhóm đó. Ghi nhóm này vào trường segment.",
    "1. HOOK (0–3s): nói thẳng nhu cầu / nỗi đau của nhóm khách đó bằng chính lời của khách (lấy từ insight, bình luận). Một câu, tối đa 12–15 chữ, không chào, không giới thiệu bản thân.",
    "2. CÂU CHUYỆN (3–25s): tình huống của khách — khoảnh khắc sự thật (lúc họ gặp vấn đề, họ thấy gì, lo gì). Ngôi thứ nhất chỉ để dẫn (\"nhiều bạn kể với mình…\"). " +
      "Trải nghiệm riêng, kết quả, con số của OWNER CHỈ dùng khi có trong căn cứ [OWNER] / Second Brain; không có thì đặt đúng một chỗ \"[OWNER KỂ: gợi ý ngắn chuyện cần kể]\" trong lời thoại — không bịa.",
    "3. GIÁ TRỊ / BÀI HỌC (25–50s): tuyên bố giá trị — MỘT thay đổi / lợi ích cụ thể khách nhận được, một ý duy nhất, làm được ngay. Nói lợi ích (khách được gì), không liệt kê tính năng. " +
      "Có bằng chứng trong căn cứ thì dẫn ngắn \"theo …\"; không có thì không nêu số liệu.",
    `4. KẾT (50–60s): MỘT lời mời nhẹ đúng chặng hành trình khách 5A (Biết → Thích → Hỏi → Làm → Giới thiệu). Chặng hiện tại: ${st.label} (${st.en}) → ${st.cta}. Không chào bán, không nêu giá, không hứa thu nhập.`,
    `Tổng lời thoại ~110–150 chữ (dưới ${VLOG_MAX_SEC} giây), câu ngắn, giọng nói chuyện tự nhiên. Chữ trên màn hình tối đa 8 chữ mỗi cảnh. Hình ảnh: một câu ngắn, quay được bằng điện thoại.`,
    "Lời thoại là câu nói với người xem — TUYỆT ĐỐI không có ghi chú về dữ liệu, độ tin cậy hay quy trình nội bộ (\"AI suy luận\", \"chưa kiểm chứng\", \"bản nháp nội bộ\", \"chưa phải căn cứ\"…). " +
      "Căn cứ yếu thì nói ít hơn, không rào đón.",
    "",
    ...ogilvyCopyRules(brandVoice),
  ].join("\n");
}

/**
 * CÁCH VIẾT — theo phong cách copywriting của David Ogilvy (Kotler quyết định NÓI GÌ: nhóm khách, nhu cầu, giá trị, chặng 5A;
 * phần này quyết định VIẾT THẾ NÀO). Là cách BAOR áp dụng phong cách, không trích lời, không phải khung do Ogilvy soạn.
 */
export function ogilvyCopyRules(brandVoice = ""): string[] {
  return [
    "CÁCH VIẾT (theo phong cách copywriting của David Ogilvy):",
    "- Một ý lớn duy nhất (big idea) cho cả video; mọi cảnh phục vụ ý đó.",
    "- Hook như một tiêu đề: cụ thể, mang lợi ích hoặc điều mới cho người xem, nói với MỘT người (\"bạn\"); không chơi chữ cho vui. Con số / chi tiết cụ thể thắng lời chung chung — chỉ dùng sự thật có trong căn cứ.",
    "- Dữ kiện thay cho tính từ: không so sánh nhất, không thổi phồng (\"nhất\", \"tuyệt vời\", \"đỉnh cao\"… khi không có bằng chứng). Cụ thể: ai, làm gì, bao nhiêu — chỉ từ căn cứ.",
    "- Lời nói đời thường, câu ngắn (phần lớn ≤ 20 chữ), như nói với một người bạn; tôn trọng trí thông minh của người xem.",
    "- Cho thấy lợi ích và đưa MỘT lý do để tin (bằng chứng / lời khách trong căn cứ); không có thì để \"[OWNER KỂ: …]\", không bịa.",
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
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/u, "");
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
  if (doc.cards.some((c) => c.speech.includes("[OWNER KỂ"))) out.push({ key: "owner", ok: false, label: "Chờ OWNER kể", why: "Thay [OWNER KỂ: …] bằng chuyện thật của anh" });
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
