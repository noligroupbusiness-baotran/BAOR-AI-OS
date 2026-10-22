// Phát tệp trên đĩa thành thân Response — luồng KÉO tự viết, an toàn khi khách huỷ yêu cầu.
//
// Vì sao không dùng thư viện có sẵn (đã đo 22/10/2026):
// - `new Response(fs.createReadStream(...))`: undici bọc luồng Node, khi thẻ <video> huỷ yêu cầu đọc theo khoảng (tua, rời
//   trang) nó gọi controller.close() trên luồng đã đóng → uncaughtException "ReadableStream is already closed".
// - `Readable.toWeb(...)`: vẫn có lúc gọi vào controller sau khi bị huỷ khi tua liên tục video lớn → "Controller is already closed".
// Ở đây: chỉ đọc đĩa khi bên nhận kéo (pull), có cờ `done`; sau cancel / close KHÔNG bao giờ gọi controller nữa.
import { open, type FileHandle } from "node:fs/promises";

const CHUNK = 256 * 1024;

export function fileBody(p: string, range?: { start: number; end: number }): ReadableStream<Uint8Array> {
  let fh: FileHandle | null = null;
  let pos = range?.start ?? 0;
  const end = range?.end ?? Number.POSITIVE_INFINITY; // vị trí byte cuối (tính cả)
  let done = false;
  const finish = async () => {
    done = true;
    const h = fh;
    fh = null;
    await h?.close().catch(() => {});
  };
  return new ReadableStream<Uint8Array>(
    {
      async pull(ctrl) {
        if (done) return;
        try {
          if (!fh) fh = await open(p, "r");
          const want = Math.min(CHUNK, end - pos + 1);
          if (want <= 0) {
            await finish();
            ctrl.close();
            return;
          }
          const buf = Buffer.allocUnsafe(want);
          const { bytesRead } = await fh.read(buf, 0, want, pos);
          if (done) return; // bị huỷ trong lúc đang đọc đĩa: không chạm controller
          if (bytesRead === 0) {
            await finish();
            ctrl.close();
            return;
          }
          pos += bytesRead;
          ctrl.enqueue(new Uint8Array(buf.buffer, buf.byteOffset, bytesRead));
        } catch (e) {
          if (done) return;
          await finish();
          ctrl.error(e);
        }
      },
      async cancel() {
        await finish();
      },
    },
    { highWaterMark: 0 },
  );
}
