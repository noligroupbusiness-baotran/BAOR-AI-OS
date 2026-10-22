import fs from "node:fs";
import { getCurrentUser } from "@/lib/auth";
import { actorFor, can } from "@/lib/permissions";
import { backupFilePath } from "@/lib/backup";
import { RATE_RULES, limitOr429 } from "@/lib/rate-limit";
import { logSecurityEvent } from "@/lib/security";

// Tải một bản sao lưu về máy: /backups/baor-YYYYMMDD-HHMMSS.db.
// Bản sao lưu chứa toàn bộ CSDL (khách hàng, băm mật khẩu, token đã mã hóa) nên chỉ Quản trị tải được.
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Chưa đăng nhập", { status: 401 });
  const actor = actorFor(user.email);
  if (!can(actor, "admin")) return new Response("Cần quyền Quản trị để tải bản sao lưu", { status: 403 });
  const limited = limitOr429(`export:${actor.email}`, RATE_RULES.export);
  if (limited) return limited;
  const { name } = await params;
  const file = backupFilePath(name);
  if (!file) return new Response("Không có bản sao lưu này", { status: 404 });
  logSecurityEvent("backup_downloaded", { email: actor.email, detail: name });
  const buf = fs.readFileSync(file);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.sqlite3",
      "Content-Length": String(buf.byteLength),
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
