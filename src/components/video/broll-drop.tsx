"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Thêm một clip B-roll: tệp + từ khoá + giấy phép (bắt buộc). Tải dạng luồng, không qua giới hạn 10 MB.
export function BrollDrop() {
  const router = useRouter();
  const file = useRef<HTMLInputElement>(null);
  const [keywords, setKeywords] = useState("");
  const [license, setLicense] = useState("");
  const [source, setSource] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pct, setPct] = useState<number | null>(null);

  function send() {
    const f = file.current?.files?.[0];
    if (!f) return setMsg({ ok: false, text: "Chưa chọn tệp" });
    if (!license.trim() || !keywords.trim()) return setMsg({ ok: false, text: "Cần từ khoá và giấy phép" });
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/video-assets/broll?name=${encodeURIComponent(f.name)}&keywords=${encodeURIComponent(keywords)}&license=${encodeURIComponent(license)}&source=${encodeURIComponent(source)}`);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && setPct(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      setPct(null);
      try {
        const j = JSON.parse(xhr.responseText) as { ok: boolean; error?: string };
        setMsg(j.ok ? { ok: true, text: "Đã thêm vào thư viện" } : { ok: false, text: j.error ?? "Lỗi" });
        if (j.ok) {
          setKeywords("");
          setLicense("");
          setSource("");
          if (file.current) file.current.value = "";
          router.refresh();
        }
      } catch {
        setMsg({ ok: false, text: `Lỗi ${xhr.status}` });
      }
    };
    xhr.onerror = () => {
      setPct(null);
      setMsg({ ok: false, text: "Mất kết nối khi tải lên" });
    };
    xhr.send(f);
  }

  const input = "h-8 w-full rounded-md border border-border-2 bg-surface px-2 text-[12.5px] text-ink";
  return (
    <div className="mt-2 grid gap-2 rounded-md border border-dashed border-border-2 p-2.5 sm:grid-cols-2">
      <input ref={file} type="file" accept=".mp4,.mov,.m4v,.webm,video/*" className="text-[12px] text-ink-2 sm:col-span-2" />
      <input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="Từ khoá: gọi điện, khách hàng" className={input} />
      <input value={license} onChange={(e) => setLicense(e.target.value)} placeholder="Giấy phép: OWNER tự quay / Pexels License…" className={input} />
      <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Nguồn (tuỳ chọn): Drive GROK BOT…" className={input} />
      <div className="flex items-center gap-2">
        <button type="button" onClick={send} disabled={pct !== null} className="inline-flex h-8 items-center rounded-full border border-border-2 px-3 text-[12.5px] font-medium text-ink hover:border-ink-3 disabled:opacity-50">
          {pct !== null ? `Đang tải ${pct}%` : "Thêm B-roll"}
        </button>
        {msg && <span className={msg.ok ? "text-[12px] text-jade" : "text-[12px] text-brick"}>{msg.text}</span>}
      </div>
    </div>
  );
}
