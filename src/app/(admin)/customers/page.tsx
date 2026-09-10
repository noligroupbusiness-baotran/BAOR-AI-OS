import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Pill, Dot } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { StatTile } from "@/components/ui/stat";
import { Table, Th, Td } from "@/components/ui/table";
import { Toggle } from "@/components/ui/toggle";
import { PlatformPill } from "@/components/ui/platform";
import { autoReplyRules, conversations, leads } from "@/lib/data/customers";
import { leadSourceLabel, leadStageLabel } from "@/lib/labels";
import { formatDateTime, formatTime, cn } from "@/lib/format";
import type { LeadStage } from "@/lib/types";

export const metadata = { title: "Khách hàng – BAOR AI OS" };

const stages: LeadStage[] = ["new", "contacted", "qualified", "won", "lost"];

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; conv?: string }>;
}) {
  const { tab: rawTab, conv } = await searchParams;
  const tab = rawTab ?? (conv ? "inbox" : "inbox");
  const selected = conversations.find((c) => c.id === conv) ?? conversations[0];
  const needHuman = conversations.filter((c) => c.needsHuman).length;

  return (
    <>
      <PageHeader
        emoji="💬"
        title="Kết nối khách hàng"
        subtitle="Bước 7. AI trả lời bình luận và inbox theo quy tắc, tạo lead vào CRM, chuyển cho bạn khi khách sẵn sàng chốt hoặc khiếu nại."
        meta={
          <>
            <span className="flex items-center gap-1.5">
              <Dot tone="green" live /> Trả lời tự động đang bật
            </span>
            <span>·</span>
            <span className="font-medium text-red">{needHuman} hội thoại cần bạn</span>
            <span>·</span>
            <span>Thời gian phản hồi TB: 14 giây</span>
          </>
        }
        actions={
          <>
            <Button variant="primary">📞 Gọi lead chờ trong 30 phút</Button>
            <Button>⬇ Xuất CRM</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Lead mới (7 ngày)" value="142" delta={21.7} />
        <StatTile label="AI trả lời tự động" value="87%" delta={4.2} hint="hội thoại không cần người" />
        <StatTile label="Tỷ lệ chốt" value="18,4%" delta={2.9} />
        <StatTile label="Comment đã ẩn (spam)" value="83" hint="7 ngày" />
      </div>

      <div className="mt-4">
        <FilterTabs
          basePath="/customers"
          active={tab}
          tabs={[
            { key: "inbox", label: "Hộp thư & bình luận", emoji: "💬", count: conversations.length },
            { key: "leads", label: "Lead / CRM", emoji: "🎯", count: leads.length },
            { key: "rules", label: "Quy tắc trả lời", emoji: "🤖", count: autoReplyRules.length },
          ]}
        />
      </div>

      {tab === "inbox" && (
        <div className="mt-4 grid gap-4 lg:grid-cols-5">
          <Card padded={false} className="lg:col-span-2">
            <div className="border-b border-border px-3 py-2.5">
              <div className="eyebrow">Hội thoại</div>
            </div>
            <ul className="divide-y divide-border/70">
              {conversations.map((c) => {
                const last = c.messages[c.messages.length - 1];
                const isSel = c.id === selected.id;
                return (
                  <li key={c.id}>
                    <Link
                      href={`/customers?tab=inbox&conv=${c.id}`}
                      className={cn("block px-3 py-2.5 hover:bg-bg-elevated", isSel && "bg-primary-soft/40")}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-semibold text-ink">{c.leadName}</span>
                        <span className="text-[10.5px] tabular-nums text-faint">{formatTime(last.at)}</span>
                      </div>
                      <div className="mt-0.5 truncate text-[12px] text-muted">{last.text}</div>
                      <div className="mt-1 flex items-center gap-1">
                        <PlatformPill platform={c.platform} short />
                        {c.needsHuman ? (
                          <Pill tone="red" size="xs">🙋 Cần bạn</Pill>
                        ) : (
                          <Pill tone="green" size="xs">🤖 AI đang xử lý</Pill>
                        )}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card padded={false} className="flex flex-col lg:col-span-3">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <div>
                <div className="text-[13.5px] font-bold text-ink">{selected.leadName}</div>
                <div className="flex items-center gap-1.5 text-[11.5px] text-muted">
                  <PlatformPill platform={selected.platform} />
                  {leads.find((l) => l.id === selected.leadId)?.tags.map((t) => (
                    <Pill key={t} tone="neutral" size="xs">#{t}</Pill>
                  ))}
                </div>
              </div>
              <div className="flex gap-1.5">
                <Button size="xs" variant="soft">🎯 Xem lead</Button>
                <Button size="xs">Giao lại cho AI</Button>
              </div>
            </div>
            <div className="flex-1 space-y-2.5 bg-bg-elevated px-4 py-3">
              {selected.messages.map((m, i) => (
                <div key={i} className={cn("flex", m.from === "customer" ? "justify-start" : "justify-end")}>
                  <div
                    className={cn(
                      "max-w-[80%] rounded-2xl px-3 py-2 text-[12.5px] leading-relaxed",
                      m.from === "customer"
                        ? "rounded-bl-sm bg-surface text-ink border border-border"
                        : m.from === "ai"
                          ? "rounded-br-sm bg-purple-soft text-ink"
                          : "rounded-br-sm bg-primary text-white",
                    )}
                  >
                    {m.from !== "customer" && (
                      <div className="mb-0.5 text-[10.5px] font-bold uppercase tracking-wide opacity-70">
                        {m.from === "ai" ? "🤖 AI" : "🙋 Bạn"}
                      </div>
                    )}
                    {m.text}
                    <div className="mt-0.5 text-right text-[10px] opacity-60">{formatTime(m.at)}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-border p-3">
              <div className="mb-2 flex flex-wrap gap-1.5">
                <Pill tone="purple" size="xs">🤖 Gợi ý: “Combo 3 bước giá 890K, đang giảm 25% còn 667K, chị Thảo nhé!”</Pill>
              </div>
              <div className="flex gap-2">
                <input
                  placeholder="Nhập tin nhắn… (AI đã soạn gợi ý phía trên)"
                  className="h-9 flex-1 rounded-full border border-border-strong bg-surface px-3.5 text-[13px] outline-none focus:border-primary"
                />
                <Button variant="primary" size="md">Gửi</Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {tab === "leads" && (
        <>
          <div className="mt-4 grid grid-cols-5 gap-2">
            {stages.map((s) => {
              const m = leadStageLabel[s];
              const n = leads.filter((l) => l.stage === s).length;
              return (
                <div key={s} className="rounded-md border border-border bg-surface px-3 py-2">
                  <Pill tone={m.tone} size="xs">{m.label}</Pill>
                  <div className="mt-1 text-[18px] font-bold tabular-nums text-ink">{n}</div>
                </div>
              );
            })}
          </div>
          <Card className="mt-3">
            <CardHeader icon="🎯" title="Danh sách lead" subtitle="AI tự tạo lead từ inbox/comment, gắn tag và giai đoạn." action={<Button size="xs">+ Thêm lead</Button>} />
            <Table>
              <thead>
                <tr>
                  <Th>Khách</Th>
                  <Th>Nguồn</Th>
                  <Th>Giai đoạn</Th>
                  <Th>Tin nhắn cuối</Th>
                  <Th>Liên hệ</Th>
                  <Th>Tag</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => {
                  const st = leadStageLabel[l.stage];
                  return (
                    <tr key={l.id} className="hover:bg-bg-elevated">
                      <Td className="font-medium text-ink">{l.name}</Td>
                      <Td>
                        <div className="flex items-center gap-1">
                          <PlatformPill platform={l.platform} short />
                          <span className="text-muted">{leadSourceLabel[l.source]}</span>
                        </div>
                      </Td>
                      <Td><Pill tone={st.tone}>{st.label}</Pill></Td>
                      <Td>
                        <div className="max-w-[260px] truncate text-ink">{l.lastMessage}</div>
                        <div className="text-[11px] tabular-nums text-faint">{formatDateTime(l.lastMessageAt)}</div>
                      </Td>
                      <Td className="tabular-nums text-muted">{l.phone ?? l.email ?? "—"}</Td>
                      <Td>
                        <div className="flex flex-wrap gap-1">
                          {l.tags.map((t) => (
                            <Pill key={t} tone="neutral" size="xs">#{t}</Pill>
                          ))}
                        </div>
                      </Td>
                      <Td className="text-right">
                        <Button size="xs" variant="ghost">Mở</Button>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>
        </>
      )}

      {tab === "rules" && (
        <Card className="mt-4">
          <CardHeader
            icon="🤖"
            title="Quy tắc trả lời tự động"
            subtitle="AI dùng giọng thương hiệu của bạn. Khiếu nại và chốt đơn luôn chuyển cho người."
            action={<Button size="xs" variant="primary">+ Thêm quy tắc</Button>}
          />
          <Table>
            <thead>
              <tr>
                <Th>Khi khách…</Th>
                <Th>Hệ thống sẽ…</Th>
                <Th className="text-right">Đã kích hoạt</Th>
                <Th className="text-right">Bật</Th>
              </tr>
            </thead>
            <tbody>
              {autoReplyRules.map((r) => (
                <tr key={r.id} className="hover:bg-bg-elevated">
                  <Td className="font-medium text-ink">{r.trigger}</Td>
                  <Td className="text-muted">{r.action}</Td>
                  <Td className="text-right tabular-nums">{r.hits}</Td>
                  <Td className="text-right">
                    <Toggle defaultChecked={r.enabled} label={r.trigger} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}
