import Link from "next/link";
import { Panel, PanelHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Table, Th, Td } from "@/components/ui/table";
import { getAiBudget } from "@/lib/router";
import { recentAiCalls, roleSpendThisMonth } from "@/lib/ai-roster";
import { formatCurrency, formatDateTime, formatNumber, cn } from "@/lib/format";
import { displayStepOf } from "@/config/journey";

// Báo cáo › Chi phí AI: MỘT màn hình chung cho mọi AI (Personal Brand System — "Tất cả các chi phí AI hiển thị thành màn hình
// báo cáo chung: [Tên AI] – chi phí gọi"). Mỗi vị trí 1 AI, trần riêng, công tắc "Cho phép gọi AI" ở Cài đặt › Đội AI.
export function AiCostPanel() {
  const b = getAiBudget();
  const roles = roleSpendThisMonth().filter((r) => !r.role.pending || r.calls > 0); // vị trí chưa nối (AI Quảng cáo) ẩn khi chưa có lần gọi
  const calls = recentAiCalls(30);
  const totalCalls = roles.reduce((n, r) => n + r.calls, 0);
  return (
    <>
      <Panel id="ai-cost">
        <PanelHeader
          title="Chi phí AI theo từng AI — tháng này"
          sub={`${formatNumber(totalCalls)} lần gọi · ${formatCurrency(b.spentMonthVnd)} / trần chung ${formatCurrency(b.monthlyCapVnd)} (hôm nay ${formatCurrency(b.spentTodayVnd)} / ${formatCurrency(b.dailyCapVnd)}). Việc theo luật không gọi AI nên không tốn tiền.`}
          action={<Link href="/settings#ai-team" className="text-[12.5px] font-semibold text-jade">Đội AI ›</Link>}
        />
        <Table>
          <thead>
            <tr><Th>AI</Th><Th>Bước</Th><Th>Mô hình</Th><Th>Cho phép</Th><Th right>Lần gọi</Th><Th right>Chi phí</Th><Th right>Mỗi lần</Th><Th right>Trần riêng</Th></tr>
          </thead>
          <tbody>
            {roles.map(({ role, settings, calls: n, failed, costVnd, avgVnd }) => {
              const over = settings.monthlyCapVnd > 0 && costVnd >= settings.monthlyCapVnd;
              return (
                <tr key={role.id}>
                  <Td><div className="font-semibold text-ink">{role.name}</div><div className="text-[11.5px] text-ink-3">{role.job}</div></Td>
                  <Td className="num">{displayStepOf(role.step)}</Td>
                  <Td className="text-[12px]">{settings.model}</Td>
                  <Td>{settings.enabled ? <Pill tone="jade">Bật</Pill> : <Pill tone="neutral">Tắt</Pill>}</Td>
                  <Td right className="num">{formatNumber(n)}{failed > 0 && <span className="text-brick"> · {failed} lỗi</span>}</Td>
                  <Td right className={cn("num font-semibold", over ? "text-brick" : "text-ink")}>{formatCurrency(costVnd)}</Td>
                  <Td right className="num">{n ? formatCurrency(avgVnd) : "—"}</Td>
                  <Td right className="num">{settings.monthlyCapVnd ? formatCurrency(settings.monthlyCapVnd) : <span className="text-ink-3">trần chung</span>}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Panel>
      <Panel>
        <PanelHeader title="Từng lần gọi AI" sub="[Tên AI] – chi phí mỗi lần gọi, mới nhất trước. Mô hình chạy tại máy (AI Edit Video) ghi ₫0." />
        {calls.length === 0 ? (
          <p className="px-4 py-3 text-[12.5px] text-ink-2">Chưa có lần gọi AI nào.</p>
        ) : (
          <ul className="m-0 list-none p-0">
            {calls.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 border-b border-border px-4 py-2 text-[12px] last:border-b-0">
                <span className="num text-ink-3">{formatDateTime(c.at)}</span>
                <span className="font-semibold text-ink">{c.roleName}</span>
                <span className="text-ink-2">{c.model}</span>
                {(c.inputTokens > 0 || c.outputTokens > 0) && <span className="num text-ink-3">{formatNumber(c.inputTokens)}/{formatNumber(c.outputTokens)} token</span>}
                <span className="num ml-auto font-semibold text-ink">{formatCurrency(c.costVnd)}</span>
                {!c.ok && <Pill tone="brick">{c.error ?? "lỗi"}</Pill>}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
