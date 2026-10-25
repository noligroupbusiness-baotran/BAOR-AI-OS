// Nghiên cứu theo nền tảng (Personal Brand System bước 2.1–2.4): OWNER dán bình luận / bài trong nhóm Facebook, bình luận YouTube,
// bình luận Facebook (xuất CSV / JSON hoặc chép tay) → phân tích THEO LUẬT (không gọi AI): câu hỏi lặp lại, nỗi lo / khó khăn, cụm từ hay
// gặp → phát hiện loại QUAN SÁT gắn nguồn là link bài / video. Riêng tư: bỏ tên người, số điện thoại, email, @nhắc tên, link; KHÔNG lưu
// bình luận gốc — chỉ lưu kết quả gộp + vài trích ngắn đã làm sạch. Kết nối đọc tự động (Graph API / YouTube Data API) chờ khoá nền tảng.
import type { ResearchResult } from "./index";

export const SOCIAL_KINDS = {
  fb_group: "Nhóm Facebook",
  youtube: "Bình luận YouTube",
  facebook: "Bình luận Facebook",
  social: "Kiến thức trên social",
} as const;
export type SocialKind = keyof typeof SOCIAL_KINDS;

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

// Chép tay từ Facebook / YouTube: dòng giao diện và dòng tên người đứng riêng
const UI_LINE = /^(?:thích|like|phản hồi|reply|trả lời|chia sẻ|share|xem thêm|see more|xem \d+ phản hồi|view \d+ repl|ẩn|hide|tác giả|author|top fan|fan cứng|đã chỉnh sửa|edited|\d+\s*(?:phút|giờ|ngày|tuần|tháng|năm|m|h|d|w|y)\b)/iu;
const NAME_LINE = /^(?:\p{Lu}[\p{L}'’.-]*\s+){1,5}\p{Lu}[\p{L}'’.-]*$/u;
const REPLY_LINE = /^(?:\p{Lu}[\p{L}'’.-]*\s+){0,5}\p{Lu}[\p{L}'’.-]*\s+(?:đã\s+)?(?:trả lời|phản hồi|replied to)\s+(?:\p{Lu}[\p{L}'’.-]*\s*){1,6}$/u;
const NAME_PREFIX = /^(?:(?:anh|chị|em|bạn|cô|chú|bác|a|c|e)\s+)?(?:\p{Lu}[\p{L}'’.-]*\s+){0,4}\p{Lu}[\p{L}'’.-]*\s*:\s*/iu;

function isUiOrName(line: string): boolean {
  const l = line.trim();
  if (!l) return true;
  if (UI_LINE.test(l) || /·/.test(l) && /(?:thích|phản hồi|like|reply)/i.test(l) || REPLY_LINE.test(l)) return true;
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
    else items = text.split(/\r?\n/).filter((l) => !isUiOrName(l)).map(stripNamePrefix);
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
  const a = analyzeComments(comments);
  const label = SOCIAL_KINDS[kind];
  const src = [url];
  const findings: ResearchResult["findings"] = [];
  const base = { classification: "OBSERVATION" as const, sourceUrls: src, knowledgeIds: [], counterView: "", contentTopics: topic ? [topic] : [] };
  const limits = `Mẫu ${a.total} bình luận (${label}, một bài / video / nhóm); ý kiến người dùng, không đại diện thị trường; lọc theo luật từ khoá.`;
  if (a.questions.length)
    findings.push({ ...base, statement: `${a.questions.length}/${a.total} bình luận là câu hỏi (${label}). Ví dụ: ${quote(a.questions)}`, limits, application: "Mỗi câu hỏi lặp lại là một hook / video trả lời trực tiếp.", confidence: a.questions.length >= 5 ? "medium" : "low" });
  if (a.pains.length)
    findings.push({ ...base, statement: `${a.pains.length}/${a.total} bình luận nói về khó khăn / nỗi lo (${label}). Ví dụ: ${quote(a.pains)}`, limits, application: "Mở video bằng đúng nỗi lo người xem tự nói ra (không khẳng định thuộc tính cá nhân người xem).", confidence: a.pains.length >= 5 ? "medium" : "low" });
  if (a.topPhrases.length)
    findings.push({ ...base, statement: `Cụm từ lặp lại nhiều nhất (${label}, ${a.total} bình luận): ${a.topPhrases.map((p) => `“${p.phrase}” ×${p.count}`).join(", ")}`, limits, application: "Dùng đúng chữ người xem hay dùng trong hook, tiêu đề, phụ đề.", confidence: "low" });
  return {
    summary: `${label}: ${a.total} bình luận (đã lọc theo luật tên người, số điện thoại, email, @nhắc tên, link — lọc tên khi chép tay là cố gắng tốt nhất, có thể sót) — ${a.questions.length} câu hỏi, ${a.pains.length} nỗi lo, ${a.topPhrases.length} cụm từ lặp lại. Phân tích theo luật, không AI.`,
    sources: [{ url, title: `${label}${topic ? ` — ${topic}` : ""}`.slice(0, 300), author: "", publisher: label, publishedAt: null, sourceType: "social", grade: "D", excerpt: `${a.total} bình luận đã làm sạch, gộp theo luật`, limits }],
    findings,
  };
}
