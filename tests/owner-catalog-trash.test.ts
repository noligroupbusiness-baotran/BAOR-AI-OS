// Xoá tư liệu "Máy của anh" từ web (OWNER 27/10/2026): web ghi lệnh xoá (đúng sha256 + tên tệp) → "Chờ máy dựng xoá" (huỷ được) →
// máy dựng kiểm lại tại máy (loại, tên an toàn, có trong manifest, tệp trong thư mục thư viện, đúng sha256) rồi chuyển vào
// DATA_DIR/video-assets/da-xoa của Mac bằng asset-trash.trashAsset → xác nhận → lần gửi danh mục kế không còn mục đó.
// CSDL + DATA_DIR tạm, "máy OWNER" là thư mục tạm riêng; ffmpeg thật tạo tệp thử; gọi thẳng route handler (không mạng thật).
import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "baor-ownertrash-"));
process.env.DATA_DIR = path.join(tmp, "server");
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.AUTH_SECRET = "test-secret-".padEnd(40, "x");
process.env.BAOR_VIDEO_WORKER = "off";
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });
const MAC = path.join(tmp, "mac");
const VA = path.join(MAC, "video-assets");

let auth: typeof import("../src/lib/video/worker-auth");
let route: typeof import("../src/app/api/render-worker/[action]/route");
let rc: typeof import("../src/lib/video/remote-catalog");
let cat: typeof import("../src/lib/video/asset-catalog");
let trash: typeof import("../src/lib/video/asset-trash");
let wire: typeof import("../src/lib/video/catalog-wire");
let oc: typeof import("../scripts/video/owner-catalog.mjs");
let rl: typeof import("../src/lib/rate-limit");
let KEY = "";

const sha = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");
const P = (action: string) => ({ params: Promise.resolve({ action }) });
const H = () => ({ authorization: `Bearer ${KEY}`, "x-baor-worker": "may-bao" });
const ff = (...args: string[]) => execFileSync("ffmpeg", ["-nostdin", "-y", "-v", "error", ...args]);
const OWNER = { email: "owner@baor.test", name: "OWNER" };
const toRoute = (async (url: string | URL, init?: RequestInit) => {
  const u = new URL(String(url));
  const body = init?.body ? Buffer.from(typeof init.body === "string" ? init.body : (init.body as Uint8Array)) : Buffer.alloc(0);
  const req = new Request(u, { method: init?.method ?? "GET", headers: init?.headers, body: init?.body ? body : undefined });
  const action = u.pathname.split("/").pop()!;
  return init?.method === "PUT" ? route.PUT(req, P(action)) : route.POST(req, P(action));
}) as typeof fetch;
const ctx = () => ({ base: "http://may-chu.test", headers: H(), dataDir: MAC, fetchImpl: toRoute });
const readList = (rel: string) => JSON.parse(fs.readFileSync(path.join(VA, rel), "utf8")) as Record<string, unknown>[];
const macEntry = (file: string) => cat.listAssetCatalog({ source: "owner_mac" }).find((x) => x.file === file);

before(async () => {
  auth = await import("../src/lib/video/worker-auth");
  route = await import("../src/app/api/render-worker/[action]/route");
  rc = await import("../src/lib/video/remote-catalog");
  cat = await import("../src/lib/video/asset-catalog");
  trash = await import("../src/lib/video/asset-trash");
  wire = await import("../src/lib/video/catalog-wire");
  oc = await import("../scripts/video/owner-catalog.mjs");
  rl = await import("../src/lib/rate-limit");
  for (const d of ["music", "broll/anh", "sfx-owner/moi"]) fs.mkdirSync(path.join(VA, d), { recursive: true });
  ff("-f", "lavfi", "-i", "sine=frequency=440:duration=3", "-c:a", "libmp3lame", path.join(VA, "music", "bai-a.mp3"));
  ff("-f", "lavfi", "-i", "sine=frequency=1200:duration=1", "-c:a", "pcm_s16le", path.join(VA, "sfx-owner", "Bell.wav"));
  ff("-f", "lavfi", "-i", "sine=frequency=900:duration=1", "-c:a", "pcm_s16le", path.join(VA, "sfx-owner", "moi", "ding.wav"));
  ff("-f", "lavfi", "-i", "nullsrc=s=640x360,geq=random(1)*255:128:128", "-frames:v", "1", path.join(VA, "broll", "anh", "van-phong.jpg"));
  fs.writeFileSync(path.join(tmp, "ngoai.jpg"), "bí mật ngoài thư viện");
  fs.symlinkSync(path.join(tmp, "ngoai.jpg"), path.join(VA, "broll", "lien-ket.jpg"));
  const w = (rel: string, v: unknown) => fs.writeFileSync(path.join(VA, rel), JSON.stringify(v));
  w("music/manifest.json", [{ file: "bai-a.mp3", title: "Bài A", license: "Pixabay Content License", catalogStatus: "ĐỦ-HỒ-SƠ" }, { file: "../../ngoai.mp3", title: "Lạ", license: "x" }]);
  w("sfx-owner/manifest.json", { license: "Tư liệu OWNER", roles: { pop: { "16:9": "Bell.wav" } } });
  w("sfx-owner/moi/manifest.json", [{ file: "ding.wav", keywords: ["ding"], license: "OWNER" }]);
  w("broll/manifest.json", [
    { file: "anh/van-phong.jpg", kind: "image", keywords: ["văn phòng"], license: "Ảnh OWNER", desc: "Góc làm việc" },
    { file: "lien-ket.jpg", kind: "image", keywords: ["x"], license: "OWNER" },
  ]);
  KEY = auth.generateWorkerKey();
  assert.ok((await oc.syncCatalog(ctx())).ok);
});
beforeEach(() => rl?.rateLimiter().reset("render-worker:catalog"));

test("trashTargetOf: chỉ music/ · sfx/ · sfx-owner/moi/ · broll/ với đường dẫn an toàn", () => {
  assert.deepEqual(wire.trashTargetOf("broll/anh/a.jpg"), { kind: "broll", file: "anh/a.jpg" });
  assert.deepEqual(wire.trashTargetOf("sfx-owner/moi/ding.wav"), { kind: "sfx-new", file: "ding.wav" });
  assert.deepEqual(wire.trashTargetOf("music/a.mp3"), { kind: "music", file: "a.mp3" });
  for (const bad of ["sfx-owner/Bell.wav", "tha-vao/nhac/a.mp3", "music/../x.mp3", "broll/.an/a.jpg", "/music/a.mp3", "music/a\u0000.mp3", "broll\\a.jpg", "khac/a.jpg"]) assert.equal(wire.trashTargetOf(bad), null, bad);
});

test("ghi lệnh xoá: chỉ mục xoá được; trạng thái 'Chờ máy dựng xoá' (canTrash tắt, duyệt bị chặn); bấm lại không trùng; Huỷ xoá được", () => {
  assert.equal(rc.requestTrashDecision("broll/khong-co.jpg", OWNER).ok, false, "mục không có");
  assert.equal(rc.requestTrashDecision("sfx-owner/Bell.wav", OWNER).ok, false, "SFX gán vai trò chung không xoá từ web");
  assert.equal(macEntry("sfx-owner/Bell.wav")?.canTrash, false);
  assert.equal(macEntry("music/bai-a.mp3")?.canTrash, true);
  assert.deepEqual(rc.requestTrashDecision("music/bai-a.mp3", OWNER), { ok: true, state: "queued" });
  assert.deepEqual(rc.requestTrashDecision("music/bai-a.mp3", OWNER), { ok: true, state: "already" });
  const e = macEntry("music/bai-a.mp3")!;
  assert.equal(e.pendingDecision?.action, "trash");
  assert.equal(e.canTrash, false);
  assert.equal(e.canApprove, false);
  const ap = rc.requestMusicDecision("music/bai-a.mp3", true, OWNER);
  assert.match(ap.ok ? "" : ap.error, /huỷ xoá trước/, "đang chờ xoá → không ghi duyệt chồng lên");
  const out = rc.pendingDecisions();
  assert.equal(out.length, 1);
  assert.deepEqual({ action: out[0].action, kind: out[0].kind, file: out[0].file, sha256: out[0].sha256 }, { action: "trash", kind: "music", file: "bai-a.mp3", sha256: sha(fs.readFileSync(path.join(VA, "music", "bai-a.mp3"))) });
  assert.deepEqual(rc.cancelAssetDecision("music/bai-a.mp3", OWNER), { ok: true, state: "cancelled" });
  assert.equal(rc.pendingDecisionCount(), 0);
  assert.equal(macEntry("music/bai-a.mp3")?.canTrash, true, "huỷ xong xoá lại được");
  assert.ok(fs.existsSync(path.join(VA, "music", "bai-a.mp3")), "huỷ trước khi áp → máy OWNER không đổi gì");
});

test("áp lệnh xoá: tệp vào da-xoa trên Mac, gỡ khỏi manifest, có bia mộ (library_sync không tải lại), mục rời danh mục web; khôi phục tại máy → hiện lại", async () => {
  assert.equal(rc.requestTrashDecision("broll/anh/van-phong.jpg", OWNER).ok, true);
  const r = await oc.syncCatalog(ctx());
  assert.ok(r.ok && r.applied === 1 && r.failed === 0, JSON.stringify(r));
  assert.equal(fs.existsSync(path.join(VA, "broll", "anh", "van-phong.jpg")), false);
  const t = trash.listTrash(MAC).find((x) => x.file === "anh/van-phong.jpg")!;
  assert.ok(t && t.kind === "broll" && fs.existsSync(path.join(trash.trashDir(MAC), t.trashed)), "tệp nằm trong da-xoa của Mac");
  assert.match(t.by, /web: owner@baor\.test/);
  assert.equal((t.entry as { desc?: string }).desc, "Góc làm việc", "mục danh mục cất nguyên văn để khôi phục");
  assert.equal(readList("broll/manifest.json").some((x) => x.file === "anh/van-phong.jpg"), false, "gỡ khỏi manifest");
  const tomb = JSON.parse(fs.readFileSync(trash.removedFile(MAC), "utf8")) as { kind: string; file: string }[];
  assert.ok(tomb.some((x) => x.kind === "broll" && x.file === "anh/van-phong.jpg"), "bia mộ removed.json");
  assert.equal(macEntry("broll/anh/van-phong.jpg"), undefined, "web không còn hiện mục này");
  assert.equal(rc.pendingDecisionCount(), 0);
  assert.equal(rc.latestDecisions().get("broll/anh/van-phong.jpg")?.status, "applied");
  // Khôi phục tại máy (Tư liệu › Đã xoá của app trên Mac) → lần đồng bộ kế hiện lại
  assert.ok(trash.restoreAsset(MAC, t.id).ok);
  assert.ok((await oc.syncCatalog(ctx())).ok);
  assert.equal(macEntry("broll/anh/van-phong.jpg")?.canTrash, true);
});

test("hiệu ứng mới (sfx-owner/moi) xoá được từ web; lệnh gửi lại sau khi đã xoá (xác nhận mất) → coi là đã áp, không lỗi", async () => {
  assert.equal(rc.requestTrashDecision("sfx-owner/moi/ding.wav", OWNER).ok, true);
  const d = rc.pendingDecisions()[0];
  const first = await oc.applyDecisions(MAC, [d]);
  assert.deepEqual(first, [{ id: d.id, ok: true }]);
  assert.equal(fs.existsSync(path.join(VA, "sfx-owner", "moi", "ding.wav")), false);
  assert.deepEqual(await oc.applyDecisions(MAC, [d]), [{ id: d.id, ok: true }], "đã nằm trong Đã xoá → đã áp");
  // xác nhận lần trước "mất": lần gửi kế không có ack nhưng mục đã rời danh mục → quyết định thành đã áp
  assert.ok((await oc.syncCatalog(ctx())).ok);
  assert.equal(rc.latestDecisions().get("sfx-owner/moi/ding.wav")?.status, "applied");
});

test("tệp trên Mac đổi (sha256 khác) → KHÔNG xoá, báo lỗi; xác nhận 'đã xoá' suông khi mục còn → không tính", async () => {
  const f = path.join(VA, "music", "bai-a.mp3");
  assert.equal(rc.requestTrashDecision("music/bai-a.mp3", OWNER).ok, true);
  ff("-f", "lavfi", "-i", "sine=frequency=220:duration=2", "-c:a", "libmp3lame", f);
  const mf0 = fs.readFileSync(path.join(VA, "music", "manifest.json"), "utf8");
  const r = await oc.syncCatalog(ctx());
  assert.ok(r.ok && r.applied === 0, JSON.stringify(r));
  assert.ok(fs.existsSync(f), "tệp còn nguyên");
  assert.equal(fs.readFileSync(path.join(VA, "music", "manifest.json"), "utf8"), mf0, "manifest không đổi");
  const e = macEntry("music/bai-a.mp3")!;
  assert.equal(e.pendingDecision, null);
  assert.match(e.decisionError ?? "", /đã đổi/);
  // ack ok suông
  assert.equal(rc.requestTrashDecision("music/bai-a.mp3", OWNER).ok, true);
  const d = rc.pendingDecisions()[0];
  const items = (await oc.buildCatalog({ dataDir: MAC })).items;
  const post = await route.POST(new Request("http://may-chu.test/api/render-worker/catalog", { method: "POST", headers: { ...H(), "content-type": "application/json" }, body: JSON.stringify({ items, acks: [{ id: d.id, ok: true }] }) }), P("catalog"));
  assert.equal(post.status, 200);
  assert.match(macEntry("music/bai-a.mp3")!.decisionError ?? "", /chưa đổi/);
  assert.ok(fs.existsSync(f));
});

test("máy dựng chặn lệnh xoá lạ: thoát thư mục (..), tuyệt đối, liên kết ra ngoài, loại lạ, tên không có trong manifest, sha sai", async () => {
  const cur = sha(fs.readFileSync(path.join(VA, "music", "bai-a.mp3")));
  const at = new Date().toISOString();
  const base = { sha256: cur, action: "trash" as const, by: "x", at };
  const acks = await oc.applyDecisions(MAC, [
    { ...base, id: "t1", kind: "music", file: "../../ngoai.mp3" },
    { ...base, id: "t2", kind: "music", file: path.join(VA, "music", "bai-a.mp3") },
    { ...base, id: "t3", kind: "broll", file: "lien-ket.jpg", sha256: sha(fs.readFileSync(path.join(tmp, "ngoai.jpg"))) },
    { ...base, id: "t4", kind: "khac" as "music", file: "bai-a.mp3" },
    { ...base, id: "t5", file: "bai-a.mp3" },
    { ...base, id: "t6", kind: "music", file: "khong-co.mp3" },
    { ...base, id: "t7", kind: "music", file: "bai-a.mp3", sha256: sha("khac") },
    { ...base, id: "t8", kind: "music", file: "bai-a.mp3", sha256: "khong-phai-sha" },
  ]);
  assert.deepEqual(acks.map((a) => a.ok), [false, false, false, false, false, false, false, false], JSON.stringify(acks));
  assert.match(acks[2].error!, /thư mục thư viện/);
  assert.match(acks[6].error!, /sha256/);
  assert.ok(fs.existsSync(path.join(tmp, "ngoai.jpg")), "tệp ngoài thư viện không bị đụng");
  assert.ok(fs.existsSync(path.join(VA, "music", "bai-a.mp3")));
  assert.ok(fs.lstatSync(path.join(VA, "broll", "lien-ket.jpg")).isSymbolicLink());
});

test("P2: máy dựng áp tối đa MAX_TRASH_PER_ROUND lệnh xoá mỗi vòng; lệnh dư không xác nhận (vẫn chờ), có cảnh báo", async () => {
  const dir = path.join(VA, "broll", "lo");
  fs.mkdirSync(dir, { recursive: true });
  const mf = readList("broll/manifest.json");
  const ds = [];
  for (let i = 0; i < 5; i++) {
    const f = path.join(dir, `a${i}.jpg`);
    fs.writeFileSync(f, `anh ${i}`);
    mf.push({ file: `lo/a${i}.jpg`, kind: "image", keywords: ["x"], license: "OWNER" });
    ds.push({ id: `cap${i}`, file: `lo/a${i}.jpg`, kind: "broll" as const, sha256: sha(`anh ${i}`), action: "trash" as const, by: "x", at: new Date().toISOString() });
  }
  fs.writeFileSync(path.join(VA, "broll", "manifest.json"), JSON.stringify(mf));
  assert.equal(oc.MAX_TRASH_PER_ROUND, 20);
  const logs: string[] = [];
  const acks = await oc.applyDecisions(MAC, ds, undefined, { maxTrash: 3, log: (...x) => logs.push(x.join(" ")) });
  assert.deepEqual(acks.map((a) => a.id), ["cap0", "cap1", "cap2"], "chỉ 3 lệnh đầu được áp / xác nhận");
  assert.ok(acks.every((a) => a.ok));
  assert.ok(fs.existsSync(path.join(dir, "a3.jpg")) && fs.existsSync(path.join(dir, "a4.jpg")), "lệnh dư chưa đụng tệp");
  assert.match(logs.join("\n"), /2 lệnh xoá vượt mức 3/);
  const rest = await oc.applyDecisions(MAC, ds.slice(3), undefined, { maxTrash: 3 });
  assert.deepEqual(rest.map((a) => a.ok), [true, true], "vòng sau áp nốt");
});

test("P3: lệnh xoá chỉ 'đã áp' khi máy dựng xác nhận — mục vắng mặt (vd manifest Mac đọc hỏng) không đủ; manifest hỏng → máy dựng báo lỗi, tệp còn", async () => {
  const items = async () => (await oc.buildCatalog({ dataDir: MAC })).items;
  const post = async (its: unknown[]) =>
    route.POST(new Request("http://may-chu.test/api/render-worker/catalog", { method: "POST", headers: { ...H(), "content-type": "application/json" }, body: JSON.stringify({ items: its, acks: [] }) }), P("catalog"));
  assert.ok((await oc.syncCatalog(ctx())).ok);
  // (a) vắng nhiều lần liên tiếp mà không có xác nhận → vẫn chờ
  assert.equal(rc.requestTrashDecision("broll/anh/van-phong.jpg", OWNER).ok, true);
  const without = (await items()).filter((x) => x.path !== "broll/anh/van-phong.jpg");
  for (let i = 0; i < 3; i++) {
    rl.rateLimiter().reset("render-worker:catalog");
    assert.equal((await post(without)).status, 200);
  }
  assert.equal(rc.latestDecisions().get("broll/anh/van-phong.jpg")?.status, "pending", "vắng mặt không có xác nhận → chưa coi là đã xoá");
  // (b) manifest B-roll trên Mac hỏng: máy dựng nhận lại lệnh → không tìm thấy → báo lỗi → thất bại; tệp còn nguyên
  const good = fs.readFileSync(path.join(VA, "broll", "manifest.json"), "utf8");
  fs.writeFileSync(path.join(VA, "broll", "manifest.json"), "{hỏng");
  rl.rateLimiter().reset("render-worker:catalog");
  assert.ok((await oc.syncCatalog(ctx())).ok);
  const d = rc.latestDecisions().get("broll/anh/van-phong.jpg")!;
  assert.equal(d.status, "failed");
  assert.match(d.error ?? "", /Không còn tệp/);
  assert.ok(fs.existsSync(path.join(VA, "broll", "anh", "van-phong.jpg")), "tệp còn nguyên");
  fs.writeFileSync(path.join(VA, "broll", "manifest.json"), good);
  rl.rateLimiter().reset("render-worker:catalog");
  assert.ok((await oc.syncCatalog(ctx())).ok);
  assert.equal(macEntry("broll/anh/van-phong.jpg")?.canTrash, true, "manifest lành lại → mục hiện lại, xoá được");
});
