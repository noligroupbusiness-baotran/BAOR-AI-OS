// S4 Nội dung → Video: kịch bản đã duyệt đi tới Video Studio và bộ dựng (gợi ý nghe, sửa chữ nghe sai, ngữ cảnh biên tập AI).
// CSDL + thư mục dữ liệu tạm; bộ dựng tắt, phần Python (script_align) chạy thật trên tệp script.txt mà ứng dụng ghi ra.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { eq } from "drizzle-orm";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "baor-cv-"));
process.env.DATA_DIR = tmp;
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.AUTH_SECRET = "test-secret-".padEnd(40, "x");
process.env.BAOR_VIDEO_WORKER = "off";

let db: typeof import("../src/db");
let jobs: typeof import("../src/lib/video/jobs");

before(async () => {
  db = await import("../src/db");
  jobs = await import("../src/lib/video/jobs");
});

const DRAFT = ["1. Mở đầu (0–5 giây)", "Hình ảnh: cận mặt", "Lời thoại: Hôm nay mình chào hỏi phá băng với chị Trà Giang [S1]", "", "2. Cách làm (5–20 giây)", "Lời thoại: Hỏi tuổi rồi dành tặng một lời khen [K2]", "", "NGUỒN", "[S1] Nguồn mẫu"].join("\n");

function content(id: string, status: string) {
  const now = new Date().toISOString();
  db.getDb().insert(db.schema.contentItems).values({ id, title: `Kịch bản ${id}`, format: "script", status, draft: DRAFT, createdAt: now, updatedAt: now } as typeof db.schema.contentItems.$inferInsert).run();
}

test("kịch bản đã duyệt → video: tải lên kèm kịch bản thì lời thoại vào việc dựng; gắn sau cũng được; kịch bản chưa duyệt bị chặn", () => {
  content("c_ok", "approved");
  content("c_draft", "draft");
  assert.equal(jobs.scriptSpeech("c_ok"), "Hôm nay mình chào hỏi phá băng với chị Trà Giang Hỏi tuổi rồi dành tặng một lời khen", "bỏ thẻ nguồn, nối các cảnh");
  const vid = jobs.createVideoFromSource({ title: "Nguồn", sourceUploadId: "up_x", cutSilence: false, by: "t", contentId: "c_ok" });
  const v = db.getDb().select().from(db.schema.videos).where(eq(db.schema.videos.id, vid)).get()!;
  assert.equal(v.contentId, "c_ok");
  assert.equal(v.title, "Kịch bản c_ok", "video lấy tên kịch bản");
  assert.match(jobs.latestJob(vid)!.job.prompt ?? "", /phá băng/);
  // Video tải lên không kèm kịch bản → gắn sau
  const vid2 = jobs.createVideoFromSource({ title: "Nguồn 2", sourceUploadId: "up_y", cutSilence: false, by: "t" });
  assert.match((jobs.linkVideoScript(vid2, "c_draft", "OWNER") as { error: string }).error, /đã duyệt/);
  assert.deepEqual(jobs.linkVideoScript(vid2, "c_ok", "OWNER"), { ok: true, title: "Kịch bản c_ok" });
  assert.equal(db.getDb().select().from(db.schema.videos).where(eq(db.schema.videos.id, vid2)).get()!.contentId, "c_ok");
  const fb = db.getDb().select().from(db.schema.videoFeedback).where(eq(db.schema.videoFeedback.videoId, vid2)).all();
  assert.ok(fb.some((f) => f.kind === "link_script" && /Trà Giang|c_ok/.test(f.note)));
  assert.deepEqual(jobs.linkVideoScript(vid2, null, "OWNER"), { ok: true, title: null }, "bỏ gắn");
});

test("kịch bản → script.txt → bộ dựng sửa chữ nghe sai theo kịch bản (Python thật), giữ lời nói ngoài kịch bản và mốc thời gian", () => {
  const dir = path.join(tmp, "job-x");
  const args = jobs.scriptArgs(dir, "c_ok");
  assert.equal(args.length, 1);
  const scriptPath = args[0].replace("--script=", "");
  assert.equal(fs.readFileSync(scriptPath, "utf8"), jobs.scriptSpeech("c_ok"));
  assert.deepEqual(jobs.scriptArgs(dir, null), [], "không kịch bản → không tham số");
  // Lời máy nghe: "phá bang" (sai dấu), "Trà Dang" nghe chưa chắc, và một câu OWNER nói thêm ngoài kịch bản
  const heard = "dạ hôm nay trời đẹp Hôm nay mình chào hỏi phá bang với chị Trà Dang".split(" ");
  const words = heard.map((t, i) => ({ text: t, start: i * 0.4, end: i * 0.4 + 0.3, p: t === "Dang" ? 0.3 : 0.95, uncertain: t === "Dang" }));
  const wPath = path.join(dir, "words.json");
  fs.writeFileSync(wPath, JSON.stringify(words));
  const py = `import json,sys; sys.path.insert(0, ${JSON.stringify(path.join(process.cwd(), "scripts", "video"))}); import script_align as S
w=json.load(open(${JSON.stringify(wPath)})); fx=S.correct(w, open(${JSON.stringify(scriptPath)}).read()); print(json.dumps({"words":[x["text"] for x in w],"starts":[x["start"] for x in w],"fixes":fx}, ensure_ascii=False))`;
  const r = spawnSync(process.env.PYTHON_BIN || "python3", ["-c", py], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.deepEqual(out.words, "dạ hôm nay trời đẹp Hôm nay mình chào hỏi phá băng với chị Trà Giang".split(" "));
  assert.deepEqual(out.starts, words.map((w) => w.start), "chỉ thay tại chỗ, mốc giữ nguyên");
  assert.equal(out.fixes.length, 2);
});
