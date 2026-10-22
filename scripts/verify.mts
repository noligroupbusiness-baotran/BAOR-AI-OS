// Cổng kiểm chứng duy nhất của BAOR (docs/BAOR_OPERATING_MODEL.md §5). Chạy cùng một chuỗi ở máy và trên CI.
//   npm run verify            guardrails · typecheck · lint · security · test (unit + tích hợp CSDL tạm) · build
//   npm run verify:e2e        chỉ E2E Playwright trên bản build production (cần đã build)
//   npm run verify:full       tất cả ở trên
//   --no-build                bỏ build (vòng phát triển nhanh; KHÔNG dùng làm bằng chứng tích hợp)
// Ghi bằng chứng gắn đúng commit: artifacts/verification-evidence/<sha>.json + latest.json (không commit).
// Một bước đỏ → dừng, thoát mã 1. Không có cờ bỏ qua test.
import { spawnSync, execSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const args = new Set(process.argv.slice(2));
const e2eOnly = args.has("--e2e-only");
const withE2e = args.has("--e2e") || e2eOnly;
const noBuild = args.has("--no-build");

type Step = { name: string; cmd: string[]; env?: Record<string, string> };
const steps: Step[] = e2eOnly
  ? []
  : [
      { name: "guardrails", cmd: ["npx", "tsx", "scripts/guardrails.mts"] },
      { name: "typecheck", cmd: ["npx", "tsc", "--noEmit", "-p", "."] },
      { name: "lint", cmd: ["npx", "eslint", "."] },
      { name: "security", cmd: ["npx", "tsx", "scripts/security-check.mts"] },
      { name: "test", cmd: ["node", "--import", "tsx", "--test", ...fs.readdirSync("tests").filter((f) => f.endsWith(".test.ts")).map((f) => `tests/${f}`)] },
      ...(noBuild ? [] : [{ name: "build", cmd: ["npx", "next", "build"] }]),
    ];
if (withE2e) steps.push({ name: "e2e", cmd: ["npx", "playwright", "test"] });

const git = (c: string) => {
  try {
    return execSync(c, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
};
const commitSha = git("git rev-parse HEAD");
const dirty = git("git status --porcelain").split("\n").filter((l) => l && !l.includes("docs/brand-engine/"));
const fingerprint = createHash("sha256").update(commitSha).update(git("git diff HEAD")).update(dirty.join("\n")).digest("hex").slice(0, 16);
const startedAt = new Date().toISOString();
const results: { name: string; result: "PASS" | "FAIL"; ms: number; tail?: string }[] = [];

let failed = false;
for (const s of steps) {
  const t = Date.now();
  process.stdout.write(`\n=== ${s.name}: ${s.cmd.join(" ").slice(0, 140)}\n`);
  const r = spawnSync(s.cmd[0], s.cmd.slice(1), { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", env: { ...process.env, ...s.env }, maxBuffer: 256 * 1024 * 1024 });
  const outText = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  process.stdout.write(outText.length > 6000 ? `…${outText.slice(-6000)}` : outText);
  const ok = r.status === 0;
  results.push({ name: s.name, result: ok ? "PASS" : "FAIL", ms: Date.now() - t, ...(ok ? {} : { tail: outText.slice(-3000) }) });
  if (!ok) {
    failed = true;
    break;
  }
}

const scope = e2eOnly ? "e2e" : withE2e ? "full" : noBuild ? "quick" : "verify";
const evidence = {
  commitSha,
  fingerprint,
  clean: dirty.length === 0,
  scope,
  result: failed ? "FAIL" : "PASS",
  steps: results,
  env: { node: process.version, platform: process.platform, ci: !!process.env.CI },
  startedAt,
  finishedAt: new Date().toISOString(),
};
const dir = path.join("artifacts", "verification-evidence");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, `${commitSha.slice(0, 12)}-${scope}.json`), JSON.stringify(evidence, null, 1));
fs.writeFileSync(path.join(dir, "latest.json"), JSON.stringify(evidence, null, 1));

console.log(`\n${"=".repeat(60)}\nVERIFY ${evidence.result} · ${scope} · ${commitSha.slice(0, 7)}${evidence.clean ? "" : " (cây có thay đổi chưa commit — bằng chứng không gắn được commit)"}`);
for (const r of results) console.log(`  ${r.result === "PASS" ? "PASS" : "FAIL"}  ${r.name.padEnd(11)} ${(r.ms / 1000).toFixed(1)} s`);
process.exit(failed ? 1 : 0);
