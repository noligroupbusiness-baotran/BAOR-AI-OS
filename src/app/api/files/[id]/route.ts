import fs from "node:fs";
import { getCurrentUser } from "@/lib/auth";
import { getUpload, uploadPath } from "@/lib/uploads";

// Phục vụ tệp tải lên (logo, nhạc, video). Chỉ người đã đăng nhập.
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getCurrentUser())) return new Response("Chưa đăng nhập", { status: 401 });
  const { id } = await params;
  const u = getUpload(id);
  const p = u ? uploadPath(u) : null;
  if (!u || !p) return new Response("Không có tệp này", { status: 404 });
  const buf = fs.readFileSync(p);
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": u.mime || "application/octet-stream", "Content-Length": String(buf.byteLength), "Cache-Control": "private, max-age=3600", "Content-Disposition": `inline; filename="${encodeURIComponent(u.name)}"` },
  });
}
