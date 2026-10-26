// Máy dựng của OWNER (25/10/2026): máy chủ giữ hàng đợi, máy dựng gọi ra bằng khoá → nhận việc, tải nguồn, nhịp tim, gửi kết quả,
// hoàn tất; dừng / mất kết nối; skill trên Notion đổi thì báo. CSDL + DATA_DIR tạm, gọi thẳng route handler (không mạng thật).
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { createHash } from "node:crypto";

const sha = (b: string) => createHash("sha256").update(b).digest("hex");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "baor-worker-"));
process.env.DATA_DIR = tmp;
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.AUTH_SECRET = "test-secret-".padEnd(40, "x");
process.env.BAOR_VIDEO_WORKER = "off";

let db: typeof import("../src/db");
let jobs: typeof import("../src/lib/video/jobs");
let auth: typeof import("../src/lib/video/worker-auth");
let route: typeof import("../src/app/api/render-worker/[action]/route");
let admin: typeof import("../src/lib/admin");
let uploads: typeof import("../src/lib/uploads");
let worker: typeof import("../scripts/video/render-worker.mjs");
let skills: typeof import("../src/lib/video/skill-freshness");
let knowledge: typeof import("../src/lib/knowledge");
let KEY = "";

before(async () => {
  db = await import("../src/db");
  jobs = await import("../src/lib/video/jobs");
  auth = await import("../src/lib/video/worker-auth");
  route = await import("../src/app/api/render-worker/[action]/route");
  admin = await import("../src/lib/admin");
  uploads = await import("../src/lib/uploads");
  worker = await import("../scripts/video/render-worker.mjs");
  skills = await import("../src/lib/video/skill-freshness");
  knowledge = await import("../src/lib/knowledge");
});

const U = "http://may-chu.test/api/render-worker";
const P = (action: string) => ({ params: Promise.resolve({ action }) });
const H = (key = KEY) => ({ authorization: `Bearer ${key}`, "x-baor-worker": "may-bao" });

function source(name: string): string {
  const id = `up_${name}`;
  fs.writeFileSync(path.join(uploads.uploadsDir(), `${id}.mp4`), `VIDEO-${name}`);
  db.getDb().insert(db.schema.uploads).values({ id, kind: "video", name: `${name}.mp4`, fileName: `${id}.mp4`, size: 7 + name.length, createdAt: new Date().toISOString() }).run();
  return jobs.createVideoFromSource({ title: `Video ${name}`, sourceUploadId: id, cutSilence: true, aspect: "16:9", by: "OWNER" });
}

test("khoá: thiếu / sai khoá → 401; khoá chỉ lưu mã băm", async () => {
  assert.equal((await route.POST(new Request(`${U}/claim`, { method: "POST" }), P("claim"))).status, 401);
  KEY = auth.generateWorkerKey();
  assert.match(KEY, /^bw_/);
  assert.equal(admin.getSetting("video.workerKeyHash")!.includes(KEY), false);
  assert.equal((await route.POST(new Request(`${U}/claim`, { method: "POST", headers: H("bw_saikhoasaikhoasaikhoa") }), P("claim"))).status, 401);
});

test("máy chủ dựng tại chỗ (mặc định) → máy dựng không nhận việc (204)", async () => {
  source("a");
  assert.equal((await route.POST(new Request(`${U}/claim`, { method: "POST", headers: H() }), P("claim"))).status, 204);
});

test("chế độ máy dựng: nhận việc → tải nguồn → nhịp tim → gửi tệp → hoàn tất → video Chờ kiểm tra", async () => {
  admin.setSetting("video.renderMode", "remote");
  const r = await route.POST(new Request(`${U}/claim`, { method: "POST", headers: H() }), P("claim"));
  assert.equal(r.status, 200);
  const spec = (await r.json()) as { videoId: string; version: number; aspect: string; cutSilence: boolean; allowAi: boolean };
  assert.equal(spec.aspect, "16:9");
  assert.equal(spec.cutSilence, true);
  const q = `videoId=${spec.videoId}&version=${spec.version}`;
  assert.equal((await route.POST(new Request(`${U}/claim`, { method: "POST", headers: H() }), P("claim"))).status, 204, "không giao trùng");
  const src = await route.GET(new Request(`${U}/source?${q}`, { headers: H() }), P("source"));
  assert.equal(await src.text(), "VIDEO-a");
  assert.equal((await route.POST(new Request(`${U}/heartbeat?${q}`, { method: "POST", headers: H(), body: JSON.stringify({ progress: { step: "x", label: "Đang dựng", pct: 40 } }) }), P("heartbeat"))).status, 200);
  assert.equal((await route.PUT(new Request(`${U}/file?${q}&name=..%2Fjob.json`, { method: "PUT", headers: H(), body: "x" }), P("file"))).status, 400, "tên tệp có đường dẫn bị chặn");
  assert.equal((await route.PUT(new Request(`${U}/file?${q}&name=job.json`, { method: "PUT", headers: H(), body: "x" }), P("file"))).status, 400, "không ghi đè job.json");
  const report = { skill: { skillId: "s", name: "Skill", version: "1", sourceUrl: "" }, output: { seconds: 12, frames: 360, cutSilence: true, cuts: 1 }, transcript: { words: 10, uncertain: [] }, captions: { units: 4 }, emphasis: [], audio: { lufs: -16, truePeak: -3, previewTruePeak: -3, music: null }, qa: [], failed: [], blockers: [] };
  const put = (name: string, body: string, extra: Record<string, string> = {}) => route.PUT(new Request(`${U}/file?${q}&name=${name}`, { method: "PUT", headers: { ...H(), "x-content-sha256": sha(body), ...extra }, body }), P("file"));
  assert.equal((await route.PUT(new Request(`${U}/file?${q}&name=master.mp4`, { method: "PUT", headers: H(), body: "MASTER" }), P("file"))).status, 400, "thiếu mã băm → từ chối");
  assert.equal((await put("master.mp4", "MASTER", { "x-content-sha256": sha("KHAC") })).status, 400, "mã băm sai → từ chối");
  assert.equal((await put("master.mp4", "MASTER", { "content-length": "999999" })).status, 400, "thiếu byte (bị cắt) → từ chối");
  assert.equal((await put("report.json", JSON.stringify(report))).status, 200);
  assert.equal((await put("snapshots/001.jpg", "JPG")).status, 200, "ảnh mốc gửi được như dựng tại chỗ");
  assert.equal((await put("master.mp4", "MASTER")).status, 200);
  assert.equal((await route.POST(new Request(`${U}/complete?${q}`, { method: "POST", headers: H() }), P("complete"))).status, 200);
  const v = db.getDb().select().from(db.schema.videos).where(eq(db.schema.videos.id, spec.videoId)).get()!;
  assert.equal(v.status, "review");
  const up = uploads.getUpload(v.uploadId!)!;
  assert.equal(fs.readFileSync(uploads.uploadPath(up)!, "utf8"), "MASTER");
  assert.equal(jobs.readJob(spec.videoId, spec.version)!.status, "done");
  assert.equal(auth.workerLastSeen()!.name, "may-bao");
});

test("OWNER bấm Dừng → nhịp tim 409 (máy dựng huỷ), gửi tệp 409", async () => {
  source("b");
  const spec = (await (await route.POST(new Request(`${U}/claim`, { method: "POST", headers: H() }), P("claim"))).json()) as { videoId: string; version: number };
  const q = `videoId=${spec.videoId}&version=${spec.version}`;
  assert.equal(jobs.stopVideoJob(spec.videoId, "OWNER").ok, true);
  assert.equal((await route.POST(new Request(`${U}/heartbeat?${q}`, { method: "POST", headers: H(), body: "{}" }), P("heartbeat"))).status, 409);
  assert.equal((await route.PUT(new Request(`${U}/file?${q}&name=master.mp4`, { method: "PUT", headers: H(), body: "x" }), P("file"))).status, 409);
});

test("máy dựng mất kết nối quá 15 phút → job xếp lại (thử lại 1 lần), máy khác nhận được", async () => {
  source("c");
  const s1 = (await (await route.POST(new Request(`${U}/claim`, { method: "POST", headers: H() }), P("claim"))).json()) as { videoId: string; version: number };
  const jp = path.join(jobs.jobDir(s1.videoId, s1.version), "job.json");
  const j = JSON.parse(fs.readFileSync(jp, "utf8"));
  fs.writeFileSync(jp, JSON.stringify({ ...j, heartbeatAt: new Date(Date.now() - 20 * 60_000).toISOString() }));
  const r = await route.POST(new Request(`${U}/claim`, { method: "POST", headers: { ...H(), "x-baor-worker": "may-khac" } }), P("claim"));
  assert.equal(r.status, 200);
  const s2 = (await r.json()) as { videoId: string };
  assert.equal(s2.videoId, s1.videoId);
  assert.equal(jobs.readJob(s1.videoId, s1.version)!.worker, "may-khac");
});

test("tham số dựng của máy dựng giống dựng tại máy chủ; chỉ gửi tệp kết quả", () => {
  const spec = { videoId: "v", version: 1, title: "t", sourceName: "a.mov", aspect: "9:16", cutSilence: true, framing: { x: 0.4 }, aiPlan: true, sfx: false, noMusic: true, music: null, keywords: "k", model: "medium", corrections: "a => b", script: "s", plan: {}, words: [], allowAi: true };
  const a = worker.buildArgs(spec, { src: "/s.mov", work: "/w", script: "/w/input-script.txt", plan: "/w/input-plan.json", words: "/w/input-words.json" });
  for (const x of ["--input=/s.mov", "--job-dir=/w", "--cut-silence", "--aspect=9:16", "--frame-x=0.4", "--no-sfx", "--ai-plan", "--no-music", "--corrections=a => b", "--script=/w/input-script.txt", "--plan=/w/input-plan.json", "--words=/w/input-words.json"]) assert.ok(a.includes(x), x);
  assert.match(a[0], /esv_render\.py$/);
  // Chất lượng chọn khi thêm video gốc: 4K → --quality=4k ngay sau --aspect (như runJob tại máy chủ); 1080 → không thêm
  assert.ok(!a.some((x) => x.startsWith("--quality")), "mặc định 1080 không thêm tham số");
  const q4 = worker.buildArgs({ ...spec, quality: "4k" }, { src: "/s.mov", work: "/w" });
  assert.equal(q4[q4.indexOf("--aspect=9:16") + 1], "--quality=4k");
  const w = fs.mkdtempSync(path.join(os.tmpdir(), "baor-w-"));
  for (const f of ["master.mp4", "preview.mp4", "report.json", "plan.json", "source.mov", "input-plan.json", "progress.json", "job.json", "x.tmp", "checksums.sha256"]) fs.writeFileSync(path.join(w, f), "x");
  fs.mkdirSync(path.join(w, "work"));
  fs.mkdirSync(path.join(w, "snapshots"));
  fs.writeFileSync(path.join(w, "snapshots", "001.jpg"), "x");
  assert.deepEqual(worker.resultFiles(w), ["checksums.sha256", "plan.json", "preview.mp4", "report.json", "snapshots/001.jpg", "master.mp4"]);
  const withMusic = worker.buildArgs({ ...spec, noMusic: false, music: { name: "a.mp3", license: "Pixabay" } }, { src: "/s", work: "/w", music: "/w/input-music.mp3" });
  assert.ok(withMusic.includes("--music=/w/input-music.mp3") && withMusic.includes("--music-license=Pixabay"), "bài nhạc OWNER chọn được dùng như dựng tại máy chủ");
});

test("skill trên Notion: lần đầu CHƯA XÁC NHẬN (không tự lấy làm mốc); xác nhận → khớp; đổi → báo cần cập nhật", () => {
  assert.ok(skills.skillStatus().every((s) => s.state === "missing"));
  knowledge.upsertPages(skills.SKILL_PAGES.map((p) => ({ id: p.pageId, title: p.title, url: "https://notion.so/x", section: "02 SKILL", status: "ACTIVE", kind: "Skill", body: "bản 1" })), "notion_sync");
  assert.ok(skills.skillStatus().every((s) => s.state === "unconfirmed"));
  skills.acceptSkillVersions();
  assert.ok(skills.skillStatus().every((s) => s.state === "ok"));
  assert.equal(skills.skillChangeNote(), "");
  knowledge.upsertPages([{ id: skills.SKILL_PAGES[0].pageId, title: "Skill ESV", url: "https://notion.so/x", section: "02 SKILL", status: "ACTIVE", kind: "Skill", body: "bản 2 — phụ đề y1600" }], "notion_sync");
  assert.equal(skills.skillStatus().find((s) => s.key === "esv")!.state, "changed");
  assert.match(skills.skillChangeNote(), /Skill ESV.*cần cập nhật/);
  skills.acceptSkillVersions();
  assert.ok(skills.skillStatus().every((s) => s.state === "ok"));
});

test("chuyển về máy chủ khi máy dựng đang giữ job → máy chủ KHÔNG dựng chồng lên job đó (phản biện P2-1)", async () => {
  admin.setSetting("video.renderMode", "remote");
  source("d");
  const spec = (await (await route.POST(new Request(`${U}/claim`, { method: "POST", headers: H() }), P("claim"))).json()) as { videoId: string; version: number };
  admin.setSetting("video.renderMode", "local");
  const prev = { w: process.env.BAOR_VIDEO_WORKER, py: process.env.PYTHON_BIN };
  delete process.env.BAOR_VIDEO_WORKER;
  process.env.PYTHON_BIN = "false";
  try {
    await jobs.kickWorker();
  } finally {
    process.env.BAOR_VIDEO_WORKER = prev.w;
    if (prev.py === undefined) delete process.env.PYTHON_BIN;
    else process.env.PYTHON_BIN = prev.py;
  }
  const j = jobs.readJob(spec.videoId, spec.version)!;
  assert.equal(j.status, "running");
  assert.equal(j.worker, "may-bao");
  assert.equal(j.pid, undefined, "máy chủ không sinh tiến trình dựng cho job của máy dựng");
  const q = `videoId=${spec.videoId}&version=${spec.version}`;
  assert.equal((await route.POST(new Request(`${U}/heartbeat?${q}`, { method: "POST", headers: H(), body: "{}" }), P("heartbeat"))).status, 200);
});

test("cấu hình máy dựng: lệnh dán ở trang tạo khoá ghi đúng tệp; máy dựng đọc được, biến môi trường thắng tệp", async () => {
  const { setupCommand } = await import("../src/components/settings/worker-key-form");
  const { execFileSync } = await import("node:child_process");
  const home = fs.mkdtempSync(path.join(tmp, "home-"));
  const key = "bw_" + "Ab-_9".repeat(9);
  execFileSync("bash", ["-c", setupCommand("https://mkt.baor.vn", key)], { env: { ...process.env, HOME: home } });
  const f = path.join(home, ".baor", "render-worker.env");
  assert.equal(fs.readFileSync(f, "utf8"), `BAOR_REMOTE_URL=https://mkt.baor.vn\nBAOR_WORKER_KEY=${key}\n`);
  assert.equal(fs.statSync(f).mode & 0o777, 0o600, "chỉ chủ máy đọc được");
  const repoEnv = path.join(home, "repo.env");
  fs.writeFileSync(repoEnv, "BAOR_REMOTE_URL=http://khac\nBAOR_WORKER_NAME=may bao!\n");
  const c = worker.readConfig([f, repoEnv], {});
  assert.equal(c.base, "https://mkt.baor.vn", "tệp ~/.baor đứng trước");
  assert.equal(c.key, key);
  assert.equal(c.name, "maybao");
  assert.equal(worker.readConfig([f], { BAOR_WORKER_KEY: "bw_tu_moi_truong_xxxxxxxxxxxx" }).key, "bw_tu_moi_truong_xxxxxxxxxxxx");
  assert.equal(worker.readConfig([path.join(home, "khong-co")], {}).key, "", "chưa có cấu hình → rỗng (máy dựng chờ, không thoát)");
  // Ký tự ' trong giá trị không phá lệnh
  execFileSync("bash", ["-c", setupCommand("https://x.vn/a'b", key)], { env: { ...process.env, HOME: home } });
  assert.match(fs.readFileSync(f, "utf8"), /^BAOR_REMOTE_URL=https:\/\/x\.vn\/a'b\n/);
});

// Kiểm toán độc lập 26/10/2026 (mục 8): nhịp tim chỉ bật SAU khi tải xong video gốc → tệp lớn / mạng chậm quá 15 phút thì máy chủ
// coi máy dựng mất kết nối và giao lại việc. Nhịp tim phải bật NGAY khi nhận việc, chạy suốt lúc tải nguồn.
function slowSource(chunks: number, everyMs: number, marks: { sourceDoneAt: number }) {
  let i = 0;
  return new ReadableStream<Uint8Array>({
    async pull(c) {
      await new Promise((r) => setTimeout(r, everyMs));
      if (i++ >= chunks) {
        marks.sourceDoneAt = Date.now();
        c.close();
        return;
      }
      c.enqueue(new TextEncoder().encode("VIDEO"));
    },
  });
}

const workerSpec = { videoId: "v_hb", version: 1, title: "Nhịp tim", sourceName: "a.mp4", aspect: "9:16", cutSilence: false, framing: null, aiPlan: false, sfx: false, noMusic: true, music: null, keywords: "", model: "small", corrections: "", script: null, plan: null, words: null, allowAi: false };

test("mục 8: máy dựng gửi nhịp tim NGAY khi nhận việc và trong lúc tải video gốc (không đợi tải xong)", async () => {
  const marks = { sourceDoneAt: 0 };
  const beats: number[] = [];
  const calls: string[] = [];
  const fake = (async (url: string | URL) => {
    const u = String(url);
    calls.push(u.replace(/\?.*$/, ""));
    if (u.includes("/heartbeat")) {
      beats.push(Date.now());
      return new Response("{}", { status: 200 });
    }
    if (u.includes("/source")) return new Response(slowSource(4, 80, marks), { status: 200 });
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  const bin = path.join(tmp, "fail-render.sh");
  fs.writeFileSync(bin, "#!/bin/sh\necho 'LỖI: bộ dựng giả' >&2\nexit 1\n");
  fs.chmodSync(bin, 0o755);
  const prev = process.env.PYTHON_BIN;
  process.env.PYTHON_BIN = bin;
  try {
    const r = await worker.runOne(workerSpec, { base: "http://may-chu.test", headers: {}, dataDir: tmp, fetchImpl: fake, beatMs: 50 });
    assert.equal(r, "failed");
  } finally {
    if (prev === undefined) delete process.env.PYTHON_BIN;
    else process.env.PYTHON_BIN = prev;
  }
  assert.ok(marks.sourceDoneAt > 0);
  const during = beats.filter((t) => t < marks.sourceDoneAt).length;
  assert.ok(during >= 3, `nhịp tim trong lúc tải nguồn: ${during}`);
  assert.equal(calls[0], "http://may-chu.test/api/render-worker/heartbeat", "nhịp tim đầu tiên đi TRƯỚC lệnh tải nguồn");
  assert.ok(calls.includes("http://may-chu.test/api/render-worker/fail"), "bộ dựng lỗi → báo máy chủ");
});

test("mục 8: máy chủ báo dừng (409) khi đang tải video gốc → máy dựng ngắt tải, không báo lỗi", async () => {
  const calls: string[] = [];
  const fake = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    calls.push(u.replace(/\?.*$/, ""));
    if (u.includes("/heartbeat")) return new Response("{}", { status: calls.filter((c) => c.endsWith("/heartbeat")).length >= 2 ? 409 : 200 });
    if (u.includes("/source")) {
      const body = slowSource(50, 40, { sourceDoneAt: 0 });
      init?.signal?.addEventListener("abort", () => body.cancel().catch(() => {}));
      return new Response(body, { status: 200 });
    }
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  const t0 = Date.now();
  const r = await worker.runOne({ ...workerSpec, videoId: "v_hb2" }, { base: "http://may-chu.test", headers: {}, dataDir: tmp, fetchImpl: fake, beatMs: 50 });
  assert.equal(r, "stopped");
  assert.ok(Date.now() - t0 < 1500, "không tải hết 50 khúc");
  assert.ok(!calls.some((c) => c.endsWith("/fail")));
});
