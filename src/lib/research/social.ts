// Nghiên cứu theo nền tảng (Personal Brand System bước 2.1–2.4): OWNER dán bình luận / bài trong nhóm Facebook, bình luận YouTube,
// bình luận Facebook (xuất CSV / JSON hoặc chép tay) → phân tích THEO LUẬT (không gọi AI): câu hỏi lặp lại, nỗi lo / khó khăn, cụm từ hay
// gặp → phát hiện loại QUAN SÁT gắn nguồn là link bài / video. Riêng tư: bỏ tên người, số điện thoại, email, @nhắc tên, link; KHÔNG lưu
// bình luận gốc — chỉ lưu kết quả gộp + vài trích ngắn đã làm sạch. Đọc tự động từ link: youtube.ts (Data API), facebook.ts (Fanpage, Graph
// API), page-read.ts (trang công khai qua công cụ hãng AI) — cùng đi qua commentsToResearch ở đây.
import type { ResearchResult } from "./index";

export const SOCIAL_KINDS = {
  fb_group: "Nhóm Facebook",
  youtube: "Bình luận YouTube",
  facebook: "Bình luận Facebook",
  social: "Kiến thức trên social",
  tiktok: "Bình luận TikTok",
  instagram: "Bình luận Instagram",
  threads: "Threads",
  zalo: "Zalo",
  web: "Diễn đàn / web",
  other: "Khác",
} as const;
export type SocialKind = keyof typeof SOCIAL_KINDS;

const FORUMS = ["voz.vn", "tinhte.vn", "webtretho.com", "otofun.net", "reddit.com", "lamchame.vn", "spiderum.com", "quora.com", "muaban.net", "5giay.vn"];

/** Nhãn nền tảng NGẮN cho huy hiệu insight, đoán từ link nguồn: YouTube / Facebook / TikTok / Instagram / Threads / Zalo / Diễn đàn / Web. */
export function platformLabel(url: string): string {
  const k = detectPlatform(url);
  if (k === "youtube") return "YouTube";
  if (k === "facebook" || k === "fb_group") return "Facebook";
  if (k === "tiktok") return "TikTok";
  if (k === "instagram") return "Instagram";
  if (k === "threads") return "Threads";
  if (k === "zalo") return "Zalo";
  if (k === "other") return "Khác";
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return "Web";
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const forum = FORUMS.some((f) => host === f || host.endsWith(`.${f}`)) || /(?:^|\.)(?:forum|diendan)\./.test(host) || /^\/(?:forum|forums|threads?|dien-dan|t)\//i.test(u.pathname);
  return forum ? "Diễn đàn" : "Web";
}

/** Nền tảng đoán từ link (OWNER 26/10: chỉ cần dán link, không phải chọn nền tảng). Link lạ / không phải http → "other". */
export function detectPlatform(url: string): SocialKind {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return "other";
  }
  if (!/^https?:$/.test(u.protocol)) return "other";
  const h = u.hostname.toLowerCase().replace(/^(?:www|m|mobile|web|vt|vm)\./, "");
  const is = (...d: string[]) => d.some((x) => h === x || h.endsWith(`.${x}`));
  if (is("youtube.com", "youtu.be", "youtube-nocookie.com")) return "youtube";
  if (is("facebook.com", "fb.com", "fb.watch")) return /^\/groups\//i.test(u.pathname) ? "fb_group" : "facebook";
  if (is("tiktok.com")) return "tiktok";
  if (is("instagram.com")) return "instagram";
  if (is("threads.net", "threads.com")) return "threads";
  if (is("zalo.me", "zalo.vn", "zaloapp.com")) return "zalo";
  return "web";
}

export const MAX_COMMENTS = 3000;
// Tên cột / trường chứa NỘI DUNG bình luận (chữ thường, bỏ khoảng trắng / gạch dưới khi so)
const TEXT_KEYS = new Set(["text", "comment", "message", "content", "body", "noidung", "binhluan", "bìnhluận", "nộidung", "nộidungbìnhluận", "textdisplay", "textoriginal", "commenttext", "messagetext", "commentbody"]);
const keyOf = (k: string) => k.normalize("NFC").toLowerCase().replace(/[\s_-]+/g, "");
const MAX_LINE = 2000; // cắt TRƯỚC khi chạy regex: dòng rất dài không chặn máy

export function cleanComment(s: string): string {
  return s
    .slice(0, MAX_LINE)
    .normalize("NFC")
    .replace(/https?:\/\/\S+/gi, " ")
    // email TRƯỚC tên miền: nếu không, tên miền bị bỏ trước và phần tên người dùng của email ở lại
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, " ")
    .replace(/(?:www\.)?[\w-]+(?:\.[\w-]+)*\.(?:com|vn|net|org|me|ly|be|io|tv|co|info|biz|link|page|xyz|shop)(?:\/\S*)?/gi, " ")
    .replace(/(?<![\d.,])\(?\+?(?:84|0)\d{0,3}\)?(?:[\s.-]?\d){7,10}(?![\d.,]*\d)/g, " ")
    .replace(/(?<![\d.,])[35789]\d{2}[\s.-]\d{3}[\s.-]\d{3}(?![\d.,]*\d)/g, " ")
    .replace(/@[\p{L}\p{N}_.-]+(?:\s[\p{Lu}][\p{L}]+){0,3}/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1000);
}

// Chép tay từ Facebook / YouTube / TikTok: dòng giao diện (nút, thời gian, số cảm xúc, huy hiệu, bộ lọc) và dòng tên người đứng riêng.
// Mẫu thật (bôi đen cả khung bình luận rồi dán): "Phù hợp nhất", "Tác giả", "Fan cứng", "2 tuần", "Thích", "Phản hồi", "12",
// "👍❤️ 25", "Xem tất cả 5 phản hồi", "Viết bình luận…", "Đã chỉnh sửa"… Không có \b ở cuối: \b của JS không hiểu chữ có dấu.
const END = String.raw`(?![\p{L}\p{N}])`;
const TIME = String.raw`(?:\d+\s*(?:giây|phút|giờ|ngày|tuần|tháng|năm|sec|min|mins|hr|hrs|day|days|wk|wks|week|weeks|month|months|year|years|yr|yrs|[smhdwy])(?:\s+trước|\s+ago)?|vừa xong|just now|hôm qua|yesterday)`;
const UI_WORD = String.raw`(?:thích|like|liked|phản hồi|reply|replies|trả lời|chia sẻ|share|xem thêm|see more|xem bản dịch|see translation|ẩn bớt|ẩn|hide|tác giả|author|top fan|fan cứng|người đóng góp nổi bật|top contributor|quản trị viên|admin|người kiểm duyệt|moderator|thành viên mới|new member|đã chỉnh sửa|edited|theo dõi|đang theo dõi|follow|following|đã ghim|pinned|ghim|gửi|send|gif|nhãn dán|sticker)`;
const UI_LINE = new RegExp(
  "^(?:" +
    [
      `${UI_WORD}${END}(?:\\s*[·•|]\\s*(?:${UI_WORD}|${TIME})${END})*\\s*$`, // "Thích", "Thích · Phản hồi", "Tác giả · Theo dõi"
      `${TIME}${END}`, // "2 tuần", "2 giờ · Thích · Phản hồi"
      String.raw`(?:xem|view|see)\s+(?:tất cả\s+|all\s+|thêm\s+|more\s+)?(?:\d+\s+)?(?:phản hồi|bình luận|câu trả lời|repl(?:y|ies)|comments?)`, // "Xem tất cả 5 phản hồi", "Xem thêm bình luận"
      String.raw`(?:phù hợp nhất|bình luận nổi bật|tất cả bình luận|mới nhất|most relevant|newest|all comments|top comments|sắp xếp theo|sort by)`,
      String.raw`(?:viết bình luận|write a comment|bình luận dưới tên|comment as|thêm bình luận|add a comment)`,
      String.raw`(?:có thể là hình ảnh|may be an image|hình ảnh có thể|no photo description)`,
      String.raw`[\d.,]+\s*[kKmMnNtT]?\s*(?:lượt thích|lượt chia sẻ|phản hồi|bình luận|likes?|comments?|shares?|replies?|cảm xúc|reactions?)?\s*$`, // "12", "1,2K", "25 lượt thích"
    ].join("|") +
    ")",
  "iu",
);
// Số cảm xúc kèm biểu tượng ("👍❤️ 25", "😆 3") và dòng chỉ có biểu tượng
const REACTION_LINE = /^[\p{Extended_Pictographic}\u200d\ufe0f\s]*[\d.,]*\s*[kKmM]?\s*$/u;
// "… Xem thêm" / "... See more" dính cuối bình luận bị cắt ngắn
const TRAILING_MORE = /\s*(?:…|\.{3})?\s*(?:xem thêm|see more)\s*$/iu;
const NAME_LINE = /^(?:\p{Lu}[\p{L}'’.-]*\s+){1,5}\p{Lu}[\p{L}'’.-]*$/u;
const REPLY_LINE = /^(?:\p{Lu}[\p{L}'’.-]*\s+){0,5}\p{Lu}[\p{L}'’.-]*\s+(?:đã\s+)?(?:trả lời|phản hồi|replied to)\s+(?:\p{Lu}[\p{L}'’.-]*\s*){1,6}$/u;
const NAME_PREFIX = /^(?:(?:anh|chị|em|bạn|cô|chú|bác|a|c|e)\s+)?(?:\p{Lu}[\p{L}'’.-]*\s+){0,4}\p{Lu}[\p{L}'’.-]*\s*:\s*/iu;

function isUiLine(line: string): boolean {
  const l = line.trim();
  return UI_LINE.test(l) || REACTION_LINE.test(l) || (/·/.test(l) && /(?:thích|phản hồi|like|reply)/i.test(l));
}

function isUiOrName(line: string): boolean {
  const l = line.trim();
  if (!l) return true;
  if (isUiLine(l) || REPLY_LINE.test(l)) return true;
  // dòng tên kèm emoji / huy hiệu (· Tác giả) / biệt danh trong ngoặc / năm sinh
  const bare = l.replace(/\p{Extended_Pictographic}|\u200d|\ufe0f/gu, " ").replace(/\([^)]*\)/g, " ").replace(/·.*$/, " ").replace(/\d+/g, " ").replace(/\s+/g, " ").trim();
  return !!bare && NAME_LINE.test(bare) && bare.length <= 50;
}

function stripNamePrefix(line: string): string {
  const m = line.match(NAME_PREFIX);
  // chỉ bỏ khi phần trước ":" có ít nhất một chữ viết hoa (tên riêng), tránh cắt câu kiểu "lưu ý: …"
  return m && /\p{Lu}/u.test(m[0].replace(/^(?:anh|chị|em|bạn|cô|chú|bác)\s+/i, "")) ? line.slice(m[0].length) : line;
}

function splitRows(text: string, sep: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === sep) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) rows.push([...row, cell]);
  return rows.filter((r) => r.some((x) => x.trim()));
}

// JSON: lấy mọi giá trị chuỗi ở trường nội dung, ở mọi độ sâu (YouTube Data API: items[].snippet.topLevelComment.snippet.textDisplay)
function jsonTexts(v: unknown, out: string[], depth = 0): void {
  if (out.length >= MAX_COMMENTS || depth > 12) return;
  if (typeof v === "string") {
    if (depth <= 2) out.push(v); // mảng chuỗi thô ở cấp đầu hoặc trong {data: […]}
    return;
  }
  if (Array.isArray(v)) {
    for (const x of v) jsonTexts(x, out, depth + 1);
    return;
  }
  if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) {
      if (typeof x === "string" && TEXT_KEYS.has(keyOf(k))) out.push(x);
      else if (x && typeof x === "object" && !/^(?:author|user|from|owner|profile|sender|người|tácgiả)/.test(keyOf(k))) jsonTexts(x, out, Array.isArray(x) ? depth : depth + 1);
    }
  }
}

/**
 * Chữ chép tay. Bản chép cả khung bình luận Facebook / YouTube / TikTok (có từ 2 dòng giao diện trở lên: "Thích", "Phản hồi", "2 tuần"…)
 * → dòng tên / giao diện là ranh giới, các dòng chữ liền nhau giữa hai ranh giới là MỘT bình luận (bình luận nhiều dòng không bị tách).
 * Danh sách thường (mỗi dòng một bình luận, không có dòng giao diện) → mỗi dòng một bình luận như cũ.
 */
export function splitManualCopy(text: string): string[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const copied = lines.filter((l) => l && isUiLine(l)).length >= 2;
  if (!copied) return lines.filter((l) => !isUiOrName(l)).map((l) => stripNamePrefix(l).replace(TRAILING_MORE, ""));
  const out: string[] = [];
  let cur: string[] = [];
  const flush = () => {
    if (cur.length) out.push(cur.join(" "));
    cur = [];
  };
  for (const l of lines) {
    if (isUiOrName(l)) flush();
    else cur.push(stripNamePrefix(l).replace(TRAILING_MORE, ""));
  }
  flush();
  return out;
}

/**
 * Dán JSON (mọi độ sâu, trường text / comment / message / textDisplay…), bảng (dấu phẩy / chấm phẩy / tab — dán từ Excel, Sheets) có cột
 * nội dung, hoặc chữ chép tay (bỏ dòng tên, dòng giao diện, tiền tố "Tên:"). Bảng nhiều cột mà không nhận ra cột nội dung → báo lỗi.
 */
export function parseSocialPaste(raw: string): string[] {
  const text = raw.normalize("NFC").trim();
  let items: string[] = [];
  let fromJson = false;
  if (text.startsWith("[") || text.startsWith("{")) {
    try {
      jsonTexts(JSON.parse(text) as unknown, items);
      fromJson = true;
    } catch {
      items = [];
    }
  }
  if (!fromJson) {
    const first = text.split(/\r?\n/, 1)[0] ?? "";
    const sep = first.includes("\t") ? "\t" : (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ";" : ",";
    const rows = splitRows(text, sep);
    const head = rows[0]?.map(keyOf) ?? [];
    const col = head.findIndex((h) => TEXT_KEYS.has(h));
    const tabular = rows.length > 1 && head.length >= 2 && (sep !== "," || rows.slice(1, 6).every((r) => r.length === head.length));
    const NAME_COL = /^(?:name|ten|tên|author|tacgia|tácgiả|nguoi|người|user|username|from|họtên|hoten)/;
    if (col >= 0 && rows.length > 1) items = rows.slice(1).map((r) => r[col] ?? "");
    else if (rows.length > 1 && head.some((h) => NAME_COL.test(h))) throw new Error("Bảng có cột tên người nhưng không nhận ra cột nội dung bình luận (đặt tên cột: text / comment / message / bình luận / nội dung)");
    else if (tabular && sep !== ",") throw new Error("Bảng có nhiều cột nhưng không nhận ra cột nội dung bình luận (đặt tên cột: text / comment / message / bình luận / nội dung)");
    else if (tabular && sep === "," && rows.every((r) => r.length === head.length) && head.every((h) => h && h.length <= 30)) throw new Error("Bảng có nhiều cột nhưng không nhận ra cột nội dung bình luận (đặt tên cột: text / comment / message / bình luận / nội dung)");
    else items = splitManualCopy(text);
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const it of items) {
    const c = cleanComment(it);
    const key = c.toLowerCase();
    if (c.length < 3 || seen.has(key)) continue;
    seen.add(key);
    out.push(c);
    if (out.length >= MAX_COMMENTS) break;
  }
  return out;
}

const QUESTION = /\?|(?<![\p{L}])(?:(?:tại|vì) sao|sao (?:lại|không|vậy|thế)|thế nào|như nào|bao nhiêu|bao lâu|có nên|làm sao|ở đâu|khi nào|được không|có không|là gì|nào tốt)(?![\p{L}])/iu;
const PAIN = /(?<![\p{L}])(?:khó|sợ|lo|ngại|mệt|chán|không biết|chưa biết|bị từ chối|bị lừa|đắt|tốn|thất bại|áp lực|ngại gọi|không dám|bực|phiền|rác)(?![\p{L}])/iu;
const STOP = new Set("và là của có cho được không thì mà này đó với các những một như cũng rất nhiều đã đang sẽ để khi ạ nhé nha ơi vậy thế bạn mình anh chị em tôi họ ai gì nào lại ra vào lên xuống thôi luôn hơn nữa vì nên còn từ trong ngoài trên dưới".split(" "));

function bigrams(c: string): string[] {
  const w = c.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((x) => x && !STOP.has(x));
  const out = new Set<string>();
  for (let i = 0; i + 1 < w.length; i++) out.add(`${w[i]} ${w[i + 1]}`);
  return [...out];
}

export interface SocialAnalysis {
  total: number;
  questions: string[];
  pains: string[];
  topPhrases: { phrase: string; count: number }[];
}

export function analyzeComments(comments: string[]): SocialAnalysis {
  const questions = comments.filter((c) => QUESTION.test(c));
  const pains = comments.filter((c) => PAIN.test(c));
  const counts = new Map<string, number>();
  for (const c of comments) for (const b of bigrams(c)) counts.set(b, (counts.get(b) ?? 0) + 1);
  const topPhrases = [...counts.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([phrase, count]) => ({ phrase, count }));
  return { total: comments.length, questions, pains, topPhrases };
}

const quote = (xs: string[], n = 3) => xs.slice(0, n).map((x) => `“${x.slice(0, 90)}${x.length > 90 ? "…" : ""}”`).join("; ");

/** Kết quả gộp → hồ sơ nghiên cứu (nhập như "import"): nguồn = link bài / video (hạng D: ý kiến người dùng, chưa kiểm chứng). */
export function socialToResearch(kind: SocialKind, url: string, comments: string[], topic: string): ResearchResult {
  return commentsToResearch(kind, comments.map((text) => ({ text })), [{ url, title: "" }], topic);
}

/**
 * Nhiều nguồn một lần (YouTube: nhiều video): mỗi bình luận có thể kèm link riêng (link tới đúng bình luận, vd …watch?v=ID&lc=COMMENT_ID).
 * Phát hiện câu hỏi / nỗi lo dẫn tới link của chính các bình luận được trích; cụm từ lặp lại dẫn tới các nguồn gốc (video / bài).
 * Không lưu tên / kênh người bình luận: đầu vào chỉ là chữ đã làm sạch + link.
 */
export function commentsToResearch(kind: SocialKind, items: { text: string; url?: string }[], origins: { url: string; title: string }[], topic: string): ResearchResult {
  const comments = items.map((i) => i.text);
  const a = analyzeComments(comments);
  const label = SOCIAL_KINDS[kind];
  const originUrls = origins.map((o) => o.url);
  const findings: ResearchResult["findings"] = [];
  const base = { classification: "OBSERVATION" as const, knowledgeIds: [], counterView: "", contentTopics: topic ? [topic] : [] };
  const where = origins.length > 1 ? `${origins.length} video / bài` : "một bài / video / nhóm";
  const limits = `Mẫu ${a.total} bình luận (${label}, ${where}); ý kiến người dùng, không đại diện thị trường; lọc theo luật từ khoá.`;
  const linkOf = new Map(items.map((i) => [i.text, i.url]));
  const commentSources = new Map<string, string>();
  const refs = (xs: string[]) => {
    const urls = xs.slice(0, 3).map((x) => linkOf.get(x)).filter((u): u is string => !!u);
    for (const u of urls) commentSources.set(u, label);
    return urls.length ? [...new Set(urls)] : originUrls;
  };
  if (a.questions.length)
    findings.push({ ...base, sourceUrls: refs(a.questions), statement: `${a.questions.length}/${a.total} bình luận là câu hỏi (${label}). Ví dụ: ${quote(a.questions)}`, limits, application: "Mỗi câu hỏi lặp lại là một hook / video trả lời trực tiếp.", confidence: a.questions.length >= 5 ? "medium" : "low" });
  if (a.pains.length)
    findings.push({ ...base, sourceUrls: refs(a.pains), statement: `${a.pains.length}/${a.total} bình luận nói về khó khăn / nỗi lo (${label}). Ví dụ: ${quote(a.pains)}`, limits, application: "Mở video bằng đúng nỗi lo người xem tự nói ra (không khẳng định thuộc tính cá nhân người xem).", confidence: a.pains.length >= 5 ? "medium" : "low" });
  if (a.topPhrases.length)
    findings.push({ ...base, sourceUrls: originUrls, statement: `Cụm từ lặp lại nhiều nhất (${label}, ${a.total} bình luận): ${a.topPhrases.map((p) => `“${p.phrase}” ×${p.count}`).join(", ")}`, limits, application: "Dùng đúng chữ người xem hay dùng trong hook, tiêu đề, phụ đề.", confidence: "low" });
  const src = (url: string, title: string, excerpt: string) => ({ url, title: title.slice(0, 300), author: "", publisher: label, publishedAt: null, sourceType: "social" as const, grade: "D" as const, excerpt, limits });
  return {
    summary: `${label}: ${a.total} bình luận${origins.length > 1 ? ` từ ${origins.length} nguồn` : ""} (đã lọc theo luật tên người, số điện thoại, email, @nhắc tên, link — lọc tên khi chép tay là cố gắng tốt nhất, có thể sót) — ${a.questions.length} câu hỏi, ${a.pains.length} nỗi lo, ${a.topPhrases.length} cụm từ lặp lại. Phân tích theo luật, không AI.`,
    sources: [
      ...origins.map((o) => src(o.url, o.title || `${label}${topic ? ` — ${topic}` : ""}`, `${a.total} bình luận đã làm sạch, gộp theo luật`)),
      ...[...commentSources.keys()].filter((u) => !originUrls.includes(u)).map((u) => src(u, `Một bình luận (${label})`, "Bình luận được trích làm ví dụ")),
    ],
    findings,
  };
}
