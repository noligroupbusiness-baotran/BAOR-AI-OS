// Tải lên NỐI TIẾP được (S5): tệp lớn đi thành từng khúc; mất mạng / tải lại trang thì hỏi máy chủ đã nhận tới byte nào rồi
// gửi tiếp từ đó. Phiên lưu ở DATA_DIR/uploads/.partial/<sid>.json + <sid>.part (không nạp cả tệp vào bộ nhớ).
// Khúc phải gửi ĐÚNG vị trí (offset = số byte đã nhận) — gửi lặp / lệch vị trí bị từ chối kèm vị trí đúng (không ghi đè, không hở).
import fs from "node:fs";
import path from "node:path";
import { uploadsDir } from "@/lib/uploads";
import { EXT_MIME, MAX_SOURCE_BYTES, newUploadId, registerSource, type IntakeParams } from "./source-intake";

export const MAX_CHUNK_BYTES = 64 * 1024 * 1024;
const busy = new Set<string>(); // một khúc mỗi phiên tại một thời điểm (hai yêu cầu cùng vị trí không cùng ghi) — một tiến trình
const SESSION_TTL_MS = 48 * 3_600_000; // phiên dở dang quá 48 giờ bị dọn

export interface UploadSession {
  sid: string;
  uploadId: string;
  key: string; // dấu vân tay tệp phía trình duyệt (tên + cỡ + thời điểm sửa) → tải lại trang vẫn tìm lại phiên
  original: string;
  ext: string;
  size: number;
  params: IntakeParams;
  by: { name: string; email: string };
  createdAt: string;
  /** Đã hoàn tất → video tạo ra (giữ dấu tới khi dọn, để trình duyệt hỏi lại vẫn biết chắc là xong). */
  doneVideoId?: string;
}

function dir(): string {
  const d = path.join(uploadsDir(), ".partial");
  fs.mkdirSync(d, { recursive: true });
  return d;
}
const SID = /^us_[a-z0-9]{8,24}$/;
const metaPath = (sid: string) => path.join(dir(), `${sid}.json`);
const partPath = (sid: string) => path.join(dir(), `${sid}.part`);

function read(sid: string): UploadSession | null {
  if (!SID.test(sid)) return null;
  try {
    return JSON.parse(fs.readFileSync(metaPath(sid), "utf8")) as UploadSession;
  } catch {
    return null;
  }
}
export function received(sid: string): number {
  try {
    return fs.statSync(partPath(sid)).size;
  } catch {
    return 0;
  }
}

/** Lần hoạt động cuối của phiên: lần ghi khúc cuối (mtime tệp .part), không phải lúc mở phiên. */
function lastActive(s: UploadSession): number {
  try {
    return fs.statSync(partPath(s.sid)).mtimeMs;
  } catch {
    try {
      return fs.statSync(metaPath(s.sid)).mtimeMs;
    } catch {
      return Date.parse(s.createdAt);
    }
  }
}

/** Dọn phiên không hoạt động quá hạn (gọi khi mở phiên mới). Không bao giờ dọn phiên đang nhận khúc. */
export function sweepSessions(now = Date.now()): number {
  let n = 0;
  for (const f of fs.readdirSync(dir())) {
    if (!f.endsWith(".json")) continue;
    const s = read(f.replace(/\.json$/, ""));
    if (s && !busy.has(s.sid) && now - lastActive(s) > SESSION_TTL_MS) {
      fs.rmSync(metaPath(s.sid), { force: true });
      fs.rmSync(partPath(s.sid), { force: true });
      n++;
    }
  }
  return n;
}

/** Mở phiên (hoặc trả phiên cũ cùng người + cùng dấu vân tay tệp để tải tiếp). */
export function openSession(i: { original: string; size: number; key: string; params: IntakeParams; by: { name: string; email: string } }): { ok: true; sid: string; offset: number; resumed: boolean } | { ok: false; error: string; status: number } {
  const original = i.original.slice(0, 200);
  const ext = path.extname(original).toLowerCase();
  if (!EXT_MIME[ext]) return { ok: false, error: "Chỉ nhận MP4, MOV, M4V, WebM", status: 415 };
  if (!Number.isInteger(i.size) || i.size <= 0) return { ok: false, error: "Cỡ tệp không hợp lệ", status: 400 };
  if (i.size > MAX_SOURCE_BYTES) return { ok: false, error: "Tệp vượt 8 GB", status: 413 };
  sweepSessions();
  const key = i.key.slice(0, 300);
  if (key) {
    for (const f of fs.readdirSync(dir())) {
      if (!f.endsWith(".json")) continue;
      const s = read(f.replace(/\.json$/, ""));
      if (s && !s.doneVideoId && s.key === key && s.by.email === i.by.email && s.size === i.size) return { ok: true, sid: s.sid, offset: received(s.sid), resumed: true };
    }
  }
  const sid = `us_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const s: UploadSession = { sid, uploadId: newUploadId(), key, original, ext, size: i.size, params: i.params, by: i.by, createdAt: new Date().toISOString() };
  fs.writeFileSync(partPath(sid), "");
  fs.writeFileSync(metaPath(sid), JSON.stringify(s));
  return { ok: true, sid, offset: 0, resumed: false };
}

export type AppendResult =
  | { ok: true; offset: number; done: false }
  | { ok: true; offset: number; done: true; videoId: string }
  | { ok: false; error: string; status: number; offset?: number };

/** Ghi nối một khúc tại `offset`. Đủ byte → hoàn tất: chuyển vào kho, tạo bản ghi + video, xoá phiên. */
export async function appendChunk(sid: string, offset: number, body: ReadableStream<Uint8Array> | null, by: { email: string }): Promise<AppendResult> {
  if (busy.has(sid)) return { ok: false, error: "Phiên đang nhận một khúc khác", status: 409, offset: received(sid) };
  busy.add(sid);
  try {
    return await appendLocked(sid, offset, body, by);
  } finally {
    busy.delete(sid);
  }
}

async function appendLocked(sid: string, offset: number, body: ReadableStream<Uint8Array> | null, by: { email: string }): Promise<AppendResult> {
  const s = read(sid);
  if (!s) return { ok: false, error: "Phiên tải lên không tồn tại hoặc đã hết hạn", status: 404 };
  if (s.by.email !== by.email) return { ok: false, error: "Phiên tải lên của người khác", status: 403 };
  if (s.doneVideoId) return { ok: true, offset: s.size, done: true, videoId: s.doneVideoId }; // khúc cuối gửi lại sau khi đã xong
  const have = received(sid);
  if (offset !== have) return { ok: false, error: `Sai vị trí: máy chủ đã nhận ${have} byte`, status: 409, offset: have };
  if (!body) return { ok: false, error: "Không có dữ liệu", status: 400 };
  const room = Math.min(MAX_CHUNK_BYTES, s.size - have);
  let n = 0;
  // Đọc thân yêu cầu bằng reader thủ công: khách huỷ giữa chừng thì reader báo lỗi tại đây và được bắt.
  // (Lỗi "ReadableStream is already closed" từng thấy trong E2E KHÔNG đến từ đây mà từ route phát tệp video bị trình duyệt
  // huỷ — đã sửa ở src/lib/file-stream.ts.)
  const out = fs.createWriteStream(partPath(sid), { flags: "a" });
  const reader = body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      n += value.byteLength;
      if (n > room) throw new Error("Khúc vượt phần còn lại của tệp / vượt 64 MB");
      if (!out.write(value)) await new Promise<void>((r) => out.once("drain", () => r()));
    }
    await new Promise<void>((resolve, reject) => out.end((e?: Error | null) => (e ? reject(e) : resolve())));
  } catch (e) {
    reader.cancel().catch(() => {});
    await new Promise<void>((r) => out.end(() => r()));
    // Khúc hỏng giữa chừng: cắt về đúng vị trí trước khúc (không để dở byte rác) → trình duyệt gửi lại khúc
    fs.truncateSync(partPath(sid), have);
    return { ok: false, error: e instanceof Error ? e.message : "Khúc bị gián đoạn", status: 400, offset: have };
  }
  const now = received(sid);
  if (now < s.size) return { ok: true, offset: now, done: false };
  const { videoId } = registerSource({ tmpPath: partPath(sid), uploadId: s.uploadId, original: s.original, ext: s.ext, size: s.size, params: s.params, by: s.by });
  fs.writeFileSync(metaPath(sid), JSON.stringify({ ...s, doneVideoId: videoId })); // giữ dấu "đã xong" (dọn sau 48 giờ)
  return { ok: true, offset: now, done: true, videoId };
}

export function sessionInfo(sid: string, by: { email: string }): { ok: true; offset: number; size: number; done?: boolean; videoId?: string } | { ok: false; status: number; error: string } {
  const s = read(sid);
  if (!s || s.by.email !== by.email) return { ok: false, status: 404, error: "Phiên tải lên không tồn tại" };
  if (s.doneVideoId) return { ok: true, offset: s.size, size: s.size, done: true, videoId: s.doneVideoId };
  return { ok: true, offset: received(sid), size: s.size };
}
