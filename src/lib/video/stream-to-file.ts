// Ghi thân yêu cầu dạng luồng xuống đĩa, đếm byte, dừng khi vượt giới hạn. Không nạp cả tệp vào bộ nhớ.
// Dùng cho tải video gốc và B-roll (đường dẫn loại khỏi proxy để không bị cắt ở 10 MB).
import fs from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";

export async function streamToFile(body: ReadableStream<Uint8Array>, file: string, maxBytes: number, tooBig = "Tệp vượt giới hạn"): Promise<{ ok: true; size: number } | { ok: false; error: string }> {
  let size = 0;
  try {
    const counter = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, ctl) {
        size += chunk.byteLength;
        if (size > maxBytes) ctl.error(new Error(tooBig));
        else ctl.enqueue(chunk);
      },
    });
    await pipeline(Readable.fromWeb(body.pipeThrough(counter) as unknown as WebReadableStream), fs.createWriteStream(file));
  } catch (e) {
    fs.rmSync(file, { force: true });
    return { ok: false, error: e instanceof Error ? e.message : "Tải lên bị gián đoạn" };
  }
  if (size === 0) {
    fs.rmSync(file, { force: true });
    return { ok: false, error: "Tệp rỗng" };
  }
  return { ok: true, size };
}
