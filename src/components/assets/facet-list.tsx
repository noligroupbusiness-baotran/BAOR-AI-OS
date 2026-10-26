"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/format";
import { ChipRow } from "./chip-tabs";

export interface Facet {
  key: string;
  label: string;
  options: { key: string; label: string }[];
}

export interface FacetItem {
  id: string;
  /** Giá trị của mục cho từng facet, vd { source: "server", genre: "acoustic" }. */
  values: Record<string, string>;
  /** Mục đã "xong" (vd nhạc đã duyệt) → số trên chip dạng "đã xong/tổng". */
  done?: boolean;
  node: ReactNode;
}

// Danh sách lọc bằng nhiều hàng chip (Tư liệu: nguồn Máy chủ / Máy của anh × thể loại). Dòng do máy chủ dựng sẵn (kèm form duyệt),
// ở đây chỉ ẩn / hiện. Hàng chip chỉ hiện khi facet có từ 2 lựa chọn trở lên (hoặc khi `always`). "Tất cả" là mặc định.
export function FacetList({ facets, items, groupBy, countDone, listClassName, always = [] }: { facets: Facet[]; items: FacetItem[]; groupBy?: string; countDone?: boolean; listClassName?: string; always?: string[] }) {
  const [active, setActive] = useState<Record<string, string>>({});
  const match = (it: FacetItem, skip?: string) => facets.every((f) => f.key === skip || !active[f.key] || active[f.key] === "all" || it.values[f.key] === active[f.key]);
  const count = (list: FacetItem[]) => (countDone ? `${list.filter((x) => x.done).length}/${list.length}` : String(list.length));
  const shown = items.filter((it) => match(it));
  const grouped = groupBy && (!active[groupBy] || active[groupBy] === "all");
  const groupFacet = facets.find((f) => f.key === groupBy);
  const list = (arr: FacetItem[]) => <ul className={cn("m-0 grid list-none gap-1.5 p-0", listClassName)}>{arr.map((it) => <FragmentNode key={it.id} node={it.node} />)}</ul>;
  return (
    <div className="grid gap-3">
      {facets.map((f) => {
        const base = items.filter((it) => match(it, f.key));
        const opts = f.options.map((o) => ({ ...o, items: base.filter((it) => it.values[f.key] === o.key) })).filter((o) => o.items.length > 0 || always.includes(f.key));
        if (opts.length < 2 && !always.includes(f.key)) return null;
        return (
          <ChipRow
            key={f.key}
            label={f.label}
            active={active[f.key] ?? "all"}
            onPick={(k) => setActive((a) => ({ ...a, [f.key]: k }))}
            items={[{ key: "all", label: "Tất cả", count: count(base) }, ...opts.map((o) => ({ key: o.key, label: o.label, count: count(o.items) }))]}
          />
        );
      })}
      {shown.length === 0 ? (
        <p className="m-0 text-[12.5px] text-ink-3">Không có mục nào.</p>
      ) : grouped && groupFacet ? (
        groupFacet.options
          .map((o) => ({ o, arr: shown.filter((it) => it.values[groupFacet.key] === o.key) }))
          .filter((g) => g.arr.length)
          .map(({ o, arr }, _i, all) => (
            <div key={o.key}>
              {all.length > 1 && <div className="lbl mb-1.5">{o.label}</div>}
              {list(arr)}
            </div>
          ))
      ) : (
        list(shown)
      )}
    </div>
  );
}

function FragmentNode({ node }: { node: ReactNode }) {
  return <>{node}</>;
}
