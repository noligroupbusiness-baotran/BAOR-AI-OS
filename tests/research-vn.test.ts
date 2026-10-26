// Nghiên cứu sát thị trường Việt Nam (OWNER 26/10/2026): bình luận YouTube qua Data API (API key, hạn mức), dán link là tự đọc (YouTube /
// Fanpage / trang công khai qua công cụ hãng AI), nhóm Facebook / TikTok → dán tay (Meta đóng Groups API), làm sạch bản chép Facebook,
// nhãn nền tảng theo link, lời nhắc tìm web tiếng Việt + vị trí VN, tự nghiên cứu theo lịch (đề xuất chờ duyệt, bỏ gần trùng).
// CSDL tạm, fetch giả — không gọi YouTube / Meta / hãng AI thật.
import { test, before, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "baor-research-vn-"));
process.env.DATA_DIR = tmp;
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.AUTH_SECRET = "test-secret-".padEnd(40, "x");
process.env.BAOR_VIDEO_WORKER = "off";
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENAI_API_KEY;
delete process.env.XAI_API_KEY;
delete process.env.YOUTUBE_API_KEY;

let social: typeof import("../src/lib/research/social");
let yt: typeof import("../src/lib/research/youtube");
let ytc: typeof import("../src/lib/connectors/youtube");
let fb: typeof import("../src/lib/research/facebook");
let page: typeof import("../src/lib/research/page-read");
let topic: typeof import("../src/lib/research/topic");
let auto: typeof import("../src/lib/research/auto");
let research: typeof import("../src/lib/research");
let providers: typeof import("../src/lib/ai-providers");
let roster: typeof import("../src/lib/ai-roster");
let hooks: typeof import("../src/lib/content/hooks");
let admin: typeof import("../src/lib/admin");
let db: typeof import("../src/db");
const realFetch = globalThis.fetch;

before(async () => {
  social = await import("../src/lib/research/social");
  yt = await import("../src/lib/research/youtube");
  ytc = await import("../src/lib/connectors/youtube");
  fb = await import("../src/lib/research/facebook");
  page = await import("../src/lib/research/page-read");
  topic = await import("../src/lib/research/topic");
  auto = await import("../src/lib/research/auto");
  research = await import("../src/lib/research");
  providers = await import("../src/lib/ai-providers");
  roster = await import("../src/lib/ai-roster");
  hooks = await import("../src/lib/content/hooks");
  admin = await import("../src/lib/admin");
  db = await import("../src/db");
});

beforeEach(() => {
  delete process.env.YOUTUBE_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  admin.setSetting("youtube.quota", "");
  admin.setSetting("research.autoDay", "");
  admin.setSetting("research.autoTickAt", "");
  admin.setSetting("research.auto", "1");
  roster.saveRoleSettings("research", { enabled: true, model: "gpt-6-luna", monthlyCapVnd: 0 });
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

// ---------------------------------------------------------------- YouTube giả (đúng dạng tài liệu Data API v3)

const VIDEOS = ["AAAAAAAAAAA", "BBBBBBBBBBB", "CCCCCCCCCCC"];
const COMMENTS = [
  "Bán online 2 năm mà vẫn chưa ra đơn đều, nản quá",
  "Chạy quảng cáo cháy tiền mà không có đơn, sợ lắm",
  "Làm sao để khách không bom hàng vậy anh?",
  "Gọi em 0912 345 678 tư vấn nhé @Nguyễn Văn An",
  "Có nên bán trên TikTok Shop không ạ?",
  "Mình khó nhất là tìm nguồn hàng uy tín",
];
type Seen = { url: URL };
function youtubeFetch(seen: Seen[], opts: { commentCount?: number; threads?: number; quotaError?: boolean } = {}): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    seen.push({ url });
    if (opts.quotaError) return json({ error: { code: 403, message: "quota", errors: [{ reason: "quotaExceeded" }] } }, 403);
    if (url.pathname.endsWith("/search")) return json({ items: VIDEOS.map((id, i) => ({ id: { kind: "youtube#video", videoId: id }, snippet: { title: `Video ${i}`, channelTitle: "Kênh X" } })) });
    if (url.pathname.endsWith("/videos")) return json({ items: url.searchParams.get("id")!.split(",").map((id, i) => ({ id, snippet: { title: `Video ${id}` }, statistics: { commentCount: String(i === 2 ? 3 : (opts.commentCount ?? 500)) } })) });
    if (url.pathname.endsWith("/commentThreads")) {
      const vid = url.searchParams.get("videoId")!;
      const n = Math.min(Number(url.searchParams.get("maxResults")), opts.threads ?? COMMENTS.length);
      return json({
        items: Array.from({ length: n }, (_, i) => ({
          id: `th_${vid}_${i}`,
          snippet: { videoId: vid, topLevelComment: { id: `c_${vid}_${i}`, snippet: { authorDisplayName: "Trần Thị Bí Mật", authorChannelId: { value: "UCbimat" }, textOriginal: `${COMMENTS[i % COMMENTS.length]}${i >= COMMENTS.length ? ` (${i})` : ""}`, likeCount: 3 } }, totalReplyCount: 0 },
        })),
      });
    }
    if (url.pathname.endsWith("/i18nRegions")) return json({ items: [] });
    throw new Error(`fetch lạ: ${url}`);
  }) as unknown as typeof fetch;
}

// ---------------------------------------------------------------- nhận nền tảng từ link

test("nền tảng tự nhận từ link + nhãn huy hiệu (YouTube / Facebook / TikTok / Instagram / Threads / Diễn đàn / Web)", () => {
  const cases: [string, string, string][] = [
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "youtube", "YouTube"],
    ["https://youtu.be/dQw4w9WgXcQ", "youtube", "YouTube"],
    ["https://m.facebook.com/groups/123/posts/456", "fb_group", "Facebook"],
    ["https://www.facebook.com/baor.vn/posts/pfbid02abc", "facebook", "Facebook"],
    ["https://vt.tiktok.com/ZSabc/", "tiktok", "TikTok"],
    ["https://www.instagram.com/p/Cxyz/", "instagram", "Instagram"],
    ["https://www.threads.net/@a/post/1", "threads", "Threads"],
    ["https://voz.vn/t/ban-hang-online.123/", "web", "Diễn đàn"],
    ["https://www.webtretho.com/f/abc", "web", "Diễn đàn"],
    ["https://vnexpress.net/kinh-doanh-online-123.html", "web", "Web"],
    ["ftp://x.y/z", "other", "Khác"],
  ];
  for (const [u, kind, label] of cases) {
    assert.equal(social.detectPlatform(u), kind, u);
    assert.equal(social.platformLabel(u), label, u);
  }
});

test("link video YouTube: watch / youtu.be / shorts / live / embed; link khác → null", () => {
  const id = "dQw4w9WgXcQ";
  for (const u of [`https://www.youtube.com/watch?v=${id}&t=10s`, `https://youtu.be/${id}?si=x`, `https://youtube.com/shorts/${id}`, `https://m.youtube.com/live/${id}`, `https://www.youtube.com/embed/${id}`]) assert.equal(yt.parseYouTubeVideoId(u), id, u);
  for (const u of ["https://www.youtube.com/@kenh", "https://www.youtube.com/watch?v=ngan", "https://evil.com/watch?v=dQw4w9WgXcQ", "không phải link"]) assert.equal(yt.parseYouTubeVideoId(u), null, u);
});

// ---------------------------------------------------------------- YouTube Data API: tham số, hạn mức, làm sạch

test("YouTube: search.list (VN, tiếng Việt, video) + commentThreads.list (relevance, plainText, ≤ 100) — đúng tham số, có key, không đọc tên tác giả", async () => {
  const seen: Seen[] = [];
  const f = youtubeFetch(seen);
  const vids = await yt.searchVideos("bán hàng online", "AIza-test", f);
  assert.equal(vids.length, 3);
  const s = seen[0].url;
  assert.equal(s.origin + s.pathname, "https://www.googleapis.com/youtube/v3/search");
  for (const [k, v] of Object.entries({ part: "snippet", q: "bán hàng online", type: "video", regionCode: "VN", relevanceLanguage: "vi", order: "relevance", key: "AIza-test" })) assert.equal(s.searchParams.get(k), v, k);
  assert.match(s.searchParams.get("publishedAfter")!, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/, "RFC 3339");
  const cs = await yt.videoComments(VIDEOS[0], 250, "AIza-test", f);
  const c = seen[1].url;
  assert.equal(c.pathname, "/youtube/v3/commentThreads");
  for (const [k, v] of Object.entries({ part: "snippet", videoId: VIDEOS[0], order: "relevance", textFormat: "plainText", maxResults: "100" })) assert.equal(c.searchParams.get(k), v, k);
  assert.ok(cs.length > 0);
  assert.doesNotMatch(JSON.stringify(cs), /Trần Thị Bí Mật|UCbimat/, "không giữ tên / kênh người bình luận");
  assert.equal(ytc.youtubeQuota().units, 2);
  assert.equal(ytc.youtubeQuota().searches, 1);
});

test("hạn mức YouTube: tự dừng TRƯỚC ngưỡng (đơn vị chung và 100 lượt search / ngày) — không gọi mạng; Google báo hết → khoá đến hết ngày PT; sang ngày mới đặt lại", async () => {
  const seen: Seen[] = [];
  const f = youtubeFetch(seen);
  const now = new Date("2026-10-26T10:00:00Z");
  admin.setSetting("youtube.quota", JSON.stringify({ day: ytc.ptDay(now), units: ytc.YT_STOP_UNITS, searches: 0 }));
  await assert.rejects(yt.videoComments(VIDEOS[0], 10, "k", f, now), (e: Error) => e instanceof ytc.YouTubeError && /hạn mức/.test(e.message));
  admin.setSetting("youtube.quota", JSON.stringify({ day: ytc.ptDay(now), units: 10, searches: ytc.YT_STOP_SEARCHES }));
  await assert.rejects(yt.searchVideos("x", "k", f, now), /hạn mức/);
  assert.equal(seen.length, 0, "không gọi YouTube khi đã chạm ngưỡng");
  assert.ok((await yt.videoDetails([VIDEOS[0]], "k", f, now)).length === 1, "bể search đầy vẫn đọc được bình luận / video (bể chung còn)");
  // Google trả quotaExceeded → coi như hết cho tới 0 giờ PT
  admin.setSetting("youtube.quota", "");
  await assert.rejects(yt.searchVideos("x", "k", youtubeFetch(seen, { quotaError: true }), now), /hạn mức/);
  assert.equal(ytc.quotaAllows("list", now).ok, false);
  const nextDay = new Date(now.getTime() + 86_400_000);
  assert.equal(ytc.quotaAllows("search", nextDay).ok, true, "ngày PT mới → đặt lại");
  assert.equal(ytc.ptDay(new Date("2026-10-27T06:59:00Z")), "2026-10-26", "0 giờ PT = 07:00 UTC (giờ mùa hè)");
});

test("đào bình luận: bỏ video ít bình luận, tổng ≤ 300, làm sạch số điện thoại / @nhắc tên, link tới đúng bình luận (lc=)", async () => {
  const seen: Seen[] = [];
  const m = await yt.mineYouTube({ queries: ["bán hàng online", "bán online khó khăn"], apiKey: "k", fetch: youtubeFetch(seen, { threads: 100 }), maxComments: 1000 });
  assert.deepEqual(m.videos.map((v) => v.id), VIDEOS.slice(0, 2), "video thứ ba chỉ có 3 bình luận → bỏ");
  assert.ok(m.comments.length <= yt.MAX_YT_COMMENTS && m.comments.length >= 90, String(m.comments.length));
  assert.equal(new Set(m.comments.map((c) => c.text)).size, m.comments.length, "bình luận trùng giữa các video chỉ giữ một");
  assert.ok(m.comments.every((c) => /^https:\/\/www\.youtube\.com\/watch\?v=[A-Z]{11}&lc=c_/.test(c.url)));
  const all = JSON.stringify(m);
  assert.doesNotMatch(all, /0912|Nguyễn Văn An|Trần Thị Bí Mật/);
  assert.equal(m.units, seen.length, "mỗi lượt gọi đếm 1 đơn vị");
});

test("thiếu API key YouTube → không gọi mạng; nút báo “Thiếu khoá YouTube”", async () => {
  const seen: Seen[] = [];
  globalThis.fetch = youtubeFetch(seen);
  const r = yt.youtubeReadiness();
  assert.equal(r.ok, false);
  assert.equal(r.ok ? "" : r.label, "Thiếu khoá YouTube");
  const id = topic.createTopic("thiếu khoá youtube", "OWNER");
  roster.saveRoleSettings("research", { enabled: false });
  const run = await topic.runPainResearch(id, "OWNER");
  assert.equal(seen.length, 0);
  assert.ok(run.notes.some((n) => /youtube: thiếu khoá/i.test(n)), run.notes.join(" | "));
  const link = await topic.analyzeLink({ taskId: id, url: `https://youtu.be/${VIDEOS[0]}`, topic: "x", by: "OWNER", fetch: youtubeFetch(seen) });
  assert.equal(link.ok, false);
  assert.ok(!link.ok && link.needPaste, "không có khoá → mở ô dán tay");
  assert.equal(seen.length, 0);
});

test("AI tìm nỗi đau khách (AI tắt): câu tìm theo luật từ tên chủ đề → insight gắn nguồn YouTube + link bình luận; tự chạy → chờ duyệt, không vào hook tới khi duyệt", async () => {
  process.env.YOUTUBE_API_KEY = "AIza-test";
  roster.saveRoleSettings("research", { enabled: false });
  const seen: Seen[] = [];
  const id = topic.createTopic("kinh doanh online", "OWNER");
  const run = await topic.runPainResearch(id, "OWNER", { fetch: youtubeFetch(seen) });
  assert.ok(run.ok, run.notes.join(" | "));
  assert.deepEqual(seen.filter((s) => s.url.pathname.endsWith("/search")).map((s) => s.url.searchParams.get("q")), yt.fallbackQueries("kinh doanh online"));
  assert.ok(run.notes.some((n) => /^Web: ai đang tắt/i.test(n)), run.notes.join(" | "));
  const ins = topic.topicInsights(id);
  assert.ok(ins.length >= 2);
  assert.ok(ins.every((i) => i.platform === "YouTube" && i.source === "Bình luận YouTube" && !i.pending));
  assert.ok(ins.some((i) => /&lc=c_/.test(i.url)), "insight dẫn tới đúng bình luận");
  const srcs = research.getResearchTask(id)!.sources;
  assert.ok(srcs.some((s) => s.url === `https://www.youtube.com/watch?v=${VIDEOS[0]}` && s.title === `Video ${VIDEOS[0]}`));
  assert.doesNotMatch(JSON.stringify(research.getResearchTask(id)), /Trần Thị Bí Mật|0912/);
  // Tự chạy (pending): đề xuất chờ duyệt, không vào hook
  const id2 = topic.createTopic("bán hàng trên mạng", "OWNER");
  await topic.runPainResearch(id2, "AI tự nghiên cứu", { pending: true, fetch: youtubeFetch([]) });
  const pend = topic.topicInsights(id2);
  assert.ok(pend.length > 0 && pend.every((i) => i.pending));
  assert.equal(hooks.hookContext("x", id2).basis.filter((b) => b.kind === "finding").length, 0, "chưa duyệt → không làm căn cứ hook");
  assert.ok(topic.approveInsight(id2, pend[0].id));
  assert.deepEqual(hooks.hookContext("x", id2).basis.filter((b) => b.kind === "finding").map((b) => b.id), [pend[0].id]);
  assert.equal(topic.approveInsight(id, pend[1]?.id ?? "x"), false, "không duyệt chéo chủ đề");
});

test("bỏ insight gần trùng khi tự nghiên cứu (đổi số đếm / dấu câu), giữ insight khác hẳn", () => {
  assert.ok(research.nearDuplicate(research.insightTokens("12/40 bình luận nói về khó khăn: “sợ cháy tiền”"), research.insightTokens("13/41 bình luận nói về khó khăn — “sợ cháy tiền”!")));
  assert.ok(!research.nearDuplicate(research.insightTokens("Khách sợ bị bom hàng khi ship COD"), research.insightTokens("Người mới không biết chọn sàn nào để bán")));
  const id = topic.createTopic("chủ đề trùng thử", "OWNER");
  const mk = (statement: string) => ({ statement, classification: "OBSERVATION" as const, sourceUrls: ["https://voz.vn/t/1/"], knowledgeIds: [], counterView: "", limits: "", application: "", contentTopics: [], confidence: "low" as const });
  const src = [{ url: "https://voz.vn/t/1/", title: "t", author: "", publisher: "Diễn đàn / web", publishedAt: null, sourceType: "social" as const, grade: "D" as const, excerpt: "", limits: "" }];
  research.saveResearchResult(id, { summary: "a", sources: src, findings: [mk("12/40 bình luận nói về khó khăn: sợ cháy tiền quảng cáo")] }, { runner: "import", by: "t", append: true });
  const r = research.saveResearchResult(id, { summary: "b", sources: src, findings: [mk("13/41 bình luận nói về khó khăn: sợ cháy tiền quảng cáo"), mk("Người mới không biết chọn sàn nào để bán"), mk("Người mới không biết chọn sàn nào để bán hàng")] }, { runner: "ai", by: "t", append: true, pending: true, dedupe: true });
  assert.equal(r.findings, 1, "chỉ còn insight mới thật sự");
});

// ---------------------------------------------------------------- dán tay: bản chép Facebook

test("bản chép khung bình luận Facebook (máy tính): bỏ tên, huy hiệu, Thích / Phản hồi / thời gian / số cảm xúc / Xem thêm; bình luận nhiều dòng giữ nguyên một bình luận", () => {
  const paste = [
    "Phù hợp nhất",
    "Nguyễn Thị Hoa",
    "Tác giả",
    "Mình bán online 2 năm mà vẫn chưa ra đơn đều,",
    "chạy quảng cáo thì cháy túi 😭",
    "2 tuần",
    "Thích",
    "Phản hồi",
    "12",
    "Trần Văn Nam",
    "Fan cứng",
    "Bạn thử livestream chưa? Mình live tối nào cũng có vài đơn",
    "1 tuần",
    "Thích",
    "Phản hồi",
    "Đã chỉnh sửa",
    "Xem tất cả 5 phản hồi",
    "Lê Minh 🌸",
    "Ship COD bị bom hàng hoài, ai có cách nào không ạ? Gọi 0912 345 678... Xem thêm",
    "3 ngày",
    "Thích · Phản hồi · Chia sẻ",
    "👍❤️ 25",
    "Viết bình luận...",
  ].join("\n");
  assert.deepEqual(social.parseSocialPaste(paste), [
    "Mình bán online 2 năm mà vẫn chưa ra đơn đều, chạy quảng cáo thì cháy túi 😭",
    "Bạn thử livestream chưa? Mình live tối nào cũng có vài đơn",
    "Ship COD bị bom hàng hoài, ai có cách nào không ạ? Gọi",
  ]);
});

test("bản chép Facebook điện thoại / giao diện tiếng Anh: “2 giờ · Thích · Phản hồi”, “Người đóng góp nổi bật”, “1,2K”, “See more”", () => {
  const vi = ["Hoa Nguyen", "Người đóng góp nổi bật", "khách hỏi giá xong im luôn, nản ghê", "2 giờ · Thích · Phản hồi", "1,2K", "Phạm Quốc Bảo", "Quản trị viên", "nhập hàng Quảng Châu có bị lừa không mọi người?", "Vừa xong", "Thích", "Trả lời", "Xem thêm bình luận"].join("\n");
  assert.deepEqual(social.parseSocialPaste(vi), ["khách hỏi giá xong im luôn, nản ghê", "nhập hàng Quảng Châu có bị lừa không mọi người?"]);
  const en = ["Most relevant", "Linh Tran", "Top fan", "sợ nhất là hàng hoàn về... See more", "5d", "Like", "Reply", "View all 3 replies", "Duc Le", "Author", "giá ship cao quá khách bỏ giỏ", "1w", "Like · Reply", "😆 3", "Write a comment…"].join("\n");
  assert.deepEqual(social.parseSocialPaste(en), ["sợ nhất là hàng hoàn về", "giá ship cao quá khách bỏ giỏ"]);
  // danh sách thường (không có dòng giao diện) vẫn mỗi dòng một bình luận
  assert.deepEqual(social.parseSocialPaste("dòng một nè\ndòng hai nè\ndòng ba nè"), ["dòng một nè", "dòng hai nè", "dòng ba nè"]);
});

// ---------------------------------------------------------------- Facebook: chỉ Fanpage của OWNER qua Graph API

test("link Facebook: nhóm / bài trang khác / chưa có Page token → dán tay, KHÔNG gọi Meta; bài trên Fanpage → /{page}_{post}/comments chỉ xin message (không xin from)", async () => {
  assert.equal(fb.parseFacebookUrl("https://www.facebook.com/groups/123/posts/456").kind, "group");
  assert.deepEqual(fb.parseFacebookUrl("https://www.facebook.com/permalink.php?story_fbid=456&id=111"), { kind: "story", storyId: "456", ownerId: "111" });
  assert.deepEqual(fb.parseFacebookUrl("https://www.facebook.com/111_456"), { kind: "object", id: "111_456", ownerId: "111" });
  assert.deepEqual(fb.parseFacebookUrl("https://www.facebook.com/baor/videos/789"), { kind: "object", id: "789" });
  assert.equal(fb.parseFacebookUrl("https://www.facebook.com/baor/posts/pfbid0abc").kind, "permalink");
  const seen: string[] = [];
  const f = (async (u: string | URL | Request) => {
    seen.push(String(u));
    const url = new URL(String(u));
    if (url.pathname.endsWith("/posts")) return json({ data: [{ id: "111_999", permalink_url: "https://www.facebook.com/baor/posts/pfbid0abc" }] });
    return json({ data: [{ message: "Bán online khó quá" }, { message: "sợ bom hàng lắm" }, { message: "ship COD có nên không?" }] });
  }) as unknown as typeof fetch;
  const cfg = { pageId: "111", pageToken: "EAAtest" };
  for (const [u, c, re] of [
    ["https://www.facebook.com/groups/123/posts/456", cfg, /Nhóm Facebook/],
    ["https://www.facebook.com/permalink.php?story_fbid=456&id=222", cfg, /không thuộc Fanpage/],
    ["https://www.facebook.com/baor/posts/456", {}, /Chưa kết nối Fanpage/],
  ] as const) {
    const r = await fb.fanpageComments(u, { fetch: f, config: c });
    assert.ok(!r.ok && r.needPaste && re.test(r.reason), u);
  }
  assert.equal(seen.length, 0, "không gọi Meta cho link không đọc được");
  const r = await fb.fanpageComments("https://www.facebook.com/baor/posts/456", { fetch: f, config: cfg });
  assert.ok(r.ok && r.comments.length === 3);
  const u = new URL(seen[0]);
  assert.equal(u.pathname, "/v21.0/111_456/comments");
  assert.equal(u.searchParams.get("fields"), "message");
  assert.equal(u.searchParams.get("filter"), "toplevel");
  const p = await fb.fanpageComments("https://www.facebook.com/baor/posts/pfbid0abc", { fetch: f, config: cfg });
  assert.ok(p.ok);
  assert.match(seen.at(-1)!, /\/v21\.0\/111_999\/comments/, "link pfbid → tìm theo permalink_url bài gần đây");
});

test("dán link: TikTok / nhóm Facebook → mở ô dán, không gọi gì; trang công khai khi AI tắt → mở ô dán; link nội bộ bị chặn trước khi gửi hãng AI", async () => {
  const seen: Seen[] = [];
  const f = youtubeFetch(seen);
  globalThis.fetch = f;
  const id = topic.createTopic("định tuyến link", "OWNER");
  for (const u of ["https://www.tiktok.com/@a/video/1", "https://www.facebook.com/groups/1/posts/2"]) {
    const r = await topic.analyzeLink({ taskId: id, url: u, topic: "x", by: "OWNER", fetch: f });
    assert.ok(!r.ok && r.needPaste, u);
  }
  roster.saveRoleSettings("research", { enabled: false });
  const w = await topic.analyzeLink({ taskId: id, url: "https://voz.vn/t/ban-hang.1/", topic: "x", by: "OWNER", fetch: f });
  assert.ok(!w.ok && w.needPaste && /AI/.test(w.error));
  assert.equal(seen.length, 0);
  for (const bad of ["http://localhost:3010/x", "http://127.0.0.1/", "http://10.0.0.5/a", "http://192.168.1.1/", "http://169.254.169.254/latest", "https://user:pass@voz.vn/", "https://voz.vn:8443/", "file:///etc/passwd", "http://[::1]/", "http://intranet/"]) assert.equal(page.isPublicHttpUrl(bad), false, bad);
  for (const ok of ["https://voz.vn/t/abc.1/", "https://tinhte.vn/thread/x.2/"]) assert.equal(page.isPublicHttpUrl(ok), true, ok);
  // Chữ hãng trả về → bình luận sạch; "không đọc được" → rỗng
  assert.deepEqual(page.pageReadToComments("- Bán online khó quá\n2. sợ bom hàng lắm\n• “ship COD có nên không?”"), ["Bán online khó quá", "sợ bom hàng lắm", "ship COD có nên không?"]);
  assert.deepEqual(page.pageReadToComments(page.PAGE_READ_FAIL), []);
  assert.match(page.pageReadPrompt("https://voz.vn/t/1/", "bán hàng"), /Việt Nam[\s\S]*Không ghi tên/);
});

// ---------------------------------------------------------------- tìm web: tiếng Việt, nguồn VN, vị trí VN theo hãng

test("lời nhắc tìm web: thị trường Việt Nam, câu tìm tiếng Việt, mạng xã hội công khai (site:), nguồn VN, nước ngoài gắn cờ", () => {
  for (const re of [/Thị trường: Việt Nam/, /TIẾNG VIỆT/, /site:facebook\.com/, /site:tiktok\.com/, /site:instagram\.com/, /site:threads\.net/, /voz\.vn/, /VECOM/, /Metric/, /Bộ Công Thương/, /\[Nước ngoài\]/]) assert.match(research.RESEARCH_SYSTEM, re);
  assert.match(research.researchPrompt("kinh doanh online", "insight", "(trống)"), /Thị trường: Việt Nam[\s\S]*tiếng Việt[\s\S]*TikTok/);
  assert.deepEqual(providers.webSearchTool({ maxCalls: 3, country: "VN", allowedDomains: ["voz.vn"] }), { type: "web_search", user_location: { type: "approximate", country: "VN" }, filters: { allowed_domains: ["voz.vn"] } });
});

test("Claude web_search: user_location VN (platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool)", async () => {
  process.env.ANTHROPIC_API_KEY = "sk-ant-test-khong-goi-that";
  roster.saveRoleSettings("research", { enabled: true, model: "claude-sonnet-5-5" });
  const bodies: Record<string, unknown>[] = [];
  const url = "https://cafef.vn/ban-hang-online.chn";
  const msg = (content: unknown[]) => ({ id: "m", type: "message", role: "assistant", model: "claude-sonnet-5-5", content, stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } });
  let n = 0;
  globalThis.fetch = (async (_u: unknown, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    return n++ === 0
      ? json(msg([{ type: "web_search_tool_result", tool_use_id: "s", content: [{ type: "web_search_result", url, title: "t", page_age: null, encrypted_content: "x" }] }, { type: "text", text: "báo cáo" }]))
      : json(msg([{ type: "text", text: JSON.stringify({ summary: "s", sources: [], findings: [] }) }]));
  }) as unknown as typeof fetch;
  const id = topic.createTopic("vị trí Claude", "OWNER");
  const r = await research.runResearchWithAi(id, "OWNER", { append: true });
  assert.ok(r.ok, r.ok ? "" : r.error);
  const tool = (bodies[0].tools as Record<string, unknown>[])[0];
  assert.equal(tool.name, "web_search");
  assert.deepEqual(tool.user_location, { type: "approximate", country: "VN", timezone: "Asia/Ho_Chi_Minh" });
  assert.match(String(bodies[0].system), /Thị trường: Việt Nam/);
});

// ---------------------------------------------------------------- tự nghiên cứu theo lịch

test("tự nghiên cứu: chọn chủ đề chưa chạy trước, bỏ chủ đề vừa chạy trong 7 ngày và chủ đề cũ quá 120 ngày; giới hạn số lượng", () => {
  const d = db.getDb();
  d.delete(db.schema.researchTasks).run();
  const now = new Date("2026-10-26T03:00:00Z");
  const fresh = topic.createTopic("chưa chạy bao giờ", "OWNER");
  const stale = topic.createTopic("chạy 8 ngày trước", "OWNER");
  const recent = topic.createTopic("vừa chạy hôm qua", "OWNER");
  const old = topic.createTopic("chủ đề quá cũ", "OWNER");
  const iso = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
  for (const id of [fresh, stale, recent]) d.update(db.schema.researchTasks).set({ createdAt: iso(10) }).where(eq(db.schema.researchTasks.id, id)).run();
  d.update(db.schema.researchTasks).set({ createdAt: iso(200) }).where(eq(db.schema.researchTasks.id, old)).run();
  admin.setSetting(`research.autoAt.${stale}`, iso(8));
  admin.setSetting(`research.autoAt.${recent}`, iso(1));
  assert.deepEqual(auto.pickTopicsForAuto(now, 5), [fresh, stale]);
  assert.deepEqual(auto.pickTopicsForAuto(now, 1), [fresh]);
});

test("tự nghiên cứu theo lịch: AI Nghiên cứu tắt / tắt tự nghiên cứu / thiếu khoá → không gọi gì; có khoá → 1 chủ đề / lượt, tối đa 2 / ngày, kết quả chờ duyệt", async () => {
  db.getDb().delete(db.schema.researchTasks).run();
  const now = new Date("2026-10-26T03:00:00Z");
  const ids = ["tự một", "tự hai", "tự ba"].map((t) => topic.createTopic(`chủ đề ${t}`, "OWNER"));
  for (const id of ids) db.getDb().update(db.schema.researchTasks).set({ createdAt: now.toISOString() }).where(eq(db.schema.researchTasks.id, id)).run();
  const seen: Seen[] = [];
  const f = youtubeFetch(seen);
  // thiếu mọi khoá
  assert.equal(await auto.runAutoResearchTick(now, f), "");
  process.env.YOUTUBE_API_KEY = "AIza-test";
  // AI Nghiên cứu tắt
  roster.saveRoleSettings("research", { enabled: false });
  assert.equal(await auto.runAutoResearchTick(now, f), "");
  // chạm trần riêng của vị trí
  roster.saveRoleSettings("research", { enabled: true, monthlyCapVnd: 1 });
  (await import("../src/lib/router")).recordAiCall({ purpose: "research", role: "research", model: "gpt-6-luna", inputTokens: 1, outputTokens: 1, ok: true, costVnd: 5 });
  assert.match(auto.autoReadiness(now).ok ? "" : (auto.autoReadiness(now) as { reason: string }).reason, /trần/);
  assert.equal(await auto.runAutoResearchTick(now, f), "");
  roster.saveRoleSettings("research", { enabled: true, monthlyCapVnd: 0 });
  // tắt tự nghiên cứu
  auto.setAutoResearch(false);
  assert.equal(await auto.runAutoResearchTick(now, f), "");
  assert.equal(seen.length, 0, "không gọi YouTube khi chưa đủ điều kiện");
  auto.setAutoResearch(true);
  const a = await auto.runAutoResearchTick(now, f);
  const b = await auto.runAutoResearchTick(new Date(now.getTime() + 3_600_000), f);
  assert.match(a, /tự nghiên cứu 1 chủ đề/);
  assert.match(b, /tự nghiên cứu 1 chủ đề/);
  const before = seen.length;
  assert.equal(await auto.runAutoResearchTick(new Date(now.getTime() + 7_200_000), f), "", "đủ 2 chủ đề / ngày");
  assert.equal(seen.length, before);
  const ran = ids.filter((id) => auto.lastAutoAt(id));
  assert.equal(ran.length, 2);
  for (const id of ran) {
    const ins = topic.topicInsights(id);
    assert.ok(ins.length > 0 && ins.every((i) => i.pending), "đề xuất chờ duyệt, không tự duyệt");
  }
  assert.ok(auto.lastAutoRun()?.topic);
  const runs = db.getDb().select().from(db.schema.syncRuns).all();
  assert.ok(runs.some((r) => r.integrationKey === "research" && r.kind === "auto" && r.ok));
  assert.ok(runs.some((r) => r.integrationKey === "youtube" && r.kind === "research"));
});

// ---------------------------------------------------------------- phản biện P2 (26/10)

test("P2-1: chủ đề mới tạo dùng CHUNG trần 2 chủ đề / ngày với lịch — tạo 5 chủ đề chỉ tự chạy 2, lịch sau đó không chạy thêm", async () => {
  db.getDb().delete(db.schema.researchTasks).run();
  process.env.YOUTUBE_API_KEY = "AIza-test";
  const seen: Seen[] = [];
  const f = youtubeFetch(seen);
  const now = new Date("2026-10-26T03:00:00Z");
  let ran = 0;
  for (let i = 0; i < 5; i++) {
    const id = topic.createTopic(`chủ đề tạo nhanh số ${i}`, "OWNER");
    if ((await auto.autoResearchTopic(id, { now, fetch: f })).ran) ran++;
  }
  assert.equal(ran, 2);
  assert.equal(auto.autoQuotaLeft(now), 0);
  const calls = seen.length;
  assert.equal(await auto.runAutoResearchTick(new Date(now.getTime() + 2 * 3_600_000), f), "");
  assert.equal(seen.length, calls, "hết lượt ngày → lịch không gọi YouTube");
});

test("P2-2: lượt tự nghiên cứu chạy TÁCH RỜI (trả ngay, không chặn lượt mỗi phút), một lượt một lúc, giãn cách ≥ 55 phút dù “Chạy ngay”", async () => {
  db.getDb().delete(db.schema.researchTasks).run();
  process.env.YOUTUBE_API_KEY = "AIza-test";
  const now = new Date("2026-10-26T03:00:00Z");
  for (const t of ["tách rời một", "tách rời hai"]) {
    const id = topic.createTopic(`chủ đề ${t}`, "OWNER");
    db.getDb().update(db.schema.researchTasks).set({ createdAt: now.toISOString() }).where(eq(db.schema.researchTasks.id, id)).run();
  }
  let release: () => void = () => {};
  const gateP = new Promise<void>((r) => (release = r));
  const inner = youtubeFetch([]);
  const slow = (async (u: string | URL | Request) => {
    await gateP;
    return inner(u);
  }) as unknown as typeof fetch;
  const k = auto.kickAutoResearch(now, slow);
  assert.match(k.started, /chạy nền/, "trả ngay khi YouTube còn đang chờ");
  assert.equal(auto.kickAutoResearch(new Date(now.getTime() + 60_000), slow).started, "", "đang chạy → không chạy chồng");
  release();
  assert.match(await k.done, /tự nghiên cứu 1 chủ đề/);
  assert.equal(auto.kickAutoResearch(new Date(now.getTime() + 10 * 60_000), inner).started, "", "chưa đủ giãn cách (Chạy ngay trong cùng giờ)");
  const k2 = auto.kickAutoResearch(new Date(now.getTime() + 60 * 60_000), inner);
  assert.ok(k2.started);
  await k2.done;
});

test("P2-3: đề xuất chờ duyệt không ghi đè brief của chủ đề; insight chờ duyệt không gợi ý chủ đề", () => {
  const id = topic.createTopic("brief không bị ghi đè", "OWNER");
  const src = [{ url: "https://cafef.vn/a.chn", title: "t", author: "", publisher: "CafeF", publishedAt: null, sourceType: "news" as const, grade: "B" as const, excerpt: "", limits: "" }];
  const f = (statement: string, topics: string[]) => ({ statement, classification: "OBSERVATION" as const, sourceUrls: [src[0].url], knowledgeIds: [], counterView: "", limits: "", application: "", contentTopics: topics, confidence: "low" as const });
  const brief = (keyMessage: string) => ({ topic: "t", goal: "g", audience: "a", keyMessage, angle: "x", points: [{ text: "p", classification: "OBSERVATION" as const, findingRefs: [0], knowledgeIds: [], sourceUrls: [src[0].url] }], gaps: [] });
  const a = research.saveResearchResult(id, { summary: "a", sources: src, findings: [f("Khách sợ cháy tiền quảng cáo", [])], brief: brief("BẢN OWNER") }, { runner: "ai", by: "OWNER", append: true });
  assert.ok(a.briefId);
  const p = research.saveResearchResult(id, { summary: "b", sources: src, findings: [f("Người mới sợ bị lừa nguồn hàng", ["chủ đề chờ duyệt riêng"])], brief: brief("BẢN TỰ ĐỘNG") }, { runner: "ai", by: "AI", append: true, pending: true, dedupe: true });
  assert.equal(p.briefId, null);
  assert.equal(research.getResearchTask(id)!.brief!.keyMessage, "BẢN OWNER");
  assert.ok(!research.suggestTopics(50).some((t) => t.topic === "chủ đề chờ duyệt riêng"), "insight chờ duyệt không gợi ý chủ đề");
});
