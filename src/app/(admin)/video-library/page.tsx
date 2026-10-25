import Link from "next/link";
import { PageHead, Panel, PanelHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Segment } from "@/components/ui/segment";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkButton } from "@/components/ui/button";
import { platformLabel } from "@/components/ui/platform";
import { fileUrl, getUpload } from "@/lib/uploads";
import { libraryRows, purgeAfterHours, purgeEnabled, type LibraryFilter } from "@/lib/videos/library";
import { formatDateTime, cn } from "@/lib/format";
import type { Platform } from "@/lib/types";

export const metadata = { title: "Tổng kho video ngắn – BAOR AI OS" };

const tabs: { key: LibraryFilter; label: string }[] = [
  { key: "unposted", label: "Chưa đăng" },
  { key: "posted", label: "Đã đăng · mục xoá" },
  { key: "purged", label: "Đã gỡ tệp" },
];

export default async function VideoLibraryPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams;
  const tab = tabs.some((t) => t.key === sp.tab) ? (sp.tab as LibraryFilter) : "unposted";
  const all = libraryRows();
  const list = all.filter((r) => r.state === tab);
  const count = (k: LibraryFilter) => all.filter((r) => r.state === k).length;
  const hours = purgeAfterHours();

  return (
    <>
      <PageHead
        title="Kho video"
        sub={purgeEnabled() ? `Đã đăng quá ${hours} giờ thì tự gỡ tệp.` : "Tự gỡ tệp đang tắt."}
        action={<LinkButton href="/video-studio?upload=1" variant="primary" size="md">Tải video đã edit</LinkButton>}
      />

      <div className="mt-3.5 grid grid-cols-3 gap-2.5">
        {tabs.map((t) => (
          <Link key={t.key} href={`/video-library?tab=${t.key}`} className={cn("card px-3.5 py-2.5 transition-colors hover:border-ink-3 hover:bg-ground-2", tab === t.key && "border-ink-3")}>
            <div className="text-[12px] font-medium text-ink-2">{t.label}</div>
            <div className="num text-[20px] font-bold leading-tight text-ink">{count(t.key)}</div>
          </Link>
        ))}
      </div>

      <div className="mt-3.5 overflow-x-auto">
        <Segment basePath="/video-library" active={tab} items={tabs.map((t) => ({ key: t.key, label: `${t.label} · ${count(t.key)}` }))} />
      </div>

      <Panel>
        <PanelHeader title={tabs.find((t) => t.key === tab)!.label} sub={tab === "unposted" ? "Lên lịch đăng ở Video Studio (mở video) hoặc Đăng bài & Quảng cáo." : tab === "posted" ? "Đã lên nền tảng (đã xác minh). Tệp video sẽ được gỡ khi tới hạn." : "Tệp video đã gỡ; xem bài trên nền tảng qua liên kết."} />
        {list.length === 0 ? (
          <EmptyState title="Chưa có video ở mục này" hint={tab === "unposted" ? "Video AI edit vào kho khi OWNER phê duyệt; video tự edit vào kho khi anh tải lên." : undefined} />
        ) : (
          <ul className="m-0 list-none p-0">
            {list.map((r) => {
              const up = r.uploadId ? getUpload(r.uploadId) : undefined;
              return (
                <li key={r.id} className="grid gap-2 border-b border-border px-4 py-3 last:border-b-0 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/video-studio?open=${r.id}`} className="font-semibold text-ink hover:underline">{r.title}</Link>
                      <Pill tone={r.origin === "self_edit" ? "violet" : "sky"}>{r.origin === "self_edit" ? "Tự edit" : "AI edit"}</Pill>
                      {r.state === "posted" && r.purgeDueAt && <Pill tone="amber">gỡ tệp lúc {formatDateTime(r.purgeDueAt)}</Pill>}
                      {r.state === "purged" && r.filesPurgedAt && <Pill tone="neutral">đã gỡ {formatDateTime(r.filesPurgedAt)}</Pill>}
                    </div>
                    <div className="mt-0.5 text-[12px] text-ink-2">
                      Cập nhật {formatDateTime(r.updatedAt)}
                      {r.postedAt && <> · đăng {formatDateTime(r.postedAt)}</>}
                    </div>
                    {r.posts.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px]">
                        {r.posts.map((p, i) =>
                          p.permalink ? (
                            <a key={i} href={p.permalink} target="_blank" rel="noopener noreferrer" className="font-medium text-accent hover:underline">{platformLabel(p.platform as Platform)} ›</a>
                          ) : (
                            <span key={i} className="text-ink-2">{platformLabel(p.platform as Platform)}</span>
                          ),
                        )}
                      </div>
                    )}
                  </div>
                  {r.state !== "purged" && up && (
                    <a href={fileUrl(up.id)} target="_blank" rel="noopener noreferrer" className="text-[12.5px] font-semibold text-accent hover:underline">Xem tệp ›</a>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </>
  );
}
