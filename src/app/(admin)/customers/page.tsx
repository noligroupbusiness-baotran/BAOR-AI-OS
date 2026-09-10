import Link from "next/link";
import { PageHead, Panel, PanelHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { Tiles, Tile } from "@/components/ui/stat";
import { Table, Th, Td } from "@/components/ui/table";
import { conversations } from "@/lib/data/customers";
import { emailSequences, emailStats } from "@/lib/data/email";
import { formatNumber, formatTime, cn } from "@/lib/format";

export const metadata = { title: "Khách hàng & email – BAOR AI OS" };

const suggestions: Record<string, string> = {
  cv1: "Combo 3 bước giá 890K, đang giảm 25% còn 667K, chị Thảo nhé!",
  cv2: "Gọi cho cô trong 30 phút, mở hồ sơ lead trước khi gọi.",
  cv3: "AI đang xử lý, chưa cần bạn can thiệp.",
};

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ conv?: string }> }) {
  const { conv } = await searchParams;
  const selected = conversations.find((c) => c.id === conv) ?? conversations[0];
  const needHuman = conversations.filter((c) => c.needsHuman).length;

  return (
    <>
      <PageHead
        title="Khách hàng & email"
        sub="AI trả lời bình luận và inbox theo giọng của bạn, tạo lead, và chuyển cho bạn khi khách sẵn sàng chốt."
        action={<Button variant="primary" size="md">Gọi 1 lead đang chờ</Button>}
      />

      <Tiles>
        <Tile label="AI tự trả lời" value="87%" hint="Hội thoại không cần người" />
        <Tile label="Cần bạn" value={String(needHuman)} hint="Khách chờ chốt / gọi lại" tone="brick" />
        <Tile label="Tỷ lệ chốt" value="18,4%" delta="▲ 2,9%" hint="30 ngày" />
        <Tile label="Email mở" value={`${emailStats.avgOpenRate.toLocaleString("vi-VN")}%`} hint={`${formatNumber(emailStats.subscribers)} người đăng ký`} />
      </Tiles>

      <div className="card mt-3.5 grid min-h-[420px] overflow-hidden md:grid-cols-[300px_1fr]">
        <div className="border-b border-border md:border-b-0 md:border-r">
          {conversations.map((c) => {
            const last = c.messages[c.messages.length - 1];
            const active = c.id === selected.id;
            return (
              <Link
                key={c.id}
                href={`/customers?conv=${c.id}`}
                aria-current={active ? "true" : undefined}
                className={cn("block border-b border-border px-3.5 py-2.5", active && "bg-jade-soft")}
              >
                <div className="flex justify-between font-semibold text-ink">
                  {c.leadName}
                  <time className="num text-[11px] font-normal text-ink-3">{formatTime(last.at)}</time>
                </div>
                <div className="mt-px truncate text-[12px] text-ink-2">{last.text}</div>
                <div className="mt-1.5">
                  {c.needsHuman ? <Pill tone="brick">{c.id === "cv2" ? "Gọi lại" : "Cần bạn"}</Pill> : <Pill tone="violet">AI đang xử lý</Pill>}
                </div>
              </Link>
            );
          })}
        </div>
        <div className="flex flex-col">
          <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <b className="text-[13.5px]">{selected.leadName}</b>
            <Button variant="ghost">Giao lại cho AI</Button>
          </header>
          <div className="flex flex-1 flex-col gap-2 bg-ground px-4 py-3.5">
            {selected.messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "max-w-[78%] rounded-[14px] px-3 py-2 text-[12.5px] leading-relaxed",
                  m.from === "customer"
                    ? "self-start rounded-bl-[4px] border border-border bg-surface"
                    : m.from === "ai"
                      ? "self-end rounded-br-[4px] bg-violet-soft"
                      : "self-end rounded-br-[4px] bg-jade text-white",
                )}
              >
                {m.from === "ai" && <div className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-violet">AI</div>}
                {m.text}
              </div>
            ))}
          </div>
          <div className="grid gap-2 border-t border-border px-3 py-2.5">
            <div className="text-[12px] text-ink-2">
              <b className="text-violet">AI gợi ý:</b> {suggestions[selected.id]}
            </div>
            <div className="flex gap-2">
              <input
                aria-label="Tin nhắn trả lời"
                placeholder="Nhập tin nhắn…"
                className="h-8 flex-1 rounded-full border border-border-2 bg-surface px-3 text-[13px] text-ink outline-none focus-visible:outline-2 focus-visible:outline-jade"
              />
              <Button variant="primary" size="md">Gửi</Button>
            </div>
          </div>
        </div>
      </div>

      <Panel>
        <PanelHeader title="Chuỗi email đang chạy" sub="Lead có email được đưa vào chuỗi theo giai đoạn." />
        <Table>
          <thead>
            <tr>
              <Th>Chuỗi</Th>
              <Th>Kích hoạt khi</Th>
              <Th right>Đang trong chuỗi</Th>
              <Th right>Mở</Th>
            </tr>
          </thead>
          <tbody>
            {emailSequences
              .filter((s) => s.active)
              .map((s) => (
                <tr key={s.id}>
                  <Td>
                    <b>{s.name}</b> · {s.steps} email
                  </Td>
                  <Td>{s.trigger}</Td>
                  <Td right className="num">{formatNumber(s.subscribers)}</Td>
                  <Td right className="num">{Math.round(s.openRate)}%</Td>
                </tr>
              ))}
          </tbody>
        </Table>
      </Panel>
    </>
  );
}
