// Phát tệp trên đĩa thành thân Response. Dùng Readable.toWeb (Node tự xử lý khi khách huỷ yêu cầu).
// KHÔNG dùng `new Response(fs.createReadStream(...))`: undici bọc luồng Node bằng ReadableStreamFrom, khi thẻ <video> huỷ
// yêu cầu đọc theo khoảng (tua, rời trang) nó gọi controller.close() trên luồng đã đóng → uncaughtException
// "ReadableStream is already closed" (phản biện S5 22/10/2026 bắt được stack: undici ReadableByteStreamController.close).
import fs from "node:fs";
import { Readable } from "node:stream";

export function fileBody(p: string, range?: { start: number; end: number }): ReadableStream {
  return Readable.toWeb(fs.createReadStream(p, range)) as unknown as ReadableStream;
}
