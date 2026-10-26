// Kho tư liệu MÁY CỦA OWNER hiện trên mkt.baor.vn (OWNER 26/10/2026): máy dựng gửi danh mục (metadata + tệp xem trước nhỏ, KHÔNG
// tệp gốc) bằng khoá máy dựng; máy chủ lưu, thay bản trước, gỡ mục không còn; OWNER duyệt nhạc trên web → máy chủ ghi quyết định →
// máy dựng áp bằng approveMusicIn trên manifest máy OWNER → xác nhận. CSDL + DATA_DIR tạm, "máy OWNER" là thư mục tạm riêng,
// ffmpeg thật tạo tệp thử và tệp xem trước; gọi thẳng route handler (không mạng thật).
import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "baor-ownercat-"));
process.env.DATA_DIR = path.join(tmp, "server");
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.AUTH_SECRET = "test-secret-".padEnd(40, "x");
process.env.BAOR_VIDEO_WORKER = "off";
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });
const MAC = path.join(tmp, "mac"); // DATA_DIR của máy OWNER (máy dựng)
const VA = path.join(MAC, "video-assets");

let auth: typeof import("../src/lib/video/worker-auth");
let route: typeof import("../src/app/api/render-worker/[action]/route");
let rc: typeof import("../src/lib/video/remote-catalog");
let cat: typeof import("../src/lib/video/asset-catalog");
let rules: typeof import("../src/lib/video/music-rules");
let oc: typeof import("../scripts/video/owner-catalog.mjs");
let rl: typeof import("../src/lib/rate-limit");
let KEY = "";

const sha = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");
const U = "http://may-chu.test/api/render-worker";
const P = (action: string) => ({ params: Promise.resolve({ action }) });
const H = (key = KEY) => ({ authorization: `Bearer ${key}`, "x-baor-worker": "may-bao" });
const ff = (...args: string[]) => execFileSync("ffmpeg", ["-nostdin", "-y", "-v", "error", ...args]);
const OWNER = { email: "owner@baor.test", name: "OWNER" };
const PENDING_LIC = "Pixabay Content License (Pixabay 963) — kho tư liệu NHAC-NEN-SFX: ĐỦ-HỒ-SƠ — chờ OWNER nghe duyệt";

/** fetch giả: chuyển thẳng vào route handler, ghi lại mọi thân yêu cầu (để chứng minh không gửi tệp gốc). */
const sent: { url: string; bytes: number; body: Buffer }[] = [];
const toRoute = (async (url: string | URL, init?: RequestInit) => {
  const u = new URL(String(url));
  const body = init?.body ? Buffer.from(typeof init.body === "string" ? init.body : (init.body as Uint8Array)) : Buffer.alloc(0);
  sent.push({ url: u.pathname, bytes: body.length, body });
  const req = new Request(u, { method: init?.method ?? "GET", headers: init?.headers, body: init?.body ? body : undefined });
  const action = u.pathname.split("/").pop()!;
  return init?.method === "PUT" ? route.PUT(req, P(action)) : init?.method === "POST" ? route.POST(req, P(action)) : route.GET(req, P(action));
}) as typeof fetch;
const ctx = () => ({ base: "http://may-chu.test", headers: H(), dataDir: MAC, fetchImpl: toRoute });

function seedMac() {
  for (const d of ["music", "sfx", "broll/anh", "sfx-owner"]) fs.mkdirSync(path.join(VA, d), { recursive: true });
  ff("-f", "lavfi", "-i", "sine=frequency=440:duration=40", "-c:a", "libmp3lame", "-b:a", "192k", path.join(VA, "music", "acoustic_a_pixabay963.mp3"));
  ff("-f", "lavfi", "-i", "sine=frequency=330:duration=3", "-c:a", "libmp3lame", path.join(VA, "music", "nghi-ai.mp3"));
  fs.copyFileSync(path.join(VA, "music", "acoustic_a_pixabay963.mp3"), path.join(VA, "music", "pixabay-552792-chill.mp3"));
  ff("-f", "lavfi", "-i", "sine=frequency=880:duration=1", "-c:a", "pcm_s16le", path.join(VA, "sfx", "pop.wav"));
  ff("-f", "lavfi", "-i", "sine=frequency=1200:duration=1", "-c:a", "pcm_s16le", path.join(VA, "sfx-owner", "Bell Small.wav"));
  ff("-f", "lavfi", "-i", "nullsrc=s=1920x1080,geq=random(1)*255:128:128", "-frames:v", "1", path.join(VA, "broll", "anh", "van-phong.jpg"));
  ff("-f", "lavfi", "-i", "testsrc=size=640x360:rate=25:duration=2", "-pix_fmt", "yuv420p", path.join(VA, "broll", "clip.mp4"));
  const w = (rel: string, v: unknown) => fs.writeFileSync(path.join(VA, rel), JSON.stringify(v));
  w("music/manifest.json", [
    { file: "acoustic_a_pixabay963.mp3", title: "Acoustic A", author: "ai-do", genre: "acoustic", mood: ["ấm áp"], durationSec: 40, license: PENDING_LIC, catalogStatus: "ĐỦ-HỒ-SƠ", source: "https://pixabay.com/x-963/" },
    { file: "nghi-ai.mp3", title: "Nghi AI", license: PENDING_LIC.replace("963", "777"), catalogStatus: "NGHI-AI" },
    { file: "pixabay-552792-chill.mp3", title: "Chill", license: "Pixabay 552792", catalogStatus: "ĐỦ-HỒ-SƠ", exclude: true, excludeReason: "Bài LOẠI A5" },
    { file: "../../ngoai.mp3", title: "Lạ", license: PENDING_LIC, catalogStatus: "ĐỦ-HỒ-SƠ" },
  ]);
  w("sfx/manifest.json", [{ file: "pop.wav", title: "Pop", kind: "pop", license: "Pixabay Content License", durationSec: 1 }]);
  w("sfx-owner/manifest.json", { license: "Tư liệu OWNER cung cấp", source: "Drive OWNER", roles: { emp_pop: { "16:9": "Bell Small.wav" } } });
  w("broll/manifest.json", [
    { file: "anh/van-phong.jpg", kind: "image", keywords: ["văn phòng"], license: "Ảnh OWNER", source: "Drive: HINH-ANH/x", driveId: "1AbCdEfGhIjKlMnOpQrStUvWxYz", desc: "Góc làm việc" },
    { file: "clip.mp4", kind: "video", keywords: ["hậu trường"], license: "Clip OWNER" },
  ]);
}

before(async () => {
  auth = await import("../src/lib/video/worker-auth");
  route = await import("../src/app/api/render-worker/[action]/route");
  rc = await import("../src/lib/video/remote-catalog");
  cat = await import("../src/lib/video/asset-catalog");
  rules = await import("../src/lib/video/music-rules");
  oc = await import("../scripts/video/owner-catalog.mjs");
  rl = await import("../src/lib/rate-limit");
  seedMac();
});
// Bộ đếm tần suất là của cả tiến trình: mỗi ca bắt đầu từ 0 (ca cuối kiểm riêng giới hạn)
beforeEach(() => rl?.rateLimiter().reset("render-worker:catalog"));

const item = (over: Record<string, unknown> = {}) => ({ path: "music/a.mp3", kind: "music", media: "audio", title: "A", sha256: sha("a"), ...over });
const postCatalog = (body: unknown, key = KEY) => route.POST(new Request(`${U}/catalog`, { method: "POST", headers: { ...H(key), "content-type": "application/json" }, body: JSON.stringify(body) }), P("catalog"));
const putPreview = (s: string, type: string, body: Buffer | string, key = KEY) => route.PUT(new Request(`${U}/preview?sha=${encodeURIComponent(s)}&type=${type}`, { method: "PUT", headers: H(key), body: typeof body === "string" ? body : new Uint8Array(body) }), P("preview"));

test("khoá: chưa có / sai khoá → 401 cho catalog và preview", async () => {
  assert.equal((await postCatalog({ items: [] }, "bw_chuacokhoachuacokhoaxx")).status, 401);
  KEY = auth.generateWorkerKey();
  assert.equal((await postCatalog({ items: [] }, "bw_saikhoasaikhoasaikhoa")).status, 401);
  assert.equal((await putPreview(sha("x"), "jpg", "x", "bw_saikhoasaikhoasaikhoa")).status, 401);
});

test("từ chối danh mục sai: đường dẫn lạ / sai loại / trùng, sha256 sai, xem trước quá cỡ, thân quá lớn", async () => {
  const bad: [unknown, RegExp][] = [
    [{ items: [item({ path: "music/../../etc/passwd" })] }, /đường dẫn/],
    [{ items: [item({ path: "/abs/a.mp3" })] }, /đường dẫn/],
    [{ items: [item({ path: "broll/a.jpg" })] }, /đường dẫn/],
    [{ items: [item({ path: "music/.an.mp3" })] }, /đường dẫn/],
    [{ items: [item({ path: "music/a\u0000.mp3" })] }, /đường dẫn/],
    [{ items: [item(), item()] }, /trùng/],
    [{ items: [item({ sha256: "abc" })] }, /sha256/],
    [{ items: [item({ kind: "exe" })] }, /loại/],
    [{ items: [item({ preview: { sha256: sha("p"), type: "jpg", bytes: 10 * 1024 * 1024 } })] }, /xem trước/],
    [{ items: [item({ preview: { sha256: sha("p"), type: "html", bytes: 10 } })] }, /xem trước/],
    [{ items: [item({ path: "tha-vao/nhac/a.mp3", kind: "drop", sha256: "", preview: { sha256: sha("p"), type: "mp3", bytes: 10 } })] }, /chưa nhận/],
    [{ items: "x" }, /items/],
  ];
  for (const [body, re] of bad) {
    const r = await postCatalog(body);
    assert.equal(r.status, 400, JSON.stringify(body).slice(0, 80));
    assert.match(((await r.json()) as { error: string }).error, re);
  }
  const big = await route.POST(new Request(`${U}/catalog`, { method: "POST", headers: { ...H(), "content-type": "application/json" }, body: "x".repeat(8 * 1024 * 1024 + 10) }), P("catalog"));
  assert.equal(big.status, 413);
  assert.equal(rc.ownerMacStatus().syncedAt, null, "lô sai không ghi gì");
});

test("đồng bộ thật từ máy dựng: đủ loại tư liệu, xem trước nhỏ đúng chuẩn, KHÔNG gửi tệp gốc, không lộ driveId, chỉ ghi preview-cache", async () => {
  const snap = fs.readdirSync(VA, { recursive: true }).map(String).sort();
  // App chạy cùng DATA_DIR trên máy OWNER để ảnh nhỏ của nó ở preview-cache/server (thư mục con) — lượt dọn không được đụng vào
  // (26/10: rmSync thư mục ném EISDIR làm hỏng cả lượt đồng bộ); tệp xem trước cũ của máy dựng thì vẫn dọn
  const pc = path.join(MAC, "preview-cache");
  fs.mkdirSync(path.join(pc, "server"), { recursive: true });
  fs.writeFileSync(path.join(pc, "server", "app-thumb.jpg"), "x");
  fs.writeFileSync(path.join(pc, "cu-khong-dung.jpg"), "x");
  sent.length = 0;
  const r = await oc.syncCatalog(ctx());
  assert.ok(fs.existsSync(path.join(pc, "server", "app-thumb.jpg")), "thư mục con của app giữ nguyên");
  assert.ok(!fs.existsSync(path.join(pc, "cu-khong-dung.jpg")), "tệp xem trước không còn dùng bị dọn");
  assert.ok(r.ok, JSON.stringify(r));
  const s = rc.ownerMacStatus();
  assert.equal(s.count, 7, JSON.stringify(s));
  assert.deepEqual(s.byKind, { music: 3, sfx: 2, broll: 2, drop: 0 });
  assert.equal(r.previewsSent, 6, "nhạc bị loại không tạo xem trước; 2 nhạc + 2 SFX + ảnh + clip");
  const list = cat.listAssetCatalog({ source: "owner_mac" });
  const by = new Map(list.map((e) => [e.file, e]));
  assert.ok(!by.has("music/../../ngoai.mp3"), "tệp trỏ ra ngoài thư mục không được báo");
  const a = by.get("music/acoustic_a_pixabay963.mp3")!;
  assert.equal(a.status, "pending");
  assert.equal(a.canApprove, true);
  assert.equal(a.licenseShort, "Pixabay");
  assert.ok(a.previewUrl && a.lastSyncedAt);
  assert.equal(by.get("music/nghi-ai.mp3")!.status, "blocked");
  assert.equal(by.get("music/nghi-ai.mp3")!.canApprove, false);
  assert.equal(by.get("music/pixabay-552792-chill.mp3")!.status, "excluded");
  assert.equal(by.get("music/pixabay-552792-chill.mp3")!.previewUrl, null);
  assert.equal(by.get("sfx-owner/Bell Small.wav")!.status, "ready");
  assert.deepEqual(by.get("sfx-owner/Bell Small.wav")!.tags, ["emp_pop"]);
  const img = by.get("broll/anh/van-phong.jpg")!;
  assert.ok(img.thumbUrl && img.media === "image" && img.desc === "Góc làm việc");
  assert.ok(by.get("broll/clip.mp4")!.thumbUrl, "clip có ảnh thu nhỏ khung hình");
  // Tệp xem trước ở máy chủ: đúng chuẩn, nhỏ
  for (const e of list.filter((x) => x.thumbUrl || x.previewUrl)) {
    const name = new URL(`http://x${e.thumbUrl ?? e.previewUrl}`).searchParams.get("p")!;
    const f = rc.remotePreviewFile(name)!;
    assert.ok(f, name);
    const size = fs.statSync(f.path).size;
    if (name.endsWith(".jpg")) {
      assert.ok(size <= 60 * 1024, `ảnh thu nhỏ ${size} B`);
      const dim = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", f.path], { encoding: "utf8" }).trim().split(",").map(Number);
      assert.ok(Math.max(...dim) <= 480, `cạnh dài ${dim}`);
    } else {
      const dur = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f.path], { encoding: "utf8" }).trim());
      assert.ok(dur <= 30.5, `nghe thử ${dur}s`);
      assert.ok(size <= 300 * 1024, `nghe thử ${size} B`);
    }
  }
  // Không gửi tệp gốc: không thân yêu cầu nào trùng (hay chứa) mã băm tệp gốc nào
  const originals = ["music/acoustic_a_pixabay963.mp3", "sfx/pop.wav", "broll/anh/van-phong.jpg", "broll/clip.mp4"].map((p) => sha(fs.readFileSync(path.join(VA, p))));
  for (const x of sent.filter((q) => q.url.endsWith("/preview"))) assert.ok(!originals.includes(sha(x.body)), "tệp xem trước không phải tệp gốc");
  assert.ok(Math.max(...sent.map((x) => x.bytes)) < 400 * 1024, "không yêu cầu nào mang tệp lớn");
  assert.ok(!sent.some((x) => x.body.toString("utf8").includes("1AbCdEfGhIjKlMnOpQrStUvWxYz")), "không gửi ID Drive");
  const after = fs.readdirSync(VA, { recursive: true }).map(String).sort();
  assert.deepEqual(after, snap, "máy dựng không ghi gì vào kho tư liệu khi chỉ đồng bộ");
  assert.ok(fs.readdirSync(path.join(MAC, "preview-cache")).some((f) => f.endsWith(".jpg")));
  // Lần 2 không đổi gì → không gửi lại tệp xem trước
  const r2 = await oc.syncCatalog(ctx());
  assert.ok(r2.ok && r2.previewsSent === 0, JSON.stringify(r2));
});

test("tệp xem trước: sai loại (magic bytes) / quá cỡ / mã băm sai / không có trong danh mục / tên lạ → từ chối", async () => {
  const fake = Buffer.from("<html>not a jpeg</html>");
  const okJpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100)]);
  const huge = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200 * 1024)]);
  const cur = cat.listAssetCatalog({ source: "owner_mac" }).map((e) => ({ path: e.file, kind: e.type, media: e.media, title: e.title, sha256: sha(e.file) }));
  // Danh mục thử trỏ tới 3 tệp xem trước (để chỉ còn lỗi loại / cỡ quyết định)
  const r = await postCatalog({ items: [...cur.slice(0, 2), { ...cur[2], preview: { sha256: sha(fake), type: "jpg", bytes: fake.length } }, { ...cur[3], preview: { sha256: sha(huge), type: "jpg", bytes: 150 * 1024 } }, { ...cur[4], preview: { sha256: sha(okJpg), type: "jpg", bytes: okJpg.length } }] });
  assert.equal(r.status, 200);
  assert.equal((await putPreview(sha(fake), "jpg", fake)).status, 415, "không phải JPEG");
  assert.equal((await putPreview(sha(huge), "jpg", huge)).status, 413, "quá cỡ");
  assert.equal((await putPreview(sha(okJpg), "jpg", Buffer.concat([okJpg, Buffer.from("x")]))).status, 400, "mã băm sai");
  assert.equal((await putPreview(sha("khong-co"), "jpg", okJpg)).status, 409, "danh mục không trỏ tới");
  assert.equal((await putPreview("../../etc/passwd", "jpg", okJpg)).status, 400, "tên lạ");
  assert.equal((await putPreview(sha(okJpg), "html", okJpg)).status, 400, "loại lạ");
  assert.equal((await putPreview(sha(okJpg), "jpg", okJpg)).status, 200);
  assert.equal(fs.readdirSync(rc.previewsDir()).filter((f) => !/^[a-f0-9]{64}\.(jpg|mp3)$/.test(f)).length, 0, "máy chủ chỉ có tệp tên = mã băm");
  assert.equal(rc.remotePreviewFile("../x.jpg"), null);
});

test("thay bản trước: thêm / đổi / gỡ mục; tệp xem trước của mục gỡ bị dọn; mục gỡ ẩn khỏi danh mục", async () => {
  const r0 = await oc.syncCatalog(ctx()); // về lại đúng kho máy OWNER
  assert.ok(r0.ok);
  const clipPrev = cat.listAssetCatalog({ source: "owner_mac" }).find((e) => e.file === "broll/clip.mp4")!.thumbUrl!;
  // máy OWNER: gỡ clip, đổi giấy phép SFX, thêm ảnh
  const bm = JSON.parse(fs.readFileSync(path.join(VA, "broll", "manifest.json"), "utf8")) as { file: string }[];
  fs.copyFileSync(path.join(VA, "broll", "anh", "van-phong.jpg"), path.join(VA, "broll", "anh", "moi.jpg"));
  fs.writeFileSync(path.join(VA, "broll", "manifest.json"), JSON.stringify([...bm.filter((x) => x.file !== "clip.mp4"), { file: "anh/moi.jpg", kind: "image", keywords: ["mới"], license: "Ảnh OWNER" }]));
  fs.writeFileSync(path.join(VA, "sfx", "manifest.json"), JSON.stringify([{ file: "pop.wav", title: "Pop", kind: "pop", license: "Mixkit Free License", durationSec: 1 }]));
  const body = { hash: "", items: (await oc.buildCatalog({ dataDir: MAC })).items };
  const res = (await (await postCatalog(body)).json()) as { added: number; changed: number; removed: number; unchanged: number };
  assert.deepEqual({ a: res.added, c: res.changed, r: res.removed }, { a: 1, c: 1, r: 1 }, JSON.stringify(res));
  const list = cat.listAssetCatalog({ source: "owner_mac" });
  assert.ok(!list.some((e) => e.file === "broll/clip.mp4"), "mục gỡ không hiện");
  assert.equal(cat.listAssetCatalog({ source: "owner_mac", includeRemoved: true }).find((e) => e.file === "broll/clip.mp4")!.status, "removed");
  assert.equal(list.find((e) => e.file === "sfx/pop.wav")!.licenseShort, "Mixkit");
  assert.equal(rc.remotePreviewFile(new URL(`http://x${clipPrev}`).searchParams.get("p")!), null, "xem trước của mục gỡ không còn phát");
  const cleanup = await oc.syncCatalog(ctx());
  assert.ok(cleanup.ok);
});

test("luật duyệt trên web = luật approveMusic: BANNED / bài bị loại / không ĐỦ-HỒ-SƠ / không ở trạng thái chờ → không ghi quyết định", () => {
  assert.equal(rc.requestMusicDecision("music/pixabay-552792-chill.mp3", true, OWNER).ok, false, "BANNED + bị loại");
  assert.equal(rc.requestMusicDecision("music/nghi-ai.mp3", true, OWNER).ok, false, "NGHI-AI");
  assert.equal(rc.requestMusicDecision("music/khong-co.mp3", true, OWNER).ok, false);
  assert.equal(rc.requestMusicDecision("sfx/pop.wav", true, OWNER).ok, false, "chỉ nhạc");
  assert.equal(rc.requestMusicDecision("music/acoustic_a_pixabay963.mp3", false, OWNER).ok, false, "chưa duyệt thì không bỏ duyệt");
  // cùng hàm luật cho từng mục: so trực tiếp với musicApprovalError trên manifest máy OWNER
  for (const x of rules.readMusicManifest(path.join(VA, "music")).filter((m) => !String(m.file).includes(".."))) {
    const row = cat.listAssetCatalog({ source: "owner_mac" }).find((e) => e.file === `music/${x.file}`)!;
    assert.equal(row.canApprove, rules.musicApprovalError(x) === null, String(x.file));
  }
  assert.equal(rc.pendingDecisionCount(), 0);
});

test("vòng quyết định: web duyệt → 'đang chờ máy dựng' → máy dựng áp bằng approveMusicIn → xác nhận → Đã duyệt; bỏ duyệt cũng vậy", async () => {
  const id = "music/acoustic_a_pixabay963.mp3";
  const at = new Date("2026-10-26T09:00:00+07:00");
  assert.deepEqual(rc.requestMusicDecision(id, true, OWNER, at), { ok: true, state: "queued" });
  assert.deepEqual(rc.requestMusicDecision(id, true, OWNER, at), { ok: true, state: "already" }, "bấm lại không tạo trùng");
  let e = cat.listAssetCatalog({ source: "owner_mac" }).find((x) => x.file === id)!;
  assert.equal(e.pendingDecision?.action, "approve");
  assert.equal(e.status, "pending");
  assert.equal(e.canApprove, false, "đang chờ → không bấm duyệt lần nữa");
  // claim báo cho máy dựng có quyết định chờ
  const claim = await route.POST(new Request(`${U}/claim`, { method: "POST", headers: H() }), P("claim"));
  assert.equal(claim.headers.get("x-baor-decisions"), "1");
  // Kết quả mong đợi = approveMusicIn trên bản sao manifest
  const twin = path.join(tmp, "twin");
  fs.mkdirSync(twin, { recursive: true });
  fs.copyFileSync(path.join(VA, "music", "manifest.json"), path.join(twin, "manifest.json"));
  assert.deepEqual(rules.approveMusicIn(twin, "acoustic_a_pixabay963.mp3", OWNER.email, at), { ok: true });
  const r = await oc.syncCatalog(ctx());
  assert.ok(r.ok && r.applied === 1 && r.failed === 0, JSON.stringify(r));
  assert.deepEqual(rules.readMusicManifest(path.join(VA, "music")), rules.readMusicManifest(twin), "manifest máy OWNER = đúng kết quả approveMusicIn");
  const mine = rules.readMusicManifest(path.join(VA, "music")).find((x) => x.file === "acoustic_a_pixabay963.mp3")!;
  assert.equal((mine.ownerApproved as { by: string }).by, OWNER.email);
  assert.match(String(mine.license), /OWNER nghe duyệt 26\/10\/2026 \(owner@baor\.test\)/);
  e = cat.listAssetCatalog({ source: "owner_mac" }).find((x) => x.file === id)!;
  assert.equal(e.status, "approved");
  assert.equal(e.pendingDecision, null);
  assert.equal(e.canUnapprove, true);
  assert.equal(rc.pendingDecisionCount(), 0);
  // Bỏ duyệt
  assert.equal(rc.requestMusicDecision(id, false, OWNER).ok, true);
  assert.ok((await oc.syncCatalog(ctx())).ok);
  const back = rules.readMusicManifest(path.join(VA, "music")).find((x) => x.file === "acoustic_a_pixabay963.mp3")!;
  assert.equal(back.license, PENDING_LIC, "giấy phép kho trả nguyên văn");
  assert.equal(back.ownerApproved, undefined);
  assert.equal(cat.listAssetCatalog({ source: "owner_mac" }).find((x) => x.file === id)!.status, "pending");
  // Bấm duyệt rồi bấm ngược lại trước khi máy dựng áp = huỷ, máy dựng không đổi gì
  assert.equal(rc.requestMusicDecision(id, true, OWNER).ok, true);
  assert.deepEqual(rc.requestMusicDecision(id, false, OWNER), { ok: true, state: "cancelled" });
  assert.equal(rc.pendingDecisionCount(), 0);
});

test("quyết định chỉ áp cho đúng tệp: tệp trên máy OWNER đổi (sha256 khác) → không áp, báo lỗi; áp trực tiếp bài khác / tệp lạ cũng không", async () => {
  const id = "music/acoustic_a_pixabay963.mp3";
  assert.equal(rc.requestMusicDecision(id, true, OWNER).ok, true);
  const mf0 = fs.readFileSync(path.join(VA, "music", "manifest.json"), "utf8");
  // máy OWNER thay tệp âm thanh (cùng tên, khác nội dung) trước khi máy dựng kịp áp
  ff("-f", "lavfi", "-i", "sine=frequency=220:duration=5", "-c:a", "libmp3lame", path.join(VA, "music", "acoustic_a_pixabay963.mp3"));
  const r = await oc.syncCatalog(ctx());
  assert.ok(r.ok && r.applied === 0, JSON.stringify(r));
  assert.equal(fs.readFileSync(path.join(VA, "music", "manifest.json"), "utf8"), mf0, "manifest không đổi");
  const e = cat.listAssetCatalog({ source: "owner_mac" }).find((x) => x.file === id)!;
  assert.equal(e.pendingDecision, null);
  assert.match(e.decisionError ?? "", /đã đổi/);
  assert.equal(e.status, "pending");
  // applyDecisions trực tiếp: sha sai / tệp không có / tên ra ngoài thư mục / hành động lạ → không áp
  const cur = sha(fs.readFileSync(path.join(VA, "music", "acoustic_a_pixabay963.mp3")));
  const acks = await oc.applyDecisions(MAC, [
    { id: "d1", file: "acoustic_a_pixabay963.mp3", sha256: sha("khac"), action: "approve", by: "x", at: new Date().toISOString() },
    { id: "d2", file: "khong-co.mp3", sha256: cur, action: "approve", by: "x", at: new Date().toISOString() },
    { id: "d3", file: "../../ngoai.mp3", sha256: cur, action: "approve", by: "x", at: new Date().toISOString() },
    { id: "d4", file: "acoustic_a_pixabay963.mp3", sha256: cur, action: "xoa" as "approve", by: "x", at: new Date().toISOString() },
    { id: "d5", file: "nghi-ai.mp3", sha256: sha(fs.readFileSync(path.join(VA, "music", "nghi-ai.mp3"))), action: "approve", by: "x", at: new Date().toISOString() },
  ]);
  assert.deepEqual(acks.map((a) => a.ok), [false, false, false, false, false]);
  assert.match(acks[4].error!, /ĐỦ-HỒ-SƠ/, "máy dựng kiểm lại luật bằng approveMusicIn");
  assert.equal(fs.readFileSync(path.join(VA, "music", "manifest.json"), "utf8"), mf0);
  // xác nhận "đã áp" suông (danh mục không đổi) không được tính
  assert.equal(rc.requestMusicDecision(id, true, OWNER).ok, true);
  const d = rc.pendingDecisions()[0];
  const items = (await oc.buildCatalog({ dataDir: MAC })).items;
  await postCatalog({ items, acks: [{ id: d.id, ok: true }] });
  assert.match(cat.listAssetCatalog({ source: "owner_mac" }).find((x) => x.file === id)!.decisionError ?? "", /chưa đổi/);
});

test("khoá máy dựng bị thu hồi → không đồng bộ được; tần suất bị giới hạn", async () => {
  auth.revokeWorkerKey();
  const r = await oc.syncCatalog(ctx());
  assert.deepEqual(r.ok ? null : r.status, 401);
  KEY = auth.generateWorkerKey();
  rl.rateLimiter().reset("render-worker:catalog");
  let last = 0;
  for (let i = 0; i < 31; i++) last = (await postCatalog({ items: [] })).status;
  assert.equal(last, 429);
  rl.rateLimiter().reset("render-worker:catalog");
});
