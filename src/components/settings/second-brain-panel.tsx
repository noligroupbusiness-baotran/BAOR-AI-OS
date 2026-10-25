import { Brain } from "lucide-react";
import { Panel, PanelHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { SubmitButton } from "@/components/campaigns/submit-button";
import { textareaClass } from "@/components/ui/field";
import { knowledgeStats } from "@/lib/knowledge";
import { notionConfigured } from "@/lib/knowledge/sync";
import { importKnowledgeSnapshotAction, syncKnowledgeNow } from "@/lib/actions/research";
import { currentActor, can } from "@/lib/permissions";
import { formatDateTime } from "@/lib/format";

// Cài đặt › Second Brain: KHÔNG hiển thị kho tri thức trong app (OWNER 25/10/2026) — hệ thống đọc ngầm cho hook, caption, nghiên cứu,
// đo lường, dựng video. Chỉ giữ trạng thái đồng bộ + "Đồng bộ ngay" khi OWNER vừa sửa skill trên Notion.
export async function SecondBrainPanel() {
  const actor = await currentActor();
  const s = knowledgeStats();
  const token = notionConfigured();
  const usable = (s.byStatus.ACTIVE ?? 0) + (s.byStatus.VERIFIED ?? 0);
  return (
    <Panel id="second-brain">
      <PanelHeader
        title="Second Brain (Notion)"
        sub={`${s.lastSyncedAt ? `Đồng bộ ${formatDateTime(s.lastSyncedAt)}` : "Chưa đồng bộ"} · ${usable}/${s.total} trang`}
        icon={Brain}
        tone="violet"
        tags={token ? <Pill tone="jade">Tự đồng bộ 6 giờ</Pill> : <Pill tone="amber">Cần token Notion</Pill>}
        info={token ? "Tự đồng bộ 6 giờ một lần. Bấm Đồng bộ ngay khi vừa sửa skill trên Notion." : "Chưa tự đồng bộ — cần token Notion ở Kết nối."}
        action={can(actor, "manager") && token ? <form action={syncKnowledgeNow}><SubmitButton pendingText="Đang đọc Notion…">Đồng bộ ngay</SubmitButton></form> : undefined}
      />
      {can(actor, "admin") && !token && (
        <details className="px-4 py-3">
          <summary className="cursor-pointer text-[12.5px] text-ink-2">Nhập ảnh chụp chỉ mục (JSON)</summary>
          <form action={importKnowledgeSnapshotAction} className="mt-2 grid gap-2">
            <textarea name="json" rows={5} className={textareaClass} placeholder='{"takenAt": "...", "takenBy": "...", "pages": [...]}' />
            <div><SubmitButton pendingText="Đang nhập…">Nhập ảnh chụp</SubmitButton></div>
          </form>
        </details>
      )}
    </Panel>
  );
}
