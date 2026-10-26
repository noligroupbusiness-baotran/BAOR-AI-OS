// Phản biện bảo mật 26/10/2026 cho đồng bộ kho tư liệu máy OWNER (CHANGES_REQUIRED):
//   P1 loại tệp xem trước "constructor" / "__proto__" lọt qua `in` → mất giới hạn cỡ; thân gom hết vào RAM; tổng 512 MB chỉ kiểm sau khi đọc
//   P2 bảng remote_assets chỉ tăng
//   P3 lý do chờ lộ đường dẫn tuyệt đối; dọn tệp xem trước xoá cả .part đang ghi; tổng dung lượng stat mọi tệp mỗi PUT; giới hạn thân
//      danh mục có thể chặn kho thật
// CSDL + DATA_DIR tạm, gọi thẳng route handler.
import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "baor-ownercat-h-"));
process.env.DATA_DIR = path.join(tmp, "server");
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.AUTH_SECRET = "test-secret-".padEnd(40, "x");
process.env.BAOR_VIDEO_WORKER = "off";
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });

let auth: typeof import("../src/lib/video/worker-auth");
let route: typeof import("../src/app/api/render-worker/[action]/route");
let rc: typeof import("../src/lib/video/remote-catalog");
let wire: typeof import("../src/lib/video/catalog-wire");
let oc: typeof import("../scripts/video/owner-catalog.mjs");
let rl: typeof import("../src/lib/rate-limit");
let dbm: typeof import("../src/db");
let KEY = "";

const sha = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");
const U = "http://may-chu.test/api/render-worker";
const P = (action: string) => ({ params: Promise.resolve({ action }) });
const H = () => ({ authorization: `Bearer ${KEY}`, "x-baor-worker": "may-bao" });
const postCatalog = (body: unknown) => route.POST(new Request(`${U}/catalog`, { method: "POST", headers: { ...H(), "content-type": "application/json" }, body: JSON.stringify(body) }), P("catalog"));
const it = (p: string, over: Record<string, unknown> = {}) => ({ path: p, kind: "music", media: "audio", title: "A", sha256: sha(p), ...over });
const jpg = (n: number, seed = "x") => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(n - 4, seed)]);
/** Luồng đếm số byte thật sự bị đọc (chứng minh máy chủ dừng đọc sớm). */
function counted(total: number, chunk = 64 * 1024) {
  const st = { pulled: 0 };
  let sent = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(c) {
      if (sent >= total) return c.close();
      const n = Math.min(chunk, total - sent);
      const b = new Uint8Array(n);
      if (sent === 0) b.set([0xff, 0xd8, 0xff, 0xe0]);
      sent += n;
      st.pulled += n;
      c.enqueue(b);
    },
  });
  return { stream, st };
}

before(async () => {
  auth = await import("../src/lib/video/worker-auth");
  route = await import("../src/app/api/render-worker/[action]/route");
  rc = await import("../src/lib/video/remote-catalog");
  wire = await import("../src/lib/video/catalog-wire");
  oc = await import("../scripts/video/owner-catalog.mjs");
  rl = await import("../src/lib/rate-limit");
  dbm = await import("../src/db");
  KEY = auth.generateWorkerKey();
});
beforeEach(() => {
  rl?.rateLimiter().reset("render-worker:catalog");
  rl?.rateLimiter().reset("render-worker:preview");
});

test("P1: loại tệp xem trước là khoá nguyên mẫu (constructor / __proto__ / toString…) → từ chối ở danh mục và ở PUT", async () => {
  const big = Buffer.alloc(5 * 1024 * 1024, 0);
  big.set([0x49, 0x44, 0x33]); // "ID3"
  for (const type of ["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf"]) {
    const r = await postCatalog({ items: [it("music/a.mp3", { preview: { sha256: sha(big), type, bytes: 1 } })] });
    assert.equal(r.status, 400, `danh mục nhận loại ${type}`);
    assert.equal(wire.isPreviewType(type), false, type);
  }
  const put = await route.PUT(new Request(`${U}/preview?sha=${sha(big)}&type=constructor`, { method: "PUT", headers: H(), body: new Uint8Array(big) }), P("preview"));
  assert.equal(put.status, 400, "PUT type=constructor 5 MB phải bị từ chối");
  assert.ok(!fs.existsSync(rc.previewsDir()) || fs.readdirSync(rc.previewsDir()).length === 0, "không ghi tệp nào");
});

test("P1: Content-Length quá cỡ → 413 không đọc thân; không có Content-Length → đọc dạng luồng, cắt ngay khi vượt", async () => {
  const good = jpg(1000, "g");
  assert.equal((await postCatalog({ items: [it("music/a.mp3", { preview: { sha256: sha(good), type: "jpg", bytes: good.length } })] })).status, 200);
  const a = counted(5 * 1024 * 1024);
  const r1 = await rc.savePreview(sha(good), "jpg", a.stream, String(5 * 1024 * 1024));
  assert.deepEqual([r1.ok, r1.ok ? 0 : r1.status], [false, 413]);
  assert.equal(a.st.pulled <= 64 * 1024, true, `đã đọc ${a.st.pulled} B dù Content-Length quá cỡ`);
  const b = counted(5 * 1024 * 1024);
  const r2 = await rc.savePreview(sha(good), "jpg", b.stream, null);
  assert.deepEqual([r2.ok, r2.ok ? 0 : r2.status], [false, 413]);
  assert.ok(b.st.pulled <= wire.PREVIEW_TYPES.jpg.maxBytes + 2 * 64 * 1024, `đọc ${b.st.pulled} B — phải dừng ngay khi vượt`);
  assert.equal(fs.existsSync(rc.previewsDir()) ? fs.readdirSync(rc.previewsDir()).filter((f) => f.endsWith(".part")).length : 0, 0, "không sót tệp tạm");
});

test("P1/P3: tổng dung lượng kiểm TRƯỚC khi nhận và cộng dồn có giữ chỗ — PUT song song không vượt trần", async () => {
  const xs = [jpg(50_000, "1"), jpg(50_000, "2"), jpg(50_000, "3")];
  assert.equal((await postCatalog({ items: xs.map((x, i) => it(`music/p${i}.mp3`, { preview: { sha256: sha(x), type: "jpg", bytes: x.length } })) })).status, 200);
  const base = rc.previewBytes();
  // Trần chỉ đủ cho 1 tệp nữa: 3 PUT cùng lúc → đúng 1 tệp được nhận
  const rs = await Promise.all(xs.map((x) => rc.savePreview(sha(x), "jpg", new Blob([new Uint8Array(x)]).stream(), String(x.length), { maxTotal: base + 60_000 })));
  assert.equal(rs.filter((r) => r.ok).length, 1, JSON.stringify(rs));
  assert.ok(rs.filter((r) => !r.ok).every((r) => !r.ok && r.status === 507));
  assert.ok(rc.previewBytes() <= base + 60_000);
  // Trần đã đầy → từ chối không đọc thân
  const c = counted(50_000);
  const r = await rc.savePreview(sha(xs[1]), "jpg", c.stream, null, { maxTotal: base + 60_000 });
  assert.equal(r.ok ? 0 : r.status, 507);
  assert.equal(c.st.pulled, 0, "không đọc thân khi kho đã đầy");
  // Tổng dung lượng giữ trong bộ nhớ, khớp đĩa
  const disk = fs.readdirSync(rc.previewsDir()).reduce((n, f) => n + fs.statSync(path.join(rc.previewsDir(), f)).size, 0);
  assert.equal(rc.previewBytes(), disk);
});

test("P2: 5 lần gửi × 1000 đường dẫn mới → bảng không phình vô hạn (xoá mục gỡ quá 7 ngày; trần số dòng)", async () => {
  const db = dbm.getDb();
  const rows = () => db.select().from(dbm.schema.remoteAssets).all().length;
  const batch = (k: number) => ({ hash: "", items: Array.from({ length: 1000 }, (_, i) => it(`music/r${k}-${i}.mp3`)) });
  // a) mỗi lần cách nhau 8 ngày: mục gỡ quá 7 ngày bị xoá hẳn
  let t = Date.parse("2026-11-01T00:00:00Z");
  for (let k = 0; k < 5; k++, t += 8 * 86_400_000) {
    const v = rc.validateCatalog(batch(k));
    assert.ok(v.ok);
    assert.ok(rc.syncRemoteCatalog(v.req, "w", new Date(t)).ok);
  }
  assert.ok(rows() <= 2000, `còn ${rows()} dòng (1000 đang hiện + 1000 vừa gỡ)`);
  // b) gửi dồn trong một ngày, trần 2500 dòng: dòng đã gỡ cũ nhất bị xoá trước, bảng không vượt trần
  for (let k = 10; k < 15; k++) {
    const v = rc.validateCatalog(batch(k));
    assert.ok(v.ok);
    const r = rc.syncRemoteCatalog(v.req, "w", new Date(t), { maxRows: 2500 });
    assert.ok(r.ok);
  }
  assert.ok(rows() <= 2500, `còn ${rows()} dòng`);
  // c) danh mục đang hiện vượt trần → từ chối rõ ràng, không ghi gì
  const v = rc.validateCatalog(batch(20));
  assert.ok(v.ok);
  const n0 = rows();
  const r = rc.syncRemoteCatalog(v.req, "w", new Date(t), { maxRows: 900 });
  assert.equal(r.ok, false);
  assert.match(r.ok ? "" : r.error, /vượt/);
  assert.equal(rows(), n0);
});

test("P3: lý do chờ / lỗi không lộ đường dẫn tuyệt đối (máy dựng xoá trước khi gửi, máy chủ lọc lại); URL giữ nguyên", async () => {
  const msg = "lỗi khi nhận: ENOENT: no such file or directory, rename '/Users/bao/BAOR/data/video-assets/tha-vao/nhac/a.mp3' -> '/Users/bao/BAOR/data/video-assets/music/a.mp3'";
  const clean = wire.stripAbsPaths(msg);
  assert.ok(!clean.includes("/Users"), clean);
  assert.match(clean, /a\.mp3/);
  assert.equal(wire.stripAbsPaths("https://pixabay.com/music/x-963/ · Drive: HINH-ANH/ẢNH VĂN PHÒNG"), "https://pixabay.com/music/x-963/ · Drive: HINH-ANH/ẢNH VĂN PHÒNG");
  assert.ok(!wire.stripAbsPaths("C:\\Users\\bao\\a.mp3 hỏng").includes("Users"));
  // máy dựng: báo cáo thả vào có lỗi kèm đường dẫn tuyệt đối
  const mac = path.join(tmp, "mac");
  fs.mkdirSync(path.join(mac, "video-assets", "tha-vao"), { recursive: true });
  fs.writeFileSync(path.join(mac, "video-assets", "tha-vao", "BAO-CAO.json"), JSON.stringify({ at: "x", imported: [], waiting: [{ kind: "nhac", file: "a.mp3", reason: msg }] }));
  const built = await oc.buildCatalog({ dataDir: mac });
  assert.ok(!JSON.stringify(built.items).includes("/Users"), JSON.stringify(built.items));
  // máy chủ: lọc lại trường lý do
  const v = rc.validateCatalog({ items: [{ path: "tha-vao/nhac/a.mp3", kind: "drop", media: "audio", title: "a.mp3", sha256: "", reason: msg }, it("music/b.mp3", { excludeReason: msg })] });
  assert.ok(v.ok);
  assert.ok(!JSON.stringify(v.req.items).includes("/Users"));
});

test("P3: dọn tệp xem trước không xoá tệp .part đang ghi (mới); .part cũ thì dọn", () => {
  fs.mkdirSync(rc.previewsDir(), { recursive: true });
  const fresh = path.join(rc.previewsDir(), `${sha("f")}.jpg.1.abc.part`);
  const old = path.join(rc.previewsDir(), `${sha("o")}.jpg.1.abc.part`);
  fs.writeFileSync(fresh, "x");
  fs.writeFileSync(old, "x");
  const hourAgo = new Date(Date.now() - 60 * 60_000);
  fs.utimesSync(old, hourAgo, hourAgo);
  rc.gcPreviews();
  assert.ok(fs.existsSync(fresh), "tệp đang ghi còn nguyên");
  assert.ok(!fs.existsSync(old), "tệp tạm cũ bị dọn");
  fs.rmSync(fresh);
});

test("P3: kho thật lớn (5000 mục, giấy phép dài, chữ Việt) vừa giới hạn thân; trường hợp xấu nhất máy dựng tự rút gọn cho vừa", async () => {
  const lic = "Tư liệu OWNER trên Drive (thư viện tư liệu / HINH-ANH / ẢNH VĂN PHÒNG BT) — OWNER xác nhận quyền dùng thương mại và sự đồng ý của người xuất hiện — OWNER (chat 21/10/2026): duyệt cho làm hết — kiểm hồ sơ giấy phép ĐỦ";
  const real = Array.from({ length: 5000 }, (_, i) => ({ ...it(`broll/anh/van-phong-${i}.jpg`, { kind: "broll", media: "image", title: `văn phòng ${i}` }), license: `${lic} ${i}`, source: "Drive: HINH-ANH/ẢNH VĂN PHÒNG BT/20.10 tặng quà", desc: "Nhóm 8 nhân sự ngồi sofa văn phòng cầm quà và hoa ngày 20/10, cười vui", tags: ["tặng quà", "phụ nữ"], preview: { sha256: sha(`p${i}`), type: "jpg" as const, bytes: 40_000 } }));
  const fitReal = oc.fitCatalogBody(real as never);
  assert.equal(fitReal.trimmed, 0, "kho thật không phải rút gọn");
  assert.ok(fitReal.bytes <= wire.CATALOG_LIMITS.maxBodyBytes, `${fitReal.bytes} B`);
  const r = await postCatalog({ hash: "", items: fitReal.items });
  assert.equal(r.status, 200, await r.clone().text());
  // xấu nhất: mọi trường dài tối đa → rút gọn tới khi vừa, vẫn hợp lệ ở máy chủ
  const worst = real.map((x) => ({ ...x, title: "ệ".repeat(300), license: "ệ".repeat(2000), source: "ệ".repeat(500), desc: "ệ".repeat(1000), excludeReason: "ệ".repeat(500), tags: Array.from({ length: 30 }, () => "ệ".repeat(80)) }));
  const fitWorst = oc.fitCatalogBody(worst as never);
  assert.ok(fitWorst.bytes <= wire.CATALOG_LIMITS.maxBodyBytes, `${fitWorst.bytes} B`);
  assert.ok(fitWorst.trimmed > 0);
  assert.equal(rc.validateCatalog({ hash: "", items: fitWorst.items }).ok, true);
});

test("P2 (vòng 2): lỗi đĩa khi nhận tệp xem trước (EACCES) không làm rò phần giữ chỗ — trả quyền lại thì PUT hợp lệ được nhận", async () => {
  const xs = [jpg(30_000, "e1"), jpg(30_000, "e2")];
  assert.equal((await postCatalog({ items: xs.map((x, i) => it(`music/eacces${i}.mp3`, { preview: { sha256: sha(x), type: "jpg", bytes: x.length } })) })).status, 200);
  fs.mkdirSync(rc.previewsDir(), { recursive: true });
  fs.chmodSync(rc.previewsDir(), 0o500);
  try {
    for (let i = 0; i < 3; i++) {
      const r = await rc.savePreview(sha(xs[0]), "jpg", new Blob([new Uint8Array(xs[0])]).stream(), String(xs[0].length)).catch((e: Error) => ({ ok: false as const, status: 0, error: e.message }));
      assert.equal(r.ok, false, "thư mục không ghi được → không nhận");
    }
  } finally {
    fs.chmodSync(rc.previewsDir(), 0o700);
  }
  assert.equal((globalThis as unknown as { __baorPreviewUsage: { reserved: number } }).__baorPreviewUsage.reserved, 0, "giữ chỗ phải được trả lại");
  const cap = rc.previewBytes() + xs[1].length + 10;
  const ok = await rc.savePreview(sha(xs[1]), "jpg", new Blob([new Uint8Array(xs[1])]).stream(), String(xs[1].length), { maxTotal: cap });
  assert.equal(ok.ok, true, JSON.stringify(ok));
});

test("P3 (vòng 2): rút gọn thân KHÔNG cắt license / source của nhạc (máy chủ dùng cho luật duyệt / BANNED); chữ hiển thị thì được cắt", () => {
  const lic = `${"Pixabay Content License — hồ sơ kiểm ".repeat(30)}— kho tư liệu: ĐỦ-HỒ-SƠ — chờ OWNER nghe duyệt`;
  const src = `${"https://pixabay.com/music/".padEnd(450, "x")}-552792`;
  const music = Array.from({ length: 1200 }, (_, i) => ({ ...it(`music/m${i}.mp3`), catalogStatus: "ĐỦ-HỒ-SƠ", license: lic, source: src, title: "ệ".repeat(300), desc: "ệ".repeat(1000), tags: Array.from({ length: 30 }, () => "ệ".repeat(80)) }));
  const broll = Array.from({ length: 3000 }, (_, i) => ({ ...it(`broll/b${i}.jpg`, { kind: "broll", media: "image" }), license: "ệ".repeat(2000), source: "ệ".repeat(500), title: "ệ".repeat(300), desc: "ệ".repeat(1000) }));
  const fit = oc.fitCatalogBody([...music, ...broll] as never);
  assert.ok(fit.trimmed > 0 && fit.bytes <= wire.CATALOG_LIMITS.maxBodyBytes, `${fit.trimmed} / ${fit.bytes} B`);
  const out = fit.items as unknown as typeof music;
  for (const x of out.filter((y) => y.path.startsWith("music/"))) {
    assert.equal(x.license, lic, "license nhạc nguyên vẹn");
    assert.equal(x.source, src, "source nhạc nguyên vẹn");
  }
  assert.ok(out.find((y) => y.path.startsWith("music/"))!.title.length < 300, "tiêu đề nhạc vẫn được rút gọn");
  assert.ok(out.find((y) => y.path.startsWith("broll/"))!.license.length < 2000, "giấy phép ảnh được rút gọn");
  // Máy chủ đánh giá đúng như manifest đầy đủ
  const v = rc.validateCatalog({ hash: "", items: fit.items });
  assert.ok(v.ok);
  const raw = rc.rawMusicOf({ id: "music/m0.mp3", meta: JSON.stringify(v.req.items[0]) });
  assert.equal(String(raw.license).endsWith("chờ OWNER nghe duyệt"), true);
  assert.equal(String(raw.source).includes("552792"), true, "BANNED vẫn nhận ra");
});
