import Link from "next/link";
import { Bot, Clapperboard, DatabaseBackup, Plug, TriangleAlert, type LucideIcon } from "lucide-react";
import { getAiBudget } from "@/lib/router";
import { listIntegrationStatus } from "@/lib/connectors/config";
import { connectorFor } from "@/lib/connectors/registry";
import { renderMode } from "@/lib/video/jobs";
import { workerLastSeen, workerOnline } from "@/lib/video/worker-auth";
import { getBackupStatus } from "@/lib/backup";
import { formatCurrency, formatDateTime } from "@/lib/format";

// Tổng quan › Tình hình chung (OWNER 25/10/2026: "đem các phần nhìn nhận chung lên Tổng quan… bấm vào đọc được tổng quan hết"):
// chi tiêu AI, kết nối, nơi dựng video, sao lưu, lỗi — mỗi ô bấm mở đúng chỗ xem / chỉnh. Chỉ đọc, không thao tác ở đây.
type Tone = "ok" | "warn" | "bad" | "idle";

const toneText: Record<Tone, string> = { ok: "text-jade-ink", warn: "text-amber", bad: "text-brick", idle: "text-ink-3" };

function Tile({ href, icon: Icon, label, value, sub, tone }: { href: string; icon: LucideIcon; label: string; value: string; sub: string; tone: Tone }) {
  return (
    <li>
      <Link href={href} className="card flex h-full flex-col gap-1 p-3.5 hover:border-border-2 focus-visible:outline-2 focus-visible:outline-jade">
        <span className="flex items-center gap-1.5 text-[12px] font-semibold text-ink-2">
          <Icon aria-hidden size={15} className={toneText[tone]} />
          {label}
        </span>
        <span className="num text-[20px] font-bold leading-tight text-ink">{value}</span>
        <span className="line-clamp-2 text-[11.5px] text-ink-3">{sub}</span>
      </Link>
    </li>
  );
}

export function OverviewStrip({ issues }: { issues: string[] }) {
  const ai = getAiBudget();
  const aiPctDay = ai.dailyCapVnd ? Math.round((ai.spentTodayVnd / ai.dailyCapVnd) * 100) : 0;
  const aiPctMonth = ai.monthlyCapVnd ? Math.round((ai.spentMonthVnd / ai.monthlyCapVnd) * 100) : 0;

  // Kết nối: chỉ tính nền tảng nối được thật (bỏ fanpage phụ chưa dùng và nền tảng chưa có kết nối thật)
  const integrations = listIntegrationStatus().filter((i) => (!/^facebook_page_\d+$/.test(i.key) || i.connected || i.lastCheckedAt) && !connectorFor(i.key)?.pending);
  const connected = integrations.filter((i) => i.connected);

  const mode = renderMode();
  const seen = workerLastSeen();
  const online = workerOnline(seen);

  const backup = getBackupStatus();
  const backupBad = !backup.enabled || backup.lastResult === "error";

  return (
    <section aria-labelledby="tinh-hinh" className="mt-4">
      <h2 id="tinh-hinh" className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-ink-3">Tình hình chung</h2>
      <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 md:grid-cols-3 xl:grid-cols-5">
        <Tile
          href="/reports?tab=ai"
          icon={Bot}
          label="Chi tiêu AI tháng này"
          value={formatCurrency(ai.spentMonthVnd)}
          sub={`Hôm nay ${formatCurrency(ai.spentTodayVnd)} · ${ai.callsToday} lần gọi · ${aiPctMonth}% trần tháng`}
          tone={aiPctMonth >= 100 || aiPctDay >= 100 ? "bad" : aiPctMonth >= 80 || aiPctDay >= 80 ? "warn" : "ok"}
        />
        <Tile
          href="/settings?tab=ket-noi"
          icon={Plug}
          label="Kết nối"
          value={`${connected.length}/${integrations.length}`}
          sub={connected.length ? `Đã nối: ${connected.map((i) => i.name).join(", ")}` : "Chưa nối nền tảng nào — đăng bài đang chạy thử"}
          tone={connected.length ? "ok" : "idle"}
        />
        <Tile
          href="/settings?tab=video#render-worker"
          icon={Clapperboard}
          label="Nơi dựng video"
          value={mode === "remote" ? "Máy của anh" : "Máy chủ"}
          sub={mode === "remote" ? (seen ? `${seen.name} · ${online ? "đang chạy" : `liên lạc lúc ${formatDateTime(seen.at)}`}` : "Máy dựng chưa kết nối") : "Dựng ngay trên máy chủ"}
          tone={mode === "remote" && !online ? "warn" : "ok"}
        />
        <Tile
          href="/settings?tab=he-thong#backup"
          icon={DatabaseBackup}
          label="Sao lưu"
          value={backup.lastBackupAt ? formatDateTime(backup.lastBackupAt) : "Chưa có"}
          sub={backupBad ? (backup.lastError ? `Lỗi: ${backup.lastError}` : "Sao lưu tự động đang tắt") : `${backup.files.length} bản${backup.github.configured ? " · có bản trên GitHub" : " · chỉ trên máy chủ"}`}
          tone={backupBad ? "bad" : backup.github.configured ? "ok" : "warn"}
        />
        <Tile
          href="/settings?tab=he-thong#syslog"
          icon={TriangleAlert}
          label="Lỗi cần xử lý"
          value={String(issues.length)}
          sub={issues[0] ?? "Không có lỗi"}
          tone={issues.length ? "bad" : "ok"}
        />
      </ul>
    </section>
  );
}
