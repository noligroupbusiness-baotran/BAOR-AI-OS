import { getCurrentUser } from "@/lib/auth";
import { mediaResponse } from "@/lib/media-response";
import { remotePreviewFile } from "@/lib/video/remote-catalog";

// Xem trước tư liệu MÁY CỦA OWNER (ảnh thu nhỏ / đoạn nghe thử máy dựng gửi lên — không phải tệp gốc). Cần đăng nhập; chỉ tên
// "<sha256>.jpg|mp3" mà danh mục hiện hành đang trỏ tới (src/lib/video/remote-catalog.ts › remotePreviewFile).
export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!(await getCurrentUser())) return new Response("Chưa đăng nhập", { status: 401 });
  const f = remotePreviewFile(new URL(req.url).searchParams.get("p") ?? "");
  if (!f) return new Response("Không tìm thấy", { status: 404 });
  return mediaResponse(req, f.path, f.type);
}
