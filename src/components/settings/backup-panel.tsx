import { Panel, PanelHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { backupNow } from "@/lib/actions/backup";
import { formatBytes, getBackupStatus } from "@/lib/backup";
import { formatDateTime } from "@/lib/format";

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
        sub={`Hệ thống tự sao chép toàn bộ cơ sở dữ liệu vào thư mục backups mỗi ${s.intervalMinutes} phút; dữ liệu không đổi thì bỏ qua. Giữ ${s.keep} bản gần nhất và mỗi ngày 1 bản trong ${s.keepDays} ngày.`}
        action={
          <form action={backupNow}>
            <Button type="submit" variant="primary">Sao lưu ngay</Button>
          </form>
        }
      />
      <div className="grid gap-3 px-4 py-3 text-[12.5px] md:grid-cols-4">
        <div>
          <div className="lbl">Trạng thái</div>
          <div className="mt-1">{statusPill}</div>
        </div>
        <div>
          <div className="lbl">Bản gần nhất</div>
          <div className="mt-1 font-semibold text-ink">{s.lastBackupAt ? formatDateTime(s.lastBackupAt) : "Chưa có"}</div>
          {s.lastRunAt && s.lastResult === "unchanged" && (
            <div className="text-[12px] text-ink-2">Kiểm tra {formatDateTime(s.lastRunAt)}: không đổi</div>
          )}
        </div>
        <div>
          <div className="lbl">Lần tiếp theo</div>
          <div className="mt-1 font-semibold text-ink">{s.nextRunAt ? formatDateTime(s.nextRunAt) : "—"}</div>
        </div>
        <div>
          <div className="lbl">Đang lưu</div>
          <div className="mt-1 font-semibold text-ink">{s.files.length} bản · {formatBytes(s.totalSize)}</div>
          <div className="truncate text-[12px] text-ink-2" title={s.dir}>{s.dir}</div>
        </div>
      </div>
      {s.lastError && <div className="border-t border-border bg-brick/5 px-4 py-2 text-[12px] text-brick">Lỗi: {s.lastError}</div>}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border bg-ground px-4 py-2 text-[12px] text-ink-2">
        <span className="font-semibold text-ink">GitHub</span>
        {!s.github.configured ? (
          <span>Chưa cấu hình. Đặt BACKUP_GITHUB_REPO (repo private) và BACKUP_GITHUB_TOKEN trong tệp .env để mỗi bản sao lưu được nén và đẩy lên GitHub.</span>
        ) : (
          <>
            <span className="font-mono">{s.github.repo}/{s.github.dir}</span>
            {s.github.lastUploadError ? (
              <Pill tone="brick">Lỗi: {s.github.lastUploadError}</Pill>
            ) : s.github.lastUploadAt ? (
              <Pill tone="jade">Đã đẩy {formatDateTime(s.github.lastUploadAt)} · {s.github.lastUploadName}</Pill>
            ) : (
              <Pill tone="amber">Chưa đẩy bản nào từ khi khởi động</Pill>
            )}
          </>
        )}
      </div>
      {latest.length > 0 && (
        <ul className="m-0 list-none border-t border-border p-0">
          {latest.map((f) => (
            <li key={f.name} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-border px-4 py-2 last:border-b-0">
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
    </Panel>
  );
}
