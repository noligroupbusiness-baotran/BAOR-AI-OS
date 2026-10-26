// Xoá tư liệu (OWNER 26/10/2026): tệp nhạc / hiệu ứng / B-roll máy chủ CHUYỂN vào video-assets/da-xoa và gỡ khỏi danh mục (bộ dựng
// không dùng nữa); Khôi phục trả lại đúng mục danh mục; chặn đường dẫn lạ; bài cấm vẫn bị cấm; thùng quá 30 ngày được dọn hẳn.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "baor-asset-trash-"));
process.env.DATA_DIR = tmp;
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.AUTH_SECRET = "test-secret-".padEnd(40, "x");
process.env.BAOR_VIDEO_WORKER = "off";

let trash: typeof import("../src/lib/video/asset-trash");
let music: typeof import("../src/lib/video/music-library");
let jobs: typeof import("../src/lib/video/jobs");
const va = path.join(tmp, "video-assets");
const now = new Date("2026-10-26T04:15:00Z");
const mf = (kind: string) => JSON.parse(fs.readFileSync(path.join(va, kind, "manifest.json"), "utf8")) as Record<string, unknown>[];
const put = (rel: string, body = "ID3") => {
  fs.mkdirSync(path.dirname(path.join(va, rel)), { recursive: true });
  fs.writeFileSync(path.join(va, rel), body);
};

before(async () => {
  trash = await import("../src/lib/video/asset-trash");
  music = await import("../src/lib/video/music-library");
  jobs = await import("../src/lib/video/jobs");
  put("music/acoustic_ok_mixkit1.mp3");
  put("music/lofi_cam_pixabay552792.mp3");
  put("music/khong-danh-muc.mp3");
  fs.writeFileSync(
    path.join(va, "music", "manifest.json"),
    JSON.stringify([
      { file: "acoustic_ok_mixkit1.mp3", title: "OK", genre: "acoustic", license: "Mixkit — OWNER nghe duyệt 25/10/2026 (owner@baor.test)", catalogLicense: "Mixkit — chờ OWNER nghe duyệt", ownerApproved: { by: "owner@baor.test" }, catalogStatus: "ĐỦ-HỒ-SƠ" },
      { file: "lofi_cam_pixabay552792.mp3", title: "Cấm", license: "Pixabay Content License (Pixabay 552792) — chờ OWNER nghe duyệt" },
    ]),
  );
  put("sfx/pop_a.wav", "RIFF");
  fs.writeFileSync(path.join(va, "sfx", "manifest.json"), JSON.stringify([{ file: "pop_a.wav", title: "Pop A", kind: "pop", license: "Mixkit SFX" }]));
  put("broll/anh/van-phong.jpg", "jpg");
  fs.writeFileSync(path.join(va, "broll", "manifest.json"), JSON.stringify([{ file: "anh/van-phong.jpg", kind: "image", keywords: ["văn phòng"], license: "Tôi tự chụp", desc: "Văn phòng" }]));
  fs.writeFileSync(path.join(tmp, "bi-mat.mp3"), "secret");
  fs.symlinkSync(path.join(tmp, "bi-mat.mp3"), path.join(va, "music", "lien-ket.mp3"));
});

test("xoá nhạc: tệp vào da-xoa, gỡ khỏi danh mục (bộ dựng không thấy); khôi phục trả nguyên mục kể cả trạng thái duyệt", () => {
  const r = trash.trashAsset(tmp, "music", "acoustic_ok_mixkit1.mp3", "owner@baor.test", now);
  assert.ok(r.ok, JSON.stringify(r));
  const t = r.ok ? r.entry : null!;
  assert.equal(t.trashed, "music/20261026T041500-acoustic_ok_mixkit1.mp3");
  assert.ok(fs.existsSync(path.join(trash.trashDir(tmp), t.trashed)), "tệp nằm trong da-xoa");
  assert.ok(!fs.existsSync(path.join(va, "music", "acoustic_ok_mixkit1.mp3")), "tệp rời thư viện");
  assert.ok(!mf("music").some((x) => x.file === "acoustic_ok_mixkit1.mp3"), "gỡ khỏi danh mục");
  assert.ok(!music.musicLibrary().some((x) => x.file === "acoustic_ok_mixkit1.mp3"), "bộ dựng / trang Tư liệu không còn thấy");
  assert.equal(music.musicFilePath("acoustic_ok_mixkit1.mp3"), null, "không phát được nữa");
  assert.equal(trash.listTrash(tmp).length, 1);

  const back = trash.restoreAsset(tmp, t.id);
  assert.ok(back.ok, JSON.stringify(back));
  const it = mf("music").find((x) => x.file === "acoustic_ok_mixkit1.mp3")!;
  assert.deepEqual(it.ownerApproved, { by: "owner@baor.test" });
  assert.match(String(it.license), /OWNER nghe duyệt/);
  assert.equal(music.musicLibrary().find((x) => x.file === "acoustic_ok_mixkit1.mp3")?.approved, true);
  assert.equal(trash.listTrash(tmp).length, 0);
  assert.ok(!fs.existsSync(path.join(trash.trashDir(tmp), t.trashed)));
});

test("chặn đường dẫn lạ: .., tuyệt đối, NUL, liên kết ra ngoài, tệp ngoài danh mục, loại lạ", () => {
  for (const bad of ["../../bi-mat.mp3", path.join(tmp, "bi-mat.mp3"), "acoustic_ok_mixkit1.mp3\0.txt", "lien-ket.mp3", "khong-danh-muc.mp3", "manifest.json", "", "khong-co.mp3"]) {
    const r = trash.trashAsset(tmp, "music", bad, "x", now);
    assert.equal(r.ok, false, `phải chặn: ${JSON.stringify(bad)}`);
  }
  assert.equal(trash.trashAsset(tmp, "uploads" as never, "a.mp3", "x", now).ok, false);
  assert.ok(fs.existsSync(path.join(tmp, "bi-mat.mp3")) && fs.existsSync(path.join(va, "music", "khong-danh-muc.mp3")), "không đụng tệp nào");
  assert.equal(trash.restoreAsset(tmp, "music:../../x").ok, false);
  assert.equal(trash.listTrash(tmp).length, 0);
});

test("bài cấm: xoá / khôi phục không làm bài hết cấm (vẫn không phát, không vào bộ dựng, không duyệt được)", () => {
  assert.equal(music.musicFilePath("lofi_cam_pixabay552792.mp3"), null);
  const r = trash.trashAsset(tmp, "music", "lofi_cam_pixabay552792.mp3", "owner@baor.test", now);
  assert.ok(r.ok);
  const back = trash.restoreAsset(tmp, r.ok ? r.entry.id : "");
  assert.ok(back.ok);
  assert.equal(music.musicFilePath("lofi_cam_pixabay552792.mp3"), null, "vẫn cấm phát");
  assert.ok(!music.musicLibrary().some((x) => x.file === "lofi_cam_pixabay552792.mp3"), "vẫn ngoài bộ dựng");
  assert.equal(music.approveMusic("lofi_cam_pixabay552792.mp3", "owner@baor.test").ok, false, "vẫn không duyệt được");
});

test("B-roll trong thư mục con + hiệu ứng: xoá rồi khôi phục đúng chỗ; trùng tên lúc khôi phục → tên mới, không đè", () => {
  const b = trash.trashAsset(tmp, "broll", "anh/van-phong.jpg", "owner@baor.test", now);
  assert.ok(b.ok);
  assert.ok(!jobs.brollLibrary().some((x) => x.file === "anh/van-phong.jpg"));
  put("broll/anh/van-phong.jpg", "anh moi");
  const back = trash.restoreAsset(tmp, b.ok ? b.entry.id : "");
  assert.ok(back.ok);
  assert.equal(back.ok && back.file, "anh/van-phong-2.jpg");
  assert.equal(fs.readFileSync(path.join(va, "broll", "anh", "van-phong.jpg"), "utf8"), "anh moi", "không đè tệp mới");
  const it = jobs.brollLibrary().find((x) => x.file === "anh/van-phong-2.jpg")!;
  assert.deepEqual(it.keywords, ["văn phòng"]);
  assert.equal(it.license, "Tôi tự chụp");

  const s = trash.trashAsset(tmp, "sfx", "pop_a.wav", "owner@baor.test", now);
  assert.ok(s.ok);
  assert.ok(!music.sfxLibrary().some((x) => x.file === "pop_a.wav"));
  assert.equal(music.sfxFilePath("pop_a.wav"), null);
});

test("dọn thùng: mục quá 30 ngày bị xoá hẳn, mục mới giữ lại", () => {
  put("music/moi.mp3");
  fs.writeFileSync(path.join(va, "music", "manifest.json"), JSON.stringify([...mf("music"), { file: "moi.mp3", license: "OWNER" }]));
  const later = new Date(now.getTime() + 20 * 86_400_000);
  const fresh = trash.trashAsset(tmp, "music", "moi.mp3", "x", later);
  assert.ok(fresh.ok);
  // 31 ngày sau lần xoá hiệu ứng (26/10): hiệu ứng quá 30 ngày → dọn; bài "moi" mới 11 ngày → giữ
  const n = trash.purgeTrash(tmp, now.getTime() + 31 * 86_400_000);
  assert.equal(n, 1);
  assert.ok(!fs.existsSync(path.join(trash.trashDir(tmp), "sfx", "20261026T041500-pop_a.wav")), "tệp cũ đã dọn hẳn");
  assert.deepEqual(trash.listTrash(tmp).map((x) => x.file), ["moi.mp3"]);
  assert.ok(fs.existsSync(path.join(trash.trashDir(tmp), fresh.ok ? fresh.entry.trashed : "")));
});

test("hiệu ứng mới (sfx-owner/moi): nghe thử chỉ tệp trong danh mục; xoá / khôi phục được; không tự gán vai trò", () => {
  put("sfx-owner/moi/whoosh-moi.wav", "RIFF");
  put("sfx-owner/moi/ngoai-danh-muc.wav", "RIFF");
  fs.writeFileSync(path.join(va, "sfx-owner", "moi", "manifest.json"), JSON.stringify([{ file: "whoosh-moi.wav", keywords: [], license: "Mixkit Sound Effects Free License" }, { file: "khong-giay-phep.wav", license: "" }]));
  put("sfx-owner/moi/khong-giay-phep.wav", "RIFF");
  assert.deepEqual(music.sfxNewLibrary().map((x) => x.file), ["whoosh-moi.wav"], "chỉ mục có giấy phép + có tệp");
  assert.ok(music.sfxNewFilePath("whoosh-moi.wav"));
  for (const bad of ["ngoai-danh-muc.wav", "../moi/whoosh-moi.wav", "../../sfx/pop_a.wav", "manifest.json"]) assert.equal(music.sfxNewFilePath(bad), null, bad);
  const r = trash.trashAsset(tmp, "sfx-new", "whoosh-moi.wav", "owner@baor.test", now);
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(music.sfxNewFilePath("whoosh-moi.wav"), null);
  assert.ok(!fs.existsSync(path.join(va, "sfx-owner", "manifest.json")), "không tạo / ghi danh mục vai trò");
  const back = trash.restoreAsset(tmp, r.ok ? r.entry.id : "");
  assert.ok(back.ok);
  assert.equal(mf("sfx-owner/moi").find((x) => x.file === "whoosh-moi.wav")?.license, "Mixkit Sound Effects Free License");
  assert.equal(trash.trashAsset(tmp, "sfx-new", "../sfx/pop_a.wav", "x", now).ok, false);
});

test("nhãn nguồn nhạc theo câu giấy phép gốc, không theo đuôi trạng thái “chờ OWNER nghe duyệt”", () => {
  const P = " — chờ OWNER nghe duyệt";
  assert.equal(music.musicSourceLabel(`Tệp thử Claude${P}`, "OWNER-CUNG-CAP"), "Anh tải lên");
  assert.equal(music.musicSourceLabel(`Mixkit Stock Music Free License${P}`, "OWNER-CUNG-CAP"), "Mixkit");
  assert.equal(music.musicSourceLabel("Tôi tự quay — OWNER nghe duyệt 26/10/2026 (owner@baor.test)", "OWNER-CUNG-CAP"), "OWNER");
  assert.equal(music.musicSourceLabel(`Pixabay Content License (Pixabay 1)${P}`, "ĐỦ-HỒ-SƠ"), "Pixabay");
  assert.equal(music.musicSourceLabel(`Nhạc mua Epidemic${P}`, "ĐỦ-HỒ-SƠ"), "Khác", "bài kho không phải OWNER tải lên");
  assert.equal(music.licenseSource(`Nhạc mua Epidemic${P}`), "OWNER", "hàm cũ (dùng cho SFX / ảnh) vẫn như trước");
});

test("phản biện P2: hai lần xoá cùng giây cùng tên tệp → id khác nhau; khôi phục một, mục kia vẫn khôi phục / dọn được", () => {
  put("broll/x1/a.jpg", "1");
  put("broll/x2/a.jpg", "2");
  fs.writeFileSync(path.join(va, "broll", "manifest.json"), JSON.stringify([...mf("broll"), { file: "x1/a.jpg", license: "x" }, { file: "x2/a.jpg", license: "y" }]));
  const at = new Date("2026-11-01T10:00:00Z");
  const t1 = trash.trashAsset(tmp, "broll", "x1/a.jpg", "o", at);
  const t2 = trash.trashAsset(tmp, "broll", "x2/a.jpg", "o", at);
  assert.ok(t1.ok && t2.ok);
  const [e1, e2] = [t1.ok ? t1.entry : null!, t2.ok ? t2.entry : null!];
  assert.notEqual(e1.id, e2.id);
  assert.equal(e2.id, `broll:${path.basename(e2.trashed)}`, "id theo tên đã chốt trong thùng");
  assert.ok(trash.restoreAsset(tmp, e1.id).ok);
  assert.ok(trash.listTrash(tmp).some((x) => x.id === e2.id), "mục kia còn trong thùng");
  assert.ok(fs.existsSync(path.join(trash.trashDir(tmp), e2.trashed)));
  const back2 = trash.restoreAsset(tmp, e2.id);
  assert.ok(back2.ok);
  assert.equal(fs.readFileSync(path.join(va, "broll", back2.ok ? back2.file : ""), "utf8"), "2", "đúng tệp của mục kia");
});

test("bia mộ removed.json: ghi khi xoá, còn sau khi thùng dọn hẳn, gỡ khi khôi phục", () => {
  put("music/kho_bai_pixabay77.mp3");
  fs.writeFileSync(path.join(va, "music", "manifest.json"), JSON.stringify([...mf("music"), { file: "kho_bai_pixabay77.mp3", license: "Pixabay — chờ OWNER nghe duyệt", catalogStatus: "ĐỦ-HỒ-SƠ" }]));
  const tomb = () => JSON.parse(fs.readFileSync(trash.removedFile(tmp), "utf8")) as { kind: string; file: string }[];
  const r = trash.trashAsset(tmp, "music", "kho_bai_pixabay77.mp3", "o", now);
  assert.ok(r.ok);
  assert.ok(tomb().some((x) => x.kind === "music" && x.file === "kho_bai_pixabay77.mp3"));
  trash.purgeTrash(tmp, now.getTime() + 400 * 86_400_000);
  assert.ok(!trash.listTrash(tmp).some((x) => x.file === "kho_bai_pixabay77.mp3"), "thùng đã dọn hẳn");
  assert.ok(tomb().some((x) => x.file === "kho_bai_pixabay77.mp3"), "bia mộ vẫn còn → library_sync không tải lại");

  put("music/khoi-phuc.mp3");
  fs.writeFileSync(path.join(va, "music", "manifest.json"), JSON.stringify([...mf("music"), { file: "khoi-phuc.mp3", license: "OWNER" }]));
  const k = trash.trashAsset(tmp, "music", "khoi-phuc.mp3", "o", now);
  assert.ok(k.ok && tomb().some((x) => x.file === "khoi-phuc.mp3"));
  assert.ok(trash.restoreAsset(tmp, k.ok ? k.entry.id : "").ok);
  assert.ok(!tomb().some((x) => x.file === "khoi-phuc.mp3"), "khôi phục → gỡ bia mộ");
});

test("phản biện P3: index.json hỏng → KHÔNG ghi đè, cất thành index.corrupt-*.json rồi bắt đầu danh sách mới", () => {
  const idx = path.join(trash.trashDir(tmp), "index.json");
  fs.writeFileSync(idx, "{hỏng");
  assert.deepEqual(trash.listTrash(tmp), [], "đọc cho giao diện không sửa gì");
  assert.equal(fs.readFileSync(idx, "utf8"), "{hỏng");
  put("music/sau-hong.mp3");
  fs.writeFileSync(path.join(va, "music", "manifest.json"), JSON.stringify([...mf("music"), { file: "sau-hong.mp3", license: "OWNER" }]));
  const r = trash.trashAsset(tmp, "music", "sau-hong.mp3", "o", now);
  assert.ok(r.ok, JSON.stringify(r));
  const baks = fs.readdirSync(trash.trashDir(tmp)).filter((f) => /^index\.corrupt-.+\.json$/.test(f));
  assert.equal(baks.length, 1);
  assert.equal(fs.readFileSync(path.join(trash.trashDir(tmp), baks[0]), "utf8"), "{hỏng", "giữ nguyên bản hỏng để xem lại");
  assert.deepEqual(trash.listTrash(tmp).map((x) => x.file), ["sau-hong.mp3"]);
});
