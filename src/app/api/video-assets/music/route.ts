import fs from "node:fs";
import path from "node:path";
import { fileBody } from "@/lib/file-stream";
import { getCurrentUser } from "@/lib/auth";
import { musicFilePath } from "@/lib/video/music-library";

// Nghe thử bài trong thư viện nhạc (Cài đặt › Dựng video). Cần đăng nhập; chỉ tệp có trong manifest, trong thư mục thư viện.
export const runtime = "nodejs";

const TYPES: Record<string, string> = { ".mp3": "audio/mpeg", ".wav": "audio/wav" };

export async function GET(req: Request) {
  if (!(await getCurrentUser())) return new Response("Chưa đăng nhập", { status: 401 });
  const p = musicFilePath(new URL(req.url).searchParams.get("file") ?? "");
  const type = p ? TYPES[path.extname(p).toLowerCase()] : undefined;
  if (!p || !type) return new Response("Không tìm thấy", { status: 404 });
  const size = fs.statSync(p).size;
  const headers = { "Content-Type": type, "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (range) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(size - 1, Number(range[2])) : size - 1;
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    return new Response(fileBody(p, { start, end }), { status: 206, headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) } });
  }
  return new Response(fileBody(p), { headers: { ...headers, "Content-Length": String(size) } });
}
