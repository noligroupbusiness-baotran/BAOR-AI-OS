import fs from "node:fs";
import { fileBody } from "@/lib/file-stream";

// Phát tệp tư liệu (nhạc, hiệu ứng âm thanh, ảnh, clip B-roll) cho trang Tư liệu: hỗ trợ Range (thẻ <audio> / <video> tua được).
// Chỉ gọi với đường dẫn ĐÃ kiểm (musicFilePath / sfxFilePath / brollFilePath) — hàm này không tự kiểm thư mục.
export function mediaResponse(req: Request, p: string, type: string): Response {
  const size = fs.statSync(p).size;
  const headers = { "Content-Type": type, "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(size - 1, Number(range[2])) : size - 1;
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    return new Response(fileBody(p, { start, end }), { status: 206, headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) } });
  }
  return new Response(fileBody(p), { headers: { ...headers, "Content-Length": String(size) } });
}
