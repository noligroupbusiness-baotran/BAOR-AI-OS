import { Panel, PanelHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { backupNow } from "@/lib/actions/backup";
import { formatBytes, getBackupStatus } from "@/lib/backup";
import { formatDateTime } from "@/lib/format";
import { MoreOptions } from "./setting-item";

// Cài đặt › Sao lưu dữ liệu: trạng thái lịch tự động, nút sao lưu ngay, danh sách bản gần nhất để tải về.
export function BackupPanel() {
  const s = getBackupStatus();
  const latest = s.files.slice(0, 8);
  const running = s.enabled && s.schedulerStartedAt !== null;

  const statusPill = !s.enabled ? (
    <Pill tone="brick">Đang tắt</Pill>
  ) : s.lastResult === "error" ? (
    <Pill tone="brick">Lỗi lần gần nhất</Pill>
  ) : running ? (
    <Pill tone="jade">Tự động mỗi {s.intervalMinutes} phút</Pill>
  ) : (
    <Pill tone="amber">Chưa khởi động lịch</Pill>
  );

  return (
    <Panel id="backup">
      <PanelHeader
        title="Sao lưu dữ liệu"
        sub={`Tự sao lưu mỗi ${s.intervalMinutes} phút. Bản gần nhất: ${s.lastBackupAt ? formatDateTime(s.lastBackupAt) : "chưa có"}.`}
        action={
          <form action={backupNow}>
            <Button type="submit" variant="primary">Sao lưu ngay</Button>
          </form>
        }
      />
      <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3 text-[12.5px]">
        {statusPill}
        <Pill>{s.files.length} bản · {formatBytes(s.totalSize)}</Pill>
        {s.github.configured ? (
          s.github.lastUploadError ? <Pill tone="brick">GitHub lỗi</Pill> : <Pill tone="jade">Có bản trên GitHub</Pill>
        ) : (
          <Pill tone="amber">Chưa có bản ngoài máy</Pill>
        )}
      </div>
      {s.lastError && <div className="border-t border-border bg-brick/5 px-4 py-2 text-[12px] text-brick">Lỗi: {s.lastError}</div>}
      <div className="border-t border-border px-4 py-3">
        <MoreOptions label="Chi tiết và tải bản sao lưu">
          <div className="grid gap-1 text-[12px] text-ink-2">
            <div>Giữ {s.keep} bản gần nhất và mỗi ngày 1 bản trong {s.keepDays} ngày; dữ liệu không đổi thì bỏ qua.{s.nextRunAt ? ` Lần tiếp theo: ${formatDateTime(s.nextRunAt)}.` : ""}</div>
            <div className="truncate" title={s.dir}>Thư mục: {s.dir}</div>
            {!s.github.configured ? (
              <div>GitHub: chưa cấu hình. Đặt BACKUP_GITHUB_REPO (repo private) và BACKUP_GITHUB_TOKEN trong tệp .env để mỗi bản được nén và đẩy lên GitHub.</div>
            ) : (
              <div>
                GitHub: <span className="font-mono">{s.github.repo}/{s.github.dir}</span>
                {s.github.lastUploadError ? ` — lỗi: ${s.github.lastUploadError}` : s.github.lastUploadAt ? ` — đã đẩy ${formatDateTime(s.github.lastUploadAt)} · ${s.github.lastUploadName}` : " — chưa đẩy bản nào từ khi khởi động"}
              </div>
            )}
          </div>
          {latest.length > 0 && (
            <ul className="m-0 list-none rounded-md border border-border p-0">
              {latest.map((f) => (
                <li key={f.name} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-border px-3 py-2 last:border-b-0">
                  <div className="min-w-0">
                    <div className="truncate font-mono text-[12px] text-ink">{f.name}</div>
                    <div className="text-[12px] text-ink-2">{formatDateTime(f.at)}</div>
                  </div>
                  <div className="text-[12px] text-ink-2">{formatBytes(f.size)}</div>
                  <a href={`/backups/${f.name}`} className="text-[12px] font-medium text-jade-ink hover:underline" download>
                    Tải về
                  </a>
                </li>
              ))}
            </ul>
          )}
        </MoreOptions>
      </div>
    </Panel>
  );
}
