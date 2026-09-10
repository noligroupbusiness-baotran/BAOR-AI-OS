import Link from "next/link";
import { Breadcrumb, ModuleGroups } from "@/components/shell/module-page";
import { PageHead, Panel, PanelHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Button, LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Segment } from "@/components/ui/segment";
import { Field, FormNotice, inputClass } from "@/components/ui/field";
import { SubmitButton } from "@/components/campaigns/submit-button";
import { ConfirmAction } from "@/components/campaigns/confirm-action";
import { listRules, listRuns, listFaqs } from "@/lib/automation/repository";
import { evaluateMessage } from "@/lib/automation/engine";
import { actionLabel, matchLabel, ruleStatusLabel, triggerLabel, type Action, type Rule, type RuleStatus, type Trigger } from "@/lib/automation/types";
import { deleteRuleAction, saveRuleAction, setRuleStatusAction } from "@/lib/actions/automation";
import { campaignRepo } from "@/lib/campaigns/repository";
import { formatDateTime, cn } from "@/lib/format";

export const metadata = { title: "Automation – BAOR AI OS" };

const tabs: { key: RuleStatus | "all" | "runs"; label: string }[] = [
  { key: "all", label: "Tất cả" },
  { key: "active", label: "Đang hoạt động" },
  { key: "draft", label: "Bản nháp" },
  { key: "paused", label: "Tạm dừng" },
  { key: "error", label: "Lỗi cần xử lý" },
  { key: "runs", label: "Lịch sử chạy" },
];

const stagesAll = [["new", "Mới"], ["contacted", "Đã liên hệ"], ["qualified", "Tiềm năng"], ["won", "Đã mua"], ["lost", "Không mua"]] as const;

export default async function AutomationPage({ searchParams }: { searchParams: Promise<{ tab?: string; add?: string; edit?: string; test?: string }> }) {
  const sp = await searchParams;
  const tab = tabs.some((t) => t.key === sp.tab) ? (sp.tab as (typeof tabs)[number]["key"]) : "all";
  const rules = listRules();
  const list = tab === "all" || tab === "runs" ? rules : rules.filter((r) => r.status === tab);
  const runs = listRuns(40);
  const editing = sp.edit ? rules.find((r) => r.id === sp.edit) : undefined;
  const showForm = sp.add === "1" || !!editing;
  const campaigns = campaignRepo.list().filter((c) => c.status !== "ended");
  const faqCount = listFaqs().length;
  const count = (s: RuleStatus) => rules.filter((r) => r.status === s).length;
  const test = sp.test?.trim() ? evaluateMessage(sp.test.trim(), { dryRun: true }) : null;

  return (
    <>
      <Breadcrumb items={[{ label: "Điều hành", href: "/dashboard" }, { label: "Automation" }]} />
      <PageHead
        title="Automation"
        sub="Quy tắc “khi X thì Y” chạy trên bộ định tuyến: có dữ liệu và công thức thì làm ngay, không gọi AI. Hành động tiêu tiền hay xuất bản luôn tạo yêu cầu chờ người duyệt."
        action={showForm ? undefined : <LinkButton href="/automation?add=1" variant="primary" size="md">Tạo quy tắc</LinkButton>}
      />

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        {(["active", "draft", "paused", "error"] as RuleStatus[]).map((s) => (
          <Link key={s} href={`/automation?tab=${s}`} className="card px-3.5 py-2.5 transition-colors hover:border-ink-3 hover:bg-ground-2">
            <div className="text-[12px] font-medium text-ink-2">{ruleStatusLabel[s].label}</div>
            <div className={cn("num text-[20px] font-bold leading-tight", s === "error" && count(s) ? "text-brick" : "text-ink")}>{count(s)}</div>
          </Link>
        ))}
      </div>

      {showForm && <RuleForm rule={editing} campaigns={campaigns.map((c) => ({ id: c.id, name: c.name }))} />}

      {/* Thử quy tắc với một tin nhắn: chạy khô, không ghi gì */}
      <Panel>
        <PanelHeader title="Thử với một tin nhắn" sub={`Xem quy tắc nào sẽ xử lý tin nhắn này (chạy thử, không ghi). Kho FAQ hiện có ${faqCount} câu chuẩn.`} />
        <form method="get" action="/automation" className="flex flex-wrap items-end gap-2 px-4 py-3">
          <input type="hidden" name="tab" value={tab} />
          <Field label="Tin nhắn của khách" className="min-w-[260px] flex-1"><input name="test" defaultValue={sp.test ?? ""} className={inputClass} placeholder="VD: Bên mình mở cửa mấy giờ? Cho mình xin giá gội nhé 0909123456" /></Field>
          <Button type="submit" variant="soft" size="md">Chạy thử</Button>
        </form>
        {test && (
          <div className="border-t border-border px-4 py-3 text-[12.5px]">
            {test.matched.length === 0 ? (
              <FormNotice tone="warn">Không quy tắc nào khớp. Hệ thống sẽ chuyển người xử lý và để AI gợi ý câu trả lời (làn AI, cần duyệt).</FormNotice>
            ) : (
              <ul className="space-y-1.5">
                {test.matched.map((m) => (
                  <li key={m.rule.id} className="flex flex-wrap items-center gap-2"><Pill tone="jade">Theo luật</Pill><span className="font-semibold text-ink">{m.rule.name}</span><span className="text-ink-2">{m.reason}</span></li>
                ))}
              </ul>
            )}
            {test.autoReply && <p className="mt-2 rounded-md bg-jade-soft/40 px-3 py-2 text-ink"><b>Trả lời tự động:</b> {test.autoReply}</p>}
            <p className="mt-2 text-ink-2">Kết quả: {test.needsHuman ? "chuyển người xử lý" : "không cần người"}{test.stage ? ` · giai đoạn → ${test.stage}` : ""}{test.tags.length ? ` · nhãn: ${test.tags.join(", ")}` : ""}{test.fallbackAi ? " · AI gợi ý (cần duyệt)" : ""}.</p>
          </div>
        )}
      </Panel>

      <div className="mt-3.5 overflow-x-auto">
        <Segment basePath="/automation" active={tab} items={tabs.map((t) => ({ key: t.key, label: t.key === "all" ? `${t.label} · ${rules.length}` : t.key === "runs" ? `${t.label} · ${runs.length}` : `${t.label} · ${count(t.key as RuleStatus)}` }))} />
      </div>

      {tab === "runs" ? (
        <Panel>
          <PanelHeader title="Lịch sử chạy" sub="Mỗi lần quy tắc khớp và hành động. Lỗi làm quy tắc tự chuyển sang “Lỗi cần xử lý”." />
          {runs.length === 0 ? (
            <EmptyState title="Chưa có lần chạy nào" hint="Quy tắc chạy khi có tin nhắn, lead mới (webhook) hoặc theo lịch mỗi giờ." />
          ) : (
            <ul className="m-0 list-none p-0">
              {runs.map((r) => (
                <li key={r.id} className="border-b border-border px-4 py-2 text-[12.5px] last:border-b-0">
                  <div className="flex flex-wrap items-center gap-2"><Pill tone={r.ok ? "jade" : "brick"}>{r.ok ? "Đã chạy" : "Lỗi"}</Pill><span className="font-semibold text-ink">{r.ruleName}</span>{r.entityType && <span className="text-ink-3">{r.entityType} {r.entityId}</span>}<span className="num ml-auto text-ink-3">{formatDateTime(r.at)}</span></div>
                  <div className="mt-0.5 text-ink-2">{r.message}</div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : (
        <Panel>
          <PanelHeader title={tabs.find((t) => t.key === tab)?.label ?? "Quy tắc"} sub="Thứ tự ưu tiên nhỏ chạy trước. Quy tắc tin nhắn dừng ở hành động trả lời hoặc chuyển người đầu tiên khớp." />
          {list.length === 0 ? (
            <EmptyState title="Chưa có quy tắc ở mục này" action={<LinkButton href="/automation?add=1" variant="primary">Tạo quy tắc</LinkButton>} />
          ) : (
            <ul className="m-0 list-none p-0">
              {list.map((r) => {
                const st = ruleStatusLabel[r.status];
                return (
                  <li key={r.id} className={cn("grid gap-3 border-b border-border px-4 py-3 last:border-b-0 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center", editing?.id === r.id && "bg-jade-soft/20")}>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="num text-[11px] text-ink-3">#{r.priority}</span>
                        <span className="text-[13.5px] font-semibold text-ink">{r.name}</span>
                        <Pill tone={st.tone}>{st.label}</Pill>
                        {r.requiresApproval && <Pill tone="amber">cần người duyệt</Pill>}
                        {r.campaignId && <Pill tone="jade">{campaigns.find((c) => c.id === r.campaignId)?.name ?? r.campaignId}</Pill>}
                      </div>
                      <div className="mt-1 text-[12.5px] text-ink">
                        <b>Khi</b> {triggerLabel[r.trigger].label.toLowerCase()}{describeCondition(r)} <b>thì</b> {actionLabel[r.action].label.toLowerCase()}{describeParams(r)}.
                      </div>
                      <div className="mt-0.5 text-[12px] text-ink-2">{r.description || triggerLabel[r.trigger].hint} · <span className="num">{r.runs} lần chạy{r.lastRunAt ? ` · gần nhất ${formatDateTime(r.lastRunAt)}` : ""}</span>{r.lastError ? <span className="text-brick"> · {r.lastError}</span> : null}</div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 lg:justify-end">
                      {editing?.id !== r.id && <LinkButton href={`/automation?edit=${r.id}`}>Sửa</LinkButton>}
                      {r.status !== "active" && (
                        <form action={setRuleStatusAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="status" value="active" /><SubmitButton variant="primary">Bật</SubmitButton></form>
                      )}
                      {r.status === "active" && (
                        <form action={setRuleStatusAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="status" value="paused" /><SubmitButton variant="outline">Tạm dừng</SubmitButton></form>
                      )}
                      <ConfirmAction action={deleteRuleAction} fields={{ id: r.id }} label="Xóa" title={`Xóa quy tắc “${r.name}”?`} message="Xóa cả lịch sử chạy của quy tắc này. Cần quyền Quản trị." confirmLabel="Xóa" variant="ghost" danger />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      )}
      <ModuleGroups moduleKey="automation" />
    </>
  );
}

function describeCondition(r: Rule): string {
  const c = r.condition;
  switch (r.trigger) {
    case "message_received":
      return c.match ? ` (${matchLabel[c.match].toLowerCase()}${c.match === "keyword" && c.keyword ? ` “${c.keyword}”` : ""})` : "";
    case "lead_stale":
      return ` (${c.hours ?? 24} giờ${c.stages?.length ? `, giai đoạn ${c.stages.join("/")}` : ""})`;
    case "lead_created":
      return c.stages?.length ? ` (giai đoạn ${c.stages.join("/")})` : "";
    case "post_engagement_high":
      return ` (≥ ${c.engagementRate ?? 3}% tương tác)`;
    case "campaign_behind":
      return ` (chậm ≥ ${c.behindPct ?? 20} điểm)`;
    case "ad_cpl_high":
      return c.cplAbove ? ` (CPL > ${c.cplAbove.toLocaleString("vi-VN")} ₫)` : " (theo hạn mức)";
  }
}

function describeParams(r: Rule): string {
  const p = r.params;
  if (r.action === "set_stage" && p.stage) return ` → ${stagesAll.find((s) => s[0] === p.stage)?.[1] ?? p.stage}`;
  if (r.action === "tag_lead" && p.tag) return ` “${p.tag}”`;
  if (r.action === "propose_ad") return ` ${(p.dailyBudget ?? 150000).toLocaleString("vi-VN")} ₫/ngày`;
  if ((r.action === "notify" || r.action === "request_approval") && p.message) return `: “${p.message}”`;
  return "";
}

function RuleForm({ rule, campaigns }: { rule?: Rule; campaigns: { id: string; name: string }[] }) {
  const c = rule?.condition ?? {};
  const p = rule?.params ?? {};
  return (
    <Panel>
      <PanelHeader title={rule ? `Sửa quy tắc “${rule.name}”` : "Quy tắc mới"} sub="Chọn điều kiện kích hoạt và hành động. Trường nào không áp dụng cho lựa chọn của bạn thì để trống." />
      <form action={saveRuleAction} className="grid gap-3 p-4 md:grid-cols-2">
        {rule && <input type="hidden" name="id" value={rule.id} />}
        <Field label="Tên quy tắc" required className="md:col-span-2"><input name="name" required defaultValue={rule?.name ?? ""} className={inputClass} placeholder="VD: Hỏi giá → trả lời bảng giá" /></Field>
        <Field label="Khi (điều kiện kích hoạt)" required>
          <select name="trigger" defaultValue={rule?.trigger ?? "message_received"} className={inputClass}>
            {(Object.keys(triggerLabel) as Trigger[]).map((t) => <option key={t} value={t}>{triggerLabel[t].label}</option>)}
          </select>
        </Field>
        <Field label="Thì (hành động)" required>
          <select name="action" defaultValue={rule?.action ?? "mark_needs_human"} className={inputClass}>
            {(Object.keys(actionLabel) as Action[]).map((a) => <option key={a} value={a}>{actionLabel[a].label}{actionLabel[a].spends ? " (cần duyệt)" : ""}</option>)}
          </select>
        </Field>

        <div className="grid gap-3 rounded-md border border-border p-3 md:col-span-2 md:grid-cols-3">
          <div className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-3 md:col-span-3">Chi tiết điều kiện</div>
          <Field label="Tin nhắn: cách khớp">
            <select name="match" defaultValue={c.match ?? "any"} className={inputClass}>
              {(Object.keys(matchLabel) as NonNullable<typeof c.match>[]).map((m) => <option key={m} value={m}>{matchLabel[m]}</option>)}
            </select>
          </Field>
          <Field label="Từ khóa (khi chọn “Chứa từ khóa”)"><input name="keyword" defaultValue={c.keyword ?? ""} className={inputClass} placeholder="VD: bảo hành" /></Field>
          <Field label="Lead không tương tác quá (giờ)"><input name="hours" inputMode="numeric" defaultValue={c.hours ?? ""} className={inputClass} placeholder="24" /></Field>
          <div>
            <span className="lbl">Giai đoạn lead áp dụng</span>
            <div className="mt-1.5 flex flex-wrap gap-2 text-[12.5px]">
              {stagesAll.map(([v, l]) => (
                <label key={v} className="flex items-center gap-1.5"><input type="checkbox" name="stages" value={v} defaultChecked={c.stages?.includes(v) ?? false} className="accent-[var(--jade)]" />{l}</label>
              ))}
            </div>
          </div>
          <Field label="Tương tác tối thiểu (%)"><input name="engagementRate" defaultValue={c.engagementRate ?? ""} className={inputClass} placeholder="3" /></Field>
          <Field label="Chậm tiến độ (điểm %)"><input name="behindPct" inputMode="numeric" defaultValue={c.behindPct ?? ""} className={inputClass} placeholder="20" /></Field>
          <Field label="CPL vượt (₫, trống = hạn mức)"><input name="cplAbove" inputMode="numeric" defaultValue={c.cplAbove ?? ""} className={inputClass} /></Field>
        </div>

        <div className="grid gap-3 rounded-md border border-border p-3 md:col-span-2 md:grid-cols-3">
          <div className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-3 md:col-span-3">Chi tiết hành động</div>
          <Field label="Đổi giai đoạn thành">
            <select name="stage" defaultValue={p.stage ?? "contacted"} className={inputClass}>
              {stagesAll.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <Field label="Nhãn gắn cho lead"><input name="tag" defaultValue={p.tag ?? ""} className={inputClass} placeholder="VD: cần chăm sóc" /></Field>
          <Field label="Ngân sách đề xuất (₫/ngày)"><input name="dailyBudget" inputMode="numeric" defaultValue={p.dailyBudget ?? ""} className={inputClass} placeholder="150000" /></Field>
          <Field label="Nội dung thông báo / yêu cầu" className="md:col-span-3"><input name="message" defaultValue={p.message ?? ""} className={inputClass} placeholder="VD: Xem lại ngân sách kênh này" /></Field>
        </div>

        <Field label="Thứ tự ưu tiên (nhỏ chạy trước)"><input name="priority" inputMode="numeric" defaultValue={rule?.priority ?? 100} className={inputClass} /></Field>
        <Field label="Chỉ áp dụng cho chiến dịch">
          <select name="campaignId" defaultValue={rule?.campaignId ?? ""} className={inputClass}>
            <option value="">Mọi chiến dịch</option>
            {campaigns.map((cp) => <option key={cp.id} value={cp.id}>{cp.name}</option>)}
          </select>
        </Field>
        <label className="flex items-center gap-2 text-[12.5px] text-ink md:col-span-2">
          <input type="checkbox" name="requiresApproval" value="1" defaultChecked={rule?.requiresApproval ?? false} className="accent-[var(--jade)]" />
          Kết quả của quy tắc này cần người duyệt trước khi có hiệu lực (hành động tiêu tiền luôn bật)
        </label>
        <Field label="Mô tả" className="md:col-span-2"><input name="description" defaultValue={rule?.description ?? ""} className={inputClass} /></Field>
        <div className="flex gap-2 md:col-span-2">
          <SubmitButton pendingText="Đang lưu…">{rule ? "Lưu quy tắc" : "Tạo quy tắc (bản nháp)"}</SubmitButton>
          <LinkButton href="/automation" variant="ghost">Hủy</LinkButton>
        </div>
      </form>
    </Panel>
  );
}
