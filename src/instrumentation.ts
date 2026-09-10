// Chạy một lần khi server Next.js khởi động: bật lịch sao lưu CSDL định kỳ (mặc định 20 phút/lần).
// Chỉ chạy ở runtime Node.js (better-sqlite3 là module native), không chạy ở Edge hay lúc build.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { startBackupScheduler } = await import("@/lib/backup");
  startBackupScheduler();
}
