// Video Review: logic thuần (dùng được ở client và server) — tìm mục kế hoạch gần mốc góp ý, áp yêu cầu sửa vào kế hoạch,
// và kiểm bản dựng mới đã thực sự áp dụng (đối chiếu kế hoạch bản dựng + báo cáo đầu ra của bộ dựng).
import { toCutTime } from "./job-types";

export type PlanKind = "emphasis" | "diagrams" | "broll";
export type FixAction = "off" | "on" | "text" | "style";
/** Mục kế hoạch được góp ý: nhận diện theo loại + mốc gốc + nhãn lúc góp ý (chỉ số mảng có thể đổi khi sửa kế hoạch). */
export interface FixTarget {
  kind: PlanKind;
  t: number;
  label: string;
  /** Kiểu sơ đồ (arrow, chapter, leak…): hai sơ đồ có thể cùng mốc (vd vệt sáng + thẻ chương). */
  type?: string;
  /** Đường tới ô chữ trong sơ đồ, vd "top.text", "steps.1.text"; trống = trường text của chữ nhấn / trích dẫn / thẻ chương. */
  field?: string;
}
export interface CommentFix {
  target: FixTarget;
  action: FixAction;
  value?: string;
}
export type CommentStatus = "open" | "planned" | "applied" | "failed" | "resolved";

export const commentStatusLabel: Record<CommentStatus, { label: string; tone: "neutral" | "amber" | "jade" | "brick" | "violet" }> = {
  open: { label: "Chưa xử lý", tone: "amber" },
  planned: { label: "Đang dựng lại", tone: "violet" },
  applied: { label: "Đã áp dụng — chờ xác nhận", tone: "jade" },
  failed: { label: "Chưa áp dụng được", tone: "brick" },
  resolved: { label: "Đã xác nhận xong", tone: "neutral" },
};
export const fixActionLabel: Record<FixAction, string> = { off: "Bỏ mục này", on: "Bật lại mục này", text: "Sửa chữ thành", style: "Đổi kiểu chữ nhấn" };
export const STYLES = ["blur", "fade", "shine"] as const;

type Obj = Record<string, unknown>;
type Plan = { emphasis?: Obj[]; diagrams?: Obj[]; broll?: Obj[] } & Obj;

export const itemTime = (kind: PlanKind, x: Obj): number => Number(kind === "emphasis" ? x.t : x.t0) || 0;

/** Các ô chữ của một mục: [nhãn, đường dẫn]. Đường trống = trường text gốc. */
export function textFields(kind: PlanKind, x: Obj): { label: string; field: string; value: string }[] {
  const out: { label: string; field: string; value: string }[] = [];
  const at = (p: string) => {
    let v: unknown = x;
    for (const k of p.split(".")) v = (v as Record<string, unknown> | undefined)?.[k];
    return typeof v === "string" ? v : "";
  };
  if (kind === "broll") return out;
  if (typeof x.text === "string") out.push({ label: "Chữ", field: "", value: x.text });
  if (kind === "diagrams") {
    for (const k of ["wrong", "top", "mid", "bottom"]) if (x[k]) out.push({ label: { wrong: "Sai", top: "Trên", mid: "Giữa", bottom: "Dưới" }[k]!, field: `${k}.text`, value: at(`${k}.text`) });
    for (const k of ["right", "steps"]) (Array.isArray(x[k]) ? (x[k] as unknown[]) : []).forEach((_, i) => out.push({ label: `${k === "right" ? "Đúng" : "Bước"} ${i + 1}`, field: `${k}.${i}.text`, value: at(`${k}.${i}.text`) }));
  }
  return out;
}

export function itemLabel(kind: PlanKind, x: Obj): string {
  if (kind === "broll") return `Ảnh minh hoạ${x.keyword ? ` “${String(x.keyword)}”` : ""}`;
  if (kind === "emphasis") return `Chữ nhấn “${String(x.text ?? "")}”`;
  const first = textFields(kind, x)[0]?.value;
  return `Sơ đồ ${String(x.type ?? "")}${first ? ` “${first}”` : ""}`;
}

export interface Candidate {
  kind: PlanKind;
  type?: string;
  t: number; // mốc gốc
  cutT: number; // mốc trên bản dựng
  label: string;
  off: boolean;
  fields: { label: string; field: string; value: string }[];
}

/** Mục kế hoạch nằm trong / gần đoạn góp ý (mốc theo bản dựng; ±pad giây). Gần nhất trước. */
export function candidatesNear(plan: Plan, keep: [number, number][] | null, t: number, tEnd: number | null, pad = 1.5): Candidate[] {
  const a = t - pad;
  const b = (tEnd ?? t) + pad;
  const out: Candidate[] = [];
  for (const kind of ["emphasis", "diagrams", "broll"] as const) {
    for (const x of plan[kind] ?? []) {
      const src = itemTime(kind, x);
      const cut = toCutTime(keep, src);
      const cutEnd = kind === "emphasis" ? cut : toCutTime(keep, Number(x.t1) || src);
      if (cutEnd >= a && cut <= b) out.push({ kind, ...(kind === "diagrams" ? { type: String(x.type ?? "") } : {}), t: src, cutT: cut, label: itemLabel(kind, x), off: !!x.off, fields: textFields(kind, x) });
    }
  }
  return out.sort((p, q) => Math.abs(p.cutT - t) - Math.abs(q.cutT - t));
}

/**
 * Chỉ số mục khớp yêu cầu: cùng loại + cùng mốc (±0,06 s) + cùng kiểu sơ đồ; còn nhiều mục thì lọc theo nhãn lúc góp ý.
 * Trả mảng để nơi gọi phân biệt "không còn" (0) với "mơ hồ" (> 1) — không bao giờ đoán.
 */
export function matchItems(plan: Plan, target: FixTarget): number[] {
  const list = plan[target.kind] ?? [];
  let idx = list.map((x, i) => [x, i] as const).filter(([x]) => Math.abs(itemTime(target.kind, x) - target.t) < 0.06 && (!target.type || String(x.type ?? "") === target.type)).map(([, i]) => i);
  if (idx.length > 1) idx = idx.filter((i) => itemLabel(target.kind, list[i]) === target.label);
  return idx;
}

export function findItem(plan: Plan, target: FixTarget): Obj | undefined {
  const idx = matchItems(plan, target);
  return idx.length === 1 ? (plan[target.kind] ?? [])[idx[0]] : undefined;
}

/** Ghi vào ô chữ CÓ SẴN (đường dẫn phải tồn tại và đang là chuỗi); không tạo khoá mới. null = ô chữ không tồn tại. */
function setField(x: Obj, field: string | undefined, v: string): Obj | null {
  const c = structuredClone(x);
  if (!field) {
    if (typeof c.text !== "string") return null;
    c.text = v;
    return c;
  }
  const keys = field.split(".");
  let o: Record<string, unknown> = c;
  for (const k of keys.slice(0, -1)) {
    const next = Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined;
    if (!next || typeof next !== "object") return null;
    o = next as Record<string, unknown>;
  }
  const last = keys[keys.length - 1];
  if (!Object.prototype.hasOwnProperty.call(o, last) || typeof o[last] !== "string") return null;
  o[last] = v;
  return c;
}
function getField(x: Obj, field: string | undefined): string {
  if (!field) return typeof x.text === "string" ? x.text : "";
  let v: unknown = x;
  for (const k of field.split(".")) v = (v as Record<string, unknown> | undefined)?.[k];
  return typeof v === "string" ? v : "";
}

/** Kiểm yêu cầu sửa có hợp lệ với mục đích không (trước khi lưu). */
export function validateFix(fix: CommentFix): string | null {
  if (!["emphasis", "diagrams", "broll"].includes(fix.target?.kind)) return "Chọn mục cần sửa";
  if (!Number.isFinite(fix.target.t)) return "Mục cần sửa không hợp lệ";
  if (!["off", "on", "text", "style"].includes(fix.action)) return "Chọn cách sửa";
  if (fix.action === "text") {
    if (fix.target.kind === "broll") return "Ảnh minh hoạ không có chữ để sửa";
    const v = (fix.value ?? "").replace(/\s+/g, " ").trim();
    if (!v) return "Nhập chữ mới (đúng nguyên lời nói)";
    if (v.length > 120) return "Chữ mới tối đa 120 ký tự";
    if (fix.target.field && !/^(wrong|top|mid|bottom)\.text$|^(right|steps)\.\d{1,2}\.text$/.test(fix.target.field)) return "Ô chữ không hợp lệ";
  }
  if (fix.action === "style" && (fix.target.kind !== "emphasis" || !STYLES.includes(fix.value as (typeof STYLES)[number]))) return "Kiểu chữ chỉ áp cho chữ nhấn (Hiện mờ / Nhoè vào / Ánh kim)";
  return null;
}

/** Áp MỘT yêu cầu sửa vào kế hoạch (mốc gốc). Chỉ đổi đúng mục được góp ý; mục khác giữ nguyên từng byte. */
export function applyFix(plan: Plan, fix: CommentFix): { plan: Plan; changed: boolean; error?: string; unchanged?: boolean } {
  const list = plan[fix.target.kind] ?? [];
  const idx = matchItems(plan, fix.target);
  if (idx.length === 0) return { plan, changed: false, error: `Không còn ${fix.target.label} ở mốc này trong kế hoạch` };
  if (idx.length > 1) return { plan, changed: false, error: `Mốc mơ hồ: ${idx.length} mục giống nhau ở ${fix.target.t.toFixed(2)} s — sửa trong Bảng biên tập` };
  const i = idx[0];
  const before = list[i];
  let after: Obj | null = before;
  if (fix.action === "off") after = { ...before, off: true };
  else if (fix.action === "on") {
    after = { ...before };
    delete after.off;
  } else if (fix.action === "text") after = setField(before, fix.target.field, (fix.value ?? "").replace(/\s+/g, " ").trim());
  else if (fix.action === "style") after = { ...before, style: fix.value };
  if (!after) return { plan, changed: false, error: `${fix.target.label}: không có ô chữ ${fix.target.field || "“Chữ”"} để sửa` };
  const changed = JSON.stringify(after) !== JSON.stringify(before);
  if (!changed) return { plan, changed: false, unchanged: true, error: `${fix.target.label}: yêu cầu không làm thay đổi gì (đã đúng như vậy)` };
  return { plan: { ...plan, [fix.target.kind]: list.map((x, j) => (j === i ? after : x)) }, changed };
}

/** Dựng lại yêu cầu sửa CHỈ từ các trường đã kiểm (cắt độ dài) — không lưu nguyên JSON người gửi. */
export function normalizeFix(f: CommentFix): CommentFix {
  const t = f.target;
  return {
    target: { kind: t.kind, t: Math.round(Number(t.t) * 100) / 100, label: String(t.label ?? "").slice(0, 120), ...(t.type ? { type: String(t.type).slice(0, 20) } : {}), ...(t.field && f.action === "text" ? { field: String(t.field).slice(0, 40) } : {}) },
    action: f.action,
    ...(f.action === "text" || f.action === "style" ? { value: String(f.value ?? "").replace(/\s+/g, " ").trim().slice(0, 120) } : {}),
  };
}

/** Phần đầu ra bộ dựng cần cho việc kiểm (report.json, mốc theo bản dựng). */
export interface RenderOutput {
  emphasis?: { t: number; text: string; kind?: string }[];
  diagrams?: { type: string; t0: number; t1?: number }[];
  broll?: { events?: { t0: number; file: string }[] };
  output?: { keep?: [number, number][] | null };
  failed?: string[];
}

const norm = (s: string) => s.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Bản dựng mới đã áp dụng yêu cầu chưa: (1) kế hoạch bản dựng có thay đổi, (2) đầu ra bộ dựng khớp (chữ nhấn / sơ đồ / minh hoạ
 * có hay không ở mốc đó, đúng chữ / đúng kiểu). Ô chữ trong sơ đồ: báo cáo không ghi chữ sơ đồ → chỉ kiểm được qua kế hoạch.
 */
export function verifyFix(fix: CommentFix, jobPlan: Plan | null, report: RenderOutput | null): { ok: boolean; note: string } {
  if (!jobPlan || !report) return { ok: false, note: "Bản dựng mới không có kế hoạch / báo cáo để đối chiếu" };
  const item = findItem(jobPlan, fix.target);
  if (!item) return { ok: false, note: `Kế hoạch bản dựng không còn ${fix.target.label}` };
  const off = !!item.off;
  if (fix.action === "off" && !off) return { ok: false, note: "Kế hoạch bản dựng vẫn bật mục này" };
  if (fix.action === "on" && off) return { ok: false, note: "Kế hoạch bản dựng vẫn tắt mục này" };
  if (fix.action === "text" && norm(getField(item, fix.target.field)) !== norm(fix.value ?? "")) return { ok: false, note: "Kế hoạch bản dựng chưa có chữ mới" };
  if (fix.action === "style" && item.style !== fix.value) return { ok: false, note: "Kế hoạch bản dựng chưa đổi kiểu" };
  const at = toCutTime(report.output?.keep ?? null, fix.target.t);
  const near = (x: number) => Math.abs(x - at) < 0.6;
  if (fix.target.kind === "emphasis") {
    const hits = (report.emphasis ?? []).filter((e) => near(e.t));
    if (fix.action === "off") return hits.length ? { ok: false, note: `Bản dựng vẫn có chữ nhấn “${hits[0].text}” ở ${at.toFixed(1)} s` } : { ok: true, note: `Bản dựng không còn chữ nhấn ở ${at.toFixed(1)} s` };
    const want = fix.action === "text" ? norm(fix.value ?? "") : norm(String(item.text ?? ""));
    const hit = hits.find((e) => norm(e.text) === want);
    if (!hit) return { ok: false, note: `Bản dựng không có chữ nhấn “${fix.action === "text" ? fix.value : item.text}” ở ${at.toFixed(1)} s` };
    if (fix.action === "style" && hit.kind !== fix.value) return { ok: false, note: `Chữ nhấn ở ${at.toFixed(1)} s dựng kiểu ${hit.kind}, cần ${fix.value}` };
    return { ok: true, note: `Bản dựng có chữ nhấn “${hit.text}” (${hit.kind}) ở ${hit.t.toFixed(1)} s` };
  }
  if (fix.target.kind === "diagrams") {
    const hit = (report.diagrams ?? []).find((d) => d.type === item.type && near(d.t0));
    // Danh sách sơ đồ trong báo cáo là danh sách bộ dựng nhận để vẽ (sau khi lọc mục tắt), không phải đo từ khung hình
    if (fix.action === "off") return hit ? { ok: false, note: `Bản dựng vẫn có sơ đồ ${hit.type} ở ${hit.t0.toFixed(1)} s` } : { ok: true, note: `Bộ dựng không còn nhận sơ đồ ${String(item.type)} ở ${at.toFixed(1)} s (xem lại bằng mắt)` };
    if (!hit) return { ok: false, note: `Bản dựng không có sơ đồ ${String(item.type)} ở ${at.toFixed(1)} s` };
    return { ok: true, note: fix.action === "text" ? `Sơ đồ ${hit.type} ở ${hit.t0.toFixed(1)} s dựng theo kế hoạch đã sửa chữ (báo cáo không ghi chữ sơ đồ — xem lại bằng mắt)` : `Bản dựng có sơ đồ ${hit.type} ở ${hit.t0.toFixed(1)} s` };
  }
  const hit = (report.broll?.events ?? []).find((e) => near(e.t0) && e.file === item.file);
  if (fix.action === "off") return hit ? { ok: false, note: `Bản dựng vẫn chèn ${hit.file} ở ${hit.t0.toFixed(1)} s` } : { ok: true, note: `Bản dựng không còn ảnh minh hoạ ở ${at.toFixed(1)} s` };
  return hit ? { ok: true, note: `Bản dựng có ảnh minh hoạ ở ${hit.t0.toFixed(1)} s` } : { ok: false, note: `Bản dựng không có ảnh minh hoạ ở ${at.toFixed(1)} s` };
}
