import { CircleAlert, HardDrive, Laptop, RefreshCw } from "lucide-react";
import { Pill } from "@/components/ui/pill";
import { InfoTip } from "@/components/ui/info-tip";
import { formatDateTime } from "@/lib/format";

// Nhãn dùng chung cho trang Tư liệu với danh mục hợp nhất (src/lib/video/asset-catalog.ts · listAssetCatalog): mục "server" (máy chủ)
// hoặc "owner_mac" (máy dựng trên Mac của OWNER báo lên), quyết định duyệt đang chờ máy dựng áp, lỗi lần áp gần nhất.
export type AssetOrigin = "server" | "owner_mac";

export const ORIGIN_LABEL: Record<AssetOrigin, string> = { server: "Máy chủ", owner_mac: "Máy của anh" };

/** Nhãn nguồn: "Máy chủ" / "Máy của anh". */
export function OriginTag({ origin }: { origin?: AssetOrigin }) {
  if (!origin) return null;
  return origin === "owner_mac" ? (
    <Pill tone="violet"><Laptop size={11} aria-hidden />Máy của anh</Pill>
  ) : (
    <Pill><HardDrive size={11} aria-hidden />Máy chủ</Pill>
  );
}

/** Quyết định duyệt đã ghi trên web nhưng máy dựng chưa nhận / áp dụng. */
export function PendingTag({ pending }: { pending?: boolean }) {
  if (!pending) return null;
  return <Pill tone="sky"><RefreshCw size={11} aria-hidden />Đang chờ máy dựng áp dụng</Pill>;
}

/** Lần áp quyết định gần nhất không thành: nhãn đỏ ngắn + (i) lý do. */
export function DecisionErrorTag({ error }: { error?: string | null }) {
  if (!error) return null;
  return (
    <span className="inline-flex items-center gap-0.5">
      <Pill tone="brick"><CircleAlert size={11} aria-hidden />Chưa áp được</Pill>
      <InfoTip label="Lý do chưa áp được">{error}</InfoTip>
    </span>
  );
}

export interface OwnerMacLineData {
  syncedAt: string | null;
  count: number;
  stale: boolean;
  pendingDecisions: number;
}

/** "Máy của anh: đồng bộ lúc …, N mục" (+ cảnh báo vàng khi quá 30 phút chưa đồng bộ, + số quyết định chờ áp). Dùng ở Tư liệu
 *  và Cài đặt › Video › Nơi dựng video. */
export function OwnerMacLine({ s }: { s: OwnerMacLineData | null }) {
  if (!s) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {s.syncedAt ? (
        <Pill tone={s.stale ? "amber" : "neutral"}><Laptop size={11} aria-hidden />Máy của anh: đồng bộ lúc {formatDateTime(s.syncedAt)} · {s.count} mục</Pill>
      ) : (
        <Pill><Laptop size={11} aria-hidden />Máy của anh: chưa đồng bộ</Pill>
      )}
      {s.syncedAt && s.stale && <Pill tone="amber"><CircleAlert size={11} aria-hidden />Máy của anh chưa đồng bộ &gt; 30 phút</Pill>}
      {s.pendingDecisions > 0 && <Pill tone="sky"><RefreshCw size={11} aria-hidden />{s.pendingDecisions} quyết định chờ máy dựng</Pill>}
    </span>
  );
}
