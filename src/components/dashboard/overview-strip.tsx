import Link from "next/link";
import { Bot, Clapperboard, DatabaseBackup, Plug, TriangleAlert, type LucideIcon } from "lucide-react";
import { getAiBudget } from "@/lib/router";
import { connectionStats } from "@/lib/shell-data";
import { renderMode } from "@/lib/video/jobs";
import { workerLastSeen, workerOnline } from "@/lib/video/worker-auth";
import { getBackupStatus } from "@/lib/backup";
import { cn, formatCurrency, formatDateTime } from "@/lib/format";
import type { GroupTone } from "@/config/menu";
import { IconChip } from "@/components/ui/icon-chip";
import { CountUp } from "@/components/ui/count-up";

// Tổng quan › Tình hình chung (OWNER 25/10/2026: "đem các phần nhìn nhận chung lên Tổng quan… bấm vào đọc được tổng quan hết"):
// chi tiêu AI, kết nối, nơi dựng video, sao lưu, lỗi — mỗi ô bấm mở đúng chỗ xem / chỉnh. Chỉ đọc, không thao tác ở đây.
type Tone = "ok" | "warn" | "bad" | "idle";

// Trạng thái hiện bằng chấm nhỏ ở góc icon chip; màu chip theo nhóm chức năng (bảng màu --tone-*, globals.css)
const toneDot: Record<Tone, string> = { ok: "bg-jade", warn: "bg-amber", bad: "bg-brick", idle: "bg-border-2" };
const toneLabel: Record<Tone, string> = { ok: "ổn", warn: "cần chú ý", bad: "có lỗi", idle: "chưa dùng" };

function Tile({ href, icon, group, label, value, sub, tone }: { href: string; icon: LucideIcon; group: GroupTone; label: string; value: string; sub: string; tone: Tone }) {
  return (
    <li className="appear appear--stat">
      <Link href={href} className="card chip-host flex h-full flex-col gap-1 p-3.5 focus-visible:outline-2 focus-visible:outline-jade">
        <span className="flex items-center gap-2 text-[12px] font-semibold text-ink-2">
          <span className="relative">
            <IconChip icon={icon} tone={group} size="xs" />
            <span className={cn("absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ring-2 ring-surface", toneDot[tone])} title={toneLabel[tone]} aria-label={toneLabel[tone]} />
          </span>
          {label}
        </span>
        <span className="num text-[20px] font-bold leading-tight text-ink"><CountUp value={value} /></span>
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
  // Cùng cách đếm với thanh trên (src/lib/shell-data.ts)
  const { list: integrations, connected } = connectionStats();

  const mode = renderMode();
  const seen = workerLastSeen();
  const online = workerOnline(seen);

  const backup = getBackupStatus();
  const backupBad = !backup.enabled || backup.lastResult === "error";

  return (
    <section aria-labelledby="tinh-hinh" className="mt-4">
      <h2 id="tinh-hinh" className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-ink-3">Tình hình chung</h2>
      <ul className="stagger m-0 grid list-none grid-cols-2 gap-3 p-0 md:grid-cols-3 xl:grid-cols-5">
        <Tile
          href="/insights/learning?tab=so-lieu&view=ai"
          icon={Bot}
          group="violet"
          label="Chi tiêu AI tháng này"
          value={formatCurrency(ai.spentMonthVnd)}
          sub={`Hôm nay ${formatCurrency(ai.spentTodayVnd)} · ${ai.callsToday} lần gọi · ${aiPctMonth}% trần tháng`}
          tone={aiPctMonth >= 100 || aiPctDay >= 100 ? "bad" : aiPctMonth >= 80 || aiPctDay >= 80 ? "warn" : "ok"}
        />
        <Tile
          href="/settings?tab=ket-noi"
          icon={Plug}
          group="blue"
          label="Kết nối"
          value={`${connected.length}/${integrations.length}`}
          sub={connected.length ? `Đã nối: ${connected.map((i) => i.name).join(", ")}` : "Chưa nối nền tảng nào — đăng bài đang chạy thử"}
          tone={connected.length ? "ok" : "idle"}
        />
        <Tile
          href="/settings?tab=video#render-worker"
          icon={Clapperboard}
          group="pink"
          label="Nơi dựng video"
          value={mode === "remote" ? "Máy của anh" : "Máy chủ"}
          sub={mode === "remote" ? (seen ? `${seen.name} · ${online ? "đang chạy" : `liên lạc lúc ${formatDateTime(seen.at)}`}` : "Máy dựng chưa kết nối") : "Dựng ngay trên máy chủ"}
          tone={mode === "remote" && !online ? "warn" : "ok"}
        />
        <Tile
          href="/settings?tab=he-thong#backup"
          icon={DatabaseBackup}
          group="slate"
          label="Sao lưu"
          value={backup.lastBackupAt ? formatDateTime(backup.lastBackupAt) : "Chưa có"}
          sub={backupBad ? (backup.lastError ? `Lỗi: ${backup.lastError}` : "Sao lưu tự động đang tắt") : `${backup.files.length} bản${backup.github.configured ? " · có bản trên GitHub" : " · chỉ trên máy chủ"}`}
          tone={backupBad ? "bad" : backup.github.configured ? "ok" : "warn"}
        />
        <Tile
          href="/dashboard#cho-toi-xu-ly"
          icon={TriangleAlert}
          group="red"
          label="Lỗi cần xử lý"
          value={String(issues.length)}
          sub={issues[0] ?? "Không có lỗi"}
          tone={issues.length ? "bad" : "ok"}
        />
      </ul>
    </section>
  );
}
