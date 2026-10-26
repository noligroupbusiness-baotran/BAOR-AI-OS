import type { ReactNode } from "react";
import { cn } from "@/lib/format";
import { PlayButton } from "./play-button";

/** Lưới ô âm thanh dùng chung (Tư liệu): 1 cột điện thoại, 2 cột máy tính bảng, 3 cột máy tính. */
export const TILE_GRID = "sm:grid-cols-2 lg:grid-cols-3";

// Ô âm thanh gọn (OWNER 26/10/2026: thư viện nhạc "sắp xếp lại giống phần hiệu ứng âm thanh"): ▶ nhỏ · tên (cắt gọn) · thời lượng,
// nhãn ngắn ngay dòng đó (hiệu ứng) hoặc dòng phụ bên dưới (nhạc: trạng thái, nguồn, giấy phép) · một nút nhỏ bên phải
// (+ thùng rác `remove`, hiện khi rê chuột — DeleteAssetButton).
// Thẻ <audio> nằm trong PlayButton (ẩn) — E2E đọc src theo thuộc tính data-* của ô (vd data-track = tên tệp nhạc).
export function AssetTile({ data, title, previewUrl, duration, tags, stacked, action, remove }: { data: Record<`data-${string}`, string>; title: string; previewUrl: string | null; duration?: string; tags?: ReactNode; stacked?: boolean; action?: ReactNode; remove?: ReactNode }) {
  return (
    <li {...data} className="group flex min-w-0 items-center gap-2.5 rounded-lg border border-border bg-ground px-2 py-1.5">
      {previewUrl ? <PlayButton size="sm" src={previewUrl} label={title} /> : <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-dashed border-border-2 text-[10px] text-ink-3" title="Chưa có bản nghe thử">—</span>}
      <div className={cn("min-w-0 flex-1", !stacked && "flex items-center gap-2")}>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-medium text-ink" title={title}>{title}</span>
          {duration && <span className="num shrink-0 text-[11px] text-ink-3">{duration}</span>}
        </div>
        {tags && <div className={cn("flex items-center gap-1", stacked ? "mt-0.5 flex-wrap" : "shrink-0")}>{tags}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
      {remove}
    </li>
  );
}
