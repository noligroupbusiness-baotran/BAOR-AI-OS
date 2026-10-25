// CP06: phân tích thuần (không CSDL, không AI). Mỗi kết luận kèm cỡ mẫu; dưới ngưỡng thì "chưa đủ dữ liệu", không kết luận.
// Mọi kết luận là GIẢ THUYẾT cho tới khi OWNER chấp nhận: hệ thống không biến quan sát thành sự thật.
import { displayStepOf } from "@/config/journey";

/** Bước hiển thị (1–7) của Đo lường cho chữ người dùng đọc — mã nội bộ sơ đồ là 8.1 / 8.2 (src/config/journey.ts). */
export const MEASURE_STEP = displayStepOf("8.1");

export interface ProposalDraft {
  key: string;
  target: "content" | "second_brain" | "video_skill" | "ads";
  title: string;
  detail: string;
  evidence: string[];
  sampleSize: number;
  confidence: "low" | "medium" | "high";
}

/** Ngưỡng tối thiểu để so sánh hiệu quả. */
export const MIN_POSTS_PER_TOPIC = 3;
export const MIN_VIEWS = 300;
export const MIN_VIDEOS_FOR_PATTERN = 2;

export interface PostRow {
  id: string;
  title: string;
  topic: string;
  platform: string;
  views: number | null;
  reach: number | null;
  engagement: number | null;
}

export interface TopicStat {
  topic: string;
  posts: number;
  avgViews: number;
  avgEngagementRate: number | null;
  enough: boolean;
}

export function topicPerformance(rows: PostRow[]): TopicStat[] {
  const by = new Map<string, PostRow[]>();
  for (const r of rows) by.set(r.topic, [...(by.get(r.topic) ?? []), r]);
  return [...by.entries()]
    .map(([topic, rs]) => {
      const views = rs.map((r) => r.views ?? 0);
      const rates = rs.filter((r) => r.reach && r.engagement != null).map((r) => (r.engagement! / r.reach!) * 100);
      const avgViews = Math.round(views.reduce((a, b) => a + b, 0) / rs.length);
      return { topic, posts: rs.length, avgViews, avgEngagementRate: rates.length ? Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 10) / 10 : null, enough: rs.length >= MIN_POSTS_PER_TOPIC && avgViews >= MIN_VIEWS };
    })
    .sort((a, b) => b.avgViews - a.avgViews);
}

/** Đề xuất nội dung: chỉ khi có ít nhất 2 chủ đề đủ mẫu để so sánh. */
export function contentProposals(stats: TopicStat[]): ProposalDraft[] {
  const enough = stats.filter((s) => s.enough);
  if (enough.length < 2) return [];
  const best = enough[0];
  const worst = enough[enough.length - 1];
  if (best.avgViews < worst.avgViews * 1.5) return [];
  return [
    {
      key: `content:topic:${best.topic}`,
      target: "content",
      title: `Làm tiếp chủ đề “${best.topic}”`,
      detail: `Trung bình ${best.avgViews.toLocaleString("vi-VN")} lượt xem/bài, gấp ${(best.avgViews / Math.max(1, worst.avgViews)).toFixed(1)} lần chủ đề “${worst.topic}”. Giả thuyết: khán giả quan tâm chủ đề này hơn. Kiểm bằng 2–3 bài tiếp theo trước khi coi là kết luận.`,
      evidence: enough.map((s) => `${s.topic}: ${s.posts} bài, ${s.avgViews.toLocaleString("vi-VN")} lượt xem TB${s.avgEngagementRate != null ? `, tương tác ${s.avgEngagementRate}%` : ""}`),
      sampleSize: enough.reduce((n, s) => n + s.posts, 0),
      confidence: best.posts >= 5 && worst.posts >= 5 ? "medium" : "low",
    },
  ];
}

export interface QaReport {
  videoId: string;
  version: number;
  qa: { id: string; name: string; status: string; detail: string }[];
  blockers: string[];
}

/** Lỗi dựng lặp lại: mục bảng kiểm "chưa đạt" hoặc "chặn đăng" xuất hiện ở từ 2 video trở lên (bản mới nhất của mỗi video). */
export function videoQaPatterns(reports: QaReport[]): ProposalDraft[] {
  const latest = new Map<string, QaReport>();
  for (const r of reports) if (!latest.has(r.videoId) || latest.get(r.videoId)!.version < r.version) latest.set(r.videoId, r);
  const count = new Map<string, { name: string; videos: string[]; details: string[] }>();
  for (const r of latest.values()) {
    for (const q of r.qa) {
      if (q.status !== "fail" && q.status !== "blocker") continue;
      const c = count.get(q.id) ?? { name: q.name, videos: [], details: [] };
      c.videos.push(r.videoId);
      c.details.push(q.detail.slice(0, 160));
      count.set(q.id, c);
    }
  }
  const out: ProposalDraft[] = [];
  for (const [id, c] of count) {
    if (c.videos.length < MIN_VIDEOS_FOR_PATTERN) continue;
    out.push({
      key: `video_skill:qa:${id}`,
      target: "video_skill",
      title: `Mục ${id} “${c.name}” lặp lại ở ${c.videos.length} video`,
      detail: `Lỗi dựng lặp lại, không phải sự cố một lần. Đề xuất xem lại luật tương ứng trong Skill Edit video Vlog hoặc chốt câu hỏi mở liên quan. Hệ thống không tự sửa skill.`,
      evidence: c.details.slice(0, 5).map((d, i) => `${c.videos[i]}: ${d}`),
      sampleSize: c.videos.length,
      confidence: c.videos.length >= 4 ? "medium" : "low",
    });
  }
  return out;
}

const FEEDBACK_BUCKETS: [string, RegExp][] = [
  ["phụ đề", /phụ đề|chữ|subtitle|chính tả|sai từ/iu],
  ["nhạc / âm thanh", /nhạc|âm|tiếng|ồn|to quá|nhỏ quá/iu],
  ["logo", /logo/iu],
  ["cắt / nhịp", /cắt|lặng|nhịp|dài|ngắn/iu],
  ["zoom / khung hình", /zoom|khung|mặt|bố cục/iu],
  ["màu / ánh sáng", /màu|sáng|tối/iu],
];

/** Yêu cầu chỉnh sửa lặp lại theo nhóm (từ lịch sử phản hồi video). */
export function feedbackPatterns(notes: { videoId: string; note: string }[]): ProposalDraft[] {
  const out: ProposalDraft[] = [];
  for (const [bucket, re] of FEEDBACK_BUCKETS) {
    const hits = notes.filter((n) => re.test(n.note));
    const videos = new Set(hits.map((h) => h.videoId));
    if (videos.size < MIN_VIDEOS_FOR_PATTERN) continue;
    out.push({
      key: `video_skill:feedback:${bucket}`,
      target: "video_skill",
      title: `OWNER yêu cầu sửa “${bucket}” ở ${videos.size} video`,
      detail: "Yêu cầu chỉnh sửa lặp lại: nên đưa thành luật trong Skill thay vì sửa tay từng video.",
      evidence: hits.slice(0, 5).map((h) => `${h.videoId}: ${h.note.slice(0, 160)}`),
      sampleSize: videos.size,
      confidence: videos.size >= 4 ? "medium" : "low",
    });
  }
  return out;
}

export interface AdRow {
  id: string;
  name: string;
  status: string;
  spent: number;
  leads: number;
  impressions: number;
}

/** Quảng cáo đạt / không đạt mục tiêu chi phí mỗi lead (chỉ quảng cáo đủ 10 lead hoặc đã chi gấp 3 mục tiêu). */
export function adProposals(ads: AdRow[], cplTarget: number): ProposalDraft[] {
  const out: ProposalDraft[] = [];
  for (const a of ads) {
    const enough = a.leads >= 10 || a.spent >= cplTarget * 3;
    if (!enough) continue;
    const cpl = a.leads ? Math.round(a.spent / a.leads) : null;
    if (cpl !== null && cpl <= cplTarget) {
      out.push({ key: `ads:good:${a.id}`, target: "ads", title: `“${a.name}” đạt mục tiêu chi phí mỗi lead`, detail: `Chi phí mỗi lead ${cpl.toLocaleString("vi-VN")} ₫ ≤ mục tiêu ${cplTarget.toLocaleString("vi-VN")} ₫. Giả thuyết: nội dung / đối tượng này nên làm tiếp; dùng làm mẫu cho quảng cáo sau.`, evidence: [`${a.leads} lead, đã chi ${a.spent.toLocaleString("vi-VN")} ₫, ${a.impressions.toLocaleString("vi-VN")} lượt hiển thị`], sampleSize: a.leads, confidence: a.leads >= 30 ? "medium" : "low" });
    } else {
      out.push({ key: `ads:bad:${a.id}`, target: "ads", title: `“${a.name}” chưa đạt mục tiêu`, detail: cpl === null ? `Đã chi ${a.spent.toLocaleString("vi-VN")} ₫ chưa có lead.` : `Chi phí mỗi lead ${cpl.toLocaleString("vi-VN")} ₫ > mục tiêu ${cplTarget.toLocaleString("vi-VN")} ₫.`, evidence: [`${a.leads} lead, đã chi ${a.spent.toLocaleString("vi-VN")} ₫, trạng thái ${a.status}`], sampleSize: Math.max(a.leads, 1), confidence: "low" });
    }
  }
  return out;
}

/** Kiến thức cần bổ sung: chỗ "còn thiếu" lặp lại qua các brief, và trang DRAFT được dùng nhiều mà chưa xác minh. */
export function knowledgeProposals(gaps: { briefId: string; gap: string }[], draftUse: { pageId: string; title: string; uses: number }[]): ProposalDraft[] {
  const out: ProposalDraft[] = [];
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").split(/\s+/).slice(0, 6).join(" ");
  const by = new Map<string, { text: string; briefs: Set<string> }>();
  for (const g of gaps) {
    const k = norm(g.gap);
    const e = by.get(k) ?? { text: g.gap, briefs: new Set<string>() };
    e.briefs.add(g.briefId);
    by.set(k, e);
  }
  for (const [k, e] of by) {
    out.push({ key: `second_brain:gap:${k}`, target: "second_brain", title: `Kiến thức còn thiếu: ${e.text.slice(0, 90)}`, detail: `Ghi nhận ở ${e.briefs.size} brief. Đề xuất OWNER bổ sung (câu chuyện thật, câu thoại chuẩn, số liệu nội bộ). Hệ thống không tự viết kiến thức thay OWNER.`, evidence: [...e.briefs].map((b) => `brief ${b}`), sampleSize: e.briefs.size, confidence: e.briefs.size >= 3 ? "medium" : "low" });
  }
  for (const d of draftUse) {
    if (d.uses < 2) continue;
    out.push({ key: `second_brain:verify:${d.pageId}`, target: "second_brain", title: `Xác minh trang DRAFT “${d.title.slice(0, 80)}”`, detail: `Trang được dùng làm căn cứ ở ${d.uses} kịch bản nhưng vẫn là DRAFT. Đề xuất OWNER duyệt (VERIFIED) hoặc sửa để kịch bản không phải ghi "nháp".`, evidence: [`${d.uses} lần dùng`], sampleSize: d.uses, confidence: "medium" });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Personal Brand System 8.1: kiểm bài ĐÃ ĐĂNG theo skill trong Second Brain TRƯỚC (luật, không AI). Luật lấy từ skill viết content
// (cấu trúc mặc định Hook → … → CTA; tránh content kiến thức chung kiểu "5 cách chốt Sales"; không tự viết số liệu thị trường) + luật
// ngôn từ theo nền tảng. Một bài lệch là QUAN SÁT; gộp nhiều bài mới thành đề xuất, kèm cỡ mẫu.
export interface PublishedPost {
  id: string;
  title: string;
  platform: string;
  caption: string;
  issues: string[]; // từ luật ngôn từ + số liệu (tính ở index.ts, cần kịch bản)
  views: number | null;
  engagement: number | null;
  reach: number | null;
}

// CTA: lời mời hành động rõ ở 2 dòng cuối (bỏ dòng hashtag), hoặc câu hỏi ở CUỐI bài. "?" tu từ giữa bài, "chia sẻ câu chuyện",
// "linkedin" không tính.
const CTA_RE = /bình luận|comment|inbox|nhắn tin|để lại|lưu (?:lại|video)|hãy chia sẻ|chia sẻ (?:video|bài)|theo dõi|follow|đăng ký|link (?:ở|trong|dưới|bio)/iu;
const LISTICLE_RE = /^\s*(?:top\s*)?(?:[2-9]|\d{2,})\s+(?:cách|mẹo|bí quyết|bước|lý do|sai lầm)(?![\p{L}])/iu;

export function skillChecksForPost(p: Pick<PublishedPost, "caption" | "issues">): string[] {
  const lines = p.caption.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const body = lines.filter((l) => !/^(?:#[\p{L}\p{N}_]+\s*)+$/u.test(l));
  const out: string[] = [];
  if (!lines.length) return ["không có caption"];
  const tail = body.slice(-2).join(" ");
  if (!CTA_RE.test(tail) && !/\?\s*$/.test(body.at(-1) ?? "")) out.push("thiếu lời kêu gọi (CTA) ở cuối — skill: cấu trúc kết bằng CTA");
  if (LISTICLE_RE.test(lines[0])) out.push("mở bằng dạng “N cách / mẹo…” — skill: tránh content kiến thức chung, ưu tiên trải nghiệm + quan điểm + ví dụ");
  return [...out, ...p.issues];
}

/** Khoá gộp: bỏ đuôi nền tảng (" — facebook"), thay số bằng N — cùng một luật = một đề xuất, không sinh khoá rác theo từng con số. */
export function issueKey(issue: string): string {
  return issue.split(" — ")[0].replace(/“[^”]*”/g, "“N”").replace(/\d+(?:[.,]\d+)?/g, "N").replace(/\s*\(.*\)\s*$/, "").trim();
}

export function skillProposals(posts: PublishedPost[], skillLabel: string): ProposalDraft[] {
  if (!posts.length) return [];
  const checked = posts.map((p) => ({ p, found: skillChecksForPost(p) }));
  const byKey = new Map<string, { ps: PublishedPost[]; variants: Set<string> }>();
  for (const { p, found } of checked)
    for (const f of found) {
      const k = issueKey(f);
      const e = byKey.get(k) ?? { ps: [], variants: new Set<string>() };
      if (!e.ps.includes(p)) e.ps.push(p);
      e.variants.add(f.split(" — ")[0]);
      byKey.set(k, e);
    }
  const out: ProposalDraft[] = [];
  for (const [issueK, { ps, variants }] of byKey) {
    const key = issueK.slice(0, 80);
    const issue = variants.size === 1 ? [...variants][0] : `${issueK} (${[...variants].slice(0, 5).join("; ")})`;
    const rate = (xs: PublishedPost[]) => {
      const r = xs.filter((x) => x.reach && x.engagement != null).map((x) => (x.engagement! / x.reach!) * 100);
      return r.length >= 3 ? Math.round((r.reduce((a, b) => a + b, 0) / r.length) * 10) / 10 : null;
    };
    const ok = posts.filter((p) => !ps.includes(p));
    const rBad = rate(ps);
    const rOk = rate(ok);
    out.push({
      key: `skill:${key}`,
      target: "content",
      title: `Bài đã đăng lệch skill: ${issueK}`,
      detail: `${ps.length}/${posts.length} bài đã đăng ${issue}. Kiểm theo ${skillLabel} (bước ${MEASURE_STEP} — luật, không AI). Đề xuất: sửa caption mẫu / kịch bản cho các bài sau.${rBad != null && rOk != null ? ` Tương tác TB: bài lệch ${rBad}% · bài đạt ${rOk}% (giả thuyết, chưa phải kết luận).` : ""}`,
      evidence: ps.slice(0, 8).map((p) => `${p.platform}: “${p.title.slice(0, 80)}”`),
      sampleSize: posts.length,
      confidence: posts.length >= 10 ? "medium" : "low",
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Đề xuất còn mở (kiểm toán 26/10): ẩn đề xuất CHỜ OWNER đã cũ — phân tích hiện tại không còn sinh ra nó (số liệu đã đổi, hoặc lỗi
// đã được OWNER quyết: bản dựng mới không còn lỗi), hoặc nó trỏ tới video không còn tồn tại (đã xoá). Đề xuất OWNER đã quyết giữ nguyên
// trong lịch sử. Đề xuất AI ("ai:") không do phân tích luật sinh ra nên chỉ xét thực thể.
export interface StoredProposal {
  key: string;
  status: string;
  evidence: string[];
}

const VIDEO_REF = /^(v_[a-z0-9]+):/i;

export function openProposals<T extends StoredProposal>(stored: T[], liveKeys: Set<string>, videoExists: (id: string) => boolean): T[] {
  return stored.filter((p) => {
    if (p.status !== "proposed") return true;
    if (!p.key.startsWith("ai:") && !liveKeys.has(p.key)) return false;
    const vids = p.evidence.map((e) => VIDEO_REF.exec(e)?.[1]).filter((x): x is string => !!x);
    return vids.every(videoExists);
  });
}
