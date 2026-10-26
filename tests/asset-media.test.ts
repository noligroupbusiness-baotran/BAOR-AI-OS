// Trang Tư liệu: route xem ảnh / clip B-roll, nghe thử nhạc / hiệu ứng âm thanh chỉ phát tệp NẰM TRONG thư mục thư viện
// (chặn "..", đường dẫn tuyệt đối, NUL, liên kết tượng trưng ra ngoài, đuôi lạ, tệp ngoài manifest). Thư mục dữ liệu tạm.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "baor-asset-media-"));
process.env.DATA_DIR = tmp;
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.AUTH_SECRET = "test-secret-".padEnd(40, "x");
process.env.BAOR_VIDEO_WORKER = "off";

let jobs: typeof import("../src/lib/video/jobs");
let ml: typeof import("../src/lib/video/music-library");
let safe: typeof import("../src/lib/video/safe-path");
let media: typeof import("../src/lib/media-response");
let thumbs: typeof import("../src/lib/video/thumb-cache");
const outside = path.join(tmp, "bi-mat.jpg");

before(async () => {
  jobs = await import("../src/lib/video/jobs");
  ml = await import("../src/lib/video/music-library");
  safe = await import("../src/lib/video/safe-path");
  media = await import("../src/lib/media-response");
  thumbs = await import("../src/lib/video/thumb-cache");
  fs.writeFileSync(outside, "secret");
  const b = jobs.brollDir();
  fs.mkdirSync(path.join(b, "anh"), { recursive: true });
  fs.writeFileSync(path.join(b, "anh", "a.jpg"), "jpg");
  fs.writeFileSync(path.join(b, "clip.mp4"), "0123456789");
  fs.writeFileSync(path.join(b, "ghi-chu.txt"), "txt");
  fs.symlinkSync(outside, path.join(b, "anh", "lien-ket.jpg"));
  // Ảnh / clip thật (ffmpeg) cho ảnh thu nhỏ
  const ff = (args: string[]) => assert.equal(spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]).status, 0, "cần ffmpeg");
  ff(["-f", "lavfi", "-i", "testsrc=s=1600x1000", "-frames:v", "1", path.join(b, "anh", "lon.jpg")]);
  ff(["-f", "lavfi", "-i", "testsrc=d=1:s=640x360:r=10", "-pix_fmt", "yuv420p", path.join(b, "that.mp4")]);
  const m = path.join(tmp, "video-assets", "music");
  fs.mkdirSync(m, { recursive: true });
  fs.writeFileSync(path.join(m, "lofi_cam_pixabay552792.mp3"), "ID3");
  fs.writeFileSync(path.join(m, "acoustic_ok_mixkit1.mp3"), "ID3");
  fs.writeFileSync(path.join(m, "manifest.json"), JSON.stringify([{ file: "lofi_cam_pixabay552792.mp3", license: "Pixabay Content License (Pixabay 552792)" }, { file: "acoustic_ok_mixkit1.mp3", license: "Mixkit Stock Music Free License (Mixkit 1)" }]));
  fs.writeFileSync(path.join(b, "manifest.json"), JSON.stringify([{ file: "anh/a.jpg", kind: "image", keywords: ["x"], license: "OWNER", desc: "Ảnh A" }, { file: "clip.mp4", keywords: ["y"], license: "OWNER tự quay" }]));
  const s = path.join(tmp, "video-assets", "sfx");
  fs.mkdirSync(s, { recursive: true });
  fs.writeFileSync(path.join(s, "pop_a_mixkit1.wav"), "RIFF");
  fs.writeFileSync(path.join(s, "khong-danh-muc.wav"), "RIFF");
  fs.writeFileSync(path.join(s, "manifest.json"), JSON.stringify([{ file: "pop_a_mixkit1.wav", title: "Pop A", kind: "pop", durationSec: 0.4, license: "Mixkit Sound Effects Free License (Mixkit 1)" }, { file: "../video-assets/broll/anh/a.jpg", license: "x" }]));
});

test("B-roll: chỉ ảnh / clip trong thư mục thư viện; chặn .., tuyệt đối, NUL, liên kết ra ngoài, đuôi lạ", () => {
  const dir = fs.realpathSync(jobs.brollDir());
  assert.deepEqual(jobs.brollFilePath("anh/a.jpg"), { path: path.join(dir, "anh", "a.jpg"), type: "image/jpeg" });
  assert.equal(jobs.brollFilePath("clip.mp4")?.type, "video/mp4");
  for (const bad of ["../bi-mat.jpg", "../../bi-mat.jpg", "anh/../../bi-mat.jpg", outside, "anh/a.jpg\0.png", "anh/lien-ket.jpg", "manifest.json", "ghi-chu.txt", "khong-co.jpg", "anh", "", "..%2Fbi-mat.jpg"]) {
    assert.equal(jobs.brollFilePath(bad), null, `phải chặn: ${JSON.stringify(bad)}`);
  }
});

test("libraryFile: thư mục gốc, thư mục con và tệp ngoài đều bị từ chối", () => {
  const dir = jobs.brollDir();
  assert.equal(safe.libraryFile(dir, "."), null);
  assert.equal(safe.libraryFile(dir, "anh"), null, "thư mục không phải tệp");
  assert.equal(safe.libraryFile(dir, path.relative(dir, outside)), null);
  assert.ok(safe.libraryFile(dir, "anh/a.jpg"));
});

test("hiệu ứng âm thanh: chỉ tệp có trong manifest và nằm trong thư mục SFX; nhãn nguồn ngắn", () => {
  assert.ok(ml.sfxFilePath("pop_a_mixkit1.wav"));
  assert.equal(ml.sfxFilePath("khong-danh-muc.wav"), null, "tệp không có trong manifest");
  assert.equal(ml.sfxFilePath("../video-assets/broll/anh/a.jpg"), null, "manifest ghi đường dẫn ra ngoài vẫn bị chặn");
  assert.equal(ml.sfxFilePath("../broll/anh/a.jpg"), null);
  assert.deepEqual(ml.sfxLibrary().map((s) => [s.file, s.kind, s.title]), [["pop_a_mixkit1.wav", "pop", "Pop A"]]);
  assert.equal(ml.licenseSource("Mixkit Stock Music Free License (Mixkit 530) — chờ OWNER nghe duyệt"), "Mixkit");
  assert.equal(ml.licenseSource("Pixabay Content License — CEO duyệt"), "Pixabay");
  assert.equal(ml.licenseSource("Tư liệu OWNER tự quay"), "OWNER");
  assert.equal(ml.licenseSource("CC0"), "Khác");
});

test("thư viện B-roll trả loại (ảnh / clip) và mô tả để hiển thị", () => {
  const lib = jobs.brollLibrary();
  assert.deepEqual(lib.map((b) => [b.file, b.kind, b.desc]), [["anh/a.jpg", "image", "Ảnh A"], ["clip.mp4", "video", ""]]);
});

test("phát tệp theo Range: 206 đúng khoảng, 416 khi ngoài cỡ tệp", async () => {
  const p = jobs.brollFilePath("clip.mp4")!.path;
  const part = media.mediaResponse(new Request("http://x/", { headers: { range: "bytes=2-4" } }), p, "video/mp4");
  assert.equal(part.status, 206);
  assert.equal(part.headers.get("content-range"), "bytes 2-4/10");
  assert.equal(await part.text(), "234");
  assert.equal(media.mediaResponse(new Request("http://x/", { headers: { range: "bytes=50-" } }), p, "video/mp4").status, 416);
  const empty = media.mediaResponse(new Request("http://x/", { headers: { range: "bytes=-" } }), p, "video/mp4");
  assert.equal(empty.status, 200, "Range rỗng \"bytes=-\" → trả cả tệp");
  assert.equal(await empty.text(), "0123456789");
  const tail = media.mediaResponse(new Request("http://x/", { headers: { range: "bytes=-3" } }), p, "video/mp4");
  assert.equal(tail.status, 206);
  assert.equal(await tail.text(), "789");
  const all = media.mediaResponse(new Request("http://x/"), p, "video/mp4");
  assert.equal(all.status, 200);
  assert.equal(all.headers.get("x-content-type-options"), "nosniff");
  assert.equal(await all.text(), "0123456789");
});

test("nghe thử nhạc: bài trong danh sách cấm (BANNED_IDS) không phát, bài khác phát được", () => {
  assert.equal(ml.musicFilePath("lofi_cam_pixabay552792.mp3"), null);
  assert.ok(ml.musicFilePath("acoustic_ok_mixkit1.mp3"));
  assert.equal(ml.musicFilePath("../broll/clip.mp4"), null);
});

/** Kích thước ảnh (rộng × cao) đọc bằng ffprobe. */
function dims(p: string): [number, number] {
  const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", p], { encoding: "utf8" });
  const [w, h] = r.stdout.trim().split(",").map(Number);
  return [w, h];
}

test("ảnh thu nhỏ máy chủ: ≤ 480 px, lưu DATA_DIR/preview-cache/server, lần 2 dùng cache, gọi đồng thời chỉ tạo một lần", async () => {
  const img = jobs.brollFilePath("anh/lon.jpg")!;
  const before = thumbs.thumbStats.generated;
  const t1 = await thumbs.serverThumb(img.path, false);
  assert.ok(t1, "tạo được ảnh thu nhỏ");
  assert.equal(path.dirname(t1!), path.join(tmp, "preview-cache", "server"));
  const [w, h] = dims(t1!);
  assert.ok(w <= 480 && h <= 480 && Math.max(w, h) === 480, `cỡ ${w}×${h}`);
  assert.ok(fs.statSync(t1!).size < fs.statSync(img.path).size, "nhỏ hơn ảnh gốc");
  assert.equal(thumbs.thumbStats.generated, before + 1);
  assert.equal(await thumbs.serverThumb(img.path, false), t1, "lần 2 cùng tệp cache");
  assert.equal(thumbs.thumbStats.generated, before + 1, "lần 2 không gọi ffmpeg");

  const clip = jobs.brollFilePath("that.mp4")!;
  const [a, b, c] = await Promise.all([thumbs.serverThumb(clip.path, true), thumbs.serverThumb(clip.path, true), thumbs.serverThumb(clip.path, true)]);
  assert.ok(a && a === b && b === c);
  assert.equal(thumbs.thumbStats.generated, before + 2, "3 yêu cầu đồng thời → 1 lần ffmpeg");
  assert.deepEqual(dims(a!), [480, 270]);
  assert.deepEqual(fs.readdirSync(path.join(tmp, "preview-cache", "server")).filter((f) => !f.endsWith(".jpg")), [], "không sót tệp tạm");

  // Tệp gốc đổi → khoá đổi → tạo lại
  const t = new Date(Date.now() + 5000);
  fs.utimesSync(img.path, t, t);
  const t2 = await thumbs.serverThumb(img.path, false);
  assert.notEqual(t2, t1);
  // Tệp không phải ảnh (ffmpeg lỗi) → null, không để lại gì
  assert.equal(await thumbs.serverThumb(path.join(jobs.brollDir(), "clip.mp4"), true), null);
  assert.deepEqual(fs.readdirSync(path.join(tmp, "preview-cache", "server")).filter((f) => !f.endsWith(".jpg")), []);
});

test("ảnh thu nhỏ chỉ đi qua đường dẫn đã kiểm: tên lạ / path traversal bị chặn trước khi tới ffmpeg", () => {
  for (const bad of ["../bi-mat.jpg", "anh/../../bi-mat.jpg", outside, "anh/lien-ket.jpg", "../preview-cache/server/x.jpg", "manifest.json"]) {
    assert.equal(jobs.brollFilePath(bad), null, bad);
  }
});
