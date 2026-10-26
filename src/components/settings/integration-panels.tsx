import Link from "next/link";
import { BookOpen, Bot, Clock, Globe, Lock, Mail, Megaphone, Plug, ScrollText, Send, Wallet, type LucideIcon } from "lucide-react";
import type { GroupTone } from "@/config/menu";
import { InfoTip } from "@/components/ui/info-tip";
import { Panel, PanelHeader } from "@/components/ui/card";
import { MoreOptions, SettingItem, SettingList, SettingSection } from "./setting-item";
import { Pill } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { Field, FormNotice, WithUnit, inputClass } from "@/components/ui/field";
import { VndCapInput } from "@/components/ui/vnd-cap-input";
import { SubmitButton } from "@/components/campaigns/submit-button";
import { STALE_CLAUDE_NOTE, listIntegrationStatus, listRuns, maskedIntegrationConfig } from "@/lib/connectors/config";
import { connectorFor } from "@/lib/connectors/registry";
import { disconnectIntegration, runBackgroundNow, saveAiBudget, saveIntegration } from "@/lib/actions/settings";
import { domainLabel, getAiBudget, laneLabel, listDecisions } from "@/lib/router";
import { vndPerUsd } from "@/lib/ai-providers";
import { schedulerState } from "@/lib/scheduler";
import { getLeadWebhookKey, getMetaVerifyToken, publicBaseUrl } from "@/lib/webhooks";
import { formatCurrency, formatDateTime, cn } from "@/lib/format";

// Cài đặt › Kết nối: mỗi nền tảng một dòng, trạng thái lấy từ lần kiểm tra thật gần nhất.
// Ô chính của từng kết nối (OWNER 25/10/2026: "các link đấu nối thì chỉ cần ô API"); trường khác nằm trong "Thêm".
const PRIMARY: Record<string, string[]> = {
  facebook_page: ["pageToken", "pageId"],
  meta_ads: ["accessToken", "adAccountId"],
  notion: ["token"],
  claude: ["apiKey"],
  openai: ["apiKey"],
  xai: ["apiKey"],
  instagram: ["igUserId"],
  tiktok: ["accessToken"],
  youtube: ["apiKey"],
  zalo_oa: ["accessToken"],
  email_provider: ["smtpUrl"],
  website: ["siteUrl"],
};

const AI_ORDER = ["claude", "openai", "xai", "notion"];

// Icon + màu nhóm của từng nền tảng (dòng trong Kết nối)
function itemLook(key: string): { icon: LucideIcon; tone: GroupTone } {
  if (key === "meta_ads") return { icon: Megaphone, tone: "orange" };
  if (key === "notion") return { icon: BookOpen, tone: "violet" };
  if (AI_ORDER.includes(key)) return { icon: Bot, tone: "violet" };
  if (key === "website") return { icon: Globe, tone: "cyan" };
  if (key === "email_provider") return { icon: Mail, tone: "cyan" };
  return { icon: Send, tone: "blue" };
}

// Nhóm nền tảng cho dễ tìm; khoá lạ rơi vào "Khác".
const SECTIONS: { title: string; keys: (k: string) => boolean }[] = [
  { title: "Đăng bài & tin nhắn", keys: (k) => k.startsWith("facebook_page") || ["instagram", "tiktok", "youtube", "zalo_oa"].includes(k) },
  { title: "Quảng cáo", keys: (k) => k === "meta_ads" },
  { title: "AI & tri thức", keys: (k) => AI_ORDER.includes(k) },
  { title: "Website & email", keys: (k) => k === "website" || k === "email_provider" },
];

export function IntegrationsPanel() {
  const all = listIntegrationStatus();
  // Fanpage phụ: hiện trang đã dùng + MỘT ô "Thêm fanpage" (thay vì 3 dòng trống)
  const extra = all.filter((i) => /^facebook_page_\d+$/.test(i.key));
  const used = new Set(extra.filter((i) => i.connected || i.lastCheckedAt).map((i) => i.key));
  const nextFree = extra.find((i) => !used.has(i.key))?.key;
  // Fanpage phụ nằm TRONG mục Facebook Page (trang đã dùng + một ô "Thêm fanpage"), không thành dòng riêng
  const extraShown = extra.filter((i) => used.has(i.key) || i.key === nextFree);
  const integrations = all.filter((i) => !/^facebook_page_\d+$/.test(i.key));
  const groups = [...SECTIONS, { title: "Khác", keys: (k: string) => !SECTIONS.some((g) => g.keys(k)) }]
    .map((g) => ({ title: g.title, items: integrations.filter((i) => g.keys(i.key)).sort((a, b) => AI_ORDER.indexOf(a.key) - AI_ORDER.indexOf(b.key)) }))
    .filter((g) => g.items.length > 0);
  return (
    <Panel id="integrations">
      <PanelHeader
        title="Kết nối"
        sub="Dán API, bấm Lưu"
        icon={Plug}
        tone="blue"
        info="Bấm vào nền tảng, dán API rồi Lưu — hệ thống tự kiểm tra. Khoá được mã hoá."
        tags={<Pill tone="jade"><Lock size={11} aria-hidden />Mã hoá</Pill>}
      />
      <SettingList>
        {groups.map((g) => (
          <div key={g.title}>
            <SettingSection title={g.title} />
            {g.items.map((i) => <IntegrationItem key={i.key} i={i} extras={i.key === "facebook_page" ? extraShown : []} nextFree={nextFree} />)}
          </div>
        ))}
      </SettingList>
    </Panel>
  );
}

type IntegrationRow = ReturnType<typeof listIntegrationStatus>[number];

function statusBadge(i: IntegrationRow) {
  const connector = connectorFor(i.key);
  const hasKey = Object.keys(maskedIntegrationConfig(i.key)).length > 0;
  return i.connected ? (
    <Pill tone="jade">Đã kết nối{i.account ? ` · ${i.account}` : ""}</Pill>
  ) : connector?.pending || i.lastError === STALE_CLAUDE_NOTE ? (
    hasKey ? <Pill tone="jade">Đã lưu khoá</Pill> : <Pill>Chưa kết nối</Pill>
  ) : i.lastCheckOk === false ? (
    <Pill tone="brick">Lỗi</Pill>
  ) : (
    <Pill>Chưa kết nối</Pill>
  );
}

function IntegrationItem({ i, extras, nextFree }: { i: IntegrationRow; extras: IntegrationRow[]; nextFree?: string }) {
  const more = extras.filter((x) => x.key !== nextFree);
  const add = extras.find((x) => x.key === nextFree);
  return (
    <SettingItem id={i.key} title={i.name} badge={statusBadge(i)} summary={more.length ? `+ ${more.length} fanpage` : undefined} {...itemLook(i.key)} action={i.connected ? "Sửa" : "Kết nối"}>
      <IntegrationBody i={i} />
      {more.map((x) => (
        <div key={x.key} id={x.key} className="grid scroll-mt-20 gap-2 rounded-md border border-border p-3">
          <div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-ink">{x.name}</span>{statusBadge(x)}</div>
          <IntegrationBody i={x} />
        </div>
      ))}
      {add && (
        <details key={add.key} id={add.key} className="group/add scroll-mt-20 rounded-md border border-dashed border-border-2">
          <summary className="cursor-pointer list-none px-3 py-2 text-[12.5px] font-semibold text-jade [&::-webkit-details-marker]:hidden">+ Thêm fanpage</summary>
          <div className="grid gap-2 px-3 pb-3"><IntegrationBody i={add} /></div>
        </details>
      )}
    </SettingItem>
  );
}

function IntegrationBody({ i }: { i: IntegrationRow }) {
  const base = publicBaseUrl();
  const connector = connectorFor(i.key);
  const fields = connector?.fields ?? [];
  const pk = PRIMARY[i.key.startsWith("facebook_page") ? "facebook_page" : i.key] ?? fields.filter((f) => f.secret).map((f) => f.key);
  const primary = fields.filter((f) => pk.includes(f.key));
  const more = fields.filter((f) => !pk.includes(f.key));
  const masked = maskedIntegrationConfig(i.key);
  return (
    <>
      {connector?.pending && (
        <div className="flex items-center gap-1.5">
          <Pill tone="amber"><Clock size={11} aria-hidden />Mở sau</Pill>
          <InfoTip label="Vì sao mở sau">Có thể lưu khoá trước — kết nối thật với nền tảng này sẽ được mở sau. {connector.pending}</InfoTip>
        </div>
      )}
      {!i.connected && !connector?.pending && i.lastError && i.lastError !== STALE_CLAUDE_NOTE && <FormNotice tone="error">{i.lastError}</FormNotice>}
      <form action={saveIntegration} className="grid gap-2">
        <input type="hidden" name="key" value={i.key} />
        <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto] md:items-center">
          {primary.map((f) => (
            <input key={f.key} name={`cfg.${f.key}`} type={f.secret ? "password" : "text"} aria-label={f.label} defaultValue={f.secret ? "" : masked[f.key] ?? ""} placeholder={masked[f.key] ? `${f.label}: đã có ${masked[f.key]}` : f.label} className={inputClass} autoComplete={f.secret ? "new-password" : "off"} data-1p-ignore data-lpignore="true" />
          ))}
          {primary.length === 1 && <span className="hidden md:block" />}
          <SubmitButton pendingText="Đang kiểm tra…">Lưu</SubmitButton>
        </div>
        {(more.length > 0 || i.key === "facebook_page" || i.key === "website" || i.connected) && (
          <MoreOptions label="Thêm thông tin">
            <div className="grid gap-2 md:grid-cols-2">
              <Field label="Tên hiển thị"><input name="account" defaultValue={i.account ?? ""} className={inputClass} /></Field>
              {more.map((f) => (
                <Field key={f.key} label={f.label} hint={f.hint}>
                  <input name={`cfg.${f.key}`} type={f.secret ? "password" : "text"} defaultValue={f.secret ? "" : masked[f.key] ?? ""} placeholder={masked[f.key] ? `đã có ${masked[f.key]}` : ""} className={inputClass} autoComplete={f.secret ? "new-password" : "off"} data-1p-ignore data-lpignore="true" />
                </Field>
              ))}
              {i.key === "facebook_page" && (
                <div className="md:col-span-2">
                  <FormNotice tone="info">Webhook Messenger: <code className="text-ink">{base}/api/webhooks/meta</code> · Verify Token <code className="text-ink">{getMetaVerifyToken()}</code></FormNotice>
                </div>
              )}
              {i.key === "website" && (
                <div className="md:col-span-2">
                  <FormNotice tone="info">Lead từ website: POST <code className="text-ink">{base}/api/webhooks/lead</code> · header <code className="text-ink">x-baor-key: {getLeadWebhookKey()}</code></FormNotice>
                </div>
              )}
            </div>
          </MoreOptions>
        )}
      </form>
      {(i.connected || i.lastCheckedAt) && (
        <form action={disconnectIntegration}>
          <input type="hidden" name="key" value={i.key} />
          <Button variant="ghost" type="submit">Ngắt kết nối</Button>
        </form>
      )}
    </>
  );
}

// Cài đặt › Đội AI: tổng chi AI (hôm nay / tháng) + trần chung. Từng lần gọi AI xem ở Báo cáo › Chi phí AI.
export function AiBudgetPanel() {
  const b = getAiBudget();
  const pct = b.dailyCapVnd ? Math.min(100, Math.round((b.spentTodayVnd / b.dailyCapVnd) * 100)) : 0;
  const pctMonth = b.monthlyCapVnd ? Math.min(100, Math.round((b.spentMonthVnd / b.monthlyCapVnd) * 100)) : 0;
  return (
    <Panel id="ai">
      <PanelHeader
        title="Chi tiêu AI"
        sub="Chạm trần thì AI tạm dừng"
        icon={Wallet}
        tone="violet"
        info="Tổng tiền gọi AI. Chạm trần thì AI tạm dừng tới ngày / tháng sau. Tỷ giá dùng để quy đổi giá hãng AI (USD) sang đồng."
        action={<Link href="/insights/learning?tab=so-lieu&view=ai" className="text-[12.5px] font-semibold text-jade">Chi tiết ›</Link>}
      />
      <div className="grid gap-4 p-4 md:grid-cols-[1fr_auto] md:items-end">
        <dl className="m-0 grid grid-cols-2 gap-3">
          <div><dt className="lbl">Hôm nay</dt><dd className={cn("num m-0 mt-0.5 text-[20px] font-bold", pct >= 100 ? "text-brick" : pct >= 80 ? "text-amber" : "text-ink")}>{formatCurrency(b.spentTodayVnd)}</dd><dd className="m-0 text-[11.5px] text-ink-3">{b.callsToday} lần gọi · {pct}% trần ngày</dd></div>
          <div><dt className="lbl">Tháng này</dt><dd className={cn("num m-0 mt-0.5 text-[20px] font-bold", pctMonth >= 100 ? "text-brick" : pctMonth >= 80 ? "text-amber" : "text-ink")}>{formatCurrency(b.spentMonthVnd)}</dd><dd className="m-0 text-[11.5px] text-ink-3">{pctMonth}% trần tháng {formatCurrency(b.monthlyCapVnd)}</dd></div>
        </dl>
        <form action={saveAiBudget} className="flex flex-wrap items-end gap-2">
          <Field label="Trần / ngày"><VndCapInput name="dailyCapVnd" defaultValue={b.dailyCapVnd} rate={vndPerUsd()} emptyHint="0 = dừng mọi AI" className="w-[130px]" /></Field>
          <Field label="Trần / tháng"><VndCapInput name="monthlyCapVnd" defaultValue={b.monthlyCapVnd} rate={vndPerUsd()} emptyHint="0 = dừng mọi AI" className="w-[140px]" /></Field>
          <Field label="Tỷ giá"><WithUnit unit="₫/USD"><input name="vndPerUsd" inputMode="numeric" defaultValue={vndPerUsd()} className={`${inputClass} w-[130px] pr-14`} /></WithUnit></Field>
          <SubmitButton>Lưu</SubmitButton>
        </form>
      </div>
    </Panel>
  );
}

// Cài đặt › Nhật ký hệ thống: bộ chạy nền, nhật ký đồng bộ, quyết định luật / AI.
export function SystemLogPanel() {
  const s = schedulerState();
  const runs = listRuns(12);
  const decisions = listDecisions(12);
  return (
    <Panel id="syslog">
      <PanelHeader
        title="Nhật ký hệ thống"
        icon={ScrollText}
        tone="slate"
        sub={s.running ? `Lần chạy nền gần nhất: ${s.lastTickAt ? formatDateTime(s.lastTickAt) : "chưa có"}` : undefined}
        tags={s.running ? <Pill tone="jade">Chạy nền bật</Pill> : <Pill tone="amber">Chạy nền tắt</Pill>}
        action={
          <form action={runBackgroundNow}>
            <SubmitButton variant="soft" pendingText="Đang chạy…">Chạy ngay</SubmitButton>
          </form>
        }
      />
      <div className="border-t border-border px-4 py-3">
      <MoreOptions label={`Xem nhật ký (${runs.length} đồng bộ · ${decisions.length} quyết định)`}>
      <div className="grid rounded-md border border-border md:grid-cols-2">
        <div className="border-b border-border md:border-b-0 md:border-r">
          <h3 className="px-4 pt-3 text-[11.5px] font-semibold uppercase tracking-wide text-ink-3">Đồng bộ và webhook</h3>
          {runs.length === 0 ? (
            <p className="px-4 py-3 text-[12.5px] text-ink-2">Chưa có lần chạy nào.</p>
          ) : (
            <ul className="m-0 list-none p-0">
              {runs.map((r) => (
                <li key={r.id} className="border-b border-border px-4 py-2 text-[12px] last:border-b-0">
                  <div className="flex items-center gap-2"><Pill tone={r.ok ? "jade" : r.finishedAt ? "brick" : "amber"}>{r.kind}</Pill><span className="font-medium text-ink">{r.integrationKey}</span><span className="num ml-auto text-ink-3">{formatDateTime(r.startedAt)}</span></div>
                  <div className="mt-0.5 text-ink-2">{r.message}{r.items ? ` · ${r.items} mục` : ""}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="px-4 pt-3 text-[11.5px] font-semibold uppercase tracking-wide text-ink-3">Quyết định luật / AI</h3>
          {decisions.length === 0 ? (
            <p className="px-4 py-3 text-[12.5px] text-ink-2">Chưa có quyết định nào.</p>
          ) : (
            <ul className="m-0 list-none p-0">
              {decisions.map((d) => (
                <li key={d.id} className="border-b border-border px-4 py-2 text-[12px] last:border-b-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone={d.lane === "ai" ? "amber" : "jade"}>{laneLabel[d.lane]}</Pill>
                    <span className="text-ink-3">{domainLabel[d.domain]}</span>
                    <span className="font-medium text-ink">{d.subject}</span>
                    <span className="num ml-auto text-ink-3">{formatDateTime(d.at)}</span>
                  </div>
                  <div className="mt-0.5 text-ink-2">{d.outcome}{d.reason ? ` · ${d.reason}` : ""}{d.confidence !== undefined ? ` · tin cậy ${d.confidence}%` : ""}{d.needsApproval ? " · cần người duyệt" : ""}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      </MoreOptions>
      </div>
    </Panel>
  );
}
