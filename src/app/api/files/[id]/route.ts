import fs from "node:fs";
import { getCurrentUser } from "@/lib/auth";
import { getUpload, uploadPath } from "@/lib/uploads";

// Phục vụ tệp tải lên (logo, nhạc, video). Chỉ người đã đăng nhập.
export const runtime = "nodejs";

// Chỉ các loại này được hiện thẳng trong trình duyệt; loại khác ép tải về để không thành trang HTML/script cùng gốc.
const INLINE_OK = /^(image\/(png|jpeg|webp|gif)|audio\/|video\/)/;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getCurrentUser())) return new Response("Chưa đăng nhập", { status: 401 });
  const { id } = await params;
  const u = getUpload(id);
  const p = u ? uploadPath(u) : null;
  if (!u || !p) return new Response("Không có tệp này", { status: 404 });
  const buf = fs.readFileSync(p);
  const mime = u.mime || "application/octet-stream";
  const isSvg = mime === "image/svg+xml";
  const inline = isSvg || INLINE_OK.test(mime);
  const headers: Record<string, string> = {
    "Content-Type": mime,
    "Content-Length": String(buf.byteLength),
    "Cache-Control": "private, max-age=3600",
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(u.name)}"`,
    "X-Content-Type-Options": "nosniff",
  };
  // SVG có thể chứa script: khóa hoàn toàn khi mở trực tiếp; nhúng qua <img> vẫn hiện bình thường.
  if (isSvg) headers["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
  return new Response(new Uint8Array(buf), { headers });
}
