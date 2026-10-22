#!/usr/bin/env node
// Hook PreToolUse (Bash) cho mọi phiên Claude Code / agent trong repo BAOR — cấu hình ở .claude/settings.json.
// Chặn (thoát mã 2, lý do in ra stderr để agent đọc) những lệnh vượt ranh giới quyền của BAOR (docs/BAOR_OPERATING_MODEL.md §3):
//   - đẩy thẳng / ép đẩy lên `main` (main TỰ TRIỂN KHAI production mkt.baor.vn), xoá nhánh xa, --mirror
//   - `git add -A` / `git add .` / `git commit -a` (repo CÔNG KHAI: phải stage đúng tệp)
//   - stage dữ liệu thật hay tài liệu nội bộ: data/, data-*/, docs/brand-engine/, .env*
//   - `git clean -f…` (xoá docs/brand-engine/ và dữ liệu chưa theo dõi), `rm -rf` vào data/
//   - chạy script triển khai (deploy/*.sh), ssh / scp / rsync tới máy chủ
// Không đọc được đầu vào thì CHẶN (đóng an toàn). Tự kiểm: node scripts/agent/guard-bash.mjs --self-test
import { execSync } from "node:child_process";

const RULES = [
  [/\bgit\s+push\b[^|;&]*\s(--force(-with-lease)?|-f)\b/, "Ép đẩy (force push) bị cấm."],
  [/\bgit\s+push\b[^|;&]*\s(--mirror|--delete|-d)\b/, "Đẩy --mirror / xoá nhánh xa bị cấm."],
  [/\bgit\s+push\b[^|;&]*\s(\S*:)?(refs\/heads\/)?main(\s|$)/, "Không đẩy lên main: main tự triển khai production. Ghép chỉ khi OWNER nói MERGE, qua PR."],
  [/\bgit\s+push\b[^|;&]*\s\+\S+/, "Refspec có dấu + (ép đẩy) bị cấm."],
  [/\bgit\s+add\s+([^|;&]*\s)?(-A|--all|\.|:\/|\*)(\s|$)/, "Repo công khai: stage đúng từng tệp, không `git add -A` / `git add .`."],
  [/\bgit\s+commit\s+([^|;&]*\s)?-[a-zA-Z]*a[a-zA-Z]*(\s|$)/, "Không `git commit -a`: stage đúng từng tệp."],
  [/\bgit\s+add\b[^|;&]*\s['"]?(\.\/)?(data(-[a-z]+)?\/|data(\s|$)|docs\/brand-engine|\S*\.env(\.\S+)?(\s|$))/, "Không stage dữ liệu thật / tài liệu nội bộ (data/, docs/brand-engine/, .env)."],
  [/\bgit\s+clean\s+[^|;&]*-[a-zA-Z]*f/, "Không `git clean -f`: sẽ xoá docs/brand-engine/ và dữ liệu chưa theo dõi."],
  [/\brm(\s+-[a-zA-Z]*[rR][a-zA-Z]*)+\s+([^|;&]*\s)?["']?(\.\/)?data(-[a-z]+)?(\/|\s|$|["'])/, "Không xoá thư mục dữ liệu (data/). Lưu trữ thay vì xoá."],
  [/\brm(\s+-[a-zA-Z]*[rR][a-zA-Z]*)+\s[^|;&]*BAOR AI OS\/data(-[a-z]+)?(\/|\s|$|["'])/, "Không xoá thư mục dữ liệu (data/). Lưu trữ thay vì xoá."],
  [/(^|[\s;&|(])(bash|sh|zsh)?\s*\.?\/?deploy\/[\w.-]+\.sh\b/, "Không tự chạy script triển khai (production là điểm dừng OWNER)."],
  [/(^|[\s;&|(])(ssh|scp|rsync)\s/, "Không ssh / scp / rsync tới máy chủ (production là điểm dừng OWNER)."],
  [/\bgit\s+(commit|push)\b[^|;&]*\s(--no-verify|-n)(\s|$)/, "Không bỏ qua git hook (--no-verify): cổng verify phải chạy."],
  [/\bcore\.hooksPath\b(?!\s+\.githooks)/, "Không đổi core.hooksPath (git hook bảo vệ của BAOR)."],
  [/\bgh\s+pr\s+merge\b/, "Không tự ghép PR: ghép = triển khai production, chỉ khi OWNER nói MERGE."],
];

function currentBranch() {
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

/** Lý do chặn, hoặc null nếu cho chạy. `branch` để kiểm `git push` trơn khi đang đứng trên main. */
export function check(command, branch = "") {
  // Nội dung lời nhắn commit (-m "…") là chữ, không phải lệnh: thay bằng MSG trước khi so luật.
  const cmd = ` ${String(command)
    .replace(/\\\n/g, " ")
    .replace(/(\s(-m|--message)(=|\s*))("(?:[^"\\]|\\.)*"|'[^']*')/g, "$1MSG")} `;
  for (const [re, why] of RULES) if (re.test(cmd)) return why;
  if (branch === "main" && /\bgit\s+push(\s+(-u\s+)?origin)?\s*([;&|]|$)/m.test(cmd.trim())) return "Đang đứng trên main: không đẩy. Tạo nhánh feature/… trước.";
  return null;
}

const CASES = [
  // [lệnh, nhánh, phải chặn?]
  ["git push origin feature/brand-cp01", "feature/brand-cp01", false],
  ["git push -q origin feature/brand-cp01 2>&1 | tail -2", "feature/brand-cp01", false],
  ["git push origin main", "feature/x", true],
  ["git push origin HEAD:main", "feature/x", true],
  ["git push origin feature/x:refs/heads/main", "feature/x", true],
  ["git push --force origin feature/x", "feature/x", true],
  ["git push -f origin feature/x", "feature/x", true],
  ["git push --force-with-lease", "feature/x", true],
  ["git push origin +feature/x", "feature/x", true],
  ["git push origin --delete feature/x", "feature/x", true],
  ["git push", "main", true],
  ["git push", "feature/x", false],
  ["cd repo && git push origin main", "feature/x", true],
  ["git add -A", "feature/x", true],
  ["git add .", "feature/x", true],
  ["git add --all src", "feature/x", true],
  ["git add src/lib/a.ts tests/a.test.ts", "feature/x", false],
  ["git add data/baor.db", "feature/x", true],
  ["git add docs/brand-engine/x.md", "feature/x", true],
  ["git add .env.local", "feature/x", true],
  ["git add src/lib/database.ts docs/BAOR_OPERATING_MODEL.md", "feature/x", false],
  ["git commit -am 'x'", "feature/x", true],
  ["git commit -q -m \"Sửa lỗi\"", "feature/x", false],
  ["git commit -q -m \"chặn git add -A, stage data/ · .env\" && git log -1", "feature/x", false],
  ["git commit -m 'x' && git add data/a.db", "feature/x", true],
  ["git commit -m \"x\" && git push origin main", "feature/x", true],
  ["git clean -fd", "feature/x", true],
  ["git clean -n", "feature/x", false],
  ["rm -rf data/video-jobs/v_1", "feature/x", true],
  ["rm -rf data", "feature/x", true],
  ["rm -rf /tmp/x/scratch", "feature/x", false],
  ["rm -rf artifacts/e2e", "feature/x", false],
  ["bash deploy/update.sh", "feature/x", true],
  ["./deploy/install.sh", "feature/x", true],
  ["ssh root@1.2.3.4 ls", "feature/x", true],
  ["rsync -a x host:/opt", "feature/x", true],
  ["gh pr merge 2 --squash", "feature/x", true],
  ["gh pr view 2", "feature/x", false],
  ["git push --no-verify origin feature/x", "feature/x", true],
  ["git commit --no-verify -m x", "feature/x", true],
  ["git config core.hooksPath /dev/null", "feature/x", true],
  ["git config core.hooksPath .githooks", "feature/x", false],
  ["npm run verify", "feature/x", false],
  ["git log --oneline main..HEAD", "feature/x", false],
  ["git diff main -- src", "feature/x", false],
  ["grep -rn 'git push origin main' docs", "feature/x", false],
  ["rm -rf \"/Volumes/NOLI_AI_OS/1.NOLIGRCORE/BAOR AI OS/data/uploads\"", "feature/x", true],
  ["rm -rf ./data-infra", "feature/x", true],
  ["rm -f data/x.tmp", "feature/x", false],
];

if (process.argv.includes("--self-test")) {
  let bad = 0;
  for (const [cmd, br, block] of CASES) {
    const got = check(cmd, br) !== null;
    if (got !== block) {
      bad++;
      console.error(`SAI: ${JSON.stringify(cmd)} (nhánh ${br}) → ${got ? "chặn" : "cho"}, cần ${block ? "chặn" : "cho"}`);
    }
  }
  console.log(`guard-bash tự kiểm: ${CASES.length - bad}/${CASES.length} đạt`);
  process.exit(bad ? 1 : 0);
}

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let command;
  try {
    command = JSON.parse(raw)?.tool_input?.command;
  } catch {
    command = undefined;
  }
  if (typeof command !== "string") {
    console.error("guard-bash: không đọc được lệnh từ hook, chặn để an toàn.");
    process.exit(2);
  }
  const why = check(command, currentBranch());
  if (why) {
    console.error(`BAOR guard: ${why} (docs/BAOR_OPERATING_MODEL.md §3). Lệnh bị chặn: ${command.slice(0, 200)}`);
    process.exit(2);
  }
  process.exit(0);
});
