import { ImageIcon, Lock, Upload } from "lucide-react";
import { Pill } from "@/components/ui/pill";
import { PageHead, Panel, PanelHeader } from "@/components/ui/card";
import { Breadcrumb } from "@/components/shell/module-page";
import { SettingList } from "@/components/settings/setting-item";
import { AppLogoItem, MusicPanel } from "@/components/settings/brand-panels";
import { MusicLibraryPanel, SfxPanel } from "@/components/settings/music-library";
import { DropFolderPanel } from "@/components/settings/drop-folder";
import { BrollPanel } from "@/components/settings/auto-edit-panel";
import { OwnerMacLine } from "@/components/assets/asset-tags";
import { AssetUpload } from "@/components/assets/asset-upload";
import { TrashPanel } from "@/components/assets/trash-panel";
import { can, currentActor } from "@/lib/permissions";
import { loadAssetPage } from "@/lib/video/asset-page";

export const metadata = { title: "Tư liệu – BAOR AI OS" };

// Tư liệu (OWNER 26/10/2026, gộp menu "Khác"): mọi tư liệu dùng cho ảnh / video ở một chỗ — logo, thư viện nhạc nền (nghe thử,
// duyệt), nhạc anh tải lên, ảnh / B-roll, thư mục thả tư liệu. Các khối CHUYỂN NGUYÊN từ Cài đặt (không viết lại);
// liên kết cũ /settings#<mục> mở thẳng đây (src/components/settings/settings-tabs.tsx · ASSET_ANCHORS).
// 26/10 tối: trình bày lại cho OWNER "xem trực tiếp được" — nghe thử bằng nút ▶, ảnh thành lưới thu nhỏ, giấy phép vào (i).
// Danh mục hợp nhất (máy chủ + "Máy của anh" do máy dựng báo lên): src/lib/video/asset-catalog.ts, nạp qua loadAssetPage.
// 26/10: khối "Tải lên" ở đầu trang — chọn / kéo thả nhiều tệp, tự vào đúng ngăn (src/components/assets/asset-upload.tsx);
// thùng rác trên từng ô (tư liệu máy chủ) → "Đã xoá", khôi phục được 30 ngày (src/lib/video/asset-trash.ts).
export default async function AssetsPage() {
  const { entries, owner } = loadAssetPage();
  const isOwner = can(await currentActor(), "admin");
  const synced = !!owner?.syncedAt;
  const ownerDrops = entries.filter((e) => e.type === "drop" && e.source === "owner_mac").length;
  return (
    <>
      <Breadcrumb items={[{ label: "Tổng quan", href: "/dashboard" }, { label: "Tư liệu" }]} />
      <PageHead title="Tư liệu" sub="Logo, nhạc, B-roll cho video" />
      {owner && <div className="-mt-1.5 mb-1"><OwnerMacLine s={owner} /></div>}
      <div className="grid gap-3.5">
        <Panel id="tai-len">
          <PanelHeader
            title="Tải lên"
            sub="Nhạc, hiệu ứng, ảnh, clip"
            icon={Upload}
            tone="indigo"
            info="Tệp tự vào đúng ngăn theo đuôi (âm thanh mặc định là Nhạc, đổi được sang Hiệu ứng). Bắt buộc ghi nguồn / giấy phép. Nhạc mới luôn chờ anh nghe duyệt; ảnh / clip cần từ khoá (ô Từ khoá hoặc tên tệp có nghĩa)."
            tags={isOwner ? undefined : <Pill><Lock size={11} aria-hidden />chỉ OWNER tải lên</Pill>}
          />
          {isOwner && <div className="p-4"><AssetUpload /></div>}
        </Panel>
        <MusicLibraryPanel entries={entries} ownerSynced={synced} />
        <SfxPanel entries={entries} ownerSynced={synced} />
        <MusicPanel />
        <BrollPanel entries={entries} ownerSynced={synced} isOwner={isOwner} />
        <DropFolderPanel ownerWaiting={ownerDrops} />
        {isOwner && <TrashPanel />}
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
