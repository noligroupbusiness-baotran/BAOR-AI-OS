import { Panel, PanelHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { SubmitButton } from "@/components/campaigns/submit-button";
import { importDropNow } from "@/lib/actions/media";
import { dataDir } from "@/lib/video/jobs";
import { DROP_KINDS, LICENSE_FILE, ensureDropFolders, lastDropReport } from "@/lib/video/drop-import";
import { formatDateTime } from "@/lib/format";
import { MoreOptions } from "./setting-item";

// Cài đặt › Video › Thả tư liệu vào máy: OWNER tải tay từ Drive rồi chép vào thư mục này; máy dựng tự nhận mỗi 5 phút (src/lib/video/drop-import.ts).
export function DropFolderPanel() {
  const root = ensureDropFolders(dataDir());
  const r = lastDropReport(dataDir());
  return (
    <Panel id="tha-vao">
      <PanelHeader
        title="Thả tư liệu vào máy"
        sub="Tải ảnh, B-roll, nhạc từ Drive về rồi chép vào thư mục này — máy tự nhận mỗi 5 phút."
        action={<form action={importDropNow}><SubmitButton variant="soft" pendingText="Đang nhận…">Nhận ngay</SubmitButton></form>}
      />
      <div className="grid gap-3 border-t border-border px-4 py-3 text-[13px]">
        <code className="block break-all rounded-md border border-border bg-ground px-2.5 py-1.5 text-[12px] text-ink">{root}</code>
        <ul className="m-0 grid list-none gap-1 p-0 text-[12.5px]">
          {Object.entries(DROP_KINDS).map(([k, v]) => (
            <li key={k}><code className="text-ink">{k}/</code> <span className="text-ink-2">— {v.label}</span></li>
          ))}
        </ul>
        <p className="m-0 text-[12px] text-ink-2">
          Mỗi ngăn cần một tệp <code>{LICENSE_FILE}</code> ghi nguồn / quyền dùng (1 dòng). Đặt tên tệp hoặc thư mục con có nghĩa để làm từ khoá (vd <code>van-phong/tang-qua.jpg</code>).
          Hướng dẫn đầy đủ nằm trong tệp HUONG-DAN.txt ở thư mục trên.
        </p>
        {r && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-ink-2">Lần nhận gần nhất {formatDateTime(r.at)}:</span>
            <Pill tone={r.imported.length ? "jade" : "neutral"}>đã nhận {r.imported.length}</Pill>
            {r.waiting.length > 0 && <Pill tone="amber">chờ {r.waiting.length}</Pill>}
          </div>
        )}
        {r && r.waiting.length > 0 && (
          <MoreOptions label={`Tệp chưa nhận và lý do (${r.waiting.length})`}>
            <ul className="m-0 grid list-none gap-1 p-0 text-[12px]">
              {r.waiting.slice(0, 30).map((w) => (
                <li key={`${w.kind}/${w.file}`}><code className="text-ink">{w.kind}/{w.file}</code> <span className="text-amber">— {w.reason}</span></li>
              ))}
            </ul>
          </MoreOptions>
        )}
      </div>
    </Panel>
  );
}
