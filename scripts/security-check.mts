// Kiểm tra bảo mật tĩnh, chạy trong gate: npm run security
// 1) Không có tệp .env* hay CSDL/sao lưu nào bị git theo dõi.
// 2) Không có chuỗi giống secret thật (khóa API, token, private key) trong mã nguồn đã theo dõi.
// 3) Không ai gọi eval / dangerouslySetInnerHTML / child_process với chuỗi từ người dùng (cảnh báo để rà tay).
// 4) npm audit ở mức high trở lên (bỏ qua nếu không có mạng, in cảnh báo).
// Thoát mã 1 khi có lỗi; cảnh báo không làm gate đỏ.
import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";

const errors: string[] = [];
const warnings: string[] = [];

const tracked = execSync("git ls-files -z", { encoding: "utf8" }).split("\0").filter(Boolean);

// 1) Tệp không bao giờ được commit
for (const f of tracked) {
  const base = f.split("/").pop() ?? f;
  if (/^\.env(\..+)?$/.test(base) && base !== ".env.example") errors.push(`Tệp môi trường bị theo dõi: ${f}`);
  if (/\.(db|sqlite|sqlite3|db-wal|db-shm|pem|key|p12|pfx)$/i.test(base)) errors.push(`Tệp dữ liệu / khóa bị theo dõi: ${f}`);
  if (/^data(-[a-z]+)?\//.test(f)) errors.push(`Thư mục dữ liệu bị theo dõi: ${f}`);
  if (/^(docs\/brand-engine|artifacts)\//.test(f)) errors.push(`Tài liệu nội bộ / bằng chứng máy bị theo dõi (repo công khai): ${f}`);
}

// 2) Mẫu secret thật. Chỉ quét tệp văn bản nhỏ; bỏ lock file và tệp test có giá trị giả rõ ràng.
const SECRET_PATTERNS: [RegExp, string][] = [
  [/sk-ant-[A-Za-z0-9_-]{20,}/, "khóa Anthropic"],
  [/\bAKIA[0-9A-Z]{16}\b/, "AWS access key"],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}\b/, "token GitHub"],
  [/\bgithub_pat_[A-Za-z0-9_]{30,}\b/, "token GitHub (fine-grained)"],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/, "token Slack"],
  [/-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----/, "private key"],
  [/\bEAA[A-Za-z0-9]{60,}\b/, "token Meta (EAA...)"],
  [/(AUTH_SECRET|ADMIN_PASSWORD|ANTHROPIC_API_KEY|BACKUP_GITHUB_TOKEN)\s*=\s*['"]?[A-Za-z0-9+/_-]{24,}/, "biến môi trường có giá trị thật"],
];
const SKIP = /(^|\/)(package-lock\.json|tsconfig\.tsbuildinfo)$|\.(png|jpg|jpeg|webp|ico|svg|woff2?|ttf|otf|mp3|mp4|wav)$/i;
for (const f of tracked) {
  if (SKIP.test(f) || !fs.existsSync(f)) continue;
  const st = fs.statSync(f);
  if (!st.isFile() || st.size > 2 * 1024 * 1024) continue;
  const text = fs.readFileSync(f, "utf8");
  for (const [re, label] of SECRET_PATTERNS) {
    const m = re.exec(text);
    if (!m) continue;
    // Giá trị mẫu / test được phép: chứa "example", "test", "changeme", "xxxx".
    if (/example|test|changeme|xxxx|your-|<.*>/i.test(m[0])) continue;
    const line = text.slice(0, m.index).split("\n").length;
    errors.push(`${f}:${line} có vẻ chứa ${label}: ${m[0].slice(0, 12)}…`);
  }
}

// 3) Mẫu nguy hiểm cần rà tay
const RISKY: [RegExp, string][] = [
  [/\beval\s*\(/, "eval()"],
  [/new Function\s*\(/, "new Function()"],
  [/dangerouslySetInnerHTML/, "dangerouslySetInnerHTML"],
  [/exec(Sync)?\s*\(\s*`[^`]*\$\{/, "exec với chuỗi nội suy"],
];
for (const f of tracked) {
  if (!/^src\/.*\.(ts|tsx)$/.test(f)) continue;
  const text = fs.readFileSync(f, "utf8");
  for (const [re, label] of RISKY) {
    const m = re.exec(text);
    if (m) warnings.push(`${f}:${text.slice(0, m.index).split("\n").length} dùng ${label} — rà lại đầu vào`);
  }
}

// 4) Lỗ hổng thư viện
const audit = spawnSync("npm", ["audit", "--audit-level=high", "--omit=dev", "--json"], { encoding: "utf8" });
if (audit.status === null || /ENOTFOUND|ECONNREFUSED|ENETUNREACH|EAI_AGAIN|audit endpoint/i.test(audit.stderr + audit.stdout)) {
  warnings.push("npm audit không chạy được (không có mạng?), bỏ qua.");
} else {
  try {
    const j = JSON.parse(audit.stdout || "{}") as { metadata?: { vulnerabilities?: Record<string, number> } };
    const v = j.metadata?.vulnerabilities ?? {};
    const high = (v.high ?? 0) + (v.critical ?? 0);
    if (high > 0) errors.push(`npm audit: ${high} lỗ hổng mức high/critical trong dependency chạy thật. Chạy \`npm audit\` để xem.`);
    else console.log(`npm audit: không có lỗ hổng high/critical (moderate: ${v.moderate ?? 0}, low: ${v.low ?? 0}).`);
  } catch {
    warnings.push("npm audit trả về dữ liệu không đọc được, bỏ qua.");
  }
}

for (const w of warnings) console.warn(`CẢNH BÁO  ${w}`);
for (const e of errors) console.error(`LỖI       ${e}`);
if (errors.length) {
  console.error(`\nKiểm tra bảo mật: ${errors.length} lỗi, ${warnings.length} cảnh báo.`);
  process.exit(1);
}
console.log(`Kiểm tra bảo mật: đạt (${warnings.length} cảnh báo).`);
