import { FolderInput, Laptop, TriangleAlert } from "lucide-react";
import { Panel, PanelHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { SubmitButton } from "@/components/campaigns/submit-button";
import { importDropNow } from "@/lib/actions/media";
import { dataDir } from "@/lib/video/jobs";
import { DROP_KINDS, LICENSE_FILE, ensureDropFolders, lastDropReport } from "@/lib/video/drop-import";
import { formatDateTime } from "@/lib/format";
import { MoreOptions } from "./setting-item";

// Tư liệu › Thả tư liệu vào máy (26/10: đường dẫn thư mục + tên ngăn vào (i), bề mặt chỉ còn nhãn): OWNER tải tay từ Drive rồi chép vào thư mục này; máy dựng tự nhận mỗi 5 phút (src/lib/video/drop-import.ts).
export function DropFolderPanel({ ownerWaiting = 0 }: { ownerWaiting?: number }) {
  const root = ensureDropFolders(dataDir());
  const r = lastDropReport(dataDir());
  return (
    <Panel id="tha-vao">
      <PanelHeader
        title="Thả tư liệu vào máy"
        sub="Tự nhận mỗi 5 phút"
        icon={FolderInput}
        tone="indigo"
        info={
          <>
            Chép ảnh, B-roll, nhạc từ Drive vào thư mục này — máy tự nhận mỗi 5 phút. Mỗi ngăn cần một tệp <code>{LICENSE_FILE}</code> ghi nguồn / quyền dùng (1 dòng); tên tệp / thư mục con có nghĩa thành từ khoá (vd <code>van-phong/tang-qua.jpg</code>). Hướng dẫn đầy đủ: HUONG-DAN.txt trong thư mục.
            <code className="mt-2 block break-all text-ink">{root}</code>
            <span className="mt-1.5 block">{Object.entries(DROP_KINDS).map(([k, v]) => `${v.label}: ${k}/`).join(" · ")}</span>
          </>
        }
        action={<form action={importDropNow}><SubmitButton variant="soft" pendingText="Đang nhận…">Nhận ngay</SubmitButton></form>}
      />
      <div className="flex flex-wrap items-center gap-1.5 px-4 py-3 text-[12px]">
        {Object.values(DROP_KINDS).map((v) => (
          <Pill key={v.label}>{v.label}</Pill>
        ))}
        <Pill tone="amber"><TriangleAlert size={11} aria-hidden />Cần {LICENSE_FILE}</Pill>
        {ownerWaiting > 0 && <Pill tone="violet"><Laptop size={11} aria-hidden />Máy của anh: chờ {ownerWaiting}</Pill>}
        {r && (
          <>
            <span className="ml-auto text-ink-3">Lần nhận {formatDateTime(r.at)}</span>
            <Pill tone={r.imported.length ? "jade" : "neutral"}>đã nhận {r.imported.length}</Pill>
            {r.waiting.length > 0 && <Pill tone="amber">chờ {r.waiting.length}</Pill>}
          </>
        )}
      </div>
      {r && r.waiting.length > 0 && (
        <div className="border-t border-border px-4 py-2.5">
          <MoreOptions label={`Tệp chưa nhận (${r.waiting.length})`}>
            <ul className="m-0 grid list-none gap-1 p-0 text-[12px]">
              {r.waiting.slice(0, 30).map((w) => (
                <li key={`${w.kind}/${w.file}`}><code className="text-ink">{w.kind}/{w.file}</code> <span className="text-amber">— {w.reason}</span></li>
              ))}
            </ul>
          </MoreOptions>
        </div>
      )}
    </Panel>
  );
}
