"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pill, type Tone } from "@/components/ui/pill";
import { inputClass } from "@/components/ui/field";
import { cn } from "@/lib/format";
import type { DropKind } from "@/lib/video/drop-kinds";
import { DESC_MAX, UPLOAD_ACCEPT, UPLOAD_LIMIT_TEXT, UPLOAD_MAX_BYTES, UPLOAD_TARGETS, defaultTarget, extOf, mediaOfExt, targetAccepts } from "@/lib/video/asset-upload-rules";

type Item = {
  key: string;
  file: File;
  target: DropKind | null;
  status: "ready" | "sending" | "imported" | "waiting" | "error";
  pct?: number;
  text?: string;
  /** Mô tả ngắn (chỉ ảnh·clip, tuỳ chọn) — bộ dựng chọn ảnh theo nội dung này thay vì tên tệp. */
  desc?: string;
};
type Reply = { ok: boolean; error?: string; state?: "imported" | "waiting"; to?: string; pending?: boolean; reason?: string };

const sizeText = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const PLACE: Record<string, string> = { music: "Nhạc", "sfx-owner": "Hiệu ứng", broll: "B-roll" };

function tooBig(f: File): string | null {
  const m = mediaOfExt(extOf(f.name));
  return m && f.size > UPLOAD_MAX_BYTES[m] ? `vượt ${Math.round(UPLOAD_MAX_BYTES[m] / 1024 / 1024)} MB` : null;
}

/** Gửi một tệp (dạng luồng, có tiến độ) tới /api/video-assets/upload. */
function sendOne(it: Item, license: string, keywords: string, onPct: (p: number) => void): Promise<Reply> {
  return new Promise((resolve) => {
    const desc = it.target === "anh-broll" ? (it.desc ?? "").trim() : "";
    const q = new URLSearchParams({ name: it.file.name, kind: it.target ?? "", license, ...(it.target === "anh-broll" && keywords ? { keywords } : {}), ...(desc ? { desc } : {}) });
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/video-assets/upload?${q.toString()}`);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && onPct(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      try {
        resolve(JSON.parse(xhr.responseText) as Reply);
      } catch {
        resolve({ ok: false, error: `Lỗi ${xhr.status}` });
      }
    };
    xhr.onerror = () => resolve({ ok: false, error: "Mất kết nối khi tải lên" });
    xhr.send(it.file);
  });
}

// Tư liệu › Tải lên (OWNER 26/10/2026): bấm "Tải lên" hoặc kéo thả nhiều tệp; mỗi tệp tự vào ngăn theo đuôi (âm thanh → Nhạc, đổi
// được sang Hiệu ứng; ảnh / clip → Ảnh·clip). Một ô "Nguồn / giấy phép" bắt buộc cho cả lượt. Máy chủ đặt tệp vào thư mục thả và
// nhận ngay (src/lib/video/asset-upload.ts) — nhạc luôn vào trạng thái chờ nghe duyệt.
export function AssetUpload() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [license, setLicense] = useState("");
  const [keywords, setKeywords] = useState("");
  const [over, setOver] = useState(false);
  const [msg, setMsg] = useState("");
  const busy = items.some((i) => i.status === "sending");
  const ready = items.filter((i) => i.status === "ready" || i.status === "error");
  const finished = items.length > 0 && items.every((i) => i.status === "imported" || i.status === "waiting");
  const hasBroll = items.some((i) => i.target === "anh-broll" && i.status !== "imported");

  const patch = (key: string, p: Partial<Item>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x)));

  function add(files: FileList | File[] | null) {
    if (!files) return;
    const next = Array.from(files).map((file, i): Item => {
      const target = defaultTarget(file.name);
      const big = tooBig(file);
      return { key: `${Date.now()}-${i}-${file.name}`, file, target, status: target && !big ? "ready" : "error", text: !target ? "loại tệp không nhận" : (big ?? undefined) };
    });
    setMsg("");
    setItems((xs) => [...xs.filter((x) => x.status !== "imported" && x.status !== "waiting"), ...next]);
  }

  async function sendAll() {
    if (!license.trim()) return setMsg("Cần ghi nguồn / giấy phép");
    setMsg("");
    const todo = items.filter((i) => (i.status === "ready" || i.status === "error") && i.target && !tooBig(i.file));
    for (const it of todo) {
      patch(it.key, { status: "sending", pct: 0, text: undefined });
      const r = await sendOne(it, license.trim(), keywords.trim(), (pct) => patch(it.key, { pct }));
      if (!r.ok) patch(it.key, { status: "error", text: r.error ?? "lỗi" });
      else if (r.state === "imported") patch(it.key, { status: "imported", text: `${PLACE[(r.to ?? "").split("/")[0]] ?? "Thư viện"}${r.pending ? " · chờ duyệt" : ""}` });
      else patch(it.key, { status: "waiting", text: r.reason ?? "chưa nhận" });
    }
    router.refresh();
  }

  const pill = (it: Item): { tone: Tone; label: string } | null => {
    if (it.status === "sending") return { tone: "sky", label: `${it.pct ?? 0}%` };
    if (it.status === "imported") return { tone: "jade", label: `Đã nhận · ${it.text}` };
    if (it.status === "waiting") return { tone: "amber", label: "Chờ nhận" };
    if (it.status === "error") return { tone: "brick", label: "Lỗi" };
    return null;
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!busy) add(e.dataTransfer.files);
      }}
      className={cn("grid gap-2.5 rounded-lg border border-dashed px-3 py-2.5 transition-colors", over ? "border-jade bg-jade-soft" : "border-border-2 bg-ground")}
    >
      <input ref={input} type="file" multiple accept={UPLOAD_ACCEPT} className="hidden" aria-label="Chọn tệp tư liệu" onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant={ready.length ? "outline" : "primary"} disabled={busy} onClick={() => input.current?.click()}>
          <Upload size={13} aria-hidden />
          {items.length ? "Thêm tệp" : "Tải lên"}
        </Button>
        <span className="text-[12px] text-ink-3">hoặc kéo thả vào đây · {UPLOAD_LIMIT_TEXT}</span>
      </div>

      {items.length > 0 && (
        <>
          <ul className="m-0 grid list-none gap-1.5 p-0">
            {items.map((it) => {
              const ext = extOf(it.file.name);
              const p = pill(it);
              const locked = it.status === "sending" || it.status === "imported" || it.status === "waiting";
              return (
                <li key={it.key} data-upload-item={it.file.name} className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-[12.5px]">
                  <span className="min-w-0 flex-1 basis-full truncate font-medium text-ink sm:basis-0" title={it.file.name}>{it.file.name}</span>
                  <span className="num shrink-0 text-[11px] text-ink-3">{sizeText(it.file.size)}</span>
                  {it.target && (
                    <div role="radiogroup" aria-label={`Loại tư liệu: ${it.file.name}`} className="inline-flex shrink-0 rounded-full border border-border-2 bg-surface p-0.5">
                      {UPLOAD_TARGETS.map((t) => {
                        const ok = targetAccepts(t.key, ext);
                        return (
                          <button
                            key={t.key}
                            type="button"
                            role="radio"
                            aria-checked={it.target === t.key}
                            disabled={locked || !ok}
                            onClick={() => patch(it.key, { target: t.key, status: "ready", text: undefined })}
                            className={cn("h-6 cursor-pointer rounded-full px-2.5 text-[11.5px] font-medium disabled:cursor-not-allowed", it.target === t.key ? "bg-jade text-white" : "text-ink-2 hover:text-ink disabled:opacity-40 disabled:hover:text-ink-2")}
                          >
                            {t.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {p && <Pill tone={p.tone}>{p.label}</Pill>}
                  {it.text && it.status !== "imported" && <span className={cn("max-w-full text-[11.5px]", it.status === "waiting" ? "text-amber" : "text-brick")}>{it.text}</span>}
                  {it.target === "anh-broll" && !locked && (
                    <input
                      value={it.desc ?? ""}
                      onChange={(e) => patch(it.key, { desc: e.target.value })}
                      maxLength={DESC_MAX}
                      aria-label={`Mô tả: ${it.file.name}`}
                      placeholder="Mô tả ngắn (tuỳ chọn) — vd hai người bắt tay ở văn phòng"
                      className={cn(inputClass, "order-last h-8 basis-full text-[12px]")}
                    />
                  )}
                  {!locked && (
                    <button type="button" onClick={() => setItems((xs) => xs.filter((x) => x.key !== it.key))} aria-label={`Bỏ ${it.file.name}`} className="grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-full text-ink-3 hover:bg-ground-2 hover:text-ink">
                      <X size={13} aria-hidden />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {!finished && (
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center">
              <input value={license} onChange={(e) => setLicense(e.target.value)} required aria-label="Nguồn / giấy phép" placeholder="Nguồn / giấy phép * (vd Mixkit, Tôi tự quay)" className={inputClass} disabled={busy} />
              {hasBroll ? <input value={keywords} onChange={(e) => setKeywords(e.target.value)} aria-label="Từ khoá" placeholder="Từ khoá ảnh·clip (vd văn phòng, tặng quà)" className={inputClass} disabled={busy} /> : <span className="hidden sm:block" />}
              <Button type="button" variant="primary" onClick={sendAll} disabled={busy || !ready.some((i) => i.target && !tooBig(i.file))}>
                {busy ? "Đang tải…" : `Gửi ${ready.filter((i) => i.target && !tooBig(i.file)).length} tệp`}
              </Button>
            </div>
          )}
          {finished && (
            <div>
              <Button type="button" variant="ghost" onClick={() => setItems([])}>Xong</Button>
            </div>
          )}
          {msg && <p role="alert" className="m-0 text-[12px] text-brick">{msg}</p>}
        </>
      )}
    </div>
  );
}
