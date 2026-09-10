import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Pill, ScoreBadge } from "@/components/ui/pill";
import { Button, LinkButton } from "@/components/ui/button";
import { contentItems } from "@/lib/data/content";
import { adCampaigns } from "@/lib/data/ads";
import { conversations } from "@/lib/data/customers";
import { emailCampaigns } from "@/lib/data/email";
import { contentFormatLabel } from "@/lib/labels";
import { formatNumber } from "@/lib/format";

export const metadata = { title: "Hộp chờ duyệt – BAOR AI OS" };

export default function ApprovalsPage() {
  const proposals = contentItems.filter((c) => c.status === "proposed");
  const ads = adCampaigns.filter((a) => a.status === "pending_approval");
  const convs = conversations.filter((c) => c.needsHuman);
  const emails = emailCampaigns.filter((e) => e.status === "draft");

  return (
    <>
      <PageHeader
        emoji="✅"
        title="Hộp chờ duyệt"
        subtitle="Mọi thứ AI muốn làm nhưng cần bạn gật đầu: ý tưởng nội dung, chiến dịch ads tiêu tiền thật, hội thoại cần người, email gửi hàng loạt."
        meta={
          <>
            <Pill tone="purple">💡 {proposals.length} ý tưởng</Pill>
            <Pill tone="gold">📣 {ads.length} ads</Pill>
            <Pill tone="red">💬 {convs.length} hội thoại</Pill>
            <Pill tone="blue">✉️ {emails.length} email</Pill>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            icon="💡"
            title="Ý tưởng nội dung AI đề xuất"
            tone="purple"
            subtitle="Nhận để tự viết, hoặc để AI viết nháp trước."
          />
          <ul className="divide-y divide-border/70">
            {proposals.map((c) => (
              <li key={c.id} className="py-2.5">
                <div className="flex items-start gap-2">
                  <ScoreBadge score={c.score ?? 0} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium text-ink">{c.title}</div>
                    <div className="mt-0.5 text-[11.5px] text-muted">
                      {contentFormatLabel[c.format].emoji} {contentFormatLabel[c.format].label} · {c.pillar}
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex gap-1.5 pl-1">
                  <Button size="xs" variant="primary">✍️ Tôi tự viết</Button>
                  <Button size="xs" variant="soft">🤖 AI viết nháp</Button>
                  <Button size="xs" variant="ghost">Bỏ qua</Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader
            icon="📣"
            title="Quảng cáo chờ duyệt"
            tone="gold"
            subtitle="Tiêu tiền thật, luôn cần bạn xác nhận."
          />
          {ads.map((a) => (
            <div key={a.id} className="rounded-lg border border-gold/30 bg-gold-soft/40 p-3">
              <div className="text-[13px] font-semibold text-ink">{a.name}</div>
              <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] text-muted">
                <div>
                  Ngân sách: <b className="text-ink">{formatNumber(a.dailyBudget)} ₫/ngày</b>
                </div>
                <div>
                  Mục tiêu: <b className="text-ink">Tương tác</b>
                </div>
                <div className="col-span-2">Đối tượng: {a.audience}</div>
              </div>
              <p className="mt-2 rounded-md bg-surface px-2.5 py-2 text-[12px] text-ink">🤖 {a.aiNote}</p>
              <div className="mt-2 flex gap-1.5">
                <Button size="xs" variant="primary">✅ Duyệt & bật</Button>
                <Button size="xs">✏️ Sửa ngân sách</Button>
                <Button size="xs" variant="danger">Từ chối</Button>
              </div>
            </div>
          ))}
        </Card>

        <Card>
          <CardHeader
            icon="💬"
            title="Hội thoại cần bạn"
            tone="red"
            subtitle="AI đã trả lời bước đầu, khách đang chờ chốt."
          />
          <ul className="divide-y divide-border/70">
            {convs.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-ink">{c.leadName}</div>
                  <div className="truncate text-[11.5px] text-muted">
                    “{c.messages[c.messages.length - 1].text}”
                  </div>
                </div>
                <LinkButton href={`/customers?conv=${c.id}`} size="xs" variant="primary">
                  Mở hội thoại
                </LinkButton>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader icon="✉️" title="Email chờ duyệt" tone="blue" subtitle="AI soạn từ nội dung đã đăng tốt." />
          <ul className="divide-y divide-border/70">
            {emails.map((e) => (
              <li key={e.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-ink">{e.subject}</div>
                  <div className="text-[11.5px] text-muted">
                    Gửi tới {formatNumber(e.recipients)} người đăng ký
                  </div>
                </div>
                <Button size="xs" variant="primary">Xem & duyệt</Button>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
