import { listAssetCatalog, ownerMacSummary, type AssetEntry } from "./asset-catalog";
import type { OwnerMacLineData } from "@/components/assets/asset-tags";

// Dữ liệu trang Tư liệu: danh mục hợp nhất + tóm tắt "Máy của anh". Phần máy của anh đọc CSDL (bảng remote_assets, migration 0024);
// CSDL chưa có bảng (máy chủ chưa khởi động lại sau khi cập nhật) hay lỗi đọc → vẫn hiện tư liệu máy chủ, không làm hỏng trang.
export function loadAssetPage(): { entries: AssetEntry[]; owner: OwnerMacLineData | null } {
  try {
    const s = ownerMacSummary();
    return { entries: listAssetCatalog(), owner: { syncedAt: s.syncedAt, count: s.count, stale: s.stale, pendingDecisions: s.pendingDecisions } };
  } catch (e) {
    console.warn("[tư liệu] không đọc được danh mục máy của OWNER — chỉ hiện tư liệu máy chủ:", (e as Error).message);
    return { entries: listAssetCatalog({ source: "server" }), owner: null };
  }
}

/** Chỉ phần tóm tắt (Cài đặt › Video › Nơi dựng video). */
export function loadOwnerMacLine(): OwnerMacLineData | null {
  try {
    const s = ownerMacSummary();
    return { syncedAt: s.syncedAt, count: s.count, stale: s.stale, pendingDecisions: s.pendingDecisions };
  } catch {
    return null;
  }
}
