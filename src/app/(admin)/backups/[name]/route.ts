import fs from "node:fs";
import { getCurrentUser } from "@/lib/auth";
import { backupFilePath } from "@/lib/backup";

// Tải một bản sao lưu về máy: /backups/baor-YYYYMMDD-HHMMSS.db (chỉ khi đã đăng nhập).
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  if (!(await getCurrentUser())) return new Response("Chưa đăng nhập", { status: 401 });
  const { name } = await params;
  const file = backupFilePath(name);
  if (!file) return new Response("Không có bản sao lưu này", { status: 404 });
  const buf = fs.readFileSync(file);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.sqlite3",
      "Content-Length": String(buf.byteLength),
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
