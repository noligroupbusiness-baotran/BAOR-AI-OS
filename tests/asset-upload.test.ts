// Nút "Tải lên" ở trang Tư liệu (OWNER 26/10/2026): tự chọn ngăn theo đuôi, làm sạch tên tệp, bắt buộc giấy phép, kiểm nội dung theo
// byte đầu, rồi đặt vào thư mục thả + nhận NGAY bằng importDrop — nhạc luôn chờ OWNER nghe duyệt, bỏ chờ ổn định CHỈ cho tệp vừa ghi.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "baor-asset-upload-"));
process.env.DATA_DIR = tmp;
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.AUTH_SECRET = "test-secret-".padEnd(40, "x");
process.env.BAOR_VIDEO_WORKER = "off";

let rules: typeof import("../src/lib/video/asset-upload-rules");
let up: typeof import("../src/lib/video/asset-upload");
let drop: typeof import("../src/lib/video/drop-import");
let music: typeof import("../src/lib/video/music-library");
const now = new Date("2026-10-26T12:00:00Z");
const ID3 = Buffer.concat([Buffer.from("ID3\x04\x00\x00\x00\x00\x00\x00"), Buffer.alloc(32)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypisom"), Buffer.alloc(32)]);
const list = (rel: string) => JSON.parse(fs.readFileSync(path.join(tmp, "video-assets", rel), "utf8")) as Record<string, unknown>[];

before(async () => {
  rules = await import("../src/lib/video/asset-upload-rules");
  up = await import("../src/lib/video/asset-upload");
  drop = await import("../src/lib/video/drop-import");
  music = await import("../src/lib/video/music-library");
});

/** Như route: kiểm → đặt chỗ → "ghi luồng" (ở đây ghi thẳng) → kiểm nội dung → nhận. */
function upload(name: string, target: string, body: Buffer, license = "Mixkit Stock Music Free License", keywords = "") {
  const c = rules.checkUpload({ name, target, license, keywords, size: body.length });
  if (!c.ok) return { error: c.error, status: c.status };
  const reject = up.uploadRejectReason(c);
  if (reject) return { error: reject, status: 400 };
  const s = up.stageUpload(tmp, c.target, c.name);
  fs.writeFileSync(s.tmp, body);
  if (!up.contentOk(s.tmp, c)) {
    fs.rmSync(s.tmp, { force: true });
    return { error: "nội dung sai", status: 415 };
  }
  return { result: up.finishUpload(tmp, s, c, now), staged: s };
}

test("chọn ngăn theo đuôi: âm thanh → Nhạc, ảnh / clip → Ảnh·clip, đuôi lạ → không nhận; ngăn chỉ nhận đúng đuôi của mình", () => {
  assert.equal(rules.defaultTarget("bai-hat.mp3"), "nhac");
  assert.equal(rules.defaultTarget("WHOOSH.WAV"), "nhac", "âm thanh mặc định Nhạc, anh đổi sang Hiệu ứng nếu cần");
  assert.equal(rules.defaultTarget("anh.JPG"), "anh-broll");
  assert.equal(rules.defaultTarget("clip.mov"), "anh-broll");
  for (const bad of ["ghi-chu.pdf", "GIAY-PHEP.txt", "x.exe", "khong-duoi", "x.webm"]) assert.equal(rules.defaultTarget(bad), null, bad);
  assert.equal(rules.targetAccepts("hieu-ung-am-thanh", ".wav"), true);
  assert.equal(rules.targetAccepts("hieu-ung-am-thanh", ".flac"), false, "đúng danh sách DROP_KINDS");
  assert.equal(rules.targetAccepts("nhac", ".jpg"), false);
  const c = rules.checkUpload({ name: "anh.jpg", target: "nhac", license: "OWNER" });
  assert.equal(c.ok, false);
  assert.equal(!c.ok && c.status, 415);
  assert.equal(rules.checkUpload({ name: "a.mp3", target: "../music", license: "OWNER" }).ok, false, "ngăn lạ bị chặn");
});

test("làm sạch tên tệp: bỏ đường dẫn, .., NUL, ký tự điều khiển / cấm; không thành tệp ẩn; giữ chữ có dấu (NFC)", () => {
  assert.equal(rules.sanitizeUploadName("../../etc/x.mp3"), "x.mp3");
  assert.equal(rules.sanitizeUploadName("C:\\Users\\anh\\Nhẹ nhàng.mp3"), "Nhẹ nhàng.mp3");
  assert.equal(rules.sanitizeUploadName("Nhe\u0323 nha\u0300ng.mp3"), "Nhẹ nhàng.mp3", "NFD → NFC");
  assert.equal(rules.sanitizeUploadName(".an.mp3"), "an.mp3");
  assert.equal(rules.sanitizeUploadName("a:b*?<x>|.jpg"), "a-b---x--.jpg");
  assert.equal(rules.sanitizeUploadName("dong\nmoi\t.mp3"), "dong-moi-.mp3", "ký tự điều khiển → -");
  for (const bad of ["a\0.mp3", "..mp3", "...", "..", ".mp3", "x.exe", "x.mp3.exe", "", "thu-muc/"]) assert.equal(rules.sanitizeUploadName(bad), null, JSON.stringify(bad));
  // Giới hạn theo BYTE UTF-8 (chữ có dấu 2–3 byte), không theo độ dài chuỗi
  for (const long of [`${"a".repeat(400)}.mp3`, `${"ệ".repeat(300)}.mp3`, `${"😀".repeat(120)}.wav`]) {
    const n = rules.sanitizeUploadName(long)!;
    assert.ok(new TextEncoder().encode(n).length <= rules.NAME_MAX_BYTES, `${n.length} ký tự / ${new TextEncoder().encode(n).length} byte`);
    assert.ok(!n.includes("\uFFFD") && n.normalize("NFC") === n, "không cắt giữa ký tự");
  }
  assert.throws(() => up.stageUpload(tmp, "nhac", "../x.mp3"), /không hợp lệ/);
  assert.throws(() => up.stageUpload(tmp, "nhac", ".an.mp3"), /không hợp lệ/);
});

test("bắt buộc nguồn / giấy phép; giấy phép, từ khoá gom một dòng (không chèn được dòng .txt giả); quá cỡ → 413", () => {
  for (const license of ["", "   ", "\n\t"]) {
    const c = rules.checkUpload({ name: "a.mp3", target: "nhac", license });
    assert.equal(c.ok, false);
    assert.match(!c.ok ? c.error : "", /nguồn \/ giấy phép/);
  }
  const c = rules.checkUpload({ name: "a.jpg", target: "anh-broll", license: "Tôi tự chụp\nGiấy phép: giả", keywords: "văn phòng,\nTừ khoá: x" });
  assert.ok(c.ok);
  assert.equal(c.ok && c.license, "Tôi tự chụp Giấy phép: giả");
  assert.deepEqual(c.ok && c.keywords, ["văn phòng", "Từ khoá: x"]);
  const big = rules.checkUpload({ name: "a.mp3", target: "nhac", license: "OWNER", size: 26 * 1024 * 1024 });
  assert.equal(!big.ok && big.status, 413);
  assert.equal(rules.checkUpload({ name: "a.mov", target: "anh-broll", license: "OWNER", keywords: "x", size: 900 * 1024 * 1024 }).ok, true, "clip tới 1 GB");
  assert.equal(rules.checkUpload({ name: "a.png", target: "anh-broll", license: "OWNER", keywords: "x", size: 9 * 1024 * 1024 }).ok, false, "ảnh tối đa 8 MB");
});

test("nội dung theo byte đầu, không theo MIME: HTML đổi đuôi .mp3 bị chặn; họ MP4 hợp clip và .m4a, không hợp .mp3", () => {
  assert.equal(rules.sniffMedia(ID3), "audio");
  assert.equal(rules.sniffMedia(JPG), "image");
  assert.equal(rules.sniffMedia(MP4), "mp4");
  assert.equal(rules.sniffMedia(Buffer.from("<html><script>alert(1)</script></html>")), null);
  assert.equal(rules.contentMatches("audio", ".mp3", rules.sniffMedia(Buffer.from("<html><body>xxxxxxxx</body></html>"))), false);
  assert.equal(rules.contentMatches("video", ".mov", "mp4"), true);
  assert.equal(rules.contentMatches("audio", ".m4a", "mp4"), true);
  assert.equal(rules.contentMatches("audio", ".mp3", "mp4"), false);
  assert.equal(rules.contentMatches("image", ".jpg", "audio"), false);
  assert.equal(upload("ngan.mp3", "nhac", Buffer.from("ID3")).status, 415, "tệp quá ngắn (chỉ có chữ ký) bị chặn");
  const r = upload("gia.mp3", "nhac", Buffer.from("<html>".padEnd(64, "x")));
  assert.equal(r.status, 415);
  assert.deepEqual(fs.readdirSync(path.join(drop.dropDir(tmp), "nhac")), [], "tệp tạm bị gỡ, không để lại gì trong ngăn");
});

test("nhạc tải lên vào thư viện ở trạng thái CHỜ OWNER nghe duyệt (không tự duyệt), tên có dấu thành tên bài", () => {
  const r = upload("Nhẹ nhàng buổi sáng.mp3", "nhac", ID3, "Mua trên Epidemic Sound");
  assert.equal(r.result?.state, "imported", JSON.stringify(r));
  assert.equal(r.result?.pending, true);
  assert.equal(r.result?.to, "music/nhe-nhang-buoi-sang.mp3");
  const it = list("music/manifest.json").find((x) => x.file === "nhe-nhang-buoi-sang.mp3")!;
  assert.equal(it.license, "Mua trên Epidemic Sound — chờ OWNER nghe duyệt");
  assert.equal(it.catalogStatus, drop.OWNER_STATUS);
  assert.equal(it.title, "Nhẹ nhàng buổi sáng");
  assert.equal(it.ownerApproved, undefined);
  const t = music.musicLibrary().find((x) => x.file === "nhe-nhang-buoi-sang.mp3")!;
  assert.equal(t.approved, false, "bộ dựng chưa tự dùng");
  assert.ok(!fs.existsSync(r.staged!.final), "tệp đã rời thư mục thả");
  assert.ok(fs.existsSync(path.join(drop.dropDir(tmp), "da-nhan", "nhac", path.basename(r.staged!.sidecar))), "tệp .txt kèm theo cất ở da-nhan/");
});

test("bỏ chờ ổn định CHỈ cho tệp máy chủ vừa ghi — tệp khác vừa chép vào ngăn vẫn chờ lần sau", () => {
  const other = path.join(drop.dropDir(tmp), "nhac", "dang-chep.mp3");
  fs.writeFileSync(other, ID3);
  fs.writeFileSync(path.join(drop.dropDir(tmp), "nhac", "GIAY-PHEP.txt"), "Nhạc OWNER mua\n");
  fs.utimesSync(other, now, now);
  const r = upload("bai-moi.mp3", "nhac", ID3);
  assert.equal(r.result?.state, "imported");
  assert.ok(fs.existsSync(other), "tệp khác (đang chép) ở yên");
  assert.match(drop.lastDropReport(tmp)!.waiting.find((w) => w.file === "dang-chep.mp3")!.reason!, /đang chép/);
  fs.rmSync(other);
  fs.rmSync(path.join(drop.dropDir(tmp), "nhac", "GIAY-PHEP.txt"));
});

test("bài trong danh sách cấm bị chặn từ đầu; trùng tên trong ngăn → tên mới (không đè tệp / .txt cũ)", () => {
  assert.match(upload("lofi_cam_pixabay552792.mp3", "nhac", ID3).error ?? "", /không dùng/);
  assert.match(upload("bai.mp3", "nhac", ID3, "Pixabay 241274").error ?? "", /không dùng/);
  const dir = path.join(drop.dropDir(tmp), "hieu-ung-am-thanh");
  fs.writeFileSync(path.join(dir, "pop.txt"), "ghi chú cũ");
  const s = up.stageUpload(tmp, "hieu-ung-am-thanh", "pop.wav");
  assert.equal(s.rel, "pop-2.wav");
  assert.equal(path.basename(s.sidecar), "pop-2.txt");
  fs.rmSync(path.join(dir, "pop.txt"));
});

test("hiệu ứng → kho sfx-owner/moi; ảnh / clip cần từ khoá (ô Từ khoá hoặc tên tệp có nghĩa)", () => {
  const sfx = upload("whoosh nhanh.wav", "hieu-ung-am-thanh", Buffer.concat([Buffer.from("RIFF\0\0\0\0WAVE"), Buffer.alloc(32)]), "Mixkit Sound Effects Free License");
  assert.equal(sfx.result?.to, "sfx-owner/moi/whoosh-nhanh.wav");
  assert.equal(sfx.result?.pending, false);
  assert.equal(list("sfx-owner/moi/manifest.json").find((x) => x.file === "whoosh-nhanh.wav")!.license, "Mixkit Sound Effects Free License");

  assert.match(upload("IMG_1234.jpg", "anh-broll", JPG, "Tôi tự chụp").error ?? "", /từ khoá/);
  const a = upload("IMG_1234.jpg", "anh-broll", JPG, "Tôi tự chụp", "văn phòng, tặng quà");
  assert.equal(a.result?.state, "imported");
  const img = list("broll/manifest.json").find((x) => x.file === a.result!.to!.replace(/^broll\//, ""))!;
  assert.deepEqual(img.keywords, ["văn phòng", "tặng quà"]);
  assert.equal(img.license, "Tôi tự chụp");
  assert.equal(img.kind, "image");
  const clip = upload("khach-hang-goi-dien.mp4", "anh-broll", MP4, "Tôi tự quay");
  assert.equal(clip.result?.state, "imported");
  assert.equal(list("broll/manifest.json").find((x) => x.file === clip.result!.to!.replace(/^broll\//, ""))!.kind, "video");
});

test("phản biện P1: tên tải lên không trùng THÂN tên tệp đang chờ trong ngăn (mọi đuôi, không phân biệt hoa thường) → .txt không cho mượn giấy phép", () => {
  const dir = path.join(drop.dropDir(tmp), "anh-broll");
  const waiting = path.join(dir, "Van-Phong.JPG"); // đang chờ: KHÔNG có giấy phép
  fs.writeFileSync(waiting, JPG);
  const old = new Date(now.getTime() - 3600_000);
  fs.utimesSync(waiting, old, old);
  const r = upload("van-phong.png", "anh-broll", Buffer.concat([Buffer.from([0x89]), Buffer.from("PNG\r\n\x1a\n"), Buffer.alloc(32)]), "Tôi tự chụp", "văn phòng");
  assert.equal(r.result?.state, "imported", JSON.stringify(r));
  assert.equal(r.staged?.rel, "van-phong-2.png", "thân tên khác tệp đang chờ");
  assert.ok(fs.existsSync(waiting), "tệp đang chờ (thiếu giấy phép) vẫn ở yên, không được nhận");
  assert.ok(!list("broll/manifest.json").some((x) => String(x.license) === "Tôi tự chụp" && /van-phong\.jpg$/i.test(String(x.file))), "không mượn giấy phép");
  fs.rmSync(waiting);

  const nh = path.join(drop.dropDir(tmp), "nhac");
  const bai = path.join(nh, "bai.aac");
  fs.writeFileSync(bai, Buffer.concat([Buffer.from([0xff, 0xf1]), Buffer.alloc(32)]));
  fs.utimesSync(bai, old, old);
  const m = upload("bai.mp3", "nhac", ID3, "Tôi tự sáng tác");
  assert.equal(m.result?.state, "imported");
  assert.ok(fs.existsSync(bai), "bai.aac (không giấy phép) vẫn chờ");
  assert.ok(!list("music/manifest.json").some((x) => x.file === "bai.aac"));
  fs.rmSync(bai);
});

test("không đè: tệp chen vào đúng tên đã chọn giữa lúc tải → chọn tên khác; tệp tạm tải dở quá 1 ngày được dọn", () => {
  const c = rules.checkUpload({ name: "chen.mp3", target: "nhac", license: "OWNER", size: ID3.length });
  assert.ok(c.ok);
  const s = up.stageUpload(tmp, "nhac", c.ok ? c.name : "");
  fs.writeFileSync(s.tmp, ID3);
  fs.writeFileSync(s.final, "tệp của người khác"); // chen vào sau khi chọn tên
  const old = new Date(now.getTime() - 3600_000);
  fs.utimesSync(s.final, old, old);
  const intruder = s.final;
  const r = up.finishUpload(tmp, s, c as Extract<typeof c, { ok: true }>, now);
  assert.notEqual(r.file, "chen.mp3");
  assert.equal(fs.readFileSync(intruder, "utf8"), "tệp của người khác", "không ghi đè");
  fs.rmSync(intruder);

  const dir = path.join(drop.dropDir(tmp), "nhac");
  const stale = path.join(dir, ".tai-len-cu.mp3.part");
  const fresh = path.join(dir, ".tai-len-moi.mp3.part");
  fs.writeFileSync(stale, "x");
  fs.writeFileSync(fresh, "x");
  const twoDays = new Date(Date.now() - 2 * 86_400_000);
  fs.utimesSync(stale, twoDays, twoDays);
  up.stageUpload(tmp, "nhac", "bat-ky.mp3");
  assert.ok(!fs.existsSync(stale), "tệp tạm quá 1 ngày bị dọn");
  assert.ok(fs.existsSync(fresh), "tệp đang tải dở (mới) giữ nguyên");
  fs.rmSync(fresh);
});

test("Origin thiếu / null / sai dạng / khác host → bị từ chối (403), không ném lỗi", async () => {
  const { sameOrigin } = await import("../src/lib/same-origin");
  const req = (origin?: string, host = "mkt.baor.vn") => new Request("http://x/api", { method: "POST", headers: { ...(origin !== undefined ? { origin } : {}), host } });
  assert.equal(sameOrigin(req("https://mkt.baor.vn")), true);
  for (const o of [undefined, "null", "::::", "https://evil.test", "not a url"]) assert.equal(sameOrigin(req(o)), false, String(o));
});
