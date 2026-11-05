// Bước 2 · Đăng (OWNER 05/11/2026): ô theo nền tảng, đăng ngay / hẹn giờ một kênh, đổi giờ bài chờ, "Tự động" (bài → giờ vàng trống,
// mỗi khung một video), công tắc tự động cho video mới móc vào luồng viết bài. CSDL tạm, chế độ thử (không gọi nền tảng), AI không khoá
// → bài theo luật.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { eq } from "drizzle-orm";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "baor-autopost-"));
process.env.DATA_DIR = tmp;
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.AUTH_SECRET = "test-secret-".padEnd(40, "x");
process.env.BAOR_VIDEO_WORKER = "off";
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENAI_API_KEY;
delete process.env.XAI_API_KEY;

let db: typeof import("../src/db");
let ap: typeof import("../src/lib/publishing/auto-post");
let pub: typeof import("../src/lib/publishing/video");
let cap: typeof import("../src/lib/publishing/caption");
let draft: typeof import("../src/lib/publishing/post-draft");
let admin: typeof import("../src/lib/admin");

function seedVideo(id: string, status = "approved") {
  const d = db.getDb();
  const now = new Date().toISOString();
  const fileName = `${id}.mp4`;
  fs.mkdirSync(path.join(tmp, "uploads"), { recursive: true });
  const out = path.join(tmp, "uploads", fileName);
  spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=108x192:r=10:d=1", "-pix_fmt", "yuv420p", out]);
  d.insert(db.schema.uploads).values({ id: `up_${id}`, kind: "video", name: fileName, fileName, mime: "video/mp4", size: fs.statSync(out).size, meta: JSON.stringify({ transcript: `Lời nói của ${id}: mình bắt đầu bán online từ một kênh.`, source: "approved-folder" }), uploadedBy: "t", createdAt: now }).run();
  d.insert(db.schema.videos).values({ id, title: `Video ${id}`, contentId: null, agent: "t", status, platforms: "[]", version: 1, note: "", uploadId: `up_${id}`, updatedAt: now }).run();
}
const posts = (id: string) => db.getDb().select().from(db.schema.scheduledPosts).where(eq(db.schema.scheduledPosts.videoId, id)).all();

before(async () => {
  db = await import("../src/db");
  ap = await import("../src/lib/publishing/auto-post");
  pub = await import("../src/lib/publishing/video");
  cap = await import("../src/lib/publishing/caption");
  draft = await import("../src/lib/publishing/post-draft");
  admin = await import("../src/lib/admin");
  admin.setSetting("publishing.dryRun", "1");
});

test("ô nền tảng: Facebook dùng được ở chế độ thử, kênh chưa có adapter bị chặn; chưa có bài → trạng thái none", () => {
  seedVideo("v_slot");
  const slots = ap.platformSlots("v_slot");
  const fb = slots.find((s) => s.platform === "facebook")!;
  assert.equal(fb.usable, true);
  assert.equal(fb.state, "none");
  for (const p of ["instagram", "tiktok", "youtube"]) {
    const s = slots.find((x) => x.platform === p)!;
    assert.equal(s.usable, false, p);
    assert.equal(s.blocked, true, p);
  }
  assert.deepEqual(ap.openPlatforms("v_slot").filter((p) => !p.startsWith("facebook_page")), ["facebook"]);
});

test("Đăng ngay một kênh: chưa có bài → viết (theo luật khi AI không khoá) từ lời đã nói rồi xếp giờ hiện tại; ô chuyển 'scheduled'", async () => {
  seedVideo("v_now");
  assert.equal(cap.captionDraft("v_now"), null);
  const before = Date.now();
  const r = await ap.postVideoTo({ videoId: "v_now", platform: "facebook", by: "t" });
  assert.equal(r.ok, true);
  assert.ok(Date.parse(r.whenIso) >= before - 1000 && Date.parse(r.whenIso) <= Date.now() + 1000, "giờ = bây giờ");
  const d = cap.captionDraft("v_now");
  assert.ok(d && d.length > 0, "đã có bài");
  assert.match(cap.postDraftSource("v_now") ?? "", /^rule:/, "AI không khoá → bài theo luật, ghi nguồn");
  const [p] = posts("v_now");
  assert.equal(p.platform, "facebook");
  assert.equal(p.status, "scheduled");
  assert.equal(p.mode, "dry_run");
  assert.equal(ap.platformSlots("v_now").find((s) => s.platform === "facebook")!.state, "scheduled");
  // kênh đã có bài chờ → không còn "mở"
  assert.ok(!ap.openPlatforms("v_now").includes("facebook"));
});

test("Hẹn giờ một kênh đúng giờ chọn (giờ VN) rồi đổi giờ bài chờ; bài đã gửi không đổi được", async () => {
  seedVideo("v_at");
  const iso = ap.vnLocalToIso("2030-01-02T20:30")!;
  assert.equal(iso, "2030-01-02T13:30:00.000Z");
  assert.equal(ap.vnLocalToIso("xx"), null);
  const r = await ap.postVideoTo({ videoId: "v_at", platform: "facebook", whenIso: iso, by: "t" });
  assert.equal(r.ok, true);
  const [p] = posts("v_at");
  assert.equal(p.scheduledFor, iso);
  const iso2 = ap.vnLocalToIso("2030-01-03T07:30")!;
  assert.deepEqual(ap.rescheduleVideoPost(p.id, iso2, { email: "t@x" }), { ok: true });
  assert.equal(posts("v_at")[0].scheduledFor, iso2);
  db.getDb().update(db.schema.scheduledPosts).set({ status: "publishing" }).where(eq(db.schema.scheduledPosts.id, p.id)).run();
  assert.equal(ap.rescheduleVideoPost(p.id, iso, { email: "t@x" }).ok, false);
});

test("Tự động: xếp mọi kênh mở vào khung giờ vàng trống gần nhất; video kế tiếp lấy khung sau (mỗi khung một video); hết kênh → báo rõ", async () => {
  const now = new Date("2030-05-05T03:00:00.000Z"); // 10:00 giờ VN → khung 12:00 là gần nhất
  seedVideo("v_a1");
  seedVideo("v_a2");
  const r1 = await ap.autoPostVideo({ videoId: "v_a1", by: "t", now });
  assert.equal(r1.ok, true);
  if (!r1.ok) return;
  assert.equal(r1.whenIso, ap.vnLocalToIso("2030-05-05T12:00"));
  assert.ok(r1.platforms.includes("facebook"));
  assert.equal(r1.mode, "dry_run");
  assert.equal(r1.source, "rule");
  const r2 = await ap.autoPostVideo({ videoId: "v_a2", by: "t", now });
  assert.equal(r2.ok, true);
  if (!r2.ok) return;
  assert.equal(r2.whenIso, ap.vnLocalToIso("2030-05-05T20:30"), "khung 12:00 đã có bài → lấy khung kế");
  const r3 = await ap.autoPostVideo({ videoId: "v_a1", by: "t", now });
  assert.equal(r3.ok, false);
  if (!r3.ok) assert.match(r3.error, /Không còn nền tảng/);
});

test("Tự động: video chưa duyệt bị chặn bởi luật lên lịch; bản nháp OWNER đã sửa được giữ nguyên khi tự động", async () => {
  seedVideo("v_rev", "review");
  const r = await ap.autoPostVideo({ videoId: "v_rev", by: "t" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /phê duyệt/);
  seedVideo("v_keep");
  cap.saveCaptionDraft("v_keep", "OWNER tự viết bài này");
  const k = await ap.autoPostVideo({ videoId: "v_keep", by: "t" });
  assert.equal(k.ok, true);
  if (k.ok) assert.equal(k.source, "kept");
  assert.equal(posts("v_keep")[0].caption, "OWNER tự viết bài này");
});

test("công tắc tự động cho video mới: tắt → luồng viết bài không xếp lịch; bật → video vào Kho có bài VÀ có lịch", async () => {
  assert.equal(ap.autoNewEnabled(), false);
  seedVideo("v_off");
  await draft.draftPostForApprovedVideo("v_off");
  assert.ok(cap.captionDraft("v_off"));
  assert.equal(posts("v_off").length, 0, "tắt: chỉ viết bài");
  ap.setAutoNew(true, { email: "t@x", name: "T" });
  try {
    seedVideo("v_on");
    const r = await draft.draftPostForApprovedVideo("v_on");
    assert.equal(r.source, "rule");
    assert.ok(cap.captionDraft("v_on"));
    const ps = posts("v_on");
    assert.ok(ps.length >= 1, "bật: đã xếp lịch");
    assert.equal(ps[0].status, "scheduled");
    assert.ok(Date.parse(ps[0].scheduledFor) > Date.now(), "giờ vàng sắp tới, không phải quá khứ");
    // chế độ thử: không bao giờ thành đã đăng
    assert.equal(ps[0].mode, "dry_run");
    assert.equal(pub.isDryRun(), true);
  } finally {
    ap.setAutoNew(false, { email: "t@x" });
  }
});
