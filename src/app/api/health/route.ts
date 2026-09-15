import { NextResponse, type NextRequest } from "next/server";
import { getSqlite } from "@/db";
import { clientIp } from "@/lib/login-guard";
import { RATE_RULES, limitOr429 } from "@/lib/rate-limit";

// Kiểm tra sức khỏe cho giám sát bên ngoài (UptimeRobot, cron curl). Không cần đăng nhập nên
// cố ý không trả gì nhạy cảm: chỉ ok/không, CSDL đọc được, thời gian chạy, thời gian phản hồi.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limited = limitOr429(`health:${clientIp((n) => req.headers.get(n))}`, RATE_RULES.health);
  if (limited) return limited;
  const t0 = performance.now();
  let db = false;
  try {
    db = getSqlite().prepare("select 1 as ok").get() !== undefined;
  } catch {
    db = false;
  }
  const body = { ok: db, db, uptimeSec: Math.round(process.uptime()), responseMs: Math.round(performance.now() - t0), at: new Date().toISOString() };
  return NextResponse.json(body, { status: db ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
