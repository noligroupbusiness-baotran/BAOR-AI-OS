import fs from "node:fs";
import { fileBody } from "@/lib/file-stream";
import { getCurrentUser } from "@/lib/auth";
import { getUpload, uploadPath } from "@/lib/uploads";

// Phục vụ tệp tải lên (logo, nhạc, video). Chỉ người đã đăng nhập.
export const runtime = "nodejs";

// Chỉ các loại này được hiện thẳng trong trình duyệt; loại khác ép tải về để không thành trang HTML/script cùng gốc.
const INLINE_OK = /^(image\/(png|jpeg|webp|gif)|audio\/|video\/)/;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getCurrentUser())) return new Response("Chưa đăng nhập", { status: 401 });
  const { id } = await params;
  const u = getUpload(id);
  const p = u ? uploadPath(u) : null;
  if (!u || !p || !fs.existsSync(p)) return new Response("Không có tệp này", { status: 404 });
  const size = fs.statSync(p).size;
  const mime = u.mime || "application/octet-stream";
  const isSvg = mime === "image/svg+xml";
  const inline = isSvg || INLINE_OK.test(mime);
  const headers: Record<string, string> = {
    "Content-Type": mime,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(u.name)}"`,
    "X-Content-Type-Options": "nosniff",
  };
  // SVG có thể chứa script: khóa hoàn toàn khi mở trực tiếp; nhúng qua <img> vẫn hiện bình thường.
  if (isSvg) headers["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
  // Video lớn: đọc dạng luồng, hỗ trợ Range để tua / xem toàn màn hình không phải tải cả tệp.
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (range) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(size - 1, Number(range[2])) : size - 1;
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    return new Response(fileBody(p, { start, end }), { status: 206, headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) } });
  }
  return new Response(fileBody(p), { headers: { ...headers, "Content-Length": String(size) } });
}
