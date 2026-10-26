import fs from "node:fs";
import path from "node:path";
import { streamToFile } from "@/lib/video/stream-to-file";
import { getCurrentUser } from "@/lib/auth";
import { actorFor } from "@/lib/permissions";
import { uploadsDir } from "@/lib/uploads";
import { EXT_MIME, MAX_SOURCE_BYTES as MAX_BYTES, newUploadId, registerSource } from "@/lib/video/source-intake";
import { sameOrigin } from "@/lib/same-origin";

// Thêm nguồn quay thô cho Video Studio. Nhận thân yêu cầu dạng luồng, ghi thẳng xuống đĩa:
// không qua bộ đệm 10 MB của proxy (đường dẫn này loại khỏi matcher trong src/proxy.ts), không nạp cả tệp vào bộ nhớ.
export const runtime = "nodejs";


export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ ok: false, error: "Chưa đăng nhập" }, { status: 401 });
  // Chống gửi chéo trang: chỉ nhận yêu cầu từ chính giao diện hệ thống.
  if (!sameOrigin(req)) return Response.json({ ok: false, error: "Nguồn yêu cầu không hợp lệ" }, { status: 403 });
  const actor = actorFor(user.email);

  const url = new URL(req.url);
  const original = (url.searchParams.get("name") ?? "").slice(0, 200);
  const ext = path.extname(original).toLowerCase();
  const mime = EXT_MIME[ext];
  if (!mime) return Response.json({ ok: false, error: "Chỉ nhận MP4, MOV, M4V, WebM" }, { status: 415 });
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_BYTES) return Response.json({ ok: false, error: "Tệp vượt 8 GB" }, { status: 413 });
  if (!req.body) return Response.json({ ok: false, error: "Không có dữ liệu tệp" }, { status: 400 });

  const id = newUploadId();
  const fileName = `${id}${ext}`;
  const full = path.join(uploadsDir(), fileName);
  const w = await streamToFile(req.body, full, MAX_BYTES, "Tệp vượt 8 GB");
  if (!w.ok) return Response.json({ ok: false, error: w.error }, { status: 400 });
  const size = w.size;
  if (declared && size !== declared) {
    fs.rmSync(full, { force: true });
    return Response.json({ ok: false, error: `Tải lên chưa trọn (${size}/${declared} byte)` }, { status: 400 });
  }
  const params = { cut: url.searchParams.get("cut") === "1", contentId: (url.searchParams.get("content") ?? "").slice(0, 80) || null, final: url.searchParams.get("mode") === "final", aspect: url.searchParams.get("aspect"), quality: url.searchParams.get("quality"), start: url.searchParams.get("start") === "1" };
  const { videoId } = registerSource({ tmpPath: full, uploadId: id, original, ext, size, params, by: { name: actor.name, email: actor.email } });
  return Response.json({ ok: true, videoId, size });
}
