import { ImageIcon } from "lucide-react";
import { PageHead, Panel, PanelHeader } from "@/components/ui/card";
import { Breadcrumb } from "@/components/shell/module-page";
import { SettingList } from "@/components/settings/setting-item";
import { AppLogoItem, MusicPanel } from "@/components/settings/brand-panels";
import { MusicLibraryPanel, SfxPanel } from "@/components/settings/music-library";
import { DropFolderPanel } from "@/components/settings/drop-folder";
import { BrollPanel } from "@/components/settings/auto-edit-panel";
import { OwnerMacLine } from "@/components/assets/asset-tags";
import { loadAssetPage } from "@/lib/video/asset-page";

export const metadata = { title: "Tư liệu – BAOR AI OS" };

// Tư liệu (OWNER 26/10/2026, gộp menu "Khác"): mọi tư liệu dùng cho ảnh / video ở một chỗ — logo, thư viện nhạc nền (nghe thử,
// duyệt), nhạc anh tải lên, ảnh / B-roll, thư mục thả tư liệu. Các khối CHUYỂN NGUYÊN từ Cài đặt (không viết lại);
// liên kết cũ /settings#<mục> mở thẳng đây (src/components/settings/settings-tabs.tsx · ASSET_ANCHORS).
// 26/10 tối: trình bày lại cho OWNER "xem trực tiếp được" — nghe thử bằng nút ▶, ảnh thành lưới thu nhỏ, giấy phép vào (i).
// Danh mục hợp nhất (máy chủ + "Máy của anh" do máy dựng báo lên): src/lib/video/asset-catalog.ts, nạp qua loadAssetPage.
export default function AssetsPage() {
  const { entries, owner } = loadAssetPage();
  const synced = !!owner?.syncedAt;
  const ownerDrops = entries.filter((e) => e.type === "drop" && e.source === "owner_mac").length;
  return (
    <>
      <Breadcrumb items={[{ label: "Tổng quan", href: "/dashboard" }, { label: "Tư liệu" }]} />
      <PageHead title="Tư liệu" sub="Logo, nhạc, B-roll cho video" />
      {owner && <div className="-mt-1.5 mb-1"><OwnerMacLine s={owner} /></div>}
      <div className="grid gap-3.5">
        <MusicLibraryPanel entries={entries} ownerSynced={synced} />
        <SfxPanel entries={entries} ownerSynced={synced} />
        <MusicPanel />
        <BrollPanel entries={entries} ownerSynced={synced} />
        <DropFolderPanel ownerWaiting={ownerDrops} />
        <Panel id="logo">
          <PanelHeader title="Logo" icon={ImageIcon} tone="indigo" />
          <SettingList>
            <AppLogoItem />
          </SettingList>
        </Panel>
      </div>
    </>
  );
}
