// CP06: phân tích thuần (không CSDL, không AI). Mỗi kết luận kèm cỡ mẫu; dưới ngưỡng thì "chưa đủ dữ liệu", không kết luận.
// Mọi kết luận là GIẢ THUYẾT cho tới khi OWNER chấp nhận: hệ thống không biến quan sát thành sự thật.

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
    out.push({ key: `second_brain:gap:${k}`, target: "second_brain", title: `Second Brain còn thiếu: ${e.text.slice(0, 90)}`, detail: `Ghi nhận ở ${e.briefs.size} brief. Đề xuất OWNER bổ sung (câu chuyện thật, câu thoại chuẩn, số liệu nội bộ). Hệ thống không tự viết kiến thức thay OWNER.`, evidence: [...e.briefs].map((b) => `brief ${b}`), sampleSize: e.briefs.size, confidence: e.briefs.size >= 3 ? "medium" : "low" });
  }
  for (const d of draftUse) {
    if (d.uses < 2) continue;
    out.push({ key: `second_brain:verify:${d.pageId}`, target: "second_brain", title: `Xác minh trang DRAFT “${d.title.slice(0, 80)}”`, detail: `Trang được dùng làm căn cứ ở ${d.uses} kịch bản nhưng vẫn là DRAFT. Đề xuất OWNER duyệt (VERIFIED) hoặc sửa để kịch bản không phải ghi "nháp".`, evidence: [`${d.uses} lần dùng`], sampleSize: d.uses, confidence: "medium" });
  }
  return out;
}
