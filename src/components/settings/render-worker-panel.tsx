import { Cpu, KeyRound, RefreshCw } from "lucide-react";
import { Panel, PanelHeader } from "@/components/ui/card";
import { IconChip } from "@/components/ui/icon-chip";
import { SwitchSubmit } from "@/components/ui/switch";
import { Pill } from "@/components/ui/pill";
import { SubmitButton } from "@/components/campaigns/submit-button";
import { WorkerKeyForm } from "./worker-key-form";
import { acceptSkillVersionsAction, revokeWorkerKeyAction, setRenderModeAction } from "@/lib/actions/settings";
import { renderMode } from "@/lib/video/jobs";
import { workerKeyConfigured, workerLastSeen, workerOnline } from "@/lib/video/worker-auth";
import { skillStatus } from "@/lib/video/skill-freshness";
import { formatDateTime } from "@/lib/format";
import { MoreOptions } from "./setting-item";

// Cài đặt › Video › Nơi dựng video: máy của OWNER dựng video cho máy chủ (lấy skill trên Notion, tư liệu trên máy / Drive).
export function RenderWorkerPanel() {
  const mode = renderMode();
  const seen = workerLastSeen();
  const online = workerOnline(seen);
  const skills = skillStatus();
  const skillAlert = skills.some((s) => s.state === "changed" || s.state === "unconfirmed");
  return (
    <Panel id="render-worker">
      <PanelHeader title="Nơi dựng video" sub="Máy chủ hoặc máy của anh" icon={Cpu} tone="pink" info="Dựng trên máy chủ, hoặc trên máy của anh (nhanh hơn, dùng tư liệu trên máy)." />
      <div className="grid text-[13px]">
        {/* Công tắc: bật = dựng trên máy của anh (cùng action, cùng giá trị mode như nút "Chuyển…" cũ) */}
        <form action={setRenderModeAction} className="chip-host flex min-h-[52px] flex-wrap items-center gap-3 border-b border-border px-4 py-2.5">
          <input type="hidden" name="mode" value={mode === "remote" ? "local" : "remote"} />
          <IconChip icon={Cpu} tone="pink" size="sm" />
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <span className="font-semibold text-ink">Dựng trên máy của anh</span>
            {mode === "remote" ? (seen ? <Pill tone={online ? "jade" : "amber"}>{seen.name} · {online ? "đang chạy" : `liên lạc lúc ${formatDateTime(seen.at)}`}</Pill> : <Pill tone="amber">Máy dựng chưa kết nối</Pill>) : <Pill>Đang dùng máy chủ</Pill>}
          </span>
          <SwitchSubmit on={mode === "remote"} label={mode === "remote" ? "Chuyển về máy chủ" : "Chuyển sang máy của anh"} />
        </form>

        <div className="chip-host flex min-h-[52px] flex-wrap items-center gap-3 border-b border-border px-4 py-2.5">
          <IconChip icon={KeyRound} tone="pink" size="sm" />
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <span className="font-semibold text-ink">Khoá máy dựng</span>
            {workerKeyConfigured() ? <Pill tone="jade">Đã có khoá</Pill> : <Pill>Chưa có khoá</Pill>}
          </span>
          <div className="flex flex-wrap items-start gap-2">
            <WorkerKeyForm hasKey={workerKeyConfigured()} />
            {workerKeyConfigured() && (
              <form action={revokeWorkerKeyAction}><SubmitButton variant="ghost">Thu hồi</SubmitButton></form>
            )}
          </div>
        </div>

        {skillAlert && (
          <form action={acceptSkillVersionsAction} className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2.5">
            <IconChip icon={RefreshCw} tone="orange" size="sm" />
            <span className="flex-1"><Pill tone="amber">Skill Notion có bản mới</Pill></span>
            <SubmitButton variant="outline">Xác nhận đã khớp</SubmitButton>
          </form>
        )}
        <div className="px-4 py-3">

        <MoreOptions label="Hướng dẫn cài máy dựng">
          <ol className="m-0 list-decimal pl-5 text-[12.5px] text-ink-2">
            <li>Cài một lần trên máy (thư mục BAOR AI OS): <code>npm run render-worker:install</code> — chạy nền, tự bật khi mở máy.</li>
            <li>Bấm Tạo khoá ở trên, dán lệnh hiện ra vào Terminal của máy đó.</li>
            <li>Chuyển sang “máy của anh”. Kiểm tra trên máy: <code>npm run render-worker:status</code>.</li>
          </ol>
          <ul className="m-0 grid list-none gap-1 p-0">
            {skills.map((s) => (
              <li key={s.key} className="flex flex-wrap items-center gap-2">
                <span className="text-ink">{s.title}</span>
                {s.state === "ok" ? <Pill tone="jade">khớp bộ dựng</Pill> : s.state === "changed" ? <Pill tone="amber">đã đổi — cần cập nhật bộ dựng</Pill> : s.state === "unconfirmed" ? <Pill tone="amber">chưa xác nhận</Pill> : <Pill>chưa đồng bộ (cần token Notion)</Pill>}
                {s.editedAt && <span className="num text-[11.5px] text-ink-3">sửa {formatDateTime(s.editedAt)}</span>}
              </li>
            ))}
          </ul>
        </MoreOptions>
        </div>
      </div>
    </Panel>
  );
}
