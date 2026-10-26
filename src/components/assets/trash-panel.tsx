import { Trash2 } from "lucide-react";
import { Panel, PanelHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { SubmitButton } from "@/components/campaigns/submit-button";
import { MoreOptions } from "@/components/settings/setting-item";
import { restoreAssetAction } from "@/lib/actions/asset-catalog";
import { listTrash, TRASH_DAYS, type TrashKind } from "@/lib/video/asset-trash";
import { dataDir } from "@/lib/video/jobs";
import { formatDateTime } from "@/lib/format";

const KIND_LABEL: Record<TrashKind, string> = { music: "Nhạc", sfx: "Hiệu ứng", "sfx-new": "Hiệu ứng", broll: "Ảnh·clip" };

// Tư liệu › Đã xoá (OWNER 26/10/2026): tư liệu máy chủ đã xoá nằm ở DATA_DIR/video-assets/da-xoa, khôi phục được tới khi lượt dọn
// hằng ngày xoá hẳn (quá TRASH_DAYS ngày — src/lib/retention.ts). Chỉ hiện khi có mục; danh sách gập lại.
export function TrashPanel() {
  const items = listTrash(dataDir()).sort((a, b) => b.at.localeCompare(a.at));
  if (!items.length) return null;
  return (
    <Panel id="da-xoa">
      <PanelHeader title={`Đã xoá (${items.length})`} sub={`Tự dọn hẳn sau ${TRASH_DAYS} ngày`} icon={Trash2} tone="slate" />
      <div className="px-4 py-3">
        <MoreOptions label="Xem và khôi phục">
          <ul className="m-0 grid list-none gap-1.5 p-0">
            {items.map((t) => (
              <li key={t.id} data-trash={t.file} className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-border bg-ground px-2.5 py-1.5">
                <Pill>{KIND_LABEL[t.kind]}</Pill>
                <span className="min-w-0 flex-1 truncate font-medium text-ink" title={t.file}>{t.title}</span>
                <span className="num shrink-0 text-[11px] text-ink-3">{formatDateTime(t.at)}</span>
                <form action={restoreAssetAction}>
                  <input type="hidden" name="id" value={t.id} />
                  <SubmitButton variant="outline" pendingText="Đang khôi phục…">Khôi phục</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </MoreOptions>
      </div>
    </Panel>
  );
}
