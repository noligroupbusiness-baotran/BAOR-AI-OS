"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/format";

type Item = { name: string; pct: number; status: "waiting" | "uploading" | "done" | "error"; error?: string };

const ACCEPT = ".mp4,.mov,.m4v,.webm,video/mp4,video/quicktime,video/webm";

// Thêm nguồn: kéo thả hoặc chọn tệp quay thô. Tải lên dạng luồng (không giới hạn 10 MB), xong là hệ thống tự dựng.
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

  function send(file: File, idx: number): Promise<void> {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `/api/video-sources?name=${encodeURIComponent(file.name)}&cut=${cut ? "1" : "0"}&content=${encodeURIComponent(contentId)}${final ? "&mode=final" : ""}`);
      xhr.setRequestHeader("Content-Type", "application/octet-stream");
      update(idx, { status: "uploading" });
      xhr.upload.onprogress = (e) => e.lengthComputable && update(idx, { pct: Math.round((e.loaded / e.total) * 100) });
      xhr.onload = () => {
        let msg = "";
        try {
          const j = JSON.parse(xhr.responseText) as { ok: boolean; error?: string };
          if (!j.ok) msg = j.error ?? "Lỗi";
        } catch {
          msg = `Lỗi ${xhr.status}`;
        }
        update(idx, msg ? { status: "error", error: msg } : { status: "done", pct: 100 });
        router.refresh();
        resolve();
      };
      xhr.onerror = () => {
        update(idx, { status: "error", error: "Mất kết nối khi tải lên" });
        resolve();
      };
      xhr.send(file);
    });
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
        Video đã dựng sẵn ở ngoài (không dựng lại, vào thẳng Chờ kiểm tra)
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
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ground-2">
                  <div className={cn("h-full rounded-full", it.status === "error" ? "bg-brick" : "bg-jade")} style={{ width: `${it.pct}%` }} />
                </div>
              </div>
              <span className={cn("num whitespace-nowrap", it.status === "error" ? "text-brick" : "text-ink-2")}>
                {it.status === "waiting" ? "Chờ" : it.status === "uploading" ? `${it.pct}%` : it.status === "done" ? (final ? "Đã nhận, chờ kiểm tra" : "Đã nhận, đang dựng") : it.error}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
