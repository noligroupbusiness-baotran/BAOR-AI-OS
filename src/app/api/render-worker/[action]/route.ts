import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileBody } from "@/lib/file-stream";
import { claimRemoteJob, completeRemoteJob, failRemoteJob, heartbeatRemote, jobDir, remoteFileNameOk, remoteJobFor, remoteMusicPath, remoteSourcePath, renderMode } from "@/lib/video/jobs";
import { touchWorker, workerAuthorized, workerName } from "@/lib/video/worker-auth";
import type { JobProgress } from "@/lib/video/job-types";

// API cho máy dựng của OWNER (scripts/video/render-worker.mts). Mọi lời gọi cần "Authorization: Bearer <khoá máy dựng>".
//   POST claim      → việc kế tiếp (204 khi không có / máy chủ không ở chế độ máy dựng)
//   GET  source     → tệp video gốc của job đang giữ (?videoId=&version=)
//   GET  music      → bài nhạc OWNER chọn ở Cài đặt (khi có)
//   POST heartbeat  → nhịp tim + tiến độ; 409 = job đã bị dừng / không còn của máy này → huỷ dựng
//   PUT  file       → gửi một tệp kết quả vào thư mục bản dựng (?videoId=&version=&name=), header x-content-sha256 bắt buộc:
//                     số byte phải khớp Content-Length và mã băm phải khớp, không thì từ chối (không nhận tệp cụt / hỏng)
//   POST complete   → hoàn tất (máy chủ đưa bản chính vào kho, video → Chờ kiểm tra)
//   POST fail       → báo lỗi dựng
export const runtime = "nodejs";

const MAX_FILE_BYTES = 8 * 1024 * 1024 * 1024;
const json = (b: unknown, status = 200) => Response.json(b, { status });

function target(url: URL): { videoId: string; version: number } | null {
  const videoId = url.searchParams.get("videoId") ?? "";
  const version = Number(url.searchParams.get("version"));
  return /^[\w-]{1,64}$/.test(videoId) && Number.isInteger(version) && version >= 1 ? { videoId, version } : null;
}

async function auth(req: Request): Promise<string | Response> {
  if (!workerAuthorized(req)) return json({ error: "Khoá máy dựng không hợp lệ" }, 401);
  const name = workerName(req);
  touchWorker(name);
  return name;
}

export async function GET(req: Request, { params }: { params: Promise<{ action: string }> }) {
  const w = await auth(req);
  if (w instanceof Response) return w;
  const { action } = await params;
  if (action !== "source" && action !== "music") return json({ error: "Không có" }, 404);
  const t = target(new URL(req.url));
  const p = t ? (action === "music" ? remoteMusicPath(t.videoId, t.version, w) : remoteSourcePath(t.videoId, t.version, w)) : null;
  if (!p) return json({ error: "Job không thuộc máy dựng này hoặc thiếu tệp" }, 404);
  return new Response(fileBody(p), { headers: { "Content-Type": "application/octet-stream", "Content-Length": String(fs.statSync(p).size) } });
}

export async function POST(req: Request, { params }: { params: Promise<{ action: string }> }) {
  const w = await auth(req);
  if (w instanceof Response) return w;
  const { action } = await params;
  if (action === "claim") {
    if (renderMode() !== "remote") return new Response(null, { status: 204 });
    const spec = claimRemoteJob(w);
    return spec ? json(spec) : new Response(null, { status: 204 });
  }
  const t = target(new URL(req.url));
  if (!t) return json({ error: "Thiếu videoId / version" }, 400);
  if (action === "heartbeat") {
    const body = (await req.json().catch(() => ({}))) as { progress?: JobProgress };
    return heartbeatRemote(t.videoId, t.version, w, body.progress) ? json({ ok: true }) : json({ stop: true }, 409);
  }
  if (action === "complete") {
    const r = completeRemoteJob(t.videoId, t.version, w);
    return r.ok ? json({ ok: true }) : json({ error: r.error }, 409);
  }
  if (action === "fail") {
    const body = (await req.json().catch(() => ({}))) as { error?: string };
    return failRemoteJob(t.videoId, t.version, w, String(body.error ?? "lỗi không rõ")) ? json({ ok: true }) : json({ stop: true }, 409);
  }
  return json({ error: "Không có" }, 404);
}

export async function PUT(req: Request, { params }: { params: Promise<{ action: string }> }) {
  const w = await auth(req);
  if (w instanceof Response) return w;
  const { action } = await params;
  const url = new URL(req.url);
  const t = target(url);
  const name = url.searchParams.get("name") ?? "";
  if (action !== "file" || !t || !remoteFileNameOk(name)) return json({ error: "Tên tệp không hợp lệ" }, 400);
  if (!remoteJobFor(t.videoId, t.version, w)) return json({ stop: true }, 409);
  if (!req.body) return json({ error: "Không có dữ liệu" }, 400);
  const wantSha = (req.headers.get("x-content-sha256") ?? "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(wantSha)) return json({ error: "Thiếu x-content-sha256" }, 400);
  const wantLen = req.headers.get("content-length");
  const dir = jobDir(t.videoId, t.version);
  const final = path.join(dir, name);
  fs.mkdirSync(path.dirname(final), { recursive: true });
  const hash = createHash("sha256");
  const tmp = `${final}.part`;
  const out = fs.createWriteStream(tmp);
  const reader = req.body.getReader();
  let n = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      n += value.byteLength;
      if (n > MAX_FILE_BYTES) throw new Error("Tệp vượt 8 GB");
      hash.update(value);
      if (!out.write(value)) await new Promise<void>((r) => out.once("drain", () => r()));
    }
    await new Promise<void>((resolve, reject) => out.end((e?: Error | null) => (e ? reject(e) : resolve())));
    if (wantLen !== null && Number(wantLen) !== n) throw new Error(`Nhận ${n} / ${wantLen} byte — tệp bị cắt`);
    if (hash.digest("hex") !== wantSha) throw new Error("Mã băm không khớp — tệp hỏng trên đường truyền");
    // Job có thể đã bị Dừng / giao lại trong lúc gửi: kiểm lại trước khi ghi vào thư mục bản dựng
    if (!remoteJobFor(t.videoId, t.version, w)) throw Object.assign(new Error("Job không còn thuộc máy dựng này"), { stop: true });
    fs.renameSync(tmp, final);
  } catch (e) {
    reader.cancel().catch(() => {});
    await new Promise<void>((r) => out.end(() => r()));
    fs.rmSync(tmp, { force: true });
    if ((e as { stop?: boolean }).stop) return json({ stop: true }, 409);
    return json({ error: e instanceof Error ? e.message : "Gửi tệp bị gián đoạn" }, 400);
  }
  return json({ ok: true, bytes: n });
}
