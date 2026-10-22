#!/usr/bin/env node
// Hook PreToolUse cho mọi phiên Claude Code / agent trong repo BAOR (Bash + terminal của app) — cấu hình ở .claude/settings.json.
// Chặn (thoát mã 2, lý do in ra stderr để agent đọc) lệnh vượt ranh giới quyền của BAOR (docs/BAOR_OPERATING_MODEL.md §3):
//   - đẩy main (main TỰ TRIỂN KHAI production mkt.baor.vn), ép đẩy, xoá nhánh xa, --mirror; ghép PR (gh pr merge, gh api …/merge)
//   - stage tất cả (repo CÔNG KHAI), stage dữ liệu thật / tài liệu nội bộ (data/, docs/brand-engine/, .env trừ .env.example)
//   - bỏ qua / đổi git hook (--no-verify, -n, core.hooksPath), git clean -f, rm -r vào data/
//   - chạy script triển khai deploy/*.sh, ssh / scp / rsync tới máy khác
// Cách so: CHUẨN HOÁ trước (bỏ nội dung lời nhắn commit, bỏ dấu nháy, bỏ tuỳ chọn toàn cục của git như -C / -c / --git-dir,
// tách cờ gộp), rồi so theo từng đoạn lệnh (tách ở ; && || | xuống dòng, kể cả lệnh trong sh -c "…").
// Giới hạn (ghi ở §9): đây là lớp cục bộ dựa trên mẫu lệnh; lớp không lách được là branch protection trên GitHub (quyền OWNER).
// Không đọc được đầu vào thì CHẶN (đóng an toàn). Tự kiểm: node scripts/agent/guard-bash.mjs --self-test
import { execSync } from "node:child_process";

const GIT_GLOBAL = /\bgit((?:\s+(?:-C|-c|--git-dir|--work-tree|--namespace|--exec-path|--config-env)(?:=|\s+)(?:"[^"]*"|'[^']*'|\S+)|\s+--(?:no-pager|paginate|bare|literal-pathspecs|glob-pathspecs|noglob-pathspecs|icase-pathspecs|no-replace-objects|no-optional-locks)\b|\s+-[pP]\b)+)/g;
const END = "(?=$|[\\s;&|)])";

/** Chuẩn hoá một lệnh: trả về các đoạn lệnh đơn đã làm sạch. */
export function segments(command) {
  let c = String(command)
    .replace(/\\\n/g, " ")
    // lời nhắn commit: -m "…" / -am '…' / --message=… / -F tệp
    .replace(/(\s-[a-zA-Z]*m)(=|\s*)("(?:[^"\\]|\\.)*"|'[^']*')/g, "$1 MSG")
    .replace(/(\s--message)(=|\s+)("(?:[^"\\]|\\.)*"|'[^']*'|\S+)/g, "$1 MSG");
  // Tắt git hook qua tuỳ chọn / biến môi trường / sửa thẳng tệp: bắt TRƯỚC khi chuẩn hoá (sau đó các dấu vết này bị bỏ)
  const hookOverride =
    /\bgit\b[^\n;&|]*\s(-c|--config-env)(=|\s*)["']?core\.hookspath/i.test(c) ||
    /\bGIT_CONFIG_(COUNT|KEY_\d+|VALUE_\d+|PARAMETERS|GLOBAL|SYSTEM|NOSYSTEM)\s*=/.test(c) ||
    /\b(chmod|mv|rm|cp|tee|truncate|ln)\b[^\n;&|]*(\.githooks|\.git\/(config|hooks))/.test(c) ||
    /\bsed\s+(-[a-zA-Z]*i|--in-place)\b[^\n;&|]*(\.githooks|\.git\/(config|hooks))/.test(c) ||
    />{1,2}\s*["']?\S*(\.githooks\/|\.git\/(config|hooks))/.test(c);
  c = c.replace(GIT_GLOBAL, "git"); // lần 1: giá trị có nháy (vd -C "đường dẫn có dấu cách")
  // Dấu nháy / gạch chéo GHÉP các mảnh như shell làm (mai''n, m\ain → main); lệnh con $(…) và `…` thành đoạn riêng;
  // lệnh lồng trong sh -c "…" / eval "…" được tách đoạn ở bước split dưới đây
  c = c.replace(/\$\(/g, " ; ").replace(/`/g, " ; ").replace(/\)/g, " ; ").replace(/\\(.)/g, "$1").replace(/["']/g, "");
  c = c.replace(GIT_GLOBAL, "git"); // lần 2: lệnh lồng trong sh -c "…"
  const segs = c
    .split(/\n|;|&&|\|\||\||\b(?:sh|bash|zsh|eval)\s+-c\b|\beval\b/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    // bỏ tiền tố không đổi ý nghĩa lệnh: biến môi trường, sudo, time, command, exec, nohup, env
    .map((s) => s.replace(/^((\w+=\S*|sudo|time|command|exec|nohup|env)\s+)+/, ""))
    .filter(Boolean);
  if (hookOverride) segs.push("HOOK-OVERRIDE");
  return segs;
}

// Tiền tố viết tắt của tuỳ chọn dài: git chấp nhận mọi tiền tố không nhập nhằng (--no-verif, --for, --del…)
const NOVERIFY = "--no-v[a-z-]*";
const SEG_RULES = [
  [/^HOOK-OVERRIDE$/, "Không tắt / đổi git hook (core.hooksPath, GIT_CONFIG_*, sửa .githooks / .git/config)."],
  // ---- đẩy / ghép
  [/^git push\b.*\s(--for[a-z-]*(=\S*)?|-[a-zA-Z]*f[a-zA-Z]*)(?=\s|$)/, "Ép đẩy (force push) bị cấm."],
  [/^git push\b.*\s(--mi[a-z]*|--del[a-z]*|--de|-d|--pru[a-z]*)(?=\s|$)/, "Đẩy --mirror / xoá nhánh xa bị cấm."],
  [new RegExp(`^git push\\b.*\\s(\\S*:)?(refs/heads/)?main${END}`), "Không đẩy lên main: main tự triển khai production. Ghép chỉ khi OWNER nói MERGE, qua PR."],
  [/^git push\b.*\s\+\S+/, "Refspec có dấu + (ép đẩy) bị cấm."],
  [/^git push\b.*\$/, "Không dùng biến trong lệnh git push (không kiểm được đích)."],
  [new RegExp(`^git (push|commit|merge|rebase|am|cherry-pick|revert)\\b.*\\s${NOVERIFY}(?=\\s|$)`), "Không bỏ qua git hook (--no-verify): cổng verify phải chạy."],
  [/^gh\b.*\bpr\s+merge\b/, "Không tự ghép PR: ghép = triển khai production, chỉ khi OWNER nói MERGE."],
  // gh api chỉ để ĐỌC: ghi qua API (đổi ref, ghép, đẩy tệp qua contents, graphql mutation, bảo vệ nhánh) đi vòng mọi git hook
  [/^gh\s+api\b.*\s(-X|--method)(=|\s*)(POST|PUT|PATCH|DELETE)\b/i, "gh api chỉ dùng để đọc: ghi qua API đi vòng mọi git hook (ref, ghép, tệp, bảo vệ nhánh)."],
  [/^gh\s+api\b.*\s(-f|-F|--field|--raw-field|--input)(=|\s)/, "gh api có tham số ghi (-f / -F / --input) = ghi dữ liệu GitHub: không cho."],
  [/^gh\s+api\s+graphql\b/, "gh api graphql không dùng (có thể là mutation ghép / đổi ref)."],
  [/^gh\s+(repo\s+(delete|edit|rename|archive|sync)|ruleset\s+(?!list|view|check)|secret\s+(set|delete|remove)|variable\s+(set|delete|remove)|release\s+(create|delete|edit))\b/, "Đổi cấu hình / bí mật / bản phát hành repo là việc của OWNER."],
  [/^gh\s+(workflow\s+(run|enable)|run\s+rerun)\b/, "Không tự chạy workflow GitHub (deploy.yml có workflow_dispatch = triển khai production)."],
  // ---- stage / commit
  [/^git add\b(.*\s)?(-A|--al[a-z]*|\.|:\/|:\/:|\*|-u|--up[a-z]*)(?=\s|$)/, "Repo công khai: stage đúng từng tệp, không `git add -A` / `git add .` / `-u`."],
  [/^git add\b.*\s(\.\/)?(data(-[a-z]+)?(\/|(?=\s|$))|docs\/brand-engine|docs\/?(\*|(?=\s|$))|artifacts\/|\S*\.env(\.(?!example(?=\s|$))\S+)?(?=\s|$))/, "Không stage dữ liệu thật / tài liệu nội bộ (data/, docs/brand-engine/, .env). Stage từng tệp docs cụ thể."],
  [/^git add\b.*\s(-f|--for[a-z]*)(?=\s|$)/, "Không ép stage tệp bị .gitignore (git add -f)."],
  [/^git commit\b.*\s(-[a-zA-Z]*[an][a-zA-Z]*|--al[a-z]*)(?=\s|$)/, "Không `git commit -a` / `-n`: stage đúng từng tệp, để git hook chạy."],
  [/^git clean\b.*\s(-[a-zA-Z]*f[a-zA-Z]*|--f[a-z]*)(?=\s|$)/, "Không `git clean -f / --force`: sẽ xoá docs/brand-engine/ và dữ liệu chưa theo dõi."],
  [/^git config\b(?!.*\s--(get|get-all|list|get-regexp)\b).*\bcore\.hookspath\b(?!\s+\.githooks\s*$)/i, "Không đổi core.hooksPath (git hook bảo vệ của BAOR)."],
  [/^git (update-ref|branch\s+-[fD]\b.*\bmain\b)/, "Không sửa ref trực tiếp / ép nhánh main."],
  // ---- xoá dữ liệu
  [/^rm\b.*\s-[a-zA-Z]*[rR][a-zA-Z]*\b.*(\s|\/)(\.\/)?data(-[a-z]+)?(\/|$|\s)/, "Không xoá thư mục dữ liệu (data/). Lưu trữ thay vì xoá."],
  [/^rm\b.*\s-[a-zA-Z]*[rR][a-zA-Z]*\b.*(\s|\/)docs\/brand-engine/, "Không xoá docs/brand-engine/ (tài liệu nội bộ chỉ có ở máy)."],
  [/^(find|xargs)\b.*\bdata(-[a-z]+)?\/.*(-delete|\brm\b)/, "Không xoá hàng loạt trong data/."],
  // ---- triển khai / máy khác
  [/^((bash|sh|zsh)(\s+-(?!n\b)[a-z]+)*\s+|(source|\.)\s+)?(\.\/)?deploy\/[\w.-]+\.sh\b/, "Không tự chạy script triển khai (production là điểm dừng OWNER)."],
  [/^(ssh|scp|sftp)\b/, "Không ssh / scp tới máy chủ (production là điểm dừng OWNER)."],
  [/^rsync\b.*\s\S*[\w\]]:\S*/, "Không rsync tới máy khác (production là điểm dừng OWNER)."],
];

function currentBranch() {
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

/** Lý do chặn, hoặc null nếu cho chạy. `branch`: nhánh hiện tại (đứng trên main thì mọi git push không có refspec đích đều là đẩy main). */
export function check(command, branch = "") {
  for (const s of segments(command)) {
    for (const [re, why] of SEG_RULES) if (re.test(s)) return why;
    if (branch === "main" && /^git push\b/.test(s) && !/\s\S+:\S+/.test(s)) return "Đang đứng trên main: không đẩy. Tạo nhánh feature/… trước.";
  }
  return null;
}

const CASES = [
  // [lệnh, nhánh, phải chặn?]
  ["git push origin feature/brand-cp01", "feature/brand-cp01", false],
  ["git push -q origin feature/brand-cp01 2>&1 | tail -2", "feature/brand-cp01", false],
  ["git push -u origin feature/x", "feature/x", false],
  ["git push -n origin feature/x", "feature/x", false],
  ["git push origin main", "feature/x", true],
  ["git push origin main;", "feature/x", true],
  ["git push origin main&&echo ok", "feature/x", true],
  ["git push origin main|cat", "feature/x", true],
  ["git push origin 'main'", "feature/x", true],
  ["git push origin \"HEAD:main\"", "feature/x", true],
  ["git push origin HEAD:main", "feature/x", true],
  ["git push origin feature/x:refs/heads/main", "feature/x", true],
  ["git -C . push --no-verify origin main", "feature/x", true],
  ["git -C \"/Volumes/NOLI_AI_OS/1.NOLIGRCORE/BAOR AI OS\" push origin main", "feature/x", true],
  ["git -c http.extraHeader=x --no-pager push origin main", "feature/x", true],
  ["sh -c \"git push origin main\"", "feature/x", true],
  ["bash -c 'cd x && git push origin main'", "feature/x", true],
  ["echo $(git push origin main)", "feature/x", true],
  ["git push --force origin feature/x", "feature/x", true],
  ["git push -f origin feature/x", "feature/x", true],
  ["git push -uf origin feature/x", "feature/x", true],
  ["git push -fu origin feature/x", "feature/x", true],
  ["git -C . push --force origin feature/x", "feature/x", true],
  ["git push --force-with-lease", "feature/x", true],
  ["git push origin +feature/x", "feature/x", true],
  ["git push origin --delete feature/x", "feature/x", true],
  ["git push --no-verify origin feature/x", "feature/x", true],
  ["git push", "main", true],
  ["git push origin HEAD", "main", true],
  ["git push -u origin HEAD", "main", true],
  ["git push origin HEAD:feature/new", "main", false],
  ["git push", "feature/x", false],
  ["cd repo && git push origin main", "feature/x", true],
  ["gh pr merge 2 --squash", "feature/x", true],
  ["gh -R o/r pr merge 2", "feature/x", true],
  ["gh api -X PUT repos/o/r/pulls/2/merge", "feature/x", true],
  ["gh pr view 2", "feature/x", false],
  ["gh pr create --draft --base main --head feature/x --title t", "feature/x", false],
  ["gh api repos/o/r/branches/main/protection", "feature/x", false],
  ["gh api -X DELETE repos/o/r/branches/main/protection", "feature/x", true],
  ["git add -A", "feature/x", true],
  ["git -C . add -A", "feature/x", true],
  ["git add .", "feature/x", true],
  ["git add -u", "feature/x", true],
  ["git add --all src", "feature/x", true],
  ["git add src/lib/a.ts tests/a.test.ts", "feature/x", false],
  ["git add data/baor.db", "feature/x", true],
  ["git -C . add data/baor.db", "feature/x", true],
  ["git add docs/brand-engine/x.md", "feature/x", true],
  ["git add docs/", "feature/x", true],
  ["git add docs", "feature/x", true],
  ["git add docs/BAOR_OPERATING_MODEL.md docs/archive/SESSIONS-2026-09.md", "feature/x", false],
  ["git add .env.local", "feature/x", true],
  ["git add .env", "feature/x", true],
  ["git add .env.example", "feature/x", false],
  ["git add deploy/update.sh", "feature/x", false],
  ["git add src/lib/database.ts docs/BAOR_OPERATING_MODEL.md", "feature/x", false],
  ["git add artifacts/verification-evidence/latest.json", "feature/x", true],
  ["git commit -am 'x'", "feature/x", true],
  ["git commit -q -m \"Sửa lỗi\"", "feature/x", false],
  ["git commit -q -F /tmp/msg.txt", "feature/x", false],
  ["git commit -q -m \"chặn git add -A, stage data/ · .env, push origin main\" && git log -1", "feature/x", false],
  ["git commit -m 'x' && git add data/a.db", "feature/x", true],
  ["git commit -m \"x\" && git push origin main", "feature/x", true],
  ["git commit -nm 'docs'", "feature/x", true],
  ["git commit -qn -m x", "feature/x", true],
  ["git commit --no-verify -m x", "feature/x", true],
  ["git clean -fd", "feature/x", true],
  ["git -C . clean -fd", "feature/x", true],
  ["git clean -n", "feature/x", false],
  ["git config core.hooksPath /dev/null", "feature/x", true],
  ["git config core.hookspath /dev/null", "feature/x", true],
  ["git -c core.hookspath=/dev/null commit -m x", "feature/x", true],
  ["git config core.hooksPath .githooks", "feature/x", false],
  ["git config --get core.hooksPath", "feature/x", false],
  ["grep -rn core.hooksPath scripts", "feature/x", false],
  ["rm -rf data/video-jobs/v_1", "feature/x", true],
  ["rm -rf data", "feature/x", true],
  ["rm -r -f ./data-infra", "feature/x", true],
  ["rm -rf \"/Volumes/NOLI_AI_OS/1.NOLIGRCORE/BAOR AI OS/data/uploads\"", "feature/x", true],
  ["find data/uploads -name '*.tmp' -delete", "feature/x", true],
  ["rm -rf /tmp/x/scratch", "feature/x", false],
  ["rm -rf artifacts/e2e", "feature/x", false],
  ["rm -f data/x.tmp", "feature/x", false],
  ["bash deploy/update.sh", "feature/x", true],
  ["./deploy/install.sh", "feature/x", true],
  ["cat deploy/update.sh", "feature/x", false],
  ["git diff deploy/update.sh", "feature/x", false],
  ["bash -n deploy/x.sh", "feature/x", false],
  ["bash -x deploy/update.sh", "feature/x", true],
  ["ssh root@1.2.3.4 ls", "feature/x", true],
  ["scp a host:/opt", "feature/x", true],
  ["rsync -a x host:/opt", "feature/x", true],
  ["rsync -a src/ /tmp/x/", "feature/x", false],
  ["git log --grep ssh", "feature/x", false],
  ["npm run verify", "feature/x", false],
  ["git log --oneline main..HEAD", "feature/x", false],
  ["git diff main -- src", "feature/x", false],
  ["git fetch origin main", "feature/x", false],
  ["git merge-base origin/main HEAD", "feature/x", false],
  ["grep -rn 'git push origin main' docs", "feature/x", false],
  ["git update-ref refs/heads/main HEAD", "feature/x", true],
  // phản biện vòng 2
  ["git add docs/*", "feature/x", true],
  ["git commit --no-verif -m docs", "feature/x", true],
  ["git push --no-verif bare HEAD:refs/heads/feature/x", "feature/x", true],
  ["git push --no-ver origin feature/x", "feature/x", true],
  ["git push bare HEAD:refs/heads/mai''n", "feature/x", true],
  ["git push origin HEAD:m\\ain", "feature/x", true],
  ["B=main; git push origin HEAD:$B", "feature/x", true],
  ["git push --for origin feature/x", "feature/x", true],
  ["git push --del origin feature/x", "feature/x", true],
  ["git push --mirror", "feature/x", true],
  ["gh api -X PATCH repos/o/r/git/refs/heads/main -f sha=abc", "feature/x", true],
  ["gh api repos/o/r/git/refs/heads/main -f sha=abc -X PATCH", "feature/x", true],
  ["gh api graphql -f query=mutation{mergePullRequest(input:{})}", "feature/x", true],
  ["gh api -X PUT repos/o/r/contents/docs/brand-engine/x.md -f content=eA==", "feature/x", true],
  ["gh api repos/o/r/pulls/3", "feature/x", false],
  ["gh repo delete o/r --yes", "feature/x", true],
  ["git clean --force -d", "feature/x", true],
  ["git clean -q --force -d", "feature/x", true],
  ["git clean --f -d", "feature/x", true],
  ["git add -f data/baor.db", "feature/x", true],
  ["GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/dev/null git commit -m x", "feature/x", true],
  ["git --config-env=core.hooksPath=X commit -m x", "feature/x", true],
  ["chmod -x .githooks/pre-push", "feature/x", true],
  ["mv .githooks /tmp/x", "feature/x", true],
  ["echo '[core] hooksPath=/dev/null' >> .git/config", "feature/x", true],
  ["sed -i '' 's/x/y/' .git/config", "feature/x", true],
  ["rm -rf docs/brand-engine", "feature/x", true],
  ["git commit --amend --no-edit", "feature/x", false],
  ["git push origin feature/brand-cp01 2>&1 | tail -9", "feature/brand-cp01", false],
  ["cat .githooks/pre-push", "feature/x", false],
  // phản biện vòng 3
  ["gh workflow run deploy.yml --ref feature/x", "feature/x", true],
  ["gh workflow run \"Deploy to VPS\"", "feature/x", true],
  ["gh run rerun 123", "feature/x", true],
  ["gh secret list", "feature/x", false],
  ["gh secret set VPS_HOST -b x", "feature/x", true],
  ["gh run list --workflow CI --limit 3", "feature/x", false],
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
