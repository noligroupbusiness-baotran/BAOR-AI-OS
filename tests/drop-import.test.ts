// Thư mục thả tư liệu (OWNER 25/10/2026): tải tay từ Drive, chép vào tha-vao/<ngăn>/ → máy tự nhận vào thư viện bộ dựng.
// Luật: không giấy phép → chưa nhận; ảnh / clip cần từ khoá; nhạc chờ OWNER nghe duyệt; tệp đang chép để lần sau; chạy lại không nhận trùng.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "baor-drop-"));
process.env.DATA_DIR = tmp;
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.AUTH_SECRET = "test-secret-".padEnd(40, "x");
process.env.BAOR_VIDEO_WORKER = "off";

let drop: typeof import("../src/lib/video/drop-import");
let music: typeof import("../src/lib/video/music-library");
const now = new Date("2026-10-25T12:00:00Z");
const old = new Date(now.getTime() - 10 * 60_000);

function put(rel: string, content = "x", mtime = old) {
  const f = path.join(tmp, "video-assets", "tha-vao", rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, content);
  fs.utimesSync(f, mtime, mtime);
  return f;
}
const list = (rel: string) => JSON.parse(fs.readFileSync(path.join(tmp, "video-assets", rel), "utf8")) as Record<string, unknown>[];

before(async () => {
  drop = await import("../src/lib/video/drop-import");
  music = await import("../src/lib/video/music-library");
});

test("tạo sẵn 3 ngăn + hướng dẫn", () => {
  const root = drop.ensureDropFolders(tmp);
  for (const k of ["anh-broll", "nhac", "hieu-ung-am-thanh"]) assert.ok(fs.statSync(path.join(root, k)).isDirectory());
  assert.match(fs.readFileSync(path.join(root, "HUONG-DAN.txt"), "utf8"), /GIAY-PHEP\.txt/);
});

test("từ khoá từ thư mục con + tên tệp, bỏ chữ máy ảnh đặt sẵn và số", () => {
  assert.deepEqual(drop.keywordsFromPath("van-phong/tang-qua-20-10.jpg"), ["van phong", "tang qua"]);
  assert.deepEqual(drop.keywordsFromPath("IMG_1234.jpg"), []);
  assert.deepEqual(drop.keywordsFromPath("Văn phòng/IMG_9.jpg"), ["văn phòng"]);
});

test("ảnh có giấy phép + từ khoá → vào thư viện B-roll; thiếu giấy phép / từ khoá / đang chép → ở yên chỗ cũ và báo lý do", () => {
  put("anh-broll/van-phong/GIAY-PHEP.txt", "Ảnh tự chụp — OWNER sở hữu\n");
  const ok = put("anh-broll/van-phong/tang-qua-20-10.jpg");
  const noKw = put("anh-broll/van-phong/../IMG_1234.jpg");
  const copying = put("anh-broll/van-phong/dang-chep.jpg", "x", now);
  put("anh-broll/khong-giay-phep/IMG_5.png");
  const r = drop.importDrop(tmp, now);
  assert.equal(r.imported.length, 1);
  assert.ok(!fs.existsSync(ok), "tệp đã nhận rời thư mục thả");
  const lib = list("broll/manifest.json");
  const it = lib.find((x) => String(x.file).startsWith("tha-vao/tang-qua"))!;
  assert.deepEqual(it.keywords, ["van phong", "tang qua"]);
  assert.equal(it.license, "Ảnh tự chụp — OWNER sở hữu");
  assert.equal(it.kind, "image");
  assert.ok(fs.existsSync(path.join(tmp, "video-assets", "broll", String(it.file))));
  const why = Object.fromEntries(r.waiting.map((w) => [w.file, w.reason ?? ""]));
  assert.match(why["IMG_1234.jpg"], /thiếu giấy phép/, "ngăn gốc không có GIAY-PHEP.txt");
  assert.match(why["khong-giay-phep/IMG_5.png"], /thiếu giấy phép/);
  assert.match(why["van-phong/dang-chep.jpg"], /đang chép/);
  assert.ok(fs.existsSync(noKw) && fs.existsSync(copying), "tệp chưa đủ điều kiện ở yên chỗ cũ");
});

test("tệp .txt cùng tên: Từ khoá / Mô tả / Giấy phép; .txt được cất vào da-nhan/", () => {
  const f = put("anh-broll/clip-01.mp4");
  const sc = put("anh-broll/clip-01.txt", "Từ khoá: chào hỏi, khách hàng\nMô tả: Nhân viên cúi chào khách ở quầy\nGiấy phép: Clip tự quay — OWNER\n");
  const r = drop.importDrop(tmp, now);
  assert.ok(r.imported.some((i) => i.file === "clip-01.mp4"));
  assert.ok(!fs.existsSync(f) && !fs.existsSync(sc));
  assert.ok(fs.existsSync(path.join(drop.dropDir(tmp), "da-nhan", "anh-broll", "clip-01.txt")));
  const it = list("broll/manifest.json").find((x) => String(x.file).startsWith("tha-vao/clip-01"))!;
  assert.equal(it.kind, "video");
  assert.equal(it.desc, "Nhân viên cúi chào khách ở quầy");
  assert.equal(it.license, "Clip tự quay — OWNER");
  assert.ok((it.keywords as string[]).includes("chào hỏi"));
  assert.ok(!r.waiting.some((w) => w.file === "clip-01.txt"), "không báo nhầm .txt đã cất (phản biện P2-2)");
});

test("không chép đè: trùng tên trong thư viện → tên mới; chạy lại không nhận trùng", () => {
  put("anh-broll/van-phong/tang-qua-20-10.jpg", "y");
  const r = drop.importDrop(tmp, now);
  assert.ok(r.imported.some((i) => i.to === "broll/tha-vao/tang-qua-20-10-2.jpg"));
  const again = drop.importDrop(tmp, now);
  assert.equal(again.imported.length, 0);
  assert.equal(list("broll/manifest.json").filter((x) => String(x.file).startsWith("tha-vao/tang-qua")).length, 2);
});

test("nhạc: vào thư viện ở trạng thái chờ nghe duyệt (bộ dựng chưa tự dùng); OWNER duyệt được, bỏ duyệt được", () => {
  put("nhac/GIAY-PHEP.txt", "Nhạc mua trên Epidemic Sound, giấy phép đến 12/2027");
  put("nhac/nhe-nhang/Buoi Sang.mp3");
  const r = drop.importDrop(tmp, now);
  assert.ok(r.imported.some((i) => i.kind === "nhac"));
  const t = music.musicLibrary().find((x) => x.file === "buoi-sang.mp3")!;
  assert.ok(t, "có trong thư viện nhạc");
  assert.equal(t.approved, false);
  assert.match(t.license, /chờ OWNER nghe duyệt/);
  assert.equal(t.genre, "nhe-nhang");
  assert.deepEqual(music.approveMusic("buoi-sang.mp3", "owner@baor.vn", now), { ok: true });
  assert.equal(music.musicLibrary().find((x) => x.file === "buoi-sang.mp3")!.approved, true);
  assert.deepEqual(music.unapproveMusic("buoi-sang.mp3"), { ok: true });
});

test("hiệu ứng âm thanh: vào kho sfx-owner/moi (chưa gán vai trò trong bộ dựng); sai loại tệp → báo", () => {
  put("hieu-ung-am-thanh/GIAY-PHEP.txt", "Kho hiệu ứng âm thanh của OWNER");
  put("hieu-ung-am-thanh/whoosh-nhanh.wav");
  put("hieu-ung-am-thanh/ghi-chu.pdf");
  const r = drop.importDrop(tmp, now);
  assert.ok(r.imported.some((i) => i.to === "sfx-owner/moi/whoosh-nhanh.wav"));
  assert.ok(list("sfx-owner/moi/manifest.json").some((x) => x.file === "whoosh-nhanh.wav"));
  assert.match(r.waiting.find((w) => w.file === "ghi-chu.pdf")!.reason!, /không phải loại tệp/);
  assert.equal(drop.lastDropReport(tmp)?.imported.length, r.imported.length, "báo cáo lần gần nhất lưu lại cho Cài đặt");
});

test("phản biện P1-2: một tệp lỗi giữa chừng không làm hỏng cả mẻ — tệp đã nhận có trong danh mục, không có tệp mồ côi", () => {
  put("anh-broll/le/GIAY-PHEP.txt", "Ảnh tự chụp — OWNER");
  const good = put("anh-broll/le/a-van-phong.jpg");
  put("anh-broll/le/b-khach.jpg");
  // ".txt" kèm theo là THƯ MỤC → đọc lỗi EISDIR (lỗi ở mọi quyền, kể cả root)
  fs.mkdirSync(path.join(tmp, "video-assets", "tha-vao", "anh-broll", "le", "b-khach.txt"));
  const r = drop.importDrop(tmp, now);
  assert.ok(r.imported.some((i) => i.file === "le/a-van-phong.jpg"));
  assert.ok(!fs.existsSync(good));
  const it = list("broll/manifest.json").find((x) => String(x.file).startsWith("tha-vao/a-van-phong"));
  assert.ok(it, "tệp đã chuyển phải có trong danh mục");
  assert.match(r.waiting.find((w) => w.file === "le/b-khach.jpg")!.reason!, /lỗi khi nhận/);
  assert.ok(drop.lastDropReport(tmp)?.at, "vẫn ghi báo cáo");
});

test("phản biện P2-1: danh mục hỏng → không chuyển tệp, không ghi đè danh mục bằng danh sách mới", () => {
  const mf = path.join(tmp, "video-assets", "music", "manifest.json");
  const before = fs.readFileSync(mf, "utf8");
  fs.writeFileSync(mf, "{hỏng");
  try {
    const f = put("nhac/hong/bai-moi.mp3");
    const r = drop.importDrop(tmp, now);
    assert.ok(fs.existsSync(f), "tệp ở yên thư mục thả");
    assert.ok(!fs.existsSync(path.join(tmp, "video-assets", "music", "bai-moi.mp3")), "không có tệp mồ côi trong thư viện");
    assert.match(r.waiting.find((w) => w.file === "hong/bai-moi.mp3")!.reason!, /lỗi khi nhận/);
    assert.equal(fs.readFileSync(mf, "utf8"), "{hỏng", "không ghi đè danh mục hỏng");
  } finally {
    fs.writeFileSync(mf, before);
  }
});

test("phản biện P3: tên toàn chữ không Latin không thành tệp ẩn, giữ đuôi", () => {
  put("hieu-ung-am-thanh/日本.wav");
  const r = drop.importDrop(tmp, now);
  const to = r.imported.find((i) => i.file === "日本.wav")!.to!;
  assert.match(to, /^sfx-owner\/moi\/tep-[a-z0-9]+\.wav$/);
});
