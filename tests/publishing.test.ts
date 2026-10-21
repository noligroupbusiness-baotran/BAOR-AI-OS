// CP04: đăng video đã duyệt. CSDL tạm, fetch giả (không gọi Meta thật). Token trong test là chuỗi giả.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { eq } from "drizzle-orm";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "baor-pub-"));
process.env.DATA_DIR = tmp;
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.AUTH_SECRET = "test-secret-".padEnd(40, "x");
process.env.BAOR_VIDEO_WORKER = "off";

let db: typeof import("../src/db");
let meta: typeof import("../src/lib/connectors/meta");
let pub: typeof import("../src/lib/publishing/video");
let config: typeof import("../src/lib/connectors/config");
let admin: typeof import("../src/lib/admin");

const FAKE = { pageId: "111", pageToken: "page-token-gia", appId: "222", userToken: "user-token-gia" };

before(async () => {
  db = await import("../src/db");
  meta = await import("../src/lib/connectors/meta");
  pub = await import("../src/lib/publishing/video");
  config = await import("../src/lib/connectors/config");
  admin = await import("../src/lib/admin");
});

type Call = { url: string; method: string; headers: Record<string, string>; bodyBytes: number; form?: URLSearchParams };

function fakeMeta(opts: { failUpload?: boolean; permalink?: boolean } = {}) {
  const calls: Call[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    const u = String(url);
    const headers = Object.fromEntries(Object.entries((init?.headers as Record<string, string>) ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
    let bodyBytes = 0;
    let form: URLSearchParams | undefined;
    if (init?.body instanceof URLSearchParams) form = init.body;
    else if (init?.body) {
      const reader = (init.body as ReadableStream<Uint8Array>).getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bodyBytes += value.byteLength;
      }
    }
    calls.push({ url: u, method: init?.method ?? "GET", headers, bodyBytes, form });
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
    if (u.includes("/222/uploads")) return json({ id: "upload:SESSION1" });
    if (u.endsWith("/upload:SESSION1")) return opts.failUpload ? json({ error: { message: "Upload lỗi", code: 1 } }, 400) : json({ h: "HANDLE1" });
    if (u.endsWith("/111/videos")) return json({ id: "VIDEO1" });
    if (u.includes("/VIDEO1/video_insights")) return json({ data: [{ name: "total_video_views", values: [{ value: 321 }] }, { name: "total_video_impressions_unique", values: [{ value: 900 }] }] });
    if (u.includes("/VIDEO1?")) return json(opts.permalink === false ? { id: "VIDEO1" } : { id: "VIDEO1", permalink_url: "/reel/VIDEO1/", created_time: "2026-10-21T12:00:00+0000" });
    return json({ error: { message: "không biết" } }, 404);
  }) as typeof fetch;
  return { calls, f };
}

test("Meta: đăng video đúng 3 bước của Video API (phiên tải, gửi tệp dạng luồng có file_offset, đăng bằng handle)", async () => {
  const file = path.join(tmp, "v.mp4");
  fs.writeFileSync(file, Buffer.alloc(3 * 1024 * 1024, 7));
  const { calls, f } = fakeMeta();
  const r = await meta.publishPageVideo({ config: FAKE, fetch: f }, { postId: "p", title: "B1", description: "Mô tả", filePath: file, fileName: "b1.mp4", fileSize: 3 * 1024 * 1024 });
  assert.deepEqual(r, { ok: true, externalId: "VIDEO1", message: "Meta nhận video (mã VIDEO1), đang xác minh." });
  assert.equal(calls.length, 3);
  const start = new URL(calls[0].url);
  assert.equal(start.pathname, "/v26.0/222/uploads");
  assert.equal(start.searchParams.get("file_type"), "video/mp4");
  assert.equal(start.searchParams.get("file_length"), String(3 * 1024 * 1024));
  assert.equal(calls[1].headers.authorization, "OAuth user-token-gia");
  assert.equal(calls[1].headers.file_offset, "0");
  assert.equal(calls[1].bodyBytes, 3 * 1024 * 1024, "gửi đủ tệp");
  assert.equal(calls[2].form?.get("fbuploader_video_file_chunk"), "HANDLE1");
  assert.equal(calls[2].form?.get("access_token"), "page-token-gia", "bước đăng dùng Page token");
  assert.equal(calls[2].form?.get("description"), "Mô tả");
});

test("Meta: thiếu token thì không gọi mạng; lỗi tải lên trả thông báo, không có mã bài", async () => {
  const { calls, f } = fakeMeta({ failUpload: true });
  const miss = await meta.publishPageVideo({ config: { pageId: "1" }, fetch: f }, { postId: "p", title: "t", description: "", filePath: "/x", fileName: "x.mp4", fileSize: 1 });
  assert.equal(miss.ok, false);
  assert.equal(calls.length, 0);
  const file = path.join(tmp, "w.mp4");
  fs.writeFileSync(file, "abc");
  const r = await meta.publishPageVideo({ config: FAKE, fetch: f }, { postId: "p", title: "t", description: "", filePath: file, fileName: "w.mp4", fileSize: 3 });
  assert.equal(r.ok, false);
  assert.equal(r.externalId, undefined);
  assert.match(r.message, /Upload lỗi/);
});

test("Meta: xác minh chỉ đạt khi đọc lại được permalink; đọc số liệu theo bài", async () => {
  const ok = await meta.verifyPageVideo({ config: FAKE, fetch: fakeMeta().f }, "VIDEO1");
  assert.equal(ok.ok, true);
  assert.equal(ok.permalink, "https://www.facebook.com/reel/VIDEO1/");
  const no = await meta.verifyPageVideo({ config: FAKE, fetch: fakeMeta({ permalink: false }).f }, "VIDEO1");
  assert.equal(no.ok, false);
  assert.deepEqual(await meta.pageVideoMetrics({ config: FAKE, fetch: fakeMeta().f }, "VIDEO1"), { views: 321, reach: 900 });
});

function seedVideo(id: string, status: string) {
  const d = db.getDb();
  const now = new Date().toISOString();
  const fileName = `${id}.mp4`;
  fs.mkdirSync(path.join(tmp, "uploads"), { recursive: true });
  // tệp MP4 ngắn thật để tạo ảnh bìa
  const out = path.join(tmp, "uploads", fileName);
  spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=108x192:r=10:d=1", "-pix_fmt", "yuv420p", out]);
  d.insert(db.schema.uploads).values({ id: `up_${id}`, kind: "video", name: fileName, fileName, mime: "video/mp4", size: fs.statSync(out).size, meta: "{}", uploadedBy: "t", createdAt: now }).run();
  d.insert(db.schema.videos).values({ id, title: `Video ${id}`, contentId: null, agent: "t", status, platforms: "[]", version: 1, note: "", uploadId: `up_${id}`, updatedAt: now }).run();
}

test("lên lịch: chỉ video đã duyệt, kênh chưa hỗ trợ bị chặn, chế độ thử không bao giờ thành 'đã đăng'", async () => {
  seedVideo("v_draft", "review");
  seedVideo("v_ok", "approved");
  const past = new Date(Date.now() - 60_000).toISOString();
  assert.match((pub.scheduleVideoPosts({ videoId: "v_draft", platforms: ["facebook"], whenIso: past, caption: "c", by: "t" }) as { error: string }).error, /phê duyệt/);
  assert.match((pub.scheduleVideoPosts({ videoId: "v_ok", platforms: ["tiktok"], whenIso: past, caption: "c", by: "t" }) as { error: string }).error, /TikTok/);
  assert.equal(pub.isDryRun(), true, "mặc định chế độ thử");
  const r = pub.scheduleVideoPosts({ videoId: "v_ok", platforms: ["facebook"], whenIso: past, caption: "Bình luận câu hỏi của bạn", by: "t" });
  assert.deepEqual(r, { ok: true, created: 1, mode: "dry_run" });
  const res = await pub.publishDueVideoPosts();
  assert.equal(res.tested, 1);
  const post = pub.videoPostsFor("v_ok")[0];
  assert.equal(post.status, "dry_run");
  assert.equal(post.externalId, null);
  assert.ok(post.thumbnailUploadId, "có ảnh bìa");
});

test("đăng thật (fetch giả): giành quyền nguyên tử, chống trùng, chỉ 'đã đăng' sau khi đọc lại được bài", async () => {
  admin.setSetting("publishing.dryRun", "0");
  config.writeIntegrationConfig("facebook_page", FAKE);
  db.getDb().update(db.schema.integrations).set({ connected: true }).where(eq(db.schema.integrations.key, "facebook_page")).run();
  seedVideo("v_live", "approved");
  const past = new Date(Date.now() - 60_000).toISOString();
  const { calls, f } = fakeMeta();
  const real = globalThis.fetch;
  globalThis.fetch = f;
  try {
    assert.deepEqual(pub.scheduleVideoPosts({ videoId: "v_live", platforms: ["facebook"], whenIso: past, caption: "Bình luận bên dưới", by: "t" }), { ok: true, created: 1, mode: "live" });
    assert.match((pub.scheduleVideoPosts({ videoId: "v_live", platforms: ["facebook"], whenIso: past, caption: "x", by: "t" }) as { error: string }).error, /trùng/, "không đăng trùng");
    const [a, b] = await Promise.all([pub.publishDueVideoPosts(), pub.publishDueVideoPosts()]);
    assert.equal(a.published + b.published, 1, "hai lượt chạy song song chỉ đăng một lần");
    assert.equal(calls.filter((c) => c.url.endsWith("/111/videos")).length, 1);
    let post = pub.videoPostsFor("v_live")[0];
    assert.equal(post.status, "verifying", "chưa đọc lại thì chưa là đã đăng");
    assert.equal(post.externalId, "VIDEO1");
    await pub.verifyPublishingPosts();
    post = pub.videoPostsFor("v_live")[0];
    assert.equal(post.status, "published");
    assert.equal(post.permalink, "https://www.facebook.com/reel/VIDEO1/");
    assert.ok(post.verifiedAt);
    await pub.syncVideoPostMetrics();
    assert.equal(pub.videoPostsFor("v_live")[0].views, 321);
    assert.equal(pub.retryVideoPost(post.id).ok, false);
  } finally {
    globalThis.fetch = real;
    admin.setSetting("publishing.dryRun", "1");
  }
});
