import fs from "node:fs";
import path from "node:path";
import { getCurrentUser } from "@/lib/auth";
import { jobDir } from "@/lib/video/jobs";
import { isJobFile } from "@/lib/video/job-types";

// Tệp kết quả của một lần dựng: bản xem nhanh, ảnh mốc, so trước/sau, phụ đề, báo cáo, mã kiểm. Chỉ người đã đăng nhập.
// Hỗ trợ Range để tua video trong trình duyệt mà không tải cả tệp.
export const runtime = "nodejs";

const MIME: Record<string, string> = { ".mp4": "video/mp4", ".jpg": "image/jpeg", ".srt": "text/plain; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".json": "application/json", ".sha256": "text/plain; charset=utf-8" };

export async function GET(req: Request, { params }: { params: Promise<{ videoId: string; version: string; file: string[] }> }) {
  if (!(await getCurrentUser())) return new Response("Chưa đăng nhập", { status: 401 });
  const { videoId, version, file } = await params;
  const name = file.join("/");
  const v = Number(version.replace(/^v/, ""));
  if (!isJobFile(name) || !Number.isInteger(v)) return new Response("Không có tệp này", { status: 404 });
  let full: string;
  try {
    full = path.join(jobDir(videoId, v), name);
  } catch {
    return new Response("Không có tệp này", { status: 404 });
  }
  if (!fs.existsSync(full)) return new Response("Không có tệp này", { status: 404 });
  const size = fs.statSync(full).size;
  const ext = path.extname(full);
  const download = new URL(req.url).searchParams.get("download") === "1" || ext === ".srt" || ext === ".sha256";
  const headers: Record<string, string> = {
    "Content-Type": MIME[ext] ?? "application/octet-stream",
    "Cache-Control": "private, max-age=600",
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${encodeURIComponent(`${videoId}_v${v}_${path.basename(name)}`)}"`,
  };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (range) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(size - 1, Number(range[2])) : size - 1;
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    const stream = fs.createReadStream(full, { start, end });
    return new Response(stream as unknown as ReadableStream, { status: 206, headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) } });
  }
  return new Response(fs.createReadStream(full) as unknown as ReadableStream, { headers: { ...headers, "Content-Length": String(size) } });
}
