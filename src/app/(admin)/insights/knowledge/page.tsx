import Link from "next/link";
import { Breadcrumb } from "@/components/shell/module-page";
import { PageHead, Panel, PanelHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SubmitButton } from "@/components/campaigns/submit-button";
import { inputClass, textareaClass } from "@/components/ui/field";
import { knowledgeStats, listKnowledge, searchKnowledge } from "@/lib/knowledge";
import { notionConfigured } from "@/lib/knowledge/sync";
import { importKnowledgeSnapshotAction, syncKnowledgeNow } from "@/lib/actions/research";
import { getSetting } from "@/lib/admin";
import { currentActor, can } from "@/lib/permissions";
import { formatDateTime } from "@/lib/format";
import type { KnowledgePage } from "@/lib/knowledge/types";

export const metadata = { title: "Second Brain – BAOR AI OS" };

const statusTone = (s: string) => (s === "ACTIVE" ? "jade" : s === "VERIFIED" ? "sky" : s === "DRAFT" ? "amber" : "neutral") as "jade" | "sky" | "amber" | "neutral";

function PageRow({ p, snippet }: { p: KnowledgePage; snippet?: string }) {
  return (
    <li className="border-b border-border px-4 py-2.5 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2">
        <a href={p.url} target="_blank" rel="noreferrer" className="text-[13.5px] font-semibold text-ink hover:text-jade hover:underline">{p.title}</a>
        <Pill tone={statusTone(p.status)}>{p.status}</Pill>
        {p.labels.map((l) => <Pill key={l} tone={l === "[OWNER]" ? "violet" : "neutral"}>{l}</Pill>)}
      </div>
      <div className="mt-0.5 text-[12px] text-ink-2">{[p.section, p.area, p.kind].filter(Boolean).join(" · ")}</div>
      {snippet && <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">{snippet.replace(/\[/g, "«").replace(/\]/g, "»")}</p>}
    </li>
  );
}

export default async function KnowledgePageView({ searchParams }: { searchParams: Promise<{ q?: string; area?: string; import?: string }> }) {
  const sp = await searchParams;
  const actor = await currentActor();
  const q = (sp.q ?? "").trim();
  const stats = knowledgeStats();
  const hits = q ? searchKnowledge(q, { area: sp.area || undefined, limit: 30 }) : [];
  const all = q ? [] : listKnowledge();
  const areas = Object.keys(stats.byArea).sort();
  const snapshot = (() => {
    try {
      return JSON.parse(getSetting("knowledge.snapshot") ?? "null") as { takenAt: string; takenBy: string; pages: number } | null;
    } catch {
      return null;
    }
  })();
  const hasToken = notionConfigured();

  return (
    <>
      <Breadcrumb items={[{ label: "Điều hành", href: "/dashboard" }, { label: "Second Brain" }]} />
      <PageHead
        title="Second Brain"
        sub="Tri thức của OWNER trên Notion (kho BAOR TRAN). Notion là nguồn chuẩn; ở đây là bản chỉ mục để tìm nhanh và dẫn về trang gốc. Sửa tri thức thì sửa trên Notion."
        action={<LinkButton href="/insights/research" size="md" variant="primary">Nghiên cứu một chủ đề</LinkButton>}
      />

      <div className="grid gap-2.5 md:grid-cols-4">
        {[["Trang trong chỉ mục", stats.total], ["ACTIVE", stats.byStatus.ACTIVE ?? 0], ["VERIFIED", stats.byStatus.VERIFIED ?? 0], ["DRAFT", stats.byStatus.DRAFT ?? 0]].map(([l, n]) => (
          <div key={String(l)} className="card px-3.5 py-2.5">
            <div className="text-[12px] font-medium text-ink-2">{l}</div>
            <div className="num text-[20px] font-bold leading-tight text-ink">{n}</div>
          </div>
        ))}
      </div>

      <Panel>
        <PanelHeader
          title="Nguồn và đồng bộ"
          sub={hasToken ? "Đồng bộ tự động mỗi 6 giờ, chỉ tải lại trang đã sửa trên Notion." : "Chưa có token Notion: chỉ mục đang dùng ảnh chụp do phiên Claude tạo, không tự cập nhật."}
          action={can(actor, "manager") && hasToken ? <form action={syncKnowledgeNow}><SubmitButton pendingText="Đang đọc Notion…">Đồng bộ ngay</SubmitButton></form> : undefined}
        />
        <div className="grid gap-1 px-4 py-3 text-[12.5px] text-ink-2">
          <div>Lần cập nhật gần nhất: <span className="num text-ink">{stats.lastSyncedAt ? formatDateTime(stats.lastSyncedAt) : "chưa có"}</span> · nguồn: {stats.origins.map((o) => (o === "snapshot" ? "ảnh chụp" : "đồng bộ Notion")).join(", ") || "—"}</div>
          {snapshot && <div>Ảnh chụp: {snapshot.pages} trang, chụp lúc <span className="num">{formatDateTime(snapshot.takenAt)}</span> bởi {snapshot.takenBy}.</div>}
          {!hasToken && <div>Để đồng bộ tự động: OWNER tạo Notion Internal Integration chỉ đọc, chia sẻ trang BAOR TRAN, nhập token ở <Link href="/settings#integrations" className="text-jade hover:underline">Cài đặt › Kết nối</Link>.</div>}
          {can(actor, "admin") && (sp.import === "1" ? (
            <form action={importKnowledgeSnapshotAction} className="mt-2 grid gap-2">
              <textarea name="json" rows={6} className={textareaClass} placeholder='{"takenAt": "...", "takenBy": "...", "pages": [...]}' />
              <div className="flex gap-2"><SubmitButton pendingText="Đang nhập…">Nhập ảnh chụp</SubmitButton><LinkButton href="/insights/knowledge" variant="ghost">Hủy</LinkButton></div>
            </form>
          ) : <div><Link href="/insights/knowledge?import=1" className="text-jade hover:underline">Nhập ảnh chụp chỉ mục (JSON)</Link></div>)}
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="Tìm trong Second Brain" sub="Gõ có dấu hay không dấu đều được. Kết quả ưu tiên ACTIVE, rồi VERIFIED, rồi DRAFT; trang ARCHIVED không hiện." />
        <form className="flex flex-wrap gap-2 border-b border-border px-4 py-3">
          <input name="q" defaultValue={q} placeholder="VD: chào hỏi phá băng, xử lý từ chối, DISC" className={`${inputClass} max-w-md flex-1`} />
          <select name="area" defaultValue={sp.area ?? ""} className={`${inputClass} w-auto`}>
            <option value="">Mọi vùng</option>
            {areas.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <button type="submit" className="h-8 rounded-full border border-jade-2 bg-jade px-4 text-[12.5px] font-medium text-white hover:bg-jade-2">Tìm</button>
        </form>
        {q ? (
          hits.length === 0 ? <EmptyState title="Không thấy trang khớp" hint="Không thấy trong chỉ mục không có nghĩa là kho không có: thử từ khác hoặc tìm trực tiếp trên Notion." /> : <ul className="m-0 list-none p-0">{hits.map((h) => <PageRow key={h.page.id} p={h.page} snippet={h.snippet} />)}</ul>
        ) : all.length === 0 ? (
          <EmptyState title="Chỉ mục trống" hint="Nhập token Notion hoặc ảnh chụp chỉ mục để bắt đầu." />
        ) : (
          <ul className="m-0 list-none p-0">{all.map((p) => <PageRow key={p.id} p={p} />)}</ul>
        )}
      </Panel>
    </>
  );
}
