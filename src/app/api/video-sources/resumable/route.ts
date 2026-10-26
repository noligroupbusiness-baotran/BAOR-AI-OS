import { getCurrentUser } from "@/lib/auth";
import { actorFor } from "@/lib/permissions";
import { appendChunk, openSession, sessionInfo } from "@/lib/video/resumable";
import { sameOrigin } from "@/lib/same-origin";

// Tải video gốc NỐI TIẾP được: POST mở phiên (hoặc tìm lại phiên cũ theo dấu vân tay tệp), PUT gửi từng khúc tại đúng
// vị trí, GET hỏi đã nhận bao nhiêu byte. Đường dẫn nằm dưới api/video-sources → loại khỏi proxy (không đệm 10 MB).
export const runtime = "nodejs";

async function guard(req: Request) {
  const user = await getCurrentUser();
  if (!user) return { error: Response.json({ ok: false, error: "Chưa đăng nhập" }, { status: 401 }) };
  // Chống gửi chéo trang: chỉ nhận yêu cầu từ chính giao diện hệ thống (GET chỉ đọc vị trí, vẫn cần đăng nhập).
  if (req.method !== "GET") {
    if (!sameOrigin(req)) return { error: Response.json({ ok: false, error: "Nguồn yêu cầu không hợp lệ" }, { status: 403 }) };
  }
  return { actor: actorFor(user.email) };
}

export async function POST(req: Request) {
  const g = await guard(req);
  if (g.error) return g.error;
  const url = new URL(req.url);
  const r = openSession({
    original: url.searchParams.get("name") ?? "",
    size: Number(url.searchParams.get("size") ?? "0"),
    key: url.searchParams.get("key") ?? "",
    params: { cut: url.searchParams.get("cut") === "1", contentId: (url.searchParams.get("content") ?? "").slice(0, 80) || null, final: url.searchParams.get("mode") === "final", aspect: url.searchParams.get("aspect"), quality: url.searchParams.get("quality"), start: url.searchParams.get("start") === "1" },
    by: { name: g.actor!.name, email: g.actor!.email },
  });
  return r.ok ? Response.json(r) : Response.json(r, { status: r.status });
}

export async function PUT(req: Request) {
  const g = await guard(req);
  if (g.error) return g.error;
  const url = new URL(req.url);
  const r = await appendChunk(url.searchParams.get("sid") ?? "", Number(url.searchParams.get("offset") ?? "-1"), req.body, { email: g.actor!.email });
  return r.ok ? Response.json(r) : Response.json(r, { status: r.status });
}

export async function GET(req: Request) {
  const g = await guard(req);
  if (g.error) return g.error;
  const r = sessionInfo(new URL(req.url).searchParams.get("sid") ?? "", { email: g.actor!.email });
  return r.ok ? Response.json(r) : Response.json(r, { status: r.status });
}
