// Luật cứng kiểm bằng máy (bước đầu của npm run verify). Mỗi luật sinh ra từ một quy tắc của chuẩn vận hành
// (docs/BAOR_OPERATING_MODEL.md §5) để không phải nhắc bằng lời. Vi phạm → thoát mã 1.
//   GR-01 Không tắt test: .skip / .only / { skip: true } / todo trong tests/ và tests-e2e/
//   GR-02 Không nới TypeScript: @ts-ignore / @ts-nocheck / @ts-expect-error; tsconfig phải strict
//   GR-03 Không tắt lint cả tệp: `/* eslint-disable */` (chỉ cho tắt từng dòng, có tên luật)
//   GR-04 Hook bảo vệ của Claude Code còn nguyên: .claude/settings.json có guard-bash (PreToolUse) và session-start (SessionStart)
//   GR-05 guard-bash tự kiểm đạt
//   GR-06 Cơ chế khôi phục phiên còn: docs/BAOR_PHASE01_STATUS.md có khối <!-- NEXT:START --> … <!-- NEXT:END -->
//   GR-07 Agent phản biện không có quyền sửa: .claude/agents/baor-reviewer.md không có Edit / Write trong tools
import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";

const errors: string[] = [];
const tracked = execSync("git ls-files -z --cached --others --exclude-standard", { encoding: "utf8" })
  .split("\0")
  .filter((f) => f && fs.existsSync(f) && !f.startsWith("docs/brand-engine/"));
const read = (f: string) => fs.readFileSync(f, "utf8");
const lineOf = (text: string, i: number) => text.slice(0, i).split("\n").length;

for (const f of tracked.filter((f) => /^tests(-e2e)?\/.*\.(ts|tsx|mts)$/.test(f))) {
  const t = read(f);
  // .skip / .only / .todo / .fixme; tuỳ chọn { skip: … } / { todo: … } / { only: … } với BẤT KỲ giá trị (node:test nhận chuỗi); t.skip() trong thân test
  for (const re of [/\b(test|it|describe|suite)\.(skip|only|todo|fixme)\s*\(/g, /[{,]\s*(skip|only|todo)\s*:/g, /\b[a-zA-Z_]\w*\.(skip|todo)\s*\(\s*\)/g]) {
    for (const m of t.matchAll(re)) errors.push(`GR-01 ${f}:${lineOf(t, m.index ?? 0)} tắt / lọc test (${m[0]})`);
  }
}
for (const f of tracked.filter((f) => /^(src|tests|tests-e2e|scripts)\/.*\.(ts|tsx|mts|mjs|js|cjs)$/.test(f) || /^[^/]+\.(ts|mts|mjs|js|cjs)$/.test(f))) {
  const t = read(f);
  for (const m of t.matchAll(/@ts-(ignore|nocheck|expect-error)/g)) if (f !== "scripts/guardrails.mts") errors.push(`GR-02 ${f}:${lineOf(t, m.index ?? 0)} ${m[0]}`);
  for (const m of t.matchAll(/\/\*\s*eslint-disable(?!-next-line|-line)(\s|\*)/g)) if (f !== "scripts/guardrails.mts") errors.push(`GR-03 ${f}:${lineOf(t, m.index ?? 0)} tắt lint cả tệp`);
}
try {
  const ts = JSON.parse(read("tsconfig.json"));
  if (ts.compilerOptions?.strict !== true) errors.push("GR-02 tsconfig.json: compilerOptions.strict phải là true");
  // Không tắt lén từng cờ con của strict
  for (const k of ["noImplicitAny", "strictNullChecks", "strictFunctionTypes", "strictBindCallApply", "strictPropertyInitialization", "noImplicitThis", "alwaysStrict", "useUnknownInCatchVariables"])
    if (ts.compilerOptions?.[k] === false) errors.push(`GR-02 tsconfig.json: không tắt ${k}`);
  // Không loại mã khỏi kiểm kiểu: exclude chỉ được chứa thư mục ngoài mã
  const allowEx = new Set(["node_modules", "artifacts", "test-results", "playwright-report", ".next"]);
  for (const x of ts.exclude ?? []) if (!allowEx.has(String(x).replace(/\/\*\*.*$/, "").replace(/\/$/, ""))) errors.push(`GR-02 tsconfig.json: exclude "${x}" loại mã khỏi kiểm kiểu`);
} catch {
  errors.push("GR-02 không đọc được tsconfig.json");
}
try {
  const st = read(".claude/settings.json");
  if (!/guard-bash\.mjs/.test(st) || !/"PreToolUse"/.test(st)) errors.push("GR-04 .claude/settings.json thiếu hook PreToolUse guard-bash");
  if (!/session-start\.mjs/.test(st) || !/"SessionStart"/.test(st)) errors.push("GR-04 .claude/settings.json thiếu hook SessionStart");
} catch {
  errors.push("GR-04 thiếu .claude/settings.json");
}
// Tắt hook ở cấu hình cục bộ (không commit) cũng là vô hiệu hoá lớp bảo vệ
for (const f of [".claude/settings.local.json", `${process.env.HOME ?? ""}/.claude/settings.json`]) {
  try {
    const j = JSON.parse(read(f));
    if (j.disableAllHooks === true) errors.push(`GR-04 ${f.replace(process.env.HOME ?? "~", "~")}: disableAllHooks = true vô hiệu hook bảo vệ BAOR`);
  } catch {
    /* không có tệp */
  }
}
const g = spawnSync("node", ["scripts/agent/guard-bash.mjs", "--self-test"], { encoding: "utf8" });
if (g.status !== 0) errors.push(`GR-05 guard-bash tự kiểm lỗi:\n${g.stdout}${g.stderr}`);
else console.log(g.stdout.trim());
if (!/<!-- NEXT:START -->[\s\S]+<!-- NEXT:END -->/.test(fs.existsSync("docs/BAOR_PHASE01_STATUS.md") ? read("docs/BAOR_PHASE01_STATUS.md") : "")) errors.push("GR-06 docs/BAOR_PHASE01_STATUS.md thiếu khối NEXT (khôi phục phiên)");
const rv = fs.existsSync(".claude/agents/baor-reviewer.md") ? read(".claude/agents/baor-reviewer.md") : "";
const tools = rv.match(/^tools:\s*(.+)$/m)?.[1] ?? "";
if (!rv) errors.push("GR-07 thiếu .claude/agents/baor-reviewer.md");
else if (!tools || /\b(Edit|Write|NotebookEdit)\b/.test(tools)) errors.push("GR-07 baor-reviewer phải khai báo tools và không có Edit / Write");

if (errors.length) {
  console.error(`Guardrails: ${errors.length} vi phạm\n${errors.join("\n")}`);
  process.exit(1);
}
console.log("Guardrails: 7/7 luật đạt");
