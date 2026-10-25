import { ImageIcon } from "lucide-react";
import { PageHead, Panel, PanelHeader } from "@/components/ui/card";
import { Breadcrumb } from "@/components/shell/module-page";
import { SettingList } from "@/components/settings/setting-item";
import { AppLogoItem, MusicPanel } from "@/components/settings/brand-panels";
import { MusicLibraryPanel } from "@/components/settings/music-library";
import { DropFolderPanel } from "@/components/settings/drop-folder";
import { BrollPanel } from "@/components/settings/auto-edit-panel";

export const metadata = { title: "Tư liệu – BAOR AI OS" };

// Tư liệu (OWNER 26/10/2026, gộp menu "Khác"): mọi tư liệu dùng cho ảnh / video ở một chỗ — logo, thư viện nhạc nền (nghe thử,
// duyệt), nhạc anh tải lên, ảnh / B-roll, thư mục thả tư liệu. Các khối CHUYỂN NGUYÊN từ Cài đặt (không viết lại);
// liên kết cũ /settings#<mục> mở thẳng đây (src/components/settings/settings-tabs.tsx · ASSET_ANCHORS).
export default function AssetsPage() {
  return (
    <>
      <Breadcrumb items={[{ label: "Tổng quan", href: "/dashboard" }, { label: "Tư liệu" }]} />
      <PageHead title="Tư liệu" sub="Logo, nhạc, B-roll cho video" />
      <div className="grid gap-3.5">
        <MusicLibraryPanel />
        <BrollPanel />
        <DropFolderPanel />
        <MusicPanel />
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
