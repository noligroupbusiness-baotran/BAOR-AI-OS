// Dữ liệu E2E: chạy trước `next start` (playwright.config.ts → webServer). Chỉ ghi vào artifacts/e2e/data (DATA_DIR tạm).
// Một video "đã dựng" 2 bản (v1, v2) với preview.mp4 thật 8 giây (ffmpeg testsrc2) + kế hoạch biên tập, để đi luồng xem / góp ý / so bản.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

// Chỉ xoá / ghi đúng thư mục E2E đã định (so đường dẫn tuyệt đối đã chuẩn hoá — không lọt kiểu artifacts/e2e/../../data)
const expected = path.resolve(import.meta.dirname, "..", "artifacts", "e2e", "data");
const dataDir = path.resolve(process.env.DATA_DIR ?? "");
if (dataDir !== expected) throw new Error(`seed E2E chỉ chạy với DATA_DIR = ${expected}, nhận: ${process.env.DATA_DIR}`);
fs.rmSync(dataDir, { recursive: true, force: true });
fs.mkdirSync(path.join(dataDir, "uploads"), { recursive: true });

const { getDb, schema } = await import("../src/db/index");
const db = getDb();
const now = new Date().toISOString();
const VID = "v_e2e_review";

function mp4(out: string, seconds: number, label: string) {
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `testsrc2=s=270x480:r=30:d=${seconds}`, "-f", "lavfi", "-i", `sine=f=440:d=${seconds}`,
    "-vf", `drawtext=text='${label}':x=20:y=20:fontsize=28:fontcolor=white`, "-shortest", "-pix_fmt", "yuv420p", "-c:v", "libx264", "-c:a", "aac", out], { encoding: "utf8" });
  if (r.status !== 0) {
    // ffmpeg không có drawtext (thiếu freetype): dựng không chữ
    const r2 = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `testsrc2=s=270x480:r=30:d=${seconds}`, "-f", "lavfi", "-i", `sine=f=440:d=${seconds}`, "-shortest", "-pix_fmt", "yuv420p", "-c:v", "libx264", "-c:a", "aac", out], { encoding: "utf8" });
    if (r2.status !== 0) throw new Error(`ffmpeg lỗi: ${r2.stderr}`);
  }
}

// Nguồn (tệp gốc) + video
const src = "e2e-source.mp4";
mp4(path.join(dataDir, "uploads", src), 8, "NGUON");
db.insert(schema.uploads).values({ id: "up_e2e_src", kind: "video", name: src, fileName: src, mime: "video/mp4", size: fs.statSync(path.join(dataDir, "uploads", src)).size, meta: "{}", uploadedBy: "E2E", createdAt: now }).run();
db.insert(schema.videos).values({ id: VID, title: "E2E · Video chờ góp ý", contentId: null, agent: "Agent Edit Video", status: "review", platforms: '["facebook"]', version: 2, note: "", uploadId: "up_e2e_src", updatedAt: now }).run();

const plan = {
  by: "Biên tập: E2E",
  note: "Kế hoạch mẫu cho E2E",
  emphasis: [
    { t: 1.5, text: "PHÁ BĂNG", style: "blur" },
    { t: 4.2, text: "Chào hỏi", style: "fade" },
  ],
  diagrams: [{ type: "arrow", t0: 5.0, t1: 7.5, top: { t: 5.1, text: "phần chào hỏi" }, bottom: { t: 6.2, text: "gỡ bỏ khoảng cách" } }],
  broll: [],
};
const report = (v: number) => ({
  skill: { name: "Skill ESV (E2E)" },
  input: {},
  output: { master: "", preview: "preview.mp4", aspect: "9:16", width: 270, height: 480, frames: 240, seconds: 8, cutSilence: false, keep: null },
  qa: [{ id: "A", name: "Khung hình, fps, số khung", status: "pass", detail: `bản ${v}` }],
  failed: [],
  blockers: [],
  elapsedSec: 12,
});
for (const v of [1, 2]) {
  const dir = path.join(dataDir, "video-jobs", VID, `v${v}`);
  fs.mkdirSync(dir, { recursive: true });
  mp4(path.join(dir, "preview.mp4"), 8, `BAN ${v}`);
  fs.writeFileSync(path.join(dir, "job.json"), JSON.stringify({ videoId: VID, version: v, status: "done", sourceUploadId: "up_e2e_src", cutSilence: false, aspect: "9:16", prompt: "", createdAt: now, by: "E2E", startedAt: now, finishedAt: now, runId: `run_e2e_${v}` }));
  fs.writeFileSync(path.join(dir, "report.json"), JSON.stringify(report(v)));
  fs.writeFileSync(path.join(dir, "plan.json"), JSON.stringify(plan));
}
fs.writeFileSync(path.join(dataDir, "video-jobs", VID, "plan.json"), JSON.stringify(plan));
// Kịch bản đã duyệt để gắn vào video (Nội dung → Video)
db.insert(schema.contentItems).values({ id: "c_e2e_script", title: "E2E · Kịch bản chào hỏi phá băng", format: "script", status: "approved",
  draft: "1. Mở đầu (0–5 giây)\nLời thoại: Hôm nay mình chào hỏi phá băng\n", createdAt: now, updatedAt: now } as typeof schema.contentItems.$inferInsert).run();
// Quảng cáo đã có số liệu Insights (không nằm trên Meta, không tiêu tiền) để kiểm hiển thị reach / CPM / CTR
db.insert(schema.adCampaigns).values({ id: "ad_e2e_metrics", name: "E2E · Quảng cáo có số liệu", objective: "video_views", status: "paused", dailyBudget: 100000,
  spent: 120000, impressions: 5000, clicks: 60, reach: 6100, leads: 3, audience: "" } as typeof schema.adCampaigns.$inferInsert).run();
console.log(`E2E seed: ${VID} (v1, v2) trong ${dataDir}`);
