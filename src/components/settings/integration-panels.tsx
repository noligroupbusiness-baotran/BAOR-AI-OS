import { Panel, PanelHeader, Rows } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { Field, FormNotice, inputClass } from "@/components/ui/field";
import { SubmitButton } from "@/components/campaigns/submit-button";
import { listIntegrationStatus, listRuns, maskedIntegrationConfig } from "@/lib/connectors/config";
import { connectorFor } from "@/lib/connectors/registry";
import { disconnectIntegration, runBackgroundNow, saveAiBudget, saveIntegration } from "@/lib/actions/settings";
import { domainLabel, getAiBudget, laneLabel, listAiCalls, listDecisions } from "@/lib/router";
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
  instagram: ["igUserId"],
  tiktok: ["accessToken"],
  youtube: ["accessToken"],
  zalo_oa: ["accessToken"],
  email_provider: ["smtpUrl"],
  website: ["siteUrl"],
};

export function IntegrationsPanel() {
  const integrations = listIntegrationStatus();
  const base = publicBaseUrl();
  return (
    <Panel id="integrations">
      <PanelHeader title="Kết nối API" sub="Dán khoá rồi bấm Lưu — hệ thống tự kiểm tra. Khoá được mã hoá, không hiện lại." />
      <Rows>
        {integrations.map((i) => {
          const connector = connectorFor(i.key);
          const fields = connector?.fields ?? [];
          const pk = PRIMARY[i.key.startsWith("facebook_page") ? "facebook_page" : i.key] ?? fields.filter((f) => f.secret).map((f) => f.key);
          const primary = fields.filter((f) => pk.includes(f.key));
          const more = fields.filter((f) => !pk.includes(f.key));
          const masked = maskedIntegrationConfig(i.key);
          return (
            <li key={i.key} id={i.key} className="scroll-mt-20 px-4 py-3">
              <form action={saveIntegration} className="grid gap-2">
                <input type="hidden" name="key" value={i.key} />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-ink">{i.name}</span>
                  {i.connected ? <Pill tone="jade">Đã kết nối{i.account ? ` · ${i.account}` : ""}</Pill> : i.lastCheckOk === false ? <Pill tone="brick">Lỗi</Pill> : <Pill>Chưa kết nối</Pill>}
                  {!i.connected && i.lastError && <span className="truncate text-[11.5px] text-brick">{i.lastError}</span>}
                </div>
                <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto] md:items-center">
                  {primary.map((f) => (
                    <input key={f.key} name={`cfg.${f.key}`} type={f.secret ? "password" : "text"} aria-label={f.label} defaultValue={f.secret ? "" : masked[f.key] ?? ""} placeholder={masked[f.key] ? `${f.label}: đã có ${masked[f.key]}` : f.label} className={inputClass} autoComplete={f.secret ? "new-password" : "off"} data-1p-ignore data-lpignore="true" />
                  ))}
                  {primary.length === 1 && <span className="hidden md:block" />}
                  <SubmitButton pendingText="Đang kiểm tra…">Lưu</SubmitButton>
                </div>
                {(more.length > 0 || i.key === "facebook_page" || i.key === "website" || i.connected) && (
                  <details className="text-[12.5px]">
                    <summary className="cursor-pointer text-ink-3">Thêm</summary>
                    <div className="mt-2 grid gap-2 md:grid-cols-2">
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
                  </details>
                )}
              </form>
              {(i.connected || i.lastCheckedAt) && (
                <form action={disconnectIntegration} className="mt-1">
                  <input type="hidden" name="key" value={i.key} />
                  <Button variant="ghost" type="submit">Ngắt kết nối</Button>
                </form>
              )}
            </li>
          );
        })}
      </Rows>
    </Panel>
  );
}

// Cài đặt › AI Agent: trần chi phí và sổ gọi AI.
export function AiBudgetPanel() {
  const b = getAiBudget();
  const calls = listAiCalls(8);
  const pct = b.dailyCapVnd ? Math.min(100, Math.round((b.spentTodayVnd / b.dailyCapVnd) * 100)) : 0;
  return (
    <Panel id="ai">
      <PanelHeader title="Trần chi phí AI" sub="Mọi lần gọi Claude đều ghi sổ. Chạm trần thì hệ thống từ chối gọi AI cho tới ngày / tháng sau." />
      <div className="grid gap-3 p-4 md:grid-cols-[1fr_auto] md:items-end">
        <dl className="grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-4">
          <div><dt className="lbl">Hôm nay</dt><dd className={cn("num mt-0.5 font-bold", pct >= 100 ? "text-brick" : pct >= 80 ? "text-amber" : "text-ink")}>{formatCurrency(b.spentTodayVnd)}</dd><dd className="text-[11.5px] text-ink-3">{b.callsToday} lần gọi · {pct}% trần ngày</dd></div>
          <div><dt className="lbl">Tháng này</dt><dd className="num mt-0.5 font-bold text-ink">{formatCurrency(b.spentMonthVnd)}</dd><dd className="text-[11.5px] text-ink-3">trần {formatCurrency(b.monthlyCapVnd)}</dd></div>
        </dl>
        <form action={saveAiBudget} className="flex flex-wrap items-end gap-2">
          <Field label="Trần / ngày (₫)"><input name="dailyCapVnd" inputMode="numeric" defaultValue={b.dailyCapVnd} className={`${inputClass} w-[130px]`} /></Field>
          <Field label="Trần / tháng (₫)"><input name="monthlyCapVnd" inputMode="numeric" defaultValue={b.monthlyCapVnd} className={`${inputClass} w-[140px]`} /></Field>
          <SubmitButton>Lưu trần</SubmitButton>
        </form>
      </div>
      {calls.length > 0 && (
        <ul className="m-0 list-none border-t border-border p-0">
          {calls.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 border-b border-border px-4 py-2 text-[12px] last:border-b-0">
              <span className="num text-ink-3">{formatDateTime(c.at)}</span>
              <span className="font-medium text-ink">{c.purpose}</span>
              <span className="text-ink-2">{c.model}</span>
              <span className="num text-ink-2">{c.inputTokens}/{c.outputTokens} token</span>
              <span className="num ml-auto font-semibold text-ink">{formatCurrency(c.costVnd)}</span>
              {!c.ok && <Pill tone="brick">{c.error ?? "lỗi"}</Pill>}
            </li>
          ))}
        </ul>
      )}
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
        sub={s.running ? `Bộ chạy nền đang hoạt động · lần chạy ${s.lastTickAt ? formatDateTime(s.lastTickAt) : "chưa có"}${s.lastResult ? ` · ${s.lastResult}` : ""}` : "Bộ chạy nền chưa khởi động trong tiến trình này."}
        action={
          <form action={runBackgroundNow}>
            <SubmitButton variant="soft" pendingText="Đang chạy…">Chạy ngay</SubmitButton>
          </form>
        }
      />
      <div className="grid md:grid-cols-2">
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
    </Panel>
  );
}
