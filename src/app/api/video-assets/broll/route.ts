import fs from "node:fs";
import path from "node:path";
import { streamToFile } from "@/lib/video/stream-to-file";
import { getCurrentUser } from "@/lib/auth";
import { actorFor, can } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { brollDir, brollFilePath } from "@/lib/video/jobs";
import { mediaResponse } from "@/lib/media-response";
import { serverThumb } from "@/lib/video/thumb-cache";

// Thêm clip vào thư viện B-roll (CP03). Nhận thân yêu cầu dạng luồng (loại khỏi proxy như api/video-sources).
// Bắt buộc ghi giấy phép và từ khoá: clip không có giấy phép thì không vào thư viện.
export const runtime = "nodejs";

const MAX_BYTES = 1024 * 1024 * 1024; // 1 GB
const EXT = new Set([".mp4", ".mov", ".m4v", ".webm"]);

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ ok: false, error: "Chưa đăng nhập" }, { status: 401 });
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) return Response.json({ ok: false, error: "Nguồn yêu cầu không hợp lệ" }, { status: 403 });
  const actor = actorFor(user.email);
  if (!can(actor, "manager")) return Response.json({ ok: false, error: "Cần quyền quản lý" }, { status: 403 });

  const url = new URL(req.url);
  const original = (url.searchParams.get("name") ?? "").slice(0, 200);
  const ext = path.extname(original).toLowerCase();
  const license = (url.searchParams.get("license") ?? "").trim().slice(0, 300);
  const source = (url.searchParams.get("source") ?? "").trim().slice(0, 300);
  const keywords = (url.searchParams.get("keywords") ?? "").split(/[,\n]/).map((k) => k.trim()).filter(Boolean).slice(0, 20);
  if (!EXT.has(ext)) return Response.json({ ok: false, error: "Chỉ nhận MP4, MOV, M4V, WebM" }, { status: 415 });
  if (!license) return Response.json({ ok: false, error: "Cần ghi giấy phép / quyền sử dụng của clip" }, { status: 400 });
  if (!keywords.length) return Response.json({ ok: false, error: "Cần ít nhất một từ khoá" }, { status: 400 });
  if (!req.body) return Response.json({ ok: false, error: "Không có dữ liệu tệp" }, { status: 400 });

  const dir = brollDir();
  const base = original.replace(/\.[^.]+$/, "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "broll";
  const file = `${base}-${Date.now().toString(36)}${ext}`;
  const full = path.join(dir, file);
  const w = await streamToFile(req.body, full, MAX_BYTES, "Clip vượt 1 GB");
  if (!w.ok) return Response.json({ ok: false, error: w.error }, { status: 400 });
  const mf = path.join(dir, "manifest.json");
  let items: unknown[] = [];
  try {
    items = JSON.parse(fs.readFileSync(mf, "utf8")) as unknown[];
  } catch {}
  items.push({ file, keywords, license, source, addedBy: actor.email, addedAt: new Date().toISOString() });
  fs.writeFileSync(`${mf}.tmp`, JSON.stringify(items, null, 1));
  fs.renameSync(`${mf}.tmp`, mf);
  logActivity("human", `${actor.name} thêm B-roll “${original}” (từ khoá: ${keywords.join(", ")}; giấy phép: ${license}).`, "video");
  return Response.json({ ok: true, file, size: w.size });
}

/** Xem ảnh / clip trong thư viện B-roll (trang Tư liệu, bảng biên tập). Chỉ đọc, cần đăng nhập, chỉ đuôi ảnh / video, chỉ trong
 *  thư mục thư viện (chặn "..", đường dẫn tuyệt đối, liên kết tượng trưng ra ngoài — src/lib/video/safe-path.ts). Clip có Range.
 *  `thumb=1`: ảnh thu nhỏ JPEG (ảnh lỗi tạo → trả ảnh gốc; clip lỗi tạo → 404). */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Chưa đăng nhập", { status: 401 });
  const q = new URL(req.url).searchParams;
  const f = brollFilePath(q.get("file") ?? "");
  if (!f) return new Response("Không tìm thấy", { status: 404 });
  if (q.get("thumb") === "1") {
    // Ảnh thu nhỏ ≤ 480 px (ảnh) / khung hình (clip), tạo lần đầu rồi dùng cache (src/lib/video/thumb-cache.ts)
    const t = await serverThumb(f.path, f.type.startsWith("video/"));
    if (t) return mediaResponse(req, t, "image/jpeg");
    if (f.type.startsWith("video/")) return new Response("Chưa tạo được ảnh thu nhỏ", { status: 404 });
  }
  return mediaResponse(req, f.path, f.type);
}
