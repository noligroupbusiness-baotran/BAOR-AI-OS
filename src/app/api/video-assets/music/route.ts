import path from "node:path";
import { getCurrentUser } from "@/lib/auth";
import { mediaResponse } from "@/lib/media-response";
import { musicFilePath } from "@/lib/video/music-library";

// Nghe thử bài trong thư viện nhạc (Tư liệu). Cần đăng nhập; chỉ tệp có trong manifest, trong thư mục thư viện.
export const runtime = "nodejs";

const TYPES: Record<string, string> = { ".mp3": "audio/mpeg", ".wav": "audio/wav" };

export async function GET(req: Request) {
  if (!(await getCurrentUser())) return new Response("Chưa đăng nhập", { status: 401 });
  const p = musicFilePath(new URL(req.url).searchParams.get("file") ?? "");
  const type = p ? TYPES[path.extname(p).toLowerCase()] : undefined;
  if (!p || !type) return new Response("Không tìm thấy", { status: 404 });
  return mediaResponse(req, p, type);
}
