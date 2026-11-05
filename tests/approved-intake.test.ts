// Thư mục đã duyệt trên máy OWNER → máy dựng gửi lên → Kho video (đã duyệt) → tự viết bài từ lời đã nói.
// Chạy trọn vòng trong một tiến trình: bộ quét / gửi của máy dựng (scripts/video/approved-intake.mts) gọi thẳng route handler
// /api/render-worker/intake (không mạng thật), CSDL + DATA_DIR tạm, không gọi AI (bản nháp theo luật).
import { test, before, after as teardown } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "baor-approved-"));
process.env.DATA_DIR = tmp;
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.AUTH_SECRET = "test-secret-".padEnd(40, "x");
process.env.ADMIN_EMAIL = "owner@example.test";
process.env.BAOR_VIDEO_WORKER = "off";
process.env.BAOR_WHISPER = "off";
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENAI_API_KEY;
delete process.env.XAI_API_KEY;

let db: typeof import("../src/db");
let route: typeof import("../src/app/api/render-worker/[action]/route");
let auth: typeof import("../src/lib/video/worker-auth");
let intake: typeof import("../scripts/video/approved-intake.mjs");
let server: typeof import("../src/lib/video/approved-intake");
let cap: typeof import("../src/lib/publishing/caption");
let draft: typeof import("../src/lib/publishing/post-draft");
let KEY = "";
const BASE = "http://may-chu.test";
const folder = path.join(tmp, "7.VIDEO-DA-DUYET");

before(async () => {
  db = await import("../src/db");
  route = await import("../src/app/api/render-worker/[action]/route");
  auth = await import("../src/lib/video/worker-auth");
  intake = await import("../scripts/video/approved-intake.mjs");
  server = await import("../src/lib/video/approved-intake");
  cap = await import("../src/lib/publishing/caption");
  draft = await import("../src/lib/publishing/post-draft");
  db.getDb();
  KEY = auth.generateWorkerKey();
  fs.mkdirSync(folder, { recursive: true });
});
teardown(() => fs.rmSync(tmp, { recursive: true, force: true }));

const headers = () => ({ authorization: `Bearer ${KEY}`, "x-baor-worker": "may-bao" });

// fetch giả: gọi thẳng route handler của /api/render-worker/<action>
const fakeFetch: typeof fetch = async (input, init) => {
  const url = new URL(String(input));
  const action = url.pathname.split("/").pop()!;
  const req = new Request(url, { method: init?.method ?? "GET", headers: init?.headers as Record<string, string>, body: init?.body as BodyInit | null, duplex: "half" } as RequestInit);
  const P = { params: Promise.resolve({ action }) };
  if (req.method === "POST") return route.POST(req, P);
  if (req.method === "PUT") return route.PUT(req, P);
  return route.GET(req, P);
};

const ctx = () => ({ base: BASE, headers: headers(), fetchImpl: fakeFetch, chunkBytes: 1024, transcribe: async () => "Hôm nay mình chia sẻ cách chào hỏi phá băng khi gọi điện cho khách mới. Đừng mở đầu bằng giới thiệu sản phẩm. Hãy hỏi một câu về họ trước." });
const video = (id: string) => db.getDb().select().from(db.schema.videos).where(eq(db.schema.videos.id, id)).get()!;

test("quét: tệp vừa chép / cỡ còn đổi chưa gửi; cỡ đứng yên qua 2 lần quét thì sẵn sàng; tệp ẩn và đuôi lạ bị bỏ", () => {
  const st = intake.newScanState();
  const f = path.join(folder, "chao-hoi.mp4");
  fs.writeFileSync(f, Buffer.alloc(3000, 1));
  fs.writeFileSync(path.join(folder, ".DS_Store"), "x");
  fs.writeFileSync(path.join(folder, "ghi-chu.txt"), "x");
  const old = Date.now() - 60_000;
  fs.utimesSync(f, old / 1000, old / 1000);
  assert.deepEqual(intake.pendingApproved(folder, st), [], "lần quét đầu chỉ ghi cỡ");
  assert.deepEqual(intake.pendingApproved(folder, st), [f], "lần hai cỡ không đổi → sẵn sàng");
  fs.appendFileSync(f, Buffer.alloc(10));
  assert.deepEqual(intake.pendingApproved(folder, st), [], "cỡ đổi → chờ tiếp");
  const fresh = path.join(folder, "moi-chep.mp4");
  fs.writeFileSync(fresh, "abc");
  intake.pendingApproved(folder, st);
  assert.ok(!intake.pendingApproved(folder, st).includes(fresh), "sửa < 20 giây chưa gửi");
  fs.rmSync(fresh);
});

test("gửi trọn vòng: băm → mở phiên → từng khúc → video vào Kho (đã duyệt, OWNER), lời nói + ghi chú lưu kèm, tệp cất vào DA-GUI/, AI đang viết", async () => {
  const st = intake.newScanState();
  const f = path.join(folder, "chao-hoi.mp4");
  fs.writeFileSync(path.join(folder, "chao-hoi.txt"), "Hashtag muốn dùng: #baor #telesales");
  const old = Date.now() - 60_000;
  fs.utimesSync(f, old / 1000, old / 1000);
  intake.pendingApproved(folder, st);
  const r = await intake.runApprovedIntake({ ...ctx(), dir: folder }, st);
  assert.deepEqual(r, { sent: 1, duplicates: 0, failed: 0 });
  const last = server.lastApprovedIntake();
  assert.ok(last && last.worker === "may-bao" && last.name === "chao-hoi.mp4");
  const v = video(last!.videoId);
  assert.equal(v.status, "approved");
  assert.equal(v.origin, "self_edit");
  assert.equal(v.title, "chao hoi");
  const up = db.getDb().select().from(db.schema.uploads).where(eq(db.schema.uploads.id, v.uploadId!)).get()!;
  const meta = JSON.parse(up.meta) as Record<string, string>;
  assert.equal(meta.source, "approved-folder");
  assert.match(meta.sha256, /^[a-f0-9]{64}$/);
  assert.ok(meta.transcript.includes("chào hỏi phá băng"));
  assert.equal(meta.note, "Hashtag muốn dùng: #baor #telesales");
  assert.equal(up.uploadedBy, "owner@example.test");
  assert.equal(fs.statSync(path.join(tmp, "uploads", up.fileName)).size, 3010, "tệp đủ byte sau khi ghép khúc 1 KB");
  // máy OWNER: tệp + .txt cất vào DA-GUI, kèm dấu đã gửi
  assert.ok(!fs.existsSync(f));
  assert.ok(fs.existsSync(path.join(folder, "DA-GUI", "chao-hoi.mp4")));
  assert.ok(fs.existsSync(path.join(folder, "DA-GUI", "chao-hoi.txt")));
  assert.match(fs.readFileSync(path.join(folder, "DA-GUI", "chao-hoi.da-gui.txt"), "utf8"), new RegExp(`Mã video: ${v.id}`));
  // Kho: AI đang viết (đánh dấu ngay), bản nháp theo luật (AI tắt) dùng lời đã nói
  await new Promise((res) => setTimeout(res, 300));
  const spoken = cap.videoSpoken(v.id);
  assert.equal(spoken.source, "transcript");
  const text = cap.captionDraft(v.id) ?? "";
  assert.ok(text.includes("chào hỏi phá băng"), `caption theo luật phải lấy từ lời đã nói, nhận: ${text}`);
  assert.equal(draft.postDraftPending(v.id), false, "viết xong thì bỏ dấu đang viết");
  assert.match(cap.postDraftSource(v.id) ?? "", /^rule:/);
  assert.equal(server.approvedIntakeCount(24), 1);
});

test("kéo lại cùng video (đổi tên) → trùng mã băm: không nhận lại, cất vào DA-GUI/ kèm ghi chú trùng", async () => {
  const st = intake.newScanState();
  fs.copyFileSync(path.join(folder, "DA-GUI", "chao-hoi.mp4"), path.join(folder, "chao-hoi (ban sao).mp4"));
  const f = path.join(folder, "chao-hoi (ban sao).mp4");
  const old = Date.now() - 60_000;
  fs.utimesSync(f, old / 1000, old / 1000);
  intake.pendingApproved(folder, st);
  const before = db.getDb().select().from(db.schema.videos).all().length;
  const r = await intake.runApprovedIntake({ ...ctx(), dir: folder }, st);
  assert.deepEqual(r, { sent: 0, duplicates: 1, failed: 0 });
  assert.equal(db.getDb().select().from(db.schema.videos).all().length, before);
  assert.match(fs.readFileSync(path.join(folder, "DA-GUI", "chao-hoi (ban sao).da-gui.txt"), "utf8"), /trùng nội dung/);
});

test("mất mạng giữa chừng: gửi lại từ vị trí máy chủ đã nhận (phiên tìm lại theo mã băm), không ghi đè, không hở", async () => {
  const f = path.join(folder, "lon.mp4");
  fs.writeFileSync(f, Buffer.from(Array.from({ length: 5000 }, (_, i) => i % 251)));
  const old = Date.now() - 60_000;
  fs.utimesSync(f, old / 1000, old / 1000);
  let calls = 0;
  const flaky: typeof fetch = async (input, init) => {
    if (init?.method === "PUT" && ++calls === 3) throw new Error("mất mạng");
    return fakeFetch(input, init);
  };
  const st = intake.newScanState();
  intake.pendingApproved(folder, st);
  const r1 = await intake.runApprovedIntake({ ...ctx(), fetchImpl: flaky, dir: folder }, st);
  assert.deepEqual(r1, { sent: 0, duplicates: 0, failed: 1 });
  assert.ok(fs.existsSync(intake.errorPath(f)));
  // 5 phút sau máy dựng thử lại: phiên cũ còn (cùng mã băm) → tiếp từ byte đã nhận
  const r2 = await intake.runApprovedIntake({ ...ctx(), dir: folder }, st, Date.now() + 6 * 60_000);
  assert.deepEqual(r2, { sent: 1, duplicates: 0, failed: 0 });
  assert.ok(!fs.existsSync(intake.errorPath(f)), "gửi được thì bỏ dấu lỗi");
  const last = server.lastApprovedIntake()!;
  const v = video(last.videoId);
  const up = db.getDb().select().from(db.schema.uploads).where(eq(db.schema.uploads.id, v.uploadId!)).get()!;
  const got = fs.readFileSync(path.join(tmp, "uploads", up.fileName));
  assert.equal(got.length, 5000);
  assert.equal(got[4999], 4999 % 251, "byte cuối đúng → ghép khúc không lệch");
});

test("route intake: thiếu khoá → 401; thiếu sha → 400; đuôi lạ → 415", async () => {
  const P = { params: Promise.resolve({ action: "intake" }) };
  assert.equal((await route.POST(new Request(`${BASE}/api/render-worker/intake?name=a.mp4&size=1&sha256=${"a".repeat(64)}`, { method: "POST" }), P)).status, 401);
  assert.equal((await route.POST(new Request(`${BASE}/api/render-worker/intake?name=a.mp4&size=1`, { method: "POST", headers: headers() }), P)).status, 400);
  assert.equal((await route.POST(new Request(`${BASE}/api/render-worker/intake?name=a.exe&size=1&sha256=${"b".repeat(64)}`, { method: "POST", headers: headers() }), P)).status, 415);
});

test("phản biện P2-2: video đã đăng và đã gỡ tệp không chặn nhận lại cùng mã băm", async () => {
  const last = server.lastApprovedIntake()!;
  const v = video(last.videoId);
  const up = db.getDb().select().from(db.schema.uploads).where(eq(db.schema.uploads.id, v.uploadId!)).get()!;
  const sha = (JSON.parse(up.meta) as { sha256: string }).sha256;
  assert.ok(server.findVideoBySha(sha), "còn tệp → trùng");
  db.getDb().update(db.schema.videos).set({ filesPurgedAt: new Date().toISOString() }).where(eq(db.schema.videos.id, v.id)).run();
  assert.equal(server.findVideoBySha(sha), null, "đã gỡ tệp → nhận lại được");
  const r = server.openApprovedIntake({ name: "lai.mp4", size: 5000, sha256: sha, worker: "may-bao" });
  assert.equal(r.ok && !r.duplicate, true);
});

test("phản biện P2-3: khai mã băm sai → khúc cuối bị từ chối, phần đã nhận bị bỏ, máy dựng gửi lại từ đầu; không tạo video", async () => {
  const f = path.join(folder, "bam-sai.mp4");
  fs.writeFileSync(f, Buffer.alloc(2500, 7));
  const old = Date.now() - 60_000;
  fs.utimesSync(f, old / 1000, old / 1000);
  const P = { params: Promise.resolve({ action: "intake" }) };
  const o = await route.POST(new Request(`${BASE}/api/render-worker/intake?name=bam-sai.mp4&size=2500&sha256=${"c".repeat(64)}`, { method: "POST", headers: headers() }), P);
  const { sid } = (await o.json()) as { sid: string };
  const put = await route.PUT(new Request(`${BASE}/api/render-worker/intake?sid=${sid}&offset=0`, { method: "PUT", headers: headers(), body: new Uint8Array(fs.readFileSync(f)), duplex: "half" } as RequestInit), P);
  assert.equal(put.status, 400);
  const b = (await put.json()) as { offset: number; error: string };
  assert.equal(b.offset, 0);
  assert.match(b.error, /Mã băm không khớp/);
  const info = await route.GET(new Request(`${BASE}/api/render-worker/intake?sid=${sid}`, { headers: headers() }), P);
  assert.equal(((await info.json()) as { offset: number }).offset, 0, "phần đã nhận bị bỏ");
  assert.ok(!db.getDb().select().from(db.schema.videos).all().some((x) => x.title === "bam sai"));
  fs.rmSync(f);
});

test("phản biện P2-1: dải trạng thái phân biệt máy dựng thấy / không thấy thư mục / mã cũ; claim ghi trạng thái từ header", async () => {
  const P = { params: Promise.resolve({ action: "claim" }) };
  await route.POST(new Request(`${BASE}/api/render-worker/claim`, { method: "POST", headers: { ...headers(), "x-baor-approved-dir": "missing" } }), P);
  assert.equal(server.approvedFolderState(), "missing");
  await route.POST(new Request(`${BASE}/api/render-worker/claim`, { method: "POST", headers: headers() }), P);
  assert.equal(server.approvedFolderState(), "outdated");
  await route.POST(new Request(`${BASE}/api/render-worker/claim`, { method: "POST", headers: { ...headers(), "x-baor-approved-dir": "ok" } }), P);
  assert.equal(server.approvedFolderState(), "ok");
  const page = await import("../src/app/(admin)/video-library/page");
  assert.equal(page.approvedFolderText({ online: true, hasKey: true, state: "ok" }).tone, "ok");
  assert.equal(page.approvedFolderText({ online: true, hasKey: true, state: "missing" }).tone, "warn");
  assert.match(page.approvedFolderText({ online: true, hasKey: true, state: "outdated" }).text, /mã cũ/);
  assert.equal(page.approvedFolderText({ online: false, hasKey: true, state: "ok" }).tone, "warn");
  assert.equal(page.approvedFolderText({ online: false, hasKey: false, state: null }).tone, "off");
});

test("phản biện P3-1: cất vào DA-GUI không ghi đè .txt / .da-gui.txt đã có; tệp lỗi tên <tên>.loi.txt", () => {
  const dir = path.join(folder, intake.DONE_DIR);
  fs.writeFileSync(path.join(dir, "ghi-de.txt"), "GHI CHU CU");
  const f = path.join(folder, "ghi-de.mp4");
  fs.writeFileSync(f, "x");
  fs.writeFileSync(path.join(folder, "ghi-de.txt"), "GHI CHU MOI");
  const dest = intake.moveDone(f, "dấu");
  assert.equal(path.basename(dest), "ghi-de v2.mp4");
  assert.equal(fs.readFileSync(path.join(dir, "ghi-de.txt"), "utf8"), "GHI CHU CU");
  assert.equal(fs.readFileSync(path.join(dir, "ghi-de v2.txt"), "utf8"), "GHI CHU MOI");
  assert.ok(fs.existsSync(path.join(dir, "ghi-de v2.da-gui.txt")));
  assert.equal(intake.errorPath(path.join(folder, "a.mp4")), path.join(folder, "a.loi.txt"));
});
