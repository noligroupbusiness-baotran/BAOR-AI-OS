#!/usr/bin/env node
// Hook SessionStart (.claude/settings.json): mỗi phiên Claude Code mới trong repo BAOR nhận ngay bối cảnh khôi phục
// (in ra stdout = đưa vào ngữ cảnh phiên). Không phải bộ điều phối: chỉ ĐỌC trạng thái đã ghi bằng văn bản + bằng chứng máy.
//   1. Chuẩn vận hành phải đọc  2. Nhánh / HEAD / tệp chưa commit  3. Bằng chứng verify gần nhất có khớp HEAD không
//   4. Khối "VIỆC TIẾP THEO" trong docs/BAOR_PHASE01_STATUS.md (giữa <!-- NEXT:START --> và <!-- NEXT:END -->)
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const sh = (c) => {
  try {
    return execSync(c, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
};

const out = [];
out.push("BAOR.vn — khôi phục phiên (hook SessionStart, scripts/agent/session-start.mjs)");
out.push("Chuẩn vận hành BẮT BUỘC: docs/BAOR_OPERATING_MODEL.md (vòng BUILD, Definition of Done, điểm dừng OWNER, cổng verify).");

const branch = sh("git rev-parse --abbrev-ref HEAD");
const head = sh("git rev-parse --short HEAD");
const dirty = sh("git status --porcelain").split("\n").filter((l) => l && !l.includes("docs/brand-engine/"));
out.push(`Nhánh: ${branch || "?"} @ ${head || "?"} · tệp chưa commit (ngoài docs/brand-engine/): ${dirty.length}`);
if (branch === "main") out.push("CẢNH BÁO: đang đứng trên main (tự triển khai production). Chuyển về nhánh làm việc trước khi sửa.");
if (dirty.length) out.push(`  ${dirty.slice(0, 8).join("\n  ")}${dirty.length > 8 ? "\n  …" : ""}`);

try {
  const ev = JSON.parse(fs.readFileSync(path.join(root, "artifacts", "verification-evidence", "latest.json"), "utf8"));
  const same = ev.commitSha?.startsWith(head) && ev.clean;
  out.push(`Verify gần nhất: ${ev.result} · ${ev.scope} · ${ev.commitSha?.slice(0, 7)} · ${ev.finishedAt} — ${same ? "KHỚP HEAD" : "KHÔNG khớp HEAD / cây bẩn: chạy lại `npm run verify` trước khi báo xong"}`);
} catch {
  out.push("Verify gần nhất: chưa có bằng chứng ở máy này (npm run verify).");
}

try {
  const status = fs.readFileSync(path.join(root, "docs", "BAOR_PHASE01_STATUS.md"), "utf8");
  const m = status.match(/<!-- NEXT:START -->([\s\S]*?)<!-- NEXT:END -->/);
  if (m) out.push("VIỆC TIẾP THEO (đã được OWNER ủy quyền — tự làm tiếp, không chờ nhắc):" + m[1].trimEnd());
  else out.push("Không thấy khối NEXT trong docs/BAOR_PHASE01_STATUS.md.");
} catch {
  out.push("Không đọc được docs/BAOR_PHASE01_STATUS.md.");
}
console.log(out.join("\n"));
