import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Worktree của các phiên Claude song song (bản sao repo, có .next riêng): không phải mã nguồn của nhánh này.
    ".claude/**",
    // Báo cáo / trace E2E do Playwright sinh ra (mã đã nén), không phải mã nguồn.
    "artifacts/**",
  ]),
]);

export default eslintConfig;
