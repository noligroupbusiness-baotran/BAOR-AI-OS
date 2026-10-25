import { Panel, PanelHeader } from "@/components/ui/card";
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
        sub={`${s.lastSyncedAt ? `Đồng bộ lúc ${formatDateTime(s.lastSyncedAt)}` : "Chưa đồng bộ"} · ${s.total} trang (${usable} dùng được, ${s.byStatus.DRAFT ?? 0} nháp). ${token ? "Tự đồng bộ 6 giờ một lần; sửa skill trên Notion xong bấm Đồng bộ ngay để áp dụng liền." : "Chưa có token Notion (Kết nối › Notion) nên chưa tự đồng bộ."}`}
        action={can(actor, "manager") && token ? <form action={syncKnowledgeNow}><SubmitButton pendingText="Đang đọc Notion…">Đồng bộ ngay</SubmitButton></form> : undefined}
      />
      {can(actor, "admin") && !token && (
        <details className="px-4 py-3">
          <summary className="cursor-pointer text-[12.5px] text-ink-2">Nhập ảnh chụp chỉ mục (JSON) khi chưa có token</summary>
          <form action={importKnowledgeSnapshotAction} className="mt-2 grid gap-2">
            <textarea name="json" rows={5} className={textareaClass} placeholder='{"takenAt": "...", "takenBy": "...", "pages": [...]}' />
            <div><SubmitButton pendingText="Đang nhập…">Nhập ảnh chụp</SubmitButton></div>
          </form>
        </details>
      )}
    </Panel>
  );
}
