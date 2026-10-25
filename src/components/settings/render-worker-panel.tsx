import { Panel, PanelHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { SubmitButton } from "@/components/campaigns/submit-button";
import { WorkerKeyForm } from "./worker-key-form";
import { acceptSkillVersionsAction, revokeWorkerKeyAction, setRenderModeAction } from "@/lib/actions/settings";
import { renderMode } from "@/lib/video/jobs";
import { workerKeyConfigured, workerLastSeen, workerOnline } from "@/lib/video/worker-auth";
import { skillStatus } from "@/lib/video/skill-freshness";
import { publicBaseUrl } from "@/lib/webhooks";
import { formatDateTime } from "@/lib/format";

// Cài đặt › Máy dựng video: máy của OWNER dựng video cho máy chủ (lấy skill trên Notion, tư liệu trên máy / Drive).
export function RenderWorkerPanel() {
  const mode = renderMode();
  const seen = workerLastSeen();
  const online = workerOnline(seen);
  const skills = skillStatus();
  return (
    <Panel id="render-worker">
      <PanelHeader title="Máy dựng video" sub={mode === "remote" ? "Video dựng trên máy dựng của anh." : "Video dựng trên máy chủ này."} />
      <div className="grid gap-4 px-4 py-3 text-[13px]">
        <form action={setRenderModeAction} className="flex flex-wrap items-center gap-2">
          <span className="text-ink-2">Nơi dựng:</span>
          <input type="hidden" name="mode" value={mode === "remote" ? "local" : "remote"} />
          <Pill tone={mode === "remote" ? "jade" : "neutral"}>{mode === "remote" ? "Máy dựng của anh" : "Máy chủ"}</Pill>
          <SubmitButton variant="soft">{mode === "remote" ? "Chuyển về máy chủ" : "Chuyển sang máy dựng của anh"}</SubmitButton>
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-ink-2">Máy dựng:</span>
          {seen ? <Pill tone={online ? "jade" : "neutral"}>{seen.name} · {online ? "đang chạy" : `liên lạc lúc ${formatDateTime(seen.at)}`}</Pill> : <Pill>chưa kết nối</Pill>}
        </div>

        <div className="grid gap-2">
          <WorkerKeyForm hasKey={workerKeyConfigured()} />
          {workerKeyConfigured() && (
            <form action={revokeWorkerKeyAction}><SubmitButton variant="ghost">Thu hồi khoá</SubmitButton></form>
          )}
          <details className="text-[12.5px] text-ink-2">
            <summary className="cursor-pointer">Cách chạy trên máy dựng</summary>
            <ol className="mt-1 list-decimal pl-5">
              <li>Tạo tệp <code>.env.render-worker</code> trong thư mục BAOR AI OS: <code>BAOR_REMOTE_URL={publicBaseUrl()}</code> và <code>BAOR_WORKER_KEY=…</code></li>
              <li>Chạy <code>npm run render-worker</code> (để máy bật; mô hình tại máy chạy sẵn thì có AI edit).</li>
            </ol>
          </details>
        </div>

        <div className="grid gap-1.5">
          <span className="text-ink-2">Skill dựng trên Notion:</span>
          <ul className="m-0 grid list-none gap-1 p-0">
            {skills.map((s) => (
              <li key={s.key} className="flex flex-wrap items-center gap-2">
                <span className="text-ink">{s.title}</span>
                {s.state === "ok" ? <Pill tone="jade">khớp bộ dựng</Pill> : s.state === "changed" ? <Pill tone="amber">đã đổi — cần cập nhật bộ dựng</Pill> : s.state === "unconfirmed" ? <Pill tone="amber">chưa xác nhận bộ dựng khớp bản này</Pill> : <Pill>chưa đồng bộ (cần token Notion)</Pill>}
                {s.editedAt && <span className="num text-[11.5px] text-ink-3">sửa {formatDateTime(s.editedAt)}</span>}
              </li>
            ))}
          </ul>
          {skills.some((s) => s.state === "changed" || s.state === "unconfirmed") && (
            <form action={acceptSkillVersionsAction}><SubmitButton variant="ghost">Xác nhận bộ dựng đã khớp skill hiện tại</SubmitButton></form>
          )}
        </div>
      </div>
    </Panel>
  );
}
