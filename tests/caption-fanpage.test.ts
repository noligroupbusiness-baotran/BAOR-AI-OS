// Personal Brand System 6.1 + 6.2.1.2: caption theo skill viết content trong Second Brain (luật + AI tuỳ chọn), đăng nhiều fanpage.
// CSDL tạm, fetch / mô hình giả: không gọi Meta / Claude thật, không đăng thật.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { eq } from "drizzle-orm";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "baor-caption-"));
process.env.DATA_DIR = tmp;
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.AUTH_SECRET = "test-secret-".padEnd(40, "x");
process.env.BAOR_VIDEO_WORKER = "off";
delete process.env.ANTHROPIC_API_KEY;

let db: typeof import("../src/db");
let cap: typeof import("../src/lib/publishing/caption");
let pub: typeof import("../src/lib/publishing/video");
let config: typeof import("../src/lib/connectors/config");
let knowledge: typeof import("../src/lib/knowledge");
let ai: typeof import("../src/lib/ai");
let roster: typeof import("../src/lib/ai-roster");
let admin: typeof import("../src/lib/admin");

before(async () => {
  db = await import("../src/db");
  cap = await import("../src/lib/publishing/caption");
  pub = await import("../src/lib/publishing/video");
  config = await import("../src/lib/connectors/config");
  knowledge = await import("../src/lib/knowledge");
  ai = await import("../src/lib/ai");
  roster = await import("../src/lib/ai-roster");
  admin = await import("../src/lib/admin");
});

function seed(id: string) {
  const d = db.getDb();
  const now = new Date().toISOString();
  fs.mkdirSync(path.join(tmp, "uploads"), { recursive: true });
  const out = path.join(tmp, "uploads", `${id}.mp4`);
  spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=108x192:r=10:d=1", "-pix_fmt", "yuv420p", out]);
  d.insert(db.schema.uploads).values({ id: `up_${id}`, kind: "video", name: `${id}.mp4`, fileName: `${id}.mp4`, mime: "video/mp4", size: fs.statSync(out).size, meta: "{}", uploadedBy: "t", createdAt: now }).run();
  d.insert(db.schema.contentItems).values({ id: `c_${id}`, title: "Chào hỏi phá băng", format: "script", status: "approved", hook: "Ba giây đầu quyết định khách có nghe tiếp", outline: JSON.stringify(["Giới thiệu bạn là ai", "Nhắc nguồn thông tin khách để lại"]), draft: "Thông điệp chính: Khách nghe tiếp khi biết vì sao bạn gọi\n30% khách cúp máy ở câu đầu", createdAt: now } as typeof db.schema.contentItems.$inferInsert).run();
  d.insert(db.schema.videos).values({ id, title: `Video ${id}`, contentId: `c_${id}`, agent: "t", status: "approved", platforms: "[]", version: 1, note: "", uploadId: `up_${id}`, updatedAt: now }).run();
}

test("skill viết content: tìm trong 02 SKILL theo tên, bỏ skill edit video, ưu tiên ACTIVE > DRAFT; OWNER chỉ định được", () => {
  assert.equal(cap.captionSkill(), null);
  knowledge.upsertPages(
    [
      { id: "sk-edit", title: "[ Skill Edit video Vlog ]", url: "https://notion.so/a", section: "02 SKILL", status: "ACTIVE", kind: "Skill", body: "edit" },
      { id: "sk-content-draft", title: "SK-KNW-01 BAOR Content Sales", url: "https://notion.so/b", section: "02 SKILL", status: "DRAFT", kind: "Skill", body: "Hook → Real situation → Lesson → CTA" },
    ],
    "snapshot",
  );
  assert.equal(cap.captionSkill()?.id, "skcontentdraft");
  knowledge.upsertPages([{ id: "sk-caption-active", title: "Skill viết caption", url: "https://notion.so/c", section: "02 SKILL", status: "ACTIVE", kind: "Skill", body: "x" }], "snapshot");
  assert.equal(cap.captionSkill()?.id, "skcaptionactive");
  admin.setSetting("publishing.captionSkillId", "skcontentdraft");
  assert.equal(cap.captionSkill()?.id, "skcontentdraft");
});

test("caption theo skill chỉ dùng chữ trong kịch bản đã duyệt: hook → thông điệp → nhịp → CTA", () => {
  seed("v_cap");
  const c = cap.buildCaption("v_cap");
  assert.equal(c.source, "skill-template");
  assert.match(c.text, /^Ba giây đầu quyết định khách có nghe tiếp\n\nKhách nghe tiếp khi biết vì sao bạn gọi\n\n→ Giới thiệu bạn là ai\n→ Nhắc nguồn/);
  assert.match(c.text, /Bình luận/);
  assert.equal(pub.suggestCaption("v_cap"), c.text);
});

test("luật caption: % không có trong kịch bản → cảnh báo; có trong kịch bản → không; luật ngôn từ theo nền tảng", () => {
  const script = cap.scriptTextFor("v_cap");
  assert.deepEqual(cap.captionIssues("30% khách cúp máy ở câu đầu", ["facebook"], script), []);
  assert.match(cap.captionIssues("90% khách thích cách này", ["facebook"], script).join(), /không có trong kịch bản/);
  assert.match(cap.captionIssues("Cam kết 100% hiệu quả", ["facebook_page_2"], script).join(), /tuyệt đối/);
});

test("AI Viết bài đăng: tắt thì không gọi; mô hình (giả) viết → lưu nháp, đề xuất dùng nháp; quay về caption theo skill", async () => {
  roster.saveRoleSettings("caption", { enabled: false });
  const off = await ai.generateCaption("v_cap");
  assert.match(off.ok ? "" : off.error, /AI Viết bài đăng đang TẮT/);
  roster.saveRoleSettings("caption", { enabled: true });
  const { createRequire } = await import("node:module");
  const esm = (await import("@anthropic-ai/sdk")).default;
  const cjs = createRequire(import.meta.url)("@anthropic-ai/sdk").default;
  const protos = [...new Set([esm.Messages.prototype, cjs.Messages.prototype])] as unknown as { create: unknown }[];
  const reals = protos.map((p) => p.create);
  let sent = "";
  const fake = async (body: { messages: { content: string }[] }) => {
    sent = body.messages[0].content;
    return { id: "m", type: "message", role: "assistant", model: "m", stop_reason: "end_turn", stop_sequence: null, content: [{ type: "text", text: "Caption AI viết theo skill", citations: null }], usage: { input_tokens: 500, output_tokens: 100 } };
  };
  for (const p of protos) p.create = fake;
  process.env.ANTHROPIC_API_KEY = "sk-test-khong-goi-that";
  try {
    const r = await ai.generateCaption("v_cap");
    assert.equal(r.ok, true, r.ok ? "" : r.error);
    assert.match(sent, /SKILL \(SK-KNW-01 BAOR Content Sales · DRAFT\)/, "skill được đưa cho mô hình");
    assert.match(sent, /Thông điệp chính/, "kịch bản đã duyệt được đưa cho mô hình");
    assert.equal(pub.suggestCaption("v_cap"), "Caption AI viết theo skill");
    assert.equal(roster.recentAiCalls(1)[0].role, "caption");
    cap.clearCaptionDraft("v_cap");
    assert.equal(pub.suggestCaption("v_cap"), cap.buildCaption("v_cap").text);
  } finally {
    protos.forEach((p, i) => (p.create = reals[i]));
    delete process.env.ANTHROPIC_API_KEY;
  }
});

test("nhiều fanpage: Fanpage 2–4 có dòng kết nối, là kênh đăng riêng; chế độ thử lên lịch 2 trang = 2 bài, không đăng thật", async () => {
  config.ensureFanpageRows();
  assert.ok(config.listIntegrationStatus().some((i) => i.key === "facebook_page_3"));
  const keys = pub.videoChannels().map((c) => c.platform);
  assert.deepEqual(keys.slice(0, 4), ["facebook", "facebook_page_2", "facebook_page_3", "facebook_page_4"]);
  seed("v_multi");
  const past = new Date(Date.now() - 60_000).toISOString();
  const r = pub.scheduleVideoPosts({ videoId: "v_multi", platforms: ["facebook", "facebook_page_2"], whenIso: past, caption: "c", by: "t" });
  assert.deepEqual(r, { ok: true, created: 2, mode: "dry_run" });
  await pub.publishDueVideoPosts();
  const posts = db.getDb().select().from(db.schema.scheduledPosts).where(eq(db.schema.scheduledPosts.videoId, "v_multi")).all();
  assert.deepEqual(posts.map((p) => p.status).sort(), ["dry_run", "dry_run"]);
});

test("đăng thật (fetch giả) lên Fanpage 2 dùng Page ID / token CỦA Fanpage 2, không phải trang chính", async () => {
  seed("v_fp2");
  config.writeIntegrationConfig("facebook_page", { pageId: "111", pageToken: "tok-1", appId: "222", userToken: "u-1" });
  config.writeIntegrationConfig("facebook_page_2", { pageId: "333", pageToken: "tok-3", appId: "222", userToken: "u-3" });
  config.setIntegrationStatus("facebook_page_2", { connected: true, account: "Trang Thử 2" });
  admin.setSetting("publishing.dryRun", "0");
  const hits: string[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const u = String(url);
    hits.push(u);
    if (init?.body && !(init.body instanceof URLSearchParams) && typeof (init.body as ReadableStream).getReader === "function") {
      const rd = (init.body as ReadableStream<Uint8Array>).getReader();
      while (!(await rd.read()).done);
    }
    const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "Content-Type": "application/json" } });
    if (u.includes("/222/uploads")) return json({ id: "upload:S" });
    if (u.endsWith("/upload:S")) return json({ h: "H" });
    if (u.endsWith("/333/videos")) return json({ id: "V3" });
    return new Response(JSON.stringify({ error: { message: "x" } }), { status: 404 });
  }) as typeof fetch;
  try {
    assert.equal(pub.videoChannels().find((c) => c.platform === "facebook_page_2")?.label, "Fanpage: Trang Thử 2");
    const r = pub.scheduleVideoPosts({ videoId: "v_fp2", platforms: ["facebook_page_2"], whenIso: new Date(Date.now() - 60_000).toISOString(), caption: "c", by: "t" });
    assert.deepEqual(r, { ok: true, created: 1, mode: "live" });
    await pub.publishDueVideoPosts();
    assert.ok(hits.some((h) => h.endsWith("/333/videos")), `phải đăng vào trang 333: ${hits.join(" ")}`);
    assert.ok(!hits.some((h) => h.includes("/111/")), "không đụng trang chính");
  } finally {
    globalThis.fetch = real;
    admin.setSetting("publishing.dryRun", "1");
  }
});

test("quảng cáo từ bài trên Fanpage 2 chạy dưới ĐÚNG Fanpage 2 (page_id 333), không phải trang chính (phản biện P1)", async () => {
  const engine = await import("../src/lib/ads/engine");
  const post = db.getDb().select().from(db.schema.scheduledPosts).where(eq(db.schema.scheduledPosts.videoId, "v_fp2")).get()!;
  const thumb = path.join(tmp, "uploads", "thumb-fp2.jpg");
  fs.writeFileSync(thumb, "jpg");
  db.getDb().insert(db.schema.uploads).values({ id: "up_thumb_fp2", kind: "image", name: "b.jpg", fileName: "thumb-fp2.jpg", createdAt: new Date().toISOString() }).run();
  db.getDb().update(db.schema.scheduledPosts).set({ status: "published", externalId: "V3", verifiedAt: new Date().toISOString(), thumbnailUploadId: "up_thumb_fp2" }).where(eq(db.schema.scheduledPosts.id, post.id)).run();
  db.getDb().insert(db.schema.adCampaigns).values({ id: "ad_fp2", name: "QC thử", objective: "video_views", status: "proposed", dailyBudget: 50_000, postId: post.id } as typeof db.schema.adCampaigns.$inferInsert).run();
  config.writeIntegrationConfig("meta_ads", { adAccountId: "act_9", accessToken: "tok-ads" });
  config.setIntegrationStatus("meta_ads", { connected: true });
  let spec = "";
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const body = init?.body instanceof URLSearchParams ? init.body : null;
    if (body?.get("object_story_spec")) spec = body.get("object_story_spec")!;
    const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "Content-Type": "application/json" } });
    return String(url).includes("adimages") ? json({ images: { x: { hash: "H" } } }) : json({ id: `id_${Math.random().toString(36).slice(2, 6)}` });
  }) as typeof fetch;
  try {
    const r = await engine.pushDraftToMeta("ad_fp2");
    assert.equal(r.ok, true, r.ok ? "" : r.error);
    assert.equal(JSON.parse(spec).page_id, "333");
  } finally {
    globalThis.fetch = real;
  }
});

test("chặn lên lịch khi hai kênh Facebook cùng một Page ID (nhập nhầm) — tránh đăng trùng một trang", () => {
  seed("v_dup");
  config.writeIntegrationConfig("facebook_page_3", { pageId: "111", pageToken: "x", appId: "222", userToken: "y" });
  const r = pub.scheduleVideoPosts({ videoId: "v_dup", platforms: ["facebook", "facebook_page_3"], whenIso: new Date().toISOString(), caption: "c", by: "t" });
  assert.equal(r.ok, false);
  assert.match(r.ok ? "" : r.error, /cùng là trang 111/);
});

test("luật %: chuẩn hoá “30 %” / “30,5%”, và 130% trong kịch bản không che 30% (phản biện P3)", () => {
  assert.deepEqual(cap.captionIssues("30% khách", ["facebook"], "30 % khách"), []);
  assert.deepEqual(cap.captionIssues("30,5% khách", ["facebook"], "30.5% khách"), []);
  assert.match(cap.captionIssues("30% khách", ["facebook"], "tăng 130% doanh số").join(), /30%/);
});
