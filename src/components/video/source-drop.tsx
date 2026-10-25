"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/format";

type Item = { name: string; pct: number; status: "waiting" | "uploading" | "done" | "error"; error?: string; note?: string };

const ACCEPT = ".mp4,.mov,.m4v,.webm,video/mp4,video/quicktime,video/webm";


// Thêm nguồn: kéo thả hoặc chọn tệp quay thô. Tải lên NỐI TIẾP được theo khúc (mất mạng / tải lại trang vẫn gửi tiếp
// từ chỗ dừng), không giới hạn 10 MB; xong là hệ thống tự dựng.
export function SourceDrop({ scripts = [], defaultContentId = "", defaultCut = true }: { scripts?: { id: string; title: string }[]; defaultContentId?: string; defaultCut?: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [cut, setCut] = useState(defaultCut);
  const [contentId, setContentId] = useState(defaultContentId);
  const [final, setFinal] = useState(false);
  const [over, setOver] = useState(false);
  const busy = items.some((i) => i.status === "uploading" || i.status === "waiting");

  const update = (idx: number, patch: Partial<Item>) => setItems((xs) => xs.map((x, i) => (i === idx ? { ...x, ...patch } : x)));

  /**
   * Tải NỐI TIẾP được: mở phiên (tải lại trang thì tìm lại phiên cũ theo tên + cỡ + thời điểm sửa tệp), gửi từng khúc tại đúng
   * vị trí; mất mạng / lỗi khúc thì hỏi máy chủ đã nhận bao nhiêu byte và gửi tiếp từ đó (tối đa 6 lần, chờ giãn dần).
   */
  async function send(file: File, idx: number): Promise<void> {
    const q = (o: Record<string, string>) => new URLSearchParams(o).toString();
    const chunkBytes = (() => {
      try {
        return Number(localStorage.getItem("baor.uploadChunkBytes")) || 16 * 1024 * 1024;
      } catch {
        return 16 * 1024 * 1024;
      }
    })();
    update(idx, { status: "uploading" });
    const open = await fetch(`/api/video-sources/resumable?${q({ name: file.name, size: String(file.size), key: `${file.name}|${file.size}|${file.lastModified}`, cut: cut ? "1" : "0", content: contentId, ...(final ? { mode: "final" } : {}) })}`, { method: "POST" })
      .then((r) => r.json() as Promise<{ ok: boolean; sid?: string; offset?: number; resumed?: boolean; error?: string }>)
      .catch(() => ({ ok: false, error: "Mất kết nối khi bắt đầu tải lên" }) as { ok: boolean; sid?: string; offset?: number; resumed?: boolean; error?: string });
    if (!open.ok || !open.sid) return update(idx, { status: "error", error: open.error ?? "Không mở được phiên tải lên" });
    const sid = open.sid;
    let offset = open.offset ?? 0;
    if (open.resumed && offset > 0) update(idx, { note: `Tải tiếp từ ${Math.round((offset / file.size) * 100)}%` });
    let fails = 0;
    while (offset < file.size) {
      const end = Math.min(file.size, offset + chunkBytes);
      const res = await new Promise<{ ok: boolean; offset?: number; done?: boolean; error?: string; net?: boolean }>((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", `/api/video-sources/resumable?${q({ sid, offset: String(offset) })}`);
        xhr.setRequestHeader("Content-Type", "application/octet-stream");
        const base = offset;
        xhr.upload.onprogress = (e) => update(idx, { pct: Math.min(99, Math.round(((base + e.loaded) / file.size) * 100)) });
        xhr.onload = () => {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch {
            resolve({ ok: false, error: `Lỗi ${xhr.status}` });
          }
        };
        xhr.onerror = () => resolve({ ok: false, net: true, error: "Mất kết nối" });
        xhr.send(file.slice(offset, end));
      });
      if (res.ok) {
        offset = res.offset ?? end;
        fails = 0;
        update(idx, { pct: Math.round((offset / file.size) * 100), note: undefined });
        if (res.done) break;
        continue;
      }
      if (++fails > 6) return update(idx, { status: "error", error: `${res.error ?? "Lỗi"} — đã thử tiếp 6 lần. Chọn lại tệp để tải tiếp từ chỗ dừng.` });
      update(idx, { note: `${res.error ?? "Lỗi"} — đang thử tiếp (lần ${fails}/6)` });
      await new Promise((r) => setTimeout(r, Math.min(15_000, 500 * 2 ** (fails - 1))));
      // Hỏi máy chủ đã nhận tới đâu (khúc có thể đã vào trọn dù trình duyệt không nhận được trả lời)
      const r = await fetch(`/api/video-sources/resumable?${q({ sid })}`).catch(() => null);
      if (r?.status === 401) return update(idx, { status: "error", error: "Phiên đăng nhập hết hạn — đăng nhập lại rồi chọn lại tệp để tải tiếp từ chỗ dừng" });
      const info = r ? await (r.json() as Promise<{ ok: boolean; offset?: number; done?: boolean }>).catch(() => null) : null;
      if (info?.ok && info.done) break; // khúc cuối đã vào trọn trước khi mất trả lời: máy chủ xác nhận đã tạo video
      if (info?.ok && typeof info.offset === "number") offset = info.offset;
      else if (typeof res.offset === "number") offset = res.offset;
      else if (r && r.status === 404) return update(idx, { status: "error", error: "Phiên tải lên đã hết hạn — chọn lại tệp để tải lại" });
    }
    update(idx, { status: "done", pct: 100 });
    router.refresh();
  }

  async function start(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => /\.(mp4|mov|m4v|webm)$/i.test(f.name));
    if (!list.length) return;
    const base = items.length;
    setItems((xs) => [...xs, ...list.map((f) => ({ name: f.name, pct: 0, status: "waiting" as const }))]);
    for (let i = 0; i < list.length; i++) await send(list[i], base + i);
  }

  return (
    <div className="grid gap-3 p-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void start(e.dataTransfer.files);
        }}
        className={cn("flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors", over ? "border-jade bg-jade-soft" : "border-border-2 bg-ground")}
      >
        <div className="text-[14px] font-semibold text-ink">Kéo thả video quay thô vào đây</div>
        <div className="text-[12.5px] text-ink-2">MP4, MOV, M4V, WebM · tối đa 8 GB mỗi tệp · chọn được nhiều tệp</div>
        <button type="button" onClick={() => input.current?.click()} disabled={busy} className="mt-1 inline-flex h-8 items-center rounded-full border border-jade-2 bg-jade px-4 text-[12.5px] font-medium text-white hover:bg-jade-2 disabled:opacity-50">
          Chọn tệp
        </button>
        <input ref={input} type="file" accept={ACCEPT} multiple hidden onChange={(e) => e.target.files && void start(e.target.files)} />
      </div>
      <label className="grid gap-1 text-[12.5px] text-ink-2">
        <span className="lbl">Kịch bản đã duyệt (video kế thừa chiến dịch; lời thoại giúp nhận lời đúng hơn)</span>
        <select value={contentId} onChange={(e) => setContentId(e.target.value)} className="h-8 rounded-md border border-border-2 bg-surface px-2 text-[13px] text-ink">
          <option value="">Không gắn kịch bản</option>
          {scripts.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
      </label>
      <label className="flex items-center gap-2 text-[12.5px] text-ink-2">
        <input type="checkbox" checked={final} onChange={(e) => setFinal(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--jade)]" />
        Video tôi đã tự edit (không dựng lại — OWNER tải lên thì vào thẳng Tổng kho video ngắn, người khác tải thì vào Chờ kiểm tra)
      </label>
      <label className="flex items-center gap-2 text-[12.5px] text-ink-2">
        <input type="checkbox" checked={cut} onChange={(e) => setCut(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--jade)]" />
        Cắt khoảng lặng cho các tệp này
      </label>
      {items.length > 0 && (
        <ul className="m-0 grid list-none gap-1.5 p-0">
          {items.map((it, i) => (
            <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-[12.5px]">
              <div className="min-w-0">
                <div className="truncate text-ink">{it.name}</div>
                {it.note && <div className="text-[11.5px] text-amber" data-testid="upload-note">{it.note}</div>}
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ground-2">
                  <div className={cn("h-full rounded-full", it.status === "error" ? "bg-brick" : "bg-jade")} style={{ width: `${it.pct}%` }} />
                </div>
              </div>
              <span className={cn("num whitespace-nowrap", it.status === "error" ? "text-brick" : "text-ink-2")}>
                {it.status === "waiting" ? "Chờ" : it.status === "uploading" ? `${it.pct}%` : it.status === "done" ? (final ? "Đã nhận — OWNER: đã vào Tổng kho; người khác: chờ kiểm tra" : "Đã nhận — chọn khung hình bên dưới rồi bấm Bắt đầu dựng") : it.error}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
