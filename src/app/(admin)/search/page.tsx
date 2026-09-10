import Link from "next/link";
import { Breadcrumb } from "@/components/shell/module-page";
import { PageHead, Panel, PanelHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pill } from "@/components/ui/pill";
import { inputClass } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { campaignRepo } from "@/lib/campaigns/repository";
import { campaignStatusLabel } from "@/lib/campaigns/labels";
import { listContent, listLeads } from "@/lib/queries";
import { listVideos } from "@/lib/videos/repository";
import { catalogRepo } from "@/lib/catalog/repository";
import { getDb, schema } from "@/db";
import { contentStatusLabel } from "@/lib/labels";
import { videoStatusLabel } from "@/lib/data/videos";
import type { ContentStatus } from "@/lib/types";

export const metadata = { title: "Tìm kiếm – BAOR AI OS" };

const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

interface Hit {
  title: string;
  sub: string;
  href: string;
  tag: string;
}

// Tìm không dấu trên chiến dịch, nội dung, video, lead, insight, sản phẩm, nhân sự.
function search(q: string): { group: string; hits: Hit[] }[] {
  const n = normalize(q);
  const has = (...parts: (string | null | undefined)[]) => normalize(parts.filter(Boolean).join(" ")).includes(n);
  const groups: { group: string; hits: Hit[] }[] = [];

  const campaigns = campaignRepo.list().filter((c) => has(c.name, c.objective, c.audience, c.location)).map<Hit>((c) => ({ title: c.name, sub: c.objective, href: `/campaigns/${c.id}`, tag: campaignStatusLabel[c.status].label }));
  if (campaigns.length) groups.push({ group: "Chiến dịch", hits: campaigns });

  const content = listContent().filter((c) => c.status !== "dismissed" && has(c.title, c.hook, c.pillar)).map<Hit>((c) => ({ title: c.title, sub: c.hook, href: `/content?tab=${c.status === "proposed" ? "proposed" : c.status === "in_progress" || c.status === "review" ? "mine" : "done"}&open=${c.id}`, tag: contentStatusLabel[c.status as ContentStatus]?.label ?? c.status }));
  if (content.length) groups.push({ group: "Nội dung", hits: content });

  const videos = listVideos().filter((v) => has(v.title, v.contentTitle, v.note)).map<Hit>((v) => ({ title: v.title, sub: v.contentTitle ? `Kịch bản: ${v.contentTitle}` : v.agent, href: `/video-studio?tab=${v.status}`, tag: videoStatusLabel[v.status].label }));
  if (videos.length) groups.push({ group: "Video", hits: videos });

  const leads = listLeads().filter((l) => has(l.name, l.lastMessage, l.phone, l.email, l.tags.join(" "))).map<Hit>((l) => ({ title: l.name, sub: l.lastMessage, href: "/customers?tab=leads", tag: l.platform }));
  if (leads.length) groups.push({ group: "Khách hàng", hits: leads });

  const insights = getDb().select().from(schema.insights).all().filter((i) => has(i.title, i.detail, i.source)).map<Hit>((i) => ({ title: i.title, sub: i.source, href: "/insights#insights", tag: `tin cậy ${i.confidence}%` }));
  if (insights.length) groups.push({ group: "Insight", hits: insights });

  const products = catalogRepo.listProducts(true).filter((p) => has(p.name, p.brand, p.description)).map<Hit>((p) => ({ title: p.name, sub: `${p.brand}${p.price ? ` · ${p.price.toLocaleString("vi-VN")} ₫/${p.unit}` : ""}`, href: `/settings?product=${p.id}#products`, tag: "Sản phẩm" }));
  if (products.length) groups.push({ group: "Sản phẩm", hits: products });

  const people = catalogRepo.listPeople(true).filter((p) => has(p.name, p.role, p.email)).map<Hit>((p) => ({ title: p.name, sub: p.role, href: `/settings?person=${p.id}#people`, tag: "Nhân sự" }));
  if (people.length) groups.push({ group: "Nhân sự", hits: people });

  return groups;
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = (await searchParams).q?.trim() ?? "";
  const groups = q.length >= 2 ? search(q) : [];
  const total = groups.reduce((n, g) => n + g.hits.length, 0);
  return (
    <>
      <Breadcrumb items={[{ label: "Điều hành", href: "/dashboard" }, { label: "Tìm kiếm" }]} />
      <PageHead title="Tìm kiếm" sub="Tìm không dấu trên chiến dịch, nội dung, video, khách hàng, insight, sản phẩm và nhân sự." />
      <form method="get" action="/search" className="flex gap-2">
        <input name="q" defaultValue={q} autoFocus className={`${inputClass} h-9 max-w-[480px]`} placeholder="Nhập từ khóa…" />
        <Button type="submit" variant="primary" size="md">Tìm</Button>
      </form>
      {q.length < 2 ? (
        <div className="card mt-3.5"><EmptyState title="Nhập ít nhất 2 ký tự để tìm" /></div>
      ) : groups.length === 0 ? (
        <div className="card mt-3.5"><EmptyState title={`Không tìm thấy “${q}”`} hint="Thử từ khóa ngắn hơn hoặc không dấu." /></div>
      ) : (
        groups.map((g) => (
          <Panel key={g.group}>
            <PanelHeader title={g.group} sub={`${g.hits.length} kết quả${g.group === groups[0].group ? ` · tổng ${total}` : ""}`} />
            <ul className="m-0 list-none p-0">
              {g.hits.slice(0, 20).map((h, i) => (
                <li key={`${h.href}-${i}`} className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-border px-4 py-2.5 last:border-b-0">
                  <div className="min-w-0">
                    <Link href={h.href} className="font-semibold text-ink hover:underline">{h.title}</Link>
                    {h.sub && <div className="truncate text-[12px] text-ink-2">{h.sub}</div>}
                  </div>
                  <Pill>{h.tag}</Pill>
                </li>
              ))}
            </ul>
          </Panel>
        ))
      )}
    </>
  );
}
