import fs from "node:fs";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { actorFor, can } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { RATE_RULES, limitOr429 } from "@/lib/rate-limit";
import { dataDir } from "@/lib/video/jobs";
import { streamToFile } from "@/lib/video/stream-to-file";
import { checkUpload } from "@/lib/video/asset-upload-rules";
import { contentOk, finishUpload, stageUpload, targetLabel, uploadRejectReason } from "@/lib/video/asset-upload";
import { sameOrigin } from "@/lib/same-origin";

// Trang Tư liệu › Tải lên: một tệp mỗi yêu cầu, thân yêu cầu là tệp (dạng luồng — đường dẫn này loại khỏi proxy, không bị cắt ở
// 10 MB, không nạp cả tệp vào bộ nhớ). Tham số: name, kind (nhac | hieu-ung-am-thanh | anh-broll), license (bắt buộc), keywords,
// desc (mô tả ngắn ảnh·clip, tuỳ chọn — một dòng đã lọc, ghi "Mô tả:" của tệp .txt kèm theo).
// Tệp vào thư mục thả + .txt kèm theo rồi được nhận ngay bằng importDrop (src/lib/video/asset-upload.ts) — luật giấy phép giữ nguyên.
export const runtime = "nodejs";

const json = (body: Record<string, unknown>, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return json({ ok: false, error: "Chưa đăng nhập" }, 401);
  // Chống gửi chéo trang: chỉ nhận yêu cầu từ chính giao diện hệ thống
  if (!sameOrigin(req)) return json({ ok: false, error: "Nguồn yêu cầu không hợp lệ" }, 403);
  const actor = actorFor(user.email);
  // Cùng mức requirePermission("admin") của các nút duyệt tư liệu (route không chuyển hướng được nên trả 403)
  if (!can(actor, "admin")) return json({ ok: false, error: "Chỉ OWNER (quản trị) tải tư liệu lên" }, 403);
  const limited = limitOr429(`asset-upload:${actor.email}`, RATE_RULES.assetUpload);
  if (limited) return limited;

  const q = new URL(req.url).searchParams;
  const declared = Number(req.headers.get("content-length") ?? "0") || 0;
  const c = checkUpload({ name: (q.get("name") ?? "").slice(0, 300), target: q.get("kind") ?? "", license: q.get("license") ?? "", keywords: q.get("keywords") ?? "", desc: q.get("desc") ?? "", size: declared });
  if (!c.ok) return json({ ok: false, error: c.error }, c.status);
  const reject = uploadRejectReason(c);
  if (reject) return json({ ok: false, error: reject }, 400);
  if (!req.body) return json({ ok: false, error: "Không có dữ liệu tệp" }, 400);

  const dir = dataDir();
  const s = stageUpload(dir, c.target, c.name);
  const w = await streamToFile(req.body, s.tmp, c.maxBytes, `Tệp vượt ${Math.round(c.maxBytes / 1024 / 1024)} MB`);
  if (!w.ok) return json({ ok: false, error: w.error }, 400);
  if (declared && w.size !== declared) {
    fs.rmSync(s.tmp, { force: true });
    return json({ ok: false, error: `Tải lên chưa trọn (${w.size}/${declared} byte)` }, 400);
  }
  if (!contentOk(s.tmp, c)) {
    fs.rmSync(s.tmp, { force: true });
    return json({ ok: false, error: `Nội dung không phải tệp ${c.ext} thật` }, 415);
  }
  try {
    const r = finishUpload(dir, s, c);
    logActivity("human", `${actor.name} tải lên “${s.rel}” vào ${targetLabel(c.target)} (giấy phép: ${c.license})${r.state === "imported" ? (r.pending ? " — chờ OWNER nghe duyệt" : "") : ` — chưa nhận: ${r.reason}`}.`, "settings");
    revalidatePath("/assets");
    return json({ ok: true, ...r });
  } catch (e) {
    fs.rmSync(s.tmp, { force: true });
    if (!fs.existsSync(s.final)) fs.rmSync(s.sidecar, { force: true });
    return json({ ok: false, error: `Lỗi khi nhận: ${e instanceof Error ? e.message : String(e)}` }, 500);
  }
}
