import Link from "next/link";
import { PageHead, Panel, PanelHeader } from "@/components/ui/card";
import { Breadcrumb, ModuleGroups } from "@/components/shell/module-page";
import { Pill } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { Segment } from "@/components/ui/segment";
import { Tiles, Tile } from "@/components/ui/stat";
import { Table, Th, Td } from "@/components/ui/table";
import { aiSuggest, handBackToAi, sendReply, setLeadStage, toggleRule, toggleSequence } from "@/lib/actions/customers";
import { listConversations, listEmailSequences, listLeads, listRules } from "@/lib/queries";
import { leadSourceLabel, leadStageLabel } from "@/lib/labels";
import { formatDateTime, formatNumber, formatTime, cn } from "@/lib/format";
import { platformLabel } from "@/components/ui/platform";
import type { LeadStage, Platform } from "@/lib/types";
import { CampaignTags, LinkToCampaignForm } from "@/components/campaigns/entity-campaign";
import { campaignRepo } from "@/lib/campaigns/repository";

export const metadata = { title: "Khách hàng & email – BAOR AI OS" };

const stages: LeadStage[] = ["new", "contacted", "qualified", "won", "lost"];

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ tab?: string; conv?: string; suggest?: string; link?: string }> }) {
  const { tab = "inbox", conv, suggest, link } = await searchParams;
  const convs = listConversations();
  const selected = convs.find((c) => c.id === conv) ?? convs[0];
  const leads = listLeads();
  const rules = listRules();
  const seqs = listEmailSequences();
  const needHuman = convs.filter((c) => c.needsHuman).length;
  const won = leads.filter((l) => l.stage === "won").length;
  const leadLinks = campaignRepo.linksForEntities("lead", leads.map((l) => l.id));

  return (
    <>
      <Breadcrumb items={[{ label: "Điều hành", href: "/dashboard" }, { label: "Khách hàng" }]} />
      <PageHead
        title="Khách hàng & email"
        sub="AI trả lời bình luận và inbox theo giọng của bạn, tạo lead, và chuyển cho bạn khi khách sẵn sàng chốt."
      />

      <Tiles>
        <Tile label="Hội thoại" value={String(convs.length)} hint="Từ inbox và bình luận" />
        <Tile label="Cần bạn" value={String(needHuman)} hint="Khách chờ chốt / gọi lại" tone={needHuman ? "brick" : undefined} />
        <Tile label="Lead" value={String(leads.length)} hint={`${won} đã mua`} />
        <Tile label="Chuỗi email đang chạy" value={String(seqs.filter((s) => s.active).length)} hint={`${formatNumber(seqs.reduce((n, s) => n + s.subscribers, 0))} người trong chuỗi`} />
      </Tiles>

      <div className="mt-3.5">
        <Segment
          basePath="/customers"
          active={tab}
          items={[
            { key: "inbox", label: `Hộp thư · ${convs.length}` },
            { key: "leads", label: `Lead · ${leads.length}` },
            { key: "rules", label: `Quy tắc trả lời · ${rules.length}` },
            { key: "email", label: `Email · ${seqs.length}` },
          ]}
        />
      </div>

      {tab === "inbox" && (
        <div className="card mt-3.5 grid min-h-[420px] overflow-hidden md:grid-cols-[300px_1fr]">
          <div className="min-w-0 border-b border-border md:border-b-0 md:border-r">
            {convs.length === 0 && <div className="px-4 py-8 text-center text-[12.5px] text-ink-2">Chưa có hội thoại. Kết nối Facebook để nhận inbox.</div>}
            {convs.map((c) => {
              const last = c.messages[c.messages.length - 1];
              const active = selected && c.id === selected.id;
              return (
                <Link key={c.id} href={`/customers?tab=inbox&conv=${c.id}`} className={cn("block border-b border-border px-3.5 py-2.5", active && "bg-jade-soft")}>
                  <div className="flex justify-between gap-2 font-semibold text-ink">
                    <span className="truncate">{c.leadName}</span>
                    {last && <time className="num text-[11px] font-normal text-ink-3">{formatTime(last.at)}</time>}
                  </div>
                  <div className="mt-px truncate text-[12px] text-ink-2">{last?.text}</div>
                  <div className="mt-1.5">{c.needsHuman ? <Pill tone="brick">Cần bạn</Pill> : <Pill tone="violet">AI đang xử lý</Pill>}</div>
                </Link>
              );
            })}
          </div>
          {selected && (
            <div className="flex min-w-0 flex-col">
              <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <div>
                  <b className="text-[13.5px]">{selected.leadName}</b>
                  <span className="ml-2 text-[12px] text-ink-2">{platformLabel(selected.platform as Platform)}</span>
                </div>
                {selected.needsHuman && (
                  <form action={handBackToAi}><input type="hidden" name="conv" value={selected.id} /><Button variant="ghost" type="submit">Giao lại cho AI</Button></form>
                )}
              </header>
              <div className="flex flex-1 flex-col gap-2 bg-ground px-4 py-3.5">
                {selected.messages.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      "max-w-[78%] rounded-[14px] px-3 py-2 text-[12.5px] leading-relaxed",
                      m.from === "customer" ? "self-start rounded-bl-[4px] border border-border bg-surface" : m.from === "ai" ? "self-end rounded-br-[4px] bg-violet-soft" : "self-end rounded-br-[4px] bg-jade text-white",
                    )}
                  >
                    {m.from !== "customer" && <div className={cn("mb-0.5 text-[10px] font-bold uppercase tracking-[0.06em]", m.from === "ai" ? "text-violet" : "text-white/80")}>{m.from === "ai" ? "AI" : "Bạn"}</div>}
                    {m.text}
                  </div>
                ))}
              </div>
              <form action={sendReply} className="grid gap-2 border-t border-border px-3 py-2.5">
                <input type="hidden" name="conv" value={selected.id} />
                <div className="flex items-center justify-between gap-2 text-[12px] text-ink-2">
                  <span>{suggest ? <><b className="text-violet">AI gợi ý:</b> {suggest}</> : "Bấm “AI gợi ý” để AI soạn câu trả lời theo giọng của bạn."}</span>
                  <Button type="submit" formAction={aiSuggest} variant="soft">AI gợi ý</Button>
                </div>
                <div className="flex gap-2">
                  <input name="text" defaultValue={suggest ?? ""} placeholder="Nhập tin nhắn…" aria-label="Tin nhắn trả lời" className="h-8 flex-1 rounded-full border border-border-2 bg-surface px-3 text-[13px] text-ink outline-none focus-visible:outline-2 focus-visible:outline-jade" />
                  <Button variant="primary" size="md" type="submit">Gửi</Button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {tab === "leads" && (
        <Panel>
          <PanelHeader title="Danh sách lead" sub="Mỗi lead ghi nhận đến từ chiến dịch, mục tiêu kênh và bài đăng / quảng cáo nào. Đổi giai đoạn bằng ô chọn." />
          <Table>
            <thead><tr><Th>Khách</Th><Th>Nguồn</Th><Th>Chiến dịch</Th><Th>Tin nhắn cuối</Th><Th>Liên hệ</Th><Th right>Giai đoạn</Th></tr></thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id}>
                  <Td className="font-semibold text-ink">{l.name}<div className="mt-0.5 flex flex-wrap gap-1">{l.tags.map((t) => <Pill key={t}>#{t}</Pill>)}</div></Td>
                  <Td>{platformLabel(l.platform as Platform)} · {leadSourceLabel[l.source] ?? l.source}</Td>
                  <Td>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <CampaignTags links={leadLinks.get(l.id)} />
                      <LinkToCampaignForm entityType="lead" entityId={l.id} status={l.stage} back="/customers?tab=leads" links={leadLinks.get(l.id)} compact open={link === l.id} />
                    </div>
                  </Td>
                  <Td><div className="max-w-[260px] truncate">{l.lastMessage}</div><div className="num text-[11px] text-ink-3">{formatDateTime(l.lastMessageAt)}</div></Td>
                  <Td className="num">{l.phone ?? l.email ?? "—"}</Td>
                  <Td right>
                    <form action={setLeadStage} className="flex justify-end gap-1.5">
                      <input type="hidden" name="id" value={l.id} />
                      <select name="stage" defaultValue={l.stage} className="h-7 rounded-md border border-border-2 bg-surface px-2 text-[12px] text-ink">
                        {stages.map((s) => <option key={s} value={s}>{leadStageLabel[s].label}</option>)}
                      </select>
                      <Button type="submit">Lưu</Button>
                    </form>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Panel>
      )}

      {tab === "rules" && (
        <Panel>
          <PanelHeader title="Quy tắc trả lời tự động" sub="AI dùng giọng thương hiệu của bạn. Khiếu nại và chốt đơn luôn chuyển cho người." />
          <Table>
            <thead><tr><Th>Khi khách…</Th><Th>Hệ thống sẽ…</Th><Th right>Đã kích hoạt</Th><Th right>Bật</Th></tr></thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}>
                  <Td className="font-semibold text-ink">{r.trigger}</Td>
                  <Td className="text-ink-2">{r.action}</Td>
                  <Td right className="num">{r.hits}</Td>
                  <Td right>
                    <form action={toggleRule}><input type="hidden" name="id" value={r.id} />
                      <Button type="submit" variant={r.enabled ? "soft" : "outline"}>{r.enabled ? "Đang bật" : "Đang tắt"}</Button>
                    </form>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Panel>
      )}

      {tab === "email" && (
        <Panel>
          <PanelHeader title="Chuỗi email tự động" sub="Lead có email được đưa vào chuỗi theo giai đoạn. Cần kết nối nhà cung cấp email để gửi thật." />
          <Table>
            <thead><tr><Th>Chuỗi</Th><Th>Kích hoạt khi</Th><Th right>Đang trong chuỗi</Th><Th right>Mở</Th><Th right>Bật</Th></tr></thead>
            <tbody>
              {seqs.map((s) => (
                <tr key={s.id}>
                  <Td><b>{s.name}</b> · {s.steps} email</Td>
                  <Td>{s.trigger}</Td>
                  <Td right className="num">{formatNumber(s.subscribers)}</Td>
                  <Td right className="num">{Math.round(s.openRate)}%</Td>
                  <Td right>
                    <form action={toggleSequence}><input type="hidden" name="id" value={s.id} />
                      <Button type="submit" variant={s.active ? "soft" : "outline"}>{s.active ? "Đang bật" : "Đang tắt"}</Button>
                    </form>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Panel>
      )}
      <ModuleGroups moduleKey="customers" />
    </>
  );
}
