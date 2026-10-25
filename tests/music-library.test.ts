// Kho tư liệu → thư viện nhạc nền: nạp chỉ bài ĐỦ-HỒ-SƠ đúng sha256 (library_sync.py), OWNER nghe duyệt trong app,
// bộ dựng (music_pick.py, cùng hàm esv_render dùng) chỉ TỰ chọn bài đã duyệt. Thư mục dữ liệu tạm, không mạng.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "baor-music-"));
process.env.DATA_DIR = tmp;
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.AUTH_SECRET = "test-secret-".padEnd(40, "x");
process.env.BAOR_VIDEO_WORKER = "off";

let ml: typeof import("../src/lib/video/music-library");
const dir = path.join(tmp, "video-assets", "music");
const PY = process.env.PYTHON_BIN || "python3";
const VIDEO = path.join(process.cwd(), "scripts", "video");

const PENDING_LIC = "Pixabay Content License (Pixabay 963) — kho tư liệu NHAC-NEN-SFX: ĐỦ-HỒ-SƠ (đội kiểm hồ sơ giấy phép; Content ID thật chưa biết) — chờ OWNER nghe duyệt";

function seed() {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const items = [
    { file: "mac-dinh.mp3", genre: "lofi-chill", mood: ["lofi"], license: "Pixabay Content License — CEO duyệt", default: true },
    { file: "acoustic_a_pixabay963.mp3", genre: "acoustic", mood: ["ấm áp"], license: PENDING_LIC, catalogStatus: "ĐỦ-HỒ-SƠ" },
    { file: "acoustic_b_pixabay839.mp3", genre: "acoustic", mood: ["ấm áp"], license: PENDING_LIC.replace("963", "839"), catalogStatus: "ĐỦ-HỒ-SƠ" },
    { file: "upbeat_bi-loai.mp3", genre: "upbeat", license: PENDING_LIC, catalogStatus: "ĐỦ-HỒ-SƠ", exclude: true },
    { file: "thieu-tep.mp3", genre: "upbeat", license: PENDING_LIC, catalogStatus: "ĐỦ-HỒ-SƠ" },
    { file: "nghi-ai.mp3", genre: "upbeat", license: PENDING_LIC, catalogStatus: "NGHI-AI" },
  ];
  for (const it of items) if (it.file !== "thieu-tep.mp3") fs.writeFileSync(path.join(dir, it.file), "ID3");
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(items));
}

/** Gọi đúng hàm chọn nhạc của bộ dựng (music_pick.pick_music) trên thư mục tạm. */
function pyPick(mood: string | null, seedName = "video-a.mp4", withPool = false) {
  const py = `import json,sys; sys.path.insert(0, ${JSON.stringify(VIDEO)}); import music_pick as M
lib = M.music_library(${JSON.stringify(tmp)}); p, lic, info = M.pick_music(lib, ${mood ? JSON.stringify(mood) : "None"}, ${JSON.stringify(seedName)}${withPool ? `, pool=M.music_pool(${JSON.stringify(tmp)})` : ""})
print(json.dumps({"file": p.split("/")[-1] if p else None, "license": lic, "info": info, "genres": M.music_genres(lib)}, ensure_ascii=False))`;
  const r = spawnSync(PY, ["-c", py], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout) as { file: string | null; license: string; info: { chosenBy?: string; suggest: string[] }; genres: Record<string, string[]> };
}

before(async () => {
  ml = await import("../src/lib/video/music-library");
});

test("library_sync: chỉ nạp bài ĐỦ-HỒ-SƠ đúng sha256, chặn tên tệp lạ, chạy lại giữ quyết định OWNER", () => {
  const r = spawnSync(PY, [path.join(VIDEO, "library_sync.py"), "--self-test"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /library_sync tự kiểm: đạt/);
});

test("thư viện nhạc: bỏ bài bị loại / thiếu tệp; bộ dựng KHÔNG tự chọn bài chưa duyệt, chỉ gợi ý", () => {
  seed();
  const lib = ml.musicLibrary();
  assert.deepEqual(lib.map((t) => t.file), ["mac-dinh.mp3", "acoustic_a_pixabay963.mp3", "acoustic_b_pixabay839.mp3", "nghi-ai.mp3"]);
  assert.deepEqual(lib.map((t) => t.approved), [true, false, false, false]);
  const p = pyPick("acoustic");
  assert.equal(p.file, "mac-dinh.mp3", "loại 'acoustic' chưa có bài duyệt → bài mặc định");
  assert.match(p.info.chosenBy ?? "", /chưa có bài OWNER duyệt/);
  assert.deepEqual(p.info.suggest, ["acoustic_a_pixabay963.mp3", "acoustic_b_pixabay839.mp3"]);
  assert.ok(p.genres.acoustic, "AI được biết có loại acoustic để chọn");
});

test("OWNER duyệt → bộ dựng tự chọn bài hợp loại, cố định theo video; bỏ duyệt → quay về mặc định, giấy phép kho trả nguyên văn", () => {
  seed();
  assert.deepEqual(ml.approveMusic("acoustic_b_pixabay839.mp3", "owner@baor.test", new Date("2026-10-22T10:00:00+07:00")), { ok: true });
  const t = ml.musicLibrary().find((x) => x.file === "acoustic_b_pixabay839.mp3")!;
  assert.equal(t.approved, true);
  assert.equal(t.approvedBy, "owner@baor.test");
  assert.match(t.license, /OWNER nghe duyệt 22\/10\/2026 \(owner@baor\.test\)/);
  const p = pyPick("acoustic");
  assert.equal(p.file, "acoustic_b_pixabay839.mp3");
  assert.doesNotMatch(p.license, /chờ OWNER/, "bài được chọn không bị bảng kiểm P chặn");
  assert.equal(pyPick("acoustic").file, pyPick("acoustic").file, "dựng lại cùng video không đổi nhạc");
  assert.equal(pyPick(null).file, "mac-dinh.mp3", "không có loại nhạc (kế hoạch người lập) → bài mặc định");
  assert.deepEqual(ml.unapproveMusic("acoustic_b_pixabay839.mp3"), { ok: true });
  const back = ml.musicLibrary().find((x) => x.file === "acoustic_b_pixabay839.mp3")!;
  assert.equal(back.license, PENDING_LIC.replace("963", "839"));
  assert.equal(pyPick("acoustic").file, "mac-dinh.mp3");
});

test("duyệt chỉ cho bài kho ĐỦ-HỒ-SƠ đang chờ; không bỏ duyệt bài duyệt từ trước; nghe thử không lọt ra ngoài thư mục", () => {
  seed();
  assert.equal(ml.approveMusic("nghi-ai.mp3", "owner@baor.test").ok, false, "NGHI-AI không duyệt được");
  assert.equal(ml.approveMusic("upbeat_bi-loai.mp3", "owner@baor.test").ok, false, "bài bị loại");
  assert.equal(ml.approveMusic("mac-dinh.mp3", "owner@baor.test").ok, false, "không ở trạng thái chờ");
  assert.equal(ml.approveMusic("khong-co.mp3", "owner@baor.test").ok, false);
  assert.equal(ml.unapproveMusic("mac-dinh.mp3").ok, false, "bài CEO duyệt trước đây không bị bỏ duyệt bằng nút");
  assert.ok(ml.musicFilePath("acoustic_a_pixabay963.mp3"));
  assert.equal(ml.musicFilePath("../music/manifest.json"), null);
  assert.equal(ml.musicFilePath("manifest.json"), null);
  assert.equal(ml.musicFilePath("thieu-tep.mp3"), null);
});

test("Phần chung A5.2 / CK-11: 552792 / 241274 / 136824 không bao giờ được dùng; Mixkit chỉ bài OWNER đã duyệt (QĐ OWNER 25/10/2026)", () => {
  seed();
  const mf = path.join(dir, "manifest.json");
  const items = JSON.parse(fs.readFileSync(mf, "utf8")) as Record<string, unknown>[];
  // bài mặc định cũ là Pixabay 552792 (đã LOẠI) + 241274 / 136824 kho vẫn ghi ĐỦ-HỒ-SƠ + một bài Mixkit ĐÃ được duyệt tay
  items[0] = { ...items[0], file: "pixabay-552792-chillhop.mp3" };
  items.push({ file: "acoustic_x_pixabay241274.mp3", genre: "acoustic", license: PENDING_LIC, catalogStatus: "ĐỦ-HỒ-SƠ" });
  items.push({ file: "cinematic_y_pixabay136824.mp3", genre: "cinematic", license: PENDING_LIC, catalogStatus: "ĐỦ-HỒ-SƠ" });
  items.push({ file: "acoustic_z_mixkit655.mp3", genre: "acoustic", license: "Mixkit Stock Music Free License — OWNER nghe duyệt 22/10/2026", catalogStatus: "ĐỦ-HỒ-SƠ", source: "https://mixkit.co/x" });
  for (const f of ["pixabay-552792-chillhop.mp3", "acoustic_x_pixabay241274.mp3", "cinematic_y_pixabay136824.mp3", "acoustic_z_mixkit655.mp3"]) fs.writeFileSync(path.join(dir, f), "ID3");
  fs.writeFileSync(mf, JSON.stringify(items));
  assert.ok(!ml.musicLibrary().some((t) => /552792|241274|136824/.test(t.file)), "app không liệt kê bài LOẠI");
  assert.ok(ml.musicLibrary().some((t) => /mixkit/.test(t.file)), "app liệt kê bài Mixkit để OWNER duyệt / bỏ duyệt");
  assert.equal(ml.approveMusic("acoustic_x_pixabay241274.mp3", "owner@baor.test").ok, false, "không duyệt được bài LOẠI");
  assert.equal(ml.approveMusic("cinematic_y_pixabay136824.mp3", "owner@baor.test").ok, false, "136824 chưa tra → không duyệt được");
  // Mixkit OWNER đã duyệt → bộ dựng dùng được (loại acoustic chỉ còn bài này)
  for (const seedName of ["a.mp4", "b.mp4", "c.mp4"]) {
    const p = pyPick("acoustic", seedName);
    assert.match(String(p.file), /acoustic_z_mixkit655\.mp3$/, `Mixkit đã duyệt phải dùng được: ${p.file}`);
  }
  // Mixkit CHƯA duyệt → không bao giờ dùng; chưa có bài đạt → bản KHÔNG nhạc
  const items2 = JSON.parse(fs.readFileSync(mf, "utf8")) as Record<string, unknown>[];
  for (const it of items2) if (String(it.file).includes("mixkit")) it.license = "Mixkit Stock Music Free License — chờ OWNER nghe duyệt";
  fs.writeFileSync(mf, JSON.stringify(items2));
  for (const seedName of ["a.mp4", "b.mp4", "c.mp4"]) {
    const p = pyPick("acoustic", seedName);
    assert.ok(!String(p.file).includes("mixkit"), `Mixkit chưa duyệt không được dùng: ${p.file}`);
  }
});

test("Mixkit CHỜ duyệt ('chờ OWNER nghe duyệt' chứa cụm 'OWNER nghe duyệt') vẫn bị chặn; đã duyệt thì dùng được (lỗi thật 25/10)", () => {
  const py = `import json,sys; sys.path.insert(0, ${JSON.stringify(VIDEO)}); from music_pick import banned
print(json.dumps([banned({"file": "a_mixkit1.mp3", "license": "Mixkit Stock Music Free License — chờ OWNER nghe duyệt"}),
                  banned({"file": "a_mixkit1.mp3", "license": "Mixkit Stock Music Free License — OWNER nghe duyệt 25/10/2026 (o@b)"})]))`;
  const r = spawnSync(PY, ["-c", py], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), ["mixkit", null]);
});

test("chưa có bài duyệt → bộ dựng dùng bài kho ĐỦ-HỒ-SƠ (kể cả Mixkit) nhưng giữ giấy phép nguyên văn (P chặn đăng); không bao giờ dùng bài LOẠI (OWNER 25/10/2026)", () => {
  seed();
  const mf = path.join(dir, "manifest.json");
  const items = (JSON.parse(fs.readFileSync(mf, "utf8")) as Record<string, unknown>[]).filter((x) => x.file !== "mac-dinh.mp3");
  items.push({ file: "acoustic_x_pixabay241274.mp3", genre: "acoustic", license: PENDING_LIC, catalogStatus: "ĐỦ-HỒ-SƠ" });
  items.push({ file: "lofi_m_mixkit12.mp3", genre: "lofi-chill", license: "Mixkit Stock Music Free License — chờ OWNER nghe duyệt", catalogStatus: "ĐỦ-HỒ-SƠ", source: "https://mixkit.co/x" });
  for (const f of ["acoustic_x_pixabay241274.mp3", "lofi_m_mixkit12.mp3"]) fs.writeFileSync(path.join(dir, f), "ID3");
  fs.writeFileSync(mf, JSON.stringify(items));
  assert.equal(pyPick("acoustic").file, null, "không truyền kho dự phòng → vẫn như cũ: không nhạc");
  for (const seedName of ["a.mp4", "b.mp4", "c.mp4", "d.mp4"]) {
    const p = pyPick("acoustic", seedName, true);
    assert.match(String(p.file), /^acoustic_[ab]_pixabay(963|839)\.mp3$/, `hợp loại, không bài LOẠI / bị loại / thiếu tệp: ${p.file}`);
    assert.match(p.license, /chờ OWNER nghe duyệt$/, "giấy phép giữ nguyên văn → bảng kiểm P chặn đăng tới khi OWNER duyệt (§7: không giả giấy phép)");
  }
  const m = pyPick("lofi-chill", "a.mp4", true);
  assert.equal(m.file, "lofi_m_mixkit12.mp3", "Mixkit ĐỦ-HỒ-SƠ dùng được qua kho dự phòng");
  // bài ĐỦ-HỒ-SƠ mà giấy phép KHÔNG ghi "chờ OWNER nghe duyệt" (trạng thái không rõ) → không vào kho dự phòng (P có thể không bắt)
  const it2 = JSON.parse(fs.readFileSync(mf, "utf8")) as Record<string, unknown>[];
  for (const it of it2) if (String(it.file).includes("mixkit12")) it.license = "Mixkit Stock Music Free License";
  fs.writeFileSync(mf, JSON.stringify(it2));
  assert.notEqual(pyPick("lofi-chill", "a.mp4", true).file, "lofi_m_mixkit12.mp3");
  const any = pyPick("cinematic", "a.mp4", true);
  assert.ok(any.file && !/241274|bi-loai|nghi-ai|thieu-tep/.test(any.file), `không hợp loại → bất kỳ bài hợp lệ: ${any.file}`);
});
