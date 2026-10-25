// Kiểm tra cấu hình môi trường lúc khởi động. Không làm sập server (tránh kéo production xuống
// vì thiếu một biến), nhưng in cảnh báo rõ ra log và đưa vào Tình trạng hệ thống trên dashboard.

export interface EnvIssue {
  level: "error" | "warn";
  text: string;
}

const WEAK_SECRETS = new Set(["", "dev-secret-change-me-in-production", "changeme", "secret", "password"]);

export function checkEnv(env: NodeJS.ProcessEnv = process.env): EnvIssue[] {
  const issues: EnvIssue[] = [];
  const prod = env.NODE_ENV === "production";
  const secret = env.AUTH_SECRET ?? "";
  if (WEAK_SECRETS.has(secret)) {
    issues.push({ level: prod ? "error" : "warn", text: "AUTH_SECRET chưa đặt: phiên đăng nhập và token nền tảng đang dùng khóa mặc định. Chạy `npm run rotate-secret` rồi đặt vào .env." });
  } else if (secret.length < 32) {
    issues.push({ level: prod ? "error" : "warn", text: `AUTH_SECRET quá ngắn (${secret.length} ký tự, cần ít nhất 32).` });
  }
  if (prod && !env.ADMIN_EMAIL) issues.push({ level: "warn", text: "ADMIN_EMAIL chưa đặt trong môi trường; chỉ đăng nhập được bằng tài khoản đã lưu trong Cài đặt." });
  if (prod && !env.PUBLIC_URL) issues.push({ level: "warn", text: "PUBLIC_URL chưa đặt; đường dẫn webhook hiển thị trong Cài đặt › Kết nối sẽ sai." });
  if (!env.ANTHROPIC_API_KEY) issues.push({ level: "warn", text: "ANTHROPIC_API_KEY chưa đặt; các việc cần AI (phi logic) sẽ bị bỏ qua, chỉ chạy phần theo luật." });
  return issues;
}

const g = globalThis as unknown as { __baorEnvIssues?: EnvIssue[] };

/** Chạy một lần lúc khởi động: in ra log và giữ lại cho dashboard. */
export function runEnvCheck(): EnvIssue[] {
  const issues = checkEnv();
  for (const i of issues) {
    const line = `[BAOR] ${i.level === "error" ? "LỖI CẤU HÌNH" : "Cảnh báo cấu hình"}: ${i.text}`;
    if (i.level === "error") console.error(line);
    else console.warn(line);
  }
  g.__baorEnvIssues = issues;
  return issues;
}

export function envIssues(): EnvIssue[] {
  return g.__baorEnvIssues ?? checkEnv();
}
