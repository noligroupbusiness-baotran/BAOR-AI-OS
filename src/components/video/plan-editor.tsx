"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/format";
import { saveVideoPlanAction } from "@/lib/actions/videos";
import { SubmitButton } from "@/components/campaigns/submit-button";
import { toCutTime, toSourceTime } from "@/lib/video/job-types";

type Obj = Record<string, unknown>;
type Plan = { emphasis?: Obj[]; diagrams?: Obj[]; broll?: Obj[] } & Obj;

const TYPE_LABEL: Record<string, string> = {
  compare: "So sánh sai / đúng",
  arrow: "Mũi tên 2 bước",
  steps: "Thanh các bước",
  mechanism: "Sơ đồ cơ chế",
  process: "Quy trình nối bước",
  chapter: "Thẻ chương",
  quote: "Khung trích dẫn",
  fs06: "Khung toàn màn hình · nền mờ",
  fs05: "Khung toàn màn hình · sân khấu",
  fs01: "Khung toàn màn hình · nền tối",
  leak: "Vệt sáng chuyển chương",
};
const STYLE_LABEL: Record<string, string> = { fade: "Hiện mờ", blur: "Nhoè vào", shine: "Ánh kim" };

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const parseMmss = (v: string): number | null => {
  const m = v.trim().match(/^(\d+):(\d{1,2}(?:\.\d+)?)$|^(\d+(?:\.\d+)?)$/);
  if (!m) return null;
  return m[3] !== undefined ? Number(m[3]) : Number(m[1]) * 60 + Number(m[2]);
};

/** Các ô chữ của một sơ đồ: [nhãn, đường dẫn tới trường text]. */
function textPaths(d: Obj): [string, (string | number)[]][] {
  const out: [string, (string | number)[]][] = [];
  if (typeof d.text === "string") out.push(["Chữ", ["text"]]);
  if (d.wrong) out.push(["Sai", ["wrong", "text"]]);
  (Array.isArray(d.right) ? d.right : []).forEach((_, i) => out.push([`Đúng ${i + 1}`, ["right", i, "text"]]));
  if (d.top) out.push(["Trên", ["top", "text"]]);
  if (d.mid) out.push(["Giữa", ["mid", "text"]]);
  if (d.bottom) out.push(["Dưới", ["bottom", "text"]]);
  (Array.isArray(d.steps) ? d.steps : []).forEach((_, i) => out.push([`Bước ${i + 1}`, ["steps", i, "text"]]));
  return out;
}
function getAt(o: unknown, p: (string | number)[]): string {
  let x: unknown = o;
  for (const k of p) x = (x as Record<string | number, unknown> | undefined)?.[k];
  return typeof x === "string" ? x : "";
}
function setAt(o: Obj, p: (string | number)[], v: string): Obj {
  const c = structuredClone(o);
  let x: Record<string | number, unknown> = c;
  for (const k of p.slice(0, -1)) x = x[k] as Record<string | number, unknown>;
  x[p[p.length - 1]] = v;
  return c;
}

// Bảng biên tập: mọi chữ nhấn, sơ đồ / khung và ảnh minh hoạ theo mốc thời gian của video (đã tính cắt lặng).
// Tắt / bật, sửa chữ, đổi kiểu, đổi ảnh, thêm chữ nhấn; lưu vào kế hoạch cấp video rồi dựng lại.
export function PlanEditor(props: { videoId: string; back: string; plan: Plan; keep: [number, number][] | null; images: { file: string; label: string }[]; canRerender: boolean }) {
  const [plan, setPlan] = useState<Plan>(() => structuredClone(props.plan));
  const [open, setOpen] = useState(false);
  const [addT, setAddT] = useState("");
  const [addText, setAddText] = useState("");
  const [addStyle, setAddStyle] = useState("fade");
  const [err, setErr] = useState("");
  const ct = (t: unknown) => toCutTime(props.keep, Number(t) || 0);

  const rows = useMemo(() => {
    const r: { kind: "emphasis" | "diagrams" | "broll"; i: number; t: number }[] = [];
    (["emphasis", "diagrams", "broll"] as const).forEach((k) => (plan[k] ?? []).forEach((x, i) => r.push({ kind: k, i, t: ct(x.t ?? x.t0) })));
    return r.sort((a, b) => a.t - b.t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan]);

  const update = (k: "emphasis" | "diagrams" | "broll", i: number, fn: (x: Obj) => Obj) =>
    setPlan((p) => ({ ...p, [k]: (p[k] ?? []).map((x, j) => (j === i ? fn(x) : x)) }));
  const offCount = rows.filter((r) => (plan[r.kind] ?? [])[r.i]?.off).length;

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex h-[26px] items-center rounded-full border border-border-2 px-2.5 text-[12px] font-medium text-ink hover:border-ink-3">
        Bảng biên tập · {rows.length} mục
      </button>
    );
  }
  return (
    <div className="grid gap-2 rounded-md border border-border bg-ground p-3 text-[12.5px]">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-ink">Bảng biên tập · {rows.length} mục{offCount ? ` · ${offCount} đang tắt` : ""}</span>
        <button type="button" onClick={() => setOpen(false)} aria-label="Đóng" className="text-ink-3 hover:text-ink">✕</button>
      </div>
      <p className="m-0 text-ink-3">Mốc thời gian theo video đã dựng. Chữ trên màn hình nên đúng nguyên lời nói. Bỏ chọn “Dùng” để tắt một mục (vẫn giữ lại, bật lại được).</p>
      <ul className="m-0 grid max-h-[520px] list-none gap-1 overflow-y-auto p-0">
        {rows.map(({ kind, i, t }) => {
          const x = (plan[kind] ?? [])[i];
          const on = !x.off;
          return (
            <li key={`${kind}-${i}`} className={cn("grid grid-cols-[52px_minmax(0,1fr)_auto] items-start gap-2 rounded border border-border bg-surface px-2 py-1.5", !on && "opacity-50")}>
              <span className="num pt-1 text-ink-2">{mmss(t)}</span>
              <div className="grid min-w-0 gap-1">
                {kind === "emphasis" && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-semibold uppercase text-ink-3">Chữ nhấn</span>
                    <input value={String(x.text ?? "")} onChange={(e) => update(kind, i, (o) => ({ ...o, text: e.target.value }))} className="h-7 min-w-0 flex-1 rounded border border-border-2 bg-surface px-2 text-ink" />
                    <select value={String(x.style ?? "fade")} onChange={(e) => update(kind, i, (o) => ({ ...o, style: e.target.value }))} className="h-7 rounded border border-border-2 bg-surface px-1 text-ink">
                      {Object.entries(STYLE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                )}
                {kind === "diagrams" && (
                  <>
                    <span className="text-[11px] font-semibold uppercase text-ink-3">{TYPE_LABEL[String(x.type)] ?? String(x.type)}{x.t1 ? ` · đến ${mmss(ct(x.t1))}` : ""}</span>
                    {textPaths(x).map(([label, p]) => (
                      <label key={p.join(".")} className="flex items-center gap-1.5">
                        <span className="w-14 shrink-0 text-ink-3">{label}</span>
                        <input value={getAt(x, p)} onChange={(e) => update(kind, i, (o) => setAt(o, p, e.target.value))} className="h-7 min-w-0 flex-1 rounded border border-border-2 bg-surface px-2 text-ink" />
                      </label>
                    ))}
                  </>
                )}
                {kind === "broll" && (
                  <div className="flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/video-assets/broll?file=${encodeURIComponent(String(x.file ?? ""))}`} alt="" className="h-12 w-12 shrink-0 rounded object-cover" />
                    <div className="grid min-w-0 flex-1 gap-1">
                      <span className="text-[11px] font-semibold uppercase text-ink-3">Ảnh minh hoạ{x.keyword ? ` · “${String(x.keyword)}”` : ""}</span>
                      <select value={String(x.file ?? "")} onChange={(e) => update(kind, i, (o) => ({ ...o, file: e.target.value }))} className="h-7 min-w-0 rounded border border-border-2 bg-surface px-1 text-ink">
                        {!props.images.some((im) => im.file === x.file) && <option value={String(x.file ?? "")}>{String(x.file ?? "")}</option>}
                        {props.images.map((im) => <option key={im.file} value={im.file}>{im.label}</option>)}
                      </select>
                    </div>
                  </div>
                )}
              </div>
              <label className="flex items-center gap-1 pt-1 text-ink-2">
                <input type="checkbox" checked={on} onChange={(e) => update(kind, i, (o) => { const c = { ...o }; if (e.target.checked) delete c.off; else c.off = true; return c; })} className="h-3.5 w-3.5 accent-[var(--jade)]" />
                Dùng
              </label>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-end gap-1.5 border-t border-border pt-2">
        <span className="w-full text-[11px] font-semibold uppercase text-ink-3">Thêm chữ nhấn</span>
        <input value={addT} onChange={(e) => setAddT(e.target.value)} placeholder="phút:giây" className="h-7 w-20 rounded border border-border-2 bg-surface px-2 text-ink" />
        <input value={addText} onChange={(e) => setAddText(e.target.value)} placeholder="đúng lời nói" className="h-7 min-w-0 flex-1 rounded border border-border-2 bg-surface px-2 text-ink" />
        <select value={addStyle} onChange={(e) => setAddStyle(e.target.value)} className="h-7 rounded border border-border-2 bg-surface px-1 text-ink">
          {Object.entries(STYLE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button
          type="button"
          onClick={() => {
            const s = parseMmss(addT);
            if (s === null || !addText.trim()) return setErr("Nhập mốc dạng phút:giây (vd 1:25) và chữ");
            setErr("");
            setPlan((p) => ({ ...p, emphasis: [...(p.emphasis ?? []), { t: Math.round(toSourceTime(props.keep, s) * 100) / 100, text: addText.trim(), style: addStyle }] }));
            setAddT("");
            setAddText("");
          }}
          className="h-7 rounded border border-border-2 px-2.5 font-medium text-ink hover:border-ink-3"
        >
          Thêm
        </button>
        {err && <span className="w-full text-brick">{err}</span>}
      </div>
      <form action={saveVideoPlanAction} className="flex flex-wrap gap-2">
        <input type="hidden" name="id" value={props.videoId} />
        <input type="hidden" name="back" value={props.back} />
        <input type="hidden" name="plan" value={JSON.stringify(plan)} />
        {props.canRerender && <SubmitButton name="rerender" value="1" pendingText="Đang lưu…">Lưu và dựng lại</SubmitButton>}
        <SubmitButton name="rerender" value="0" variant="outline" pendingText="Đang lưu…">Chỉ lưu</SubmitButton>
      </form>
    </div>
  );
}
