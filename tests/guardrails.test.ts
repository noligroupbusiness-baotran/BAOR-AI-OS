// Luật cứng (scripts/guardrails.mts) phải ĐỎ trên vi phạm thật — thử đột biến trong một repo tạm (không chạm repo thật).
// Các đột biến lấy từ phản biện S1 (22/10/2026): những dạng từng lọt.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "..");
const TSX = path.join(ROOT, "node_modules", ".bin", "tsx");

function sandbox(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "baor-gr-"));
  for (const f of ["scripts/guardrails.mts", "scripts/agent/guard-bash.mjs", "tsconfig.json", ".claude/settings.json", ".claude/agents/baor-reviewer.md", "docs/BAOR_PHASE01_STATUS.md"]) {
    fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, f), path.join(d, f));
  }
  fs.mkdirSync(path.join(d, "tests"), { recursive: true });
  fs.mkdirSync(path.join(d, "src"), { recursive: true });
  fs.writeFileSync(path.join(d, "tests", "a.test.ts"), 'import { test } from "node:test";\ntest("a", () => {});\n');
  fs.writeFileSync(path.join(d, "src", "a.ts"), "export const a = 1;\n");
  execFileSync("git", ["init", "-q"], { cwd: d });
  return d;
}
// Chuỗi vi phạm ghép từ mảnh lúc chạy: tệp test này không tự chứa vi phạm nguyên vẹn (guardrails quét cả tests/)
const J = (...p: string[]) => p.join("");
const SKIP = J("sk", "ip");
const TS_IGNORE = J("@ts", "-ignore");
const ESL_OFF = J("/* eslint", "-disable */");
const run = (d: string) => spawnSync(TSX, ["scripts/guardrails.mts"], { cwd: d, encoding: "utf8", env: { ...process.env, HOME: d } });

test("guardrails: mã sạch đạt; mỗi vi phạm (kể cả dạng từng lọt) làm đỏ", () => {
  const clean = sandbox();
  const ok = run(clean);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);

  const mutations: [string, (d: string) => void, RegExp][] = [
    ["test.skip", (d) => fs.writeFileSync(path.join(d, "tests/a.test.ts"), `import { test } from "node:test";\ntest.${SKIP}("a", () => {});\n`), /GR-01/],
    ["tuỳ chọn bỏ qua có giá trị chuỗi (node:test)", (d) => fs.writeFileSync(path.join(d, "tests/a.test.ts"), `import { test } from "node:test";\ntest("a", { ${SKIP}: "tạm" }, () => {});\n`), /GR-01/],
    ["gọi bỏ qua trong thân test", (d) => fs.writeFileSync(path.join(d, "tests/a.test.ts"), `import { test } from "node:test";\ntest("a", (t) => { t.${SKIP}(); });\n`), /GR-01/],
    ["ts-ignore", (d) => fs.writeFileSync(path.join(d, "src/a.ts"), `// ${TS_IGNORE}\nexport const a = 1;\n`), /GR-02/],
    ["tắt noImplicitAny", (d) => { const p = path.join(d, "tsconfig.json"); const j = JSON.parse(fs.readFileSync(p, "utf8")); j.compilerOptions.noImplicitAny = false; fs.writeFileSync(p, JSON.stringify(j)); }, /GR-02.*noImplicitAny/],
    ["exclude src/lib", (d) => { const p = path.join(d, "tsconfig.json"); const j = JSON.parse(fs.readFileSync(p, "utf8")); j.exclude.push("src/lib"); fs.writeFileSync(p, JSON.stringify(j)); }, /GR-02.*exclude/],
    ["tắt lint cả tệp trong .mjs", (d) => fs.writeFileSync(path.join(d, "scripts/x.mjs"), `${ESL_OFF}\nexport {};\n`), /GR-03/],
    ["bỏ hook PreToolUse", (d) => fs.writeFileSync(path.join(d, ".claude/settings.json"), "{}"), /GR-04/],
    ["disableAllHooks ở settings.local.json", (d) => fs.writeFileSync(path.join(d, ".claude/settings.local.json"), '{"disableAllHooks": true}'), /GR-04.*disableAllHooks/],
    ["guard-bash hỏng tự kiểm", (d) => { const p = path.join(d, "scripts/agent/guard-bash.mjs"); fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace('["git push origin main", "feature/x", true]', '["git push origin main", "feature/x", false]')); }, /GR-05/],
    ["mất khối NEXT", (d) => fs.writeFileSync(path.join(d, "docs/BAOR_PHASE01_STATUS.md"), "# trạng thái\n"), /GR-06/],
    ["reviewer có Edit", (d) => { const p = path.join(d, ".claude/agents/baor-reviewer.md"); fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace(/^tools:.*$/m, "tools: Read, Edit, Bash")); }, /GR-07/],
  ];
  for (const [name, mutate, expect] of mutations) {
    const d = sandbox();
    mutate(d);
    const r = run(d);
    assert.notEqual(r.status, 0, `đột biến "${name}" phải làm guardrails đỏ`);
    assert.match(r.stdout + r.stderr, expect, name);
  }
});
