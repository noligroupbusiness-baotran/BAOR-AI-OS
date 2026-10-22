// S3 Biên tập AI: lõi không cần mô hình của scripts/video/ai_plan.py (ghép cụm vào LỜI NÓI THẬT, so khớp giữ dấu, chia câu).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";

test("ai_plan: chữ trên màn hình luôn lấy từ lời nói thật; lọc giữ dấu; chia câu ở chỗ ngắt hơi", () => {
  const r = spawnSync(process.env.PYTHON_BIN || "python3", [path.join(import.meta.dirname, "..", "scripts", "video", "ai_plan.py"), "--self-test"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /ai_plan tự kiểm: đạt/);
});
