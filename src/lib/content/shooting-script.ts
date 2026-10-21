// CP02: brief nghiên cứu → kịch bản quay theo cảnh, và luật kiểm kịch bản trước khi gửi OWNER duyệt.
// Hàm thuần, không gọi AI. Hệ thống KHÔNG viết câu chuyện hay quan điểm thay OWNER: chỗ có thể chèn trải nghiệm thật
// nằm ở dòng "Gợi ý OWNER: [OWNER KỂ: …]" ngoài lời thoại. Dấu này mà lọt vào lời thoại hoặc chữ trên màn hình thì chặn.
//
// Giới hạn đã biết: căn cứ gắn theo CẢNH, không theo từng câu. Một thẻ hợp lệ trong cảnh hợp thức hoá mọi số liệu của cảnh đó;
// người duyệt vẫn phải đọc. Bù lại: AI viết lại không được thêm số mới (rewriteViolations) và mỗi luận điểm có nguồn ngoài
// đều được đọc kèm "Theo …".
import { SCRIPT_SCENES, scriptCheck } from "./formats";
import type { BriefPoint, Classification } from "@/lib/knowledge/types";

export interface ScriptSource {
  id: string;
  title: string;
  author: string;
  publisher: string;
  publishedAt: string | null;
  grade: string;
  url: string;
  excerpt: string;
}

export interface ScriptPage {
  id: string;
  title: string;
  status: string;
}

export interface ScriptBrief {
  topic: string;
  goal: string;
  audience: string;
  keyMessage: string;
  angle: string;
  points: BriefPoint[];
  gaps: string[];
}

export const OWNER_MARK = "[OWNER KỂ:";
/** Nhận dấu OWNER bất kể hoa thường, khoảng trắng, dạng Unicode, có dấu hay không ("KỂ", "KE", "kể"). */
const OWNER_RE = /\[\s*owner\s+k[eểêềếệễ]\s*:/iu;
const OWNER_RE_G = /\[\s*owner\s+k[eểêềếệễ]\s*:/giu;
const DEFAULT_MAX_SECONDS = 90;
/** Tốc độ nói giảng giải rõ ràng: khoảng 4,5 âm tiết mỗi giây (tiếng Việt tách âm tiết bằng dấu cách). */
const SYLLABLES_PER_SECOND = 4.5;

const nfc = (s: string) => s.normalize("NFC");

export function hasOwnerMark(s: string): boolean {
  return OWNER_RE.test(nfc(s));
}

function firstSentence(s: string): string {
  const t = s.trim();
  const m = t.match(/^(.+?[.!?])(\s|$)/);
  return (m ? m[1] : t).trim();
}

function shortLabel(s: string, words = 8): string {
  const w = s.replace(/[“”"()]/g, "").split(/\s+/).filter(Boolean);
  const cut = w.slice(0, words).join(" ").replace(/[,:;.]+$/, "");
  return w.length > words ? `${cut}…` : cut;
}

function year(d: string | null): string {
  const m = d?.match(/\d{4}/);
  return m ? m[0] : "";
}

function attribution(s: ScriptSource): string {
  const who = (s.author.split(/[,;]/)[0] ?? "").trim();
  const many = s.author.includes(",");
  const name = who ? (many ? `${who} và cộng sự` : who) : s.publisher;
  const y = year(s.publishedAt);
  return name ? `Theo ${name}${y ? ` (${y})` : ""}: ` : "";
}

interface Tagged {
  point: BriefPoint;
  tags: string[];
}

/** Dựng kịch bản quay từ brief đã đạt kiểm. Mỗi cảnh có Hình ảnh / Lời thoại / Chữ trên màn hình / Căn cứ. */
export function buildShootingScript(brief: ScriptBrief, sources: ScriptSource[], pages: ScriptPage[]): string {
  const sTag = new Map<string, string>();
  const kTag = new Map<string, string>();
  const spoken = brief.points.filter((p) => p.classification !== "HYPOTHESIS");
  for (const p of spoken) {
    for (const id of p.sourceIds) if (!sTag.has(id) && sources.some((s) => s.id === id)) sTag.set(id, `S${sTag.size + 1}`);
    for (const id of p.knowledgeIds) if (!kTag.has(id) && pages.some((pg) => pg.id === id)) kTag.set(id, `K${kTag.size + 1}`);
  }
  const tagged: Tagged[] = spoken.map((point) => ({
    point,
    tags: [...point.sourceIds.map((id) => sTag.get(id)), ...point.knowledgeIds.map((id) => kTag.get(id))].filter((t): t is string => Boolean(t)),
  }));
  const of = (...cls: Classification[]) => tagged.filter((t) => cls.includes(t.point.classification));
  const internalObs = of("OBSERVATION").filter((t) => t.point.sourceIds.length === 0);
  const externalObs = of("OBSERVATION").filter((t) => t.point.sourceIds.length > 0);
  const steps = of("PROCEDURE", "BUSINESS_DECISION");
  const facts = of("FACT");
  const views = of("OWNER_VIEW");

  // Mọi luận điểm có nguồn ngoài đều đọc kèm tên nguồn: người xem không nghe nhầm thành lời của OWNER.
  const speechOf = (t: Tagged) => {
    const src = sources.find((s) => s.id === t.point.sourceIds[0]);
    if (!src || /^theo\s/i.test(t.point.text)) return t.point.text;
    return `${attribution(src)}${t.point.text}`;
  };
  const tagsOf = (list: Tagged[]) => [...new Set(list.flatMap((t) => t.tags))].map((t) => `[${t}]`).join(" ");
  const sourced = (list: Tagged[]) => list.some((t) => t.point.sourceIds.length > 0);

  const scene = (i: number, visual: string, speech: string[], onScreen: string, basis: Tagged[], extra: string[] = []) => {
    const s = SCRIPT_SCENES[i];
    const lines = [`${i + 1}. ${s.name.toUpperCase()} (${s.seconds})`, `Hình ảnh: ${visual}`, `Lời thoại: ${speech.filter(Boolean).join(" ")}`, `Chữ trên màn hình: ${onScreen}`];
    const tags = tagsOf(basis);
    if (tags) lines.push(`Căn cứ: ${tags}`);
    return [...lines, ...extra].join("\n");
  };
  const NAME_SOURCE = "chèn tên nguồn và năm trên màn hình khi nhắc tới nguồn ngoài";

  const hook = firstSentence(brief.angle || brief.keyMessage);
  const problem = internalObs.length ? internalObs : externalObs.slice(0, 1);
  // Brief không có luận điểm "vấn đề": dùng phần còn lại của góc khai thác (chữ của brief, không phải số liệu mới).
  const angleRest = (brief.angle || "").trim().slice(hook.length).trim();
  const proof = [...facts, ...externalObs.filter((t) => !problem.includes(t))];
  const scenes = [
    scene(0, "Cận mặt, nhìn thẳng ống kính, một câu duy nhất.", [hook], shortLabel(hook, 7), []),
    scene(
      1,
      `Trung cảnh; chèn chữ nêu lỗi thường gặp${sourced(problem) ? `; ${NAME_SOURCE}` : ""}.`,
      problem.length ? problem.map(speechOf) : [angleRest || brief.keyMessage],
      problem[0] ? shortLabel(problem[0].point.text) : shortLabel(angleRest || brief.keyMessage),
      problem,
    ),
    scene(2, "Trung cảnh, đếm từng bước bằng tay; chữ đánh số từng bước.", steps.map(speechOf), steps.map((t, k) => `${k + 1}) ${shortLabel(t.point.text, 6)}`).join(" · "), steps),
    scene(3, `Trung cảnh; ${NAME_SOURCE}.`, proof.map(speechOf), proof[0] ? shortLabel(proof[0].point.text) : "", proof, [
      `Gợi ý OWNER: ${OWNER_MARK} có thể thêm một cuộc gọi thật của anh minh hoạ điều này. Kho chưa có câu chuyện nên hệ thống không viết thay. Không thêm thì xoá dòng này.]`,
    ]),
    scene(4, "Cận mặt, chậm lại ở câu cuối.", [...views.map(speechOf), brief.keyMessage], shortLabel(brief.keyMessage, 8), views),
  ];

  const srcLines = [...sTag.entries()].map(([id, tag]) => {
    const s = sources.find((x) => x.id === id)!;
    return `[${tag}] ${s.title}${s.publisher ? ` — ${s.publisher}` : ""}${year(s.publishedAt) ? ` (${year(s.publishedAt)})` : ""}, hạng ${s.grade}: ${s.url}`;
  });
  const pageLines = [...kTag.entries()].map(([id, tag]) => {
    const p = pages.find((x) => x.id === id)!;
    return `[${tag}] Second Brain: ${p.title} (${p.status})`;
  });
  const hypotheses = brief.points.filter((p) => p.classification === "HYPOTHESIS").map((p) => `- Giả thuyết chưa kiểm (không đưa vào lời thoại): ${p.text}`);
  const missing = [...brief.gaps.map((g) => `- ${g}`), ...hypotheses];

  return [
    `KỊCH BẢN QUAY: ${brief.topic}`,
    `Mục tiêu: ${brief.goal}`,
    `Khán giả: ${brief.audience}`,
    `Thông điệp chính: ${brief.keyMessage}`,
    "",
    scenes.join("\n\n"),
    "",
    "Nhạc nền: (chọn trong Cài đặt › Kho nhạc, đã xác minh quyền dùng)",
    "Ghi chú dựng: dựng theo Skill edit video vlog; chữ trên màn hình lấy đúng dòng ở từng cảnh.",
    "",
    "NGUỒN",
    ...srcLines,
    ...pageLines,
    ...(missing.length ? ["", "CÒN THIẾU (từ brief)", ...missing] : []),
  ].join("\n");
}

// ---------------------------------------------------------------- đọc kịch bản quay

export interface ParsedScene {
  index: number;
  name: string;
  seconds: string;
  visual: string;
  speech: string;
  onScreen: string;
  basis: string[];
  /** Dòng "Gợi ý OWNER: …" (không đọc khi quay). */
  ownerHint: string;
}

export interface ParsedSource {
  tag: string;
  text: string;
}

export interface ParsedScript {
  scenes: ParsedScene[];
  tags: Set<string>;
  sources: ParsedSource[];
  /** Chữ ngoài cảnh và ngoài mục NGUỒN (tiêu đề, mục tiêu, dòng lạ) — vẫn phải qua luật số liệu. */
  loose: string[];
  /** Số lần gặp tiêu đề NGUỒN và vị trí so với cảnh cuối. */
  sourceHeaders: number;
  sourcesBeforeLastScene: boolean;
}

const FIELD = /^(Hình ảnh|Lời thoại|Chữ trên màn hình|Căn cứ|Gợi ý OWNER)\s*:\s*(.*)$/i;
const HEADER = /^\s*(\d+)\.\s*(.+?)\s*\(([^)]*)\)\s*$/;
const SOURCES_HEADER = /^NGUỒN\s*:?\s*$/i;

export function parseShootingScript(draft: string): ParsedScript {
  const scenes: ParsedScene[] = [];
  const tags = new Set<string>();
  const sources: ParsedSource[] = [];
  const loose: string[] = [];
  let cur: ParsedScene | null = null;
  let field: "visual" | "speech" | "onScreen" | "basis" | "ownerHint" | null = null;
  let mode: "body" | "sources" | "missing" = "body";
  let sourceHeaders = 0;
  let sourcesBeforeLastScene = false;
  for (const raw of nfc(draft).split(/\r?\n/)) {
    const line = raw.trim();
    if (SOURCES_HEADER.test(line)) {
      sourceHeaders++;
      mode = "sources";
      cur = null;
      continue;
    }
    // Chỉ dòng tiêu đề đúng dạng (viết hoa), không phải câu nói bắt đầu bằng "Còn thiếu…".
    if (/^CÒN THIẾU(?:\s*\([^)]*\))?\s*$/.test(line)) {
      mode = "missing";
      cur = null;
      continue;
    }
    const h = line.match(HEADER);
    if (h) {
      if (sourceHeaders > 0) sourcesBeforeLastScene = true;
      mode = "body";
      cur = { index: Number(h[1]), name: h[2].trim(), seconds: h[3].trim(), visual: "", speech: "", onScreen: "", basis: [], ownerHint: "" };
      scenes.push(cur);
      field = null;
      continue;
    }
    if (mode === "missing") continue;
    if (mode === "sources") {
      const m = line.match(/^\[([SK]\d+)\]\s*(.*)$/);
      if (m) {
        tags.add(m[1]);
        sources.push({ tag: m[1], text: m[2] });
      } else if (line) loose.push(line);
      continue;
    }
    if (!cur) {
      if (line && !/^(Nhạc nền|Ghi chú dựng)\s*:/i.test(line)) loose.push(line);
      continue;
    }
    const f = line.match(FIELD);
    if (f) {
      const key = f[1].toLowerCase();
      field = key === "hình ảnh" ? "visual" : key === "lời thoại" ? "speech" : key === "chữ trên màn hình" ? "onScreen" : key === "căn cứ" ? "basis" : "ownerHint";
      if (field === "basis") cur.basis = [...f[2].matchAll(/\[([SK]\d+)\]/g)].map((x) => x[1]);
      else cur[field] = f[2].trim();
      continue;
    }
    if (!line) {
      field = null;
      continue;
    }
    if (/^(Nhạc nền|Ghi chú dựng)\s*:/i.test(line)) {
      cur = null;
      continue;
    }
    if (field && field !== "basis") cur[field] = `${cur[field]} ${line}`.trim();
    else loose.push(line);
  }
  return { scenes, tags, sources, loose, sourceHeaders, sourcesBeforeLastScene };
}

// ---------------------------------------------------------------- kiểm kịch bản

export interface ScriptQa {
  ok: boolean;
  /** Lỗi chặn gửi duyệt / duyệt. */
  blocking: string[];
  warnings: string[];
  seconds: number;
}

const words = (s: string) =>
  nfc(s)
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

/** Câu nói trùng nguyên văn từ 12 từ liên tiếp trở lên với đoạn trích nguồn → coi là sao chép. */
const COPY_RUN = 12;
const OVERCLAIM = /(?<![\p{L}\p{N}])(100\s*%|chắc chắn|cam kết|đảm bảo|tuyệt đối|số 1)(?![\p{L}\p{N}])/iu;
const YEAR = /(?<!\d)(?:19|20)\d{2}(?!\d)/g;

/**
 * Số liệu cần nguồn. Gồm phần trăm (ký hiệu hoặc chữ), phân số, "N trong/trên M", "gấp N lần", "x3", số thập phân,
 * số từ 100 trở lên, "10k", nghìn/triệu/tỷ, và "phần trăm/phần tư/phần ba" viết bằng chữ.
 * Số nhỏ chỉ thời lượng hay thứ tự ("30 giây đầu", "3 bước") không phải số liệu. Năm (19xx, 20xx) không tính.
 */
const STAT_PATTERNS: RegExp[] = [
  /\d+(?:[.,]\d+)?\s*(?:%|phần\s*trăm)/iu,
  /(?<![\p{L}\p{N}])phần\s*(?:trăm|tư|ba|năm|mười)(?![\p{L}])/iu,
  /\d+\s*\/\s*\d+/u,
  /\d+\s*(?:trong|trên)\s*(?:số\s*)?\d+/iu,
  /gấp\s*(?:\d|hai|ba|bốn|năm|mười|đôi)/iu,
  /\d+(?:[.,]\d+)?\s*lần/iu,
  /(?<![\p{L}])x\s*\d/iu,
  /\d+[.,]\d+/u,
  /\d{3,}/u,
  /\d+\s*k(?![\p{L}])/iu,
  /\d+\s*x(?![\p{L}])/iu,
  /(?<![\p{L}])(?:một|hai|ba|bốn|năm|sáu|bảy|tám|chín|mười)\s+(?:trên|trong)\s+(?:mười|trăm|\d+)(?![\p{L}])/iu,
  /(?<![\p{L}])một\s+nửa(?![\p{L}])/iu,
  /\d+\s*(?:nghìn|ngàn|triệu|tỷ)/iu,
];

/** Đếm người / việc ("45 khách", "2000 người", "12 cuộc gọi") luôn là số liệu, kể cả số giống năm. */
const COUNT = /\d+(?:[.,]\d+)?\s*(?:khách|người|học viên|cuộc gọi|cuộc|đơn|seller|nhân viên|doanh nghiệp|công ty|lượt|học sinh|shop|cửa hàng)(?![\p{L}])/iu;

export function hasStatistic(text: string): boolean {
  if (COUNT.test(nfc(text).replace(/\[[SK]\d+\]/g, ""))) return true;
  const t = nfc(text).replace(/\[[SK]\d+\]/g, "").replace(YEAR, "").replace(/(^|[\s·])\d+\)\s/g, "$1");
  if (STAT_PATTERNS.some((r) => r.test(t))) return true;
  // Hai con số khác nhau trong cùng một câu thường là so sánh số liệu ("99 khách thì 60 người").
  return t.split(/[.!?;\n]/).some((sent) => new Set(sent.match(/\d+/g) ?? []).size >= 2);
}

export interface QaOptions {
  sourceExcerpts?: string[];
  maxSeconds?: number;
  /** URL và tiêu đề nguồn ngoài thật của brief: mỗi dòng [S#] trong NGUỒN phải chứa một trong số này. */
  knownSources?: string[];
  /** Tiêu đề trang Second Brain của brief: mỗi dòng [K#] phải chứa một trong số này. */
  knownPages?: string[];
}

export function scriptQa(draft: string, opts: QaOptions = {}): ScriptQa {
  const blocking: string[] = [];
  const warnings: string[] = [];
  const check = scriptCheck(draft);
  if (!check.hasSpeech) blocking.push("Chưa có lời thoại");
  const p = parseShootingScript(draft);

  // Cấu trúc: đúng 5 cảnh theo thứ tự, đọc được tiêu đề "1. HOOK (0–3s)"; một mục NGUỒN, đặt sau cảnh cuối.
  const names = SCRIPT_SCENES.map((s) => s.name.toLowerCase());
  const got = p.scenes.map((s) => s.name.toLowerCase());
  if (got.length !== names.length || names.some((n, i) => got[i] !== n)) {
    blocking.push(`Không đọc được đủ 5 cảnh theo thứ tự (${SCRIPT_SCENES.map((s, i) => `${i + 1}. ${s.name.toUpperCase()} (${s.seconds})`).join(", ")}). Giữ đúng dạng tiêu đề cảnh.`);
  }
  if (p.sourceHeaders > 1) blocking.push("Có hơn một mục NGUỒN");
  if (p.sourcesBeforeLastScene) blocking.push("Mục NGUỒN phải nằm sau cảnh cuối");

  // Nguồn khai trong kịch bản phải là nguồn thật của brief.
  if (opts.knownSources || opts.knownPages) {
    for (const s of p.sources) {
      const pool = s.tag.startsWith("S") ? (opts.knownSources ?? []) : (opts.knownPages ?? []);
      if (!pool.some((k) => k && s.text.includes(k))) blocking.push(`Nguồn [${s.tag}] không thuộc brief: chỉ dùng nguồn đã nghiên cứu`);
    }
  }
  const draftPages = new Set(p.sources.filter((s) => s.tag.startsWith("K") && /\(DRAFT\)\s*$/.test(s.text)).map((s) => s.tag));

  for (const s of p.scenes) {
    const label = `Cảnh ${s.index} (${s.name})`;
    const said = `${s.speech} ${s.onScreen}`;
    if (!s.speech.trim()) blocking.push(`${label}: chưa có lời thoại`);
    if (hasOwnerMark(said)) blocking.push(`${label}: dấu [OWNER KỂ: …] nằm trong lời thoại hoặc chữ trên màn hình. OWNER thay bằng trải nghiệm thật hoặc xoá; hệ thống không viết thay.`);
    const unknown = s.basis.filter((t) => !p.tags.has(t));
    if (unknown.length) blocking.push(`${label}: căn cứ ${unknown.map((t) => `[${t}]`).join(" ")} không có trong mục NGUỒN`);
    if ([s.speech, s.onScreen, s.visual].some(hasStatistic) && s.basis.filter((t) => p.tags.has(t)).length === 0) blocking.push(`${label}: có số liệu nhưng không có căn cứ trong mục NGUỒN`);
    if (OVERCLAIM.test(said)) warnings.push(`${label}: có từ khẳng định tuyệt đối, kiểm lại`);
    const drafts = s.basis.filter((t) => draftPages.has(t));
    if (drafts.length) warnings.push(`${label}: dựa trên trang Second Brain còn DRAFT (${drafts.map((t) => `[${t}]`).join(" ")}): OWNER xác nhận trước khi quay`);
    if (s.ownerHint && hasOwnerMark(s.ownerHint)) warnings.push(`${label}: có chỗ để thêm câu chuyện thật của OWNER (không bắt buộc)`);
  }
  const looseStat = p.loose.filter((l) => !/^(KỊCH BẢN QUAY|Mục tiêu|Khán giả)\s*:/i.test(l) && hasStatistic(l));
  if (looseStat.length) blocking.push(`Có số liệu nằm ngoài cảnh, không gắn căn cứ: “${looseStat[0].slice(0, 80)}”`);
  if (p.loose.some((l) => hasOwnerMark(l))) blocking.push("Dấu [OWNER KỂ: …] nằm ngoài dòng Gợi ý OWNER");

  const excerpts = (opts.sourceExcerpts ?? []).map(words).filter((w) => w.length >= COPY_RUN);
  if (excerpts.length) {
    const grams = new Set<string>();
    for (const w of excerpts) for (let i = 0; i + COPY_RUN <= w.length; i++) grams.add(w.slice(i, i + COPY_RUN).join(" "));
    const body = words([...p.scenes.map((s) => `${s.speech} ${s.onScreen} ${s.visual}`), ...p.loose].join(" "));
    for (let i = 0; i + COPY_RUN <= body.length; i++) {
      if (grams.has(body.slice(i, i + COPY_RUN).join(" "))) {
        blocking.push("Có đoạn trùng nguyên văn từ 12 từ trở lên với trích dẫn nguồn: viết lại bằng lời của mình");
        break;
      }
    }
  }

  const syllables = p.scenes.reduce((n, s) => n + words(s.speech.replace(/\[[^\]]*\]/g, "")).length, 0);
  const seconds = Math.round(syllables / SYLLABLES_PER_SECOND);
  const max = opts.maxSeconds ?? DEFAULT_MAX_SECONDS;
  if (seconds > max) warnings.push(`Lời thoại khoảng ${seconds} giây, dài hơn mục tiêu ${max} giây`);

  return { ok: blocking.length === 0, blocking, warnings, seconds };
}

/** Lấy thời lượng tối đa từ mục tiêu brief (ví dụ "60–90 giây"); mặc định 90 giây. */
export function maxSecondsFromGoal(goal: string): number {
  const m = goal.match(/(\d+)\s*(?:[–-]\s*(\d+))?\s*giây/);
  if (!m) return DEFAULT_MAX_SECONDS;
  return Number(m[2] ?? m[1]);
}

// ---------------------------------------------------------------- bảo vệ khi AI viết lại

const numbers = (s: string) => new Set((nfc(s).replace(/\[[SK]\d+\]/g, "").match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(",", ".")));

/**
 * So kịch bản trước và sau khi AI viết lại. AI chỉ được đổi câu chữ: không được đổi dấu OWNER, mục NGUỒN,
 * thẻ căn cứ từng cảnh, hay thêm con số mới. Trả về danh sách vi phạm (rỗng = chấp nhận).
 */
export function rewriteViolations(before: string, after: string): string[] {
  const out: string[] = [];
  const b = parseShootingScript(before);
  const a = parseShootingScript(after);
  const marks = (s: string) => (nfc(s).match(OWNER_RE_G) ?? []).length;
  if (marks(before) !== marks(after)) out.push("AI đã đổi hoặc xoá chỗ dành cho câu chuyện OWNER");
  const src = (x: ParsedScript) => x.sources.map((s) => `[${s.tag}] ${s.text}`).join("\n");
  if (src(b) !== src(a)) out.push("AI đã đổi mục NGUỒN");
  const basis = (x: ParsedScript) => x.scenes.map((s) => `${s.index}:${[...s.basis].sort().join(",")}`).join("|");
  if (basis(b) !== basis(a)) out.push("AI đã đổi thẻ căn cứ của các cảnh");
  const nb = numbers(before);
  const added = [...numbers(after)].filter((n) => !nb.has(n));
  if (added.length) out.push(`AI đã thêm con số mới: ${added.slice(0, 5).join(", ")}`);
  return out;
}
