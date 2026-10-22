"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { CHANNELS, METRICS, channelDef, channelLabel, executionLabel, metricLabel, metricUnit, type ChannelKey, type ExecutionType, type MetricKey } from "@/config/channels";
import { checkBudget, isValidDateRange } from "@/lib/campaigns/results";
import type { Person, PlatformAccount, Product } from "@/lib/campaigns/types";
import { createCampaignAction, type CreateCampaignState } from "@/lib/actions/campaigns";
import { Button } from "@/components/ui/button";
import { Field, FormNotice, inputClass, textareaClass } from "@/components/ui/field";
import { Pill } from "@/components/ui/pill";
import { formatCurrency, formatNumber, cn } from "@/lib/format";
import { SubmitButton } from "./submit-button";

// Biểu mẫu tạo chiến dịch 4 bước. Toàn bộ dữ liệu nằm ở state trình duyệt cho tới khi
// người dùng chọn "Lưu bản nháp" hoặc "Gửi phê duyệt" ở bước 4; máy chủ kiểm tra lại lần nữa.

interface GoalDraft {
  key: string;
  channel: ChannelKey;
  accountId: string;
  executionType: ExecutionType;
  objective: string;
  primaryMetric: MetricKey;
  targetValue: string;
  budget: string;
  ownerId: string;
  startDate: string;
  endDate: string;
}

interface Props {
  people: Person[];
  products: Product[];
  accounts: PlatformAccount[];
  idem: string;
  defaultStart: string;
  defaultEnd: string;
}

const STEPS = ["Thông tin chung", "Thời gian và ngân sách", "Mục tiêu từng kênh", "Kiểm tra và xác nhận"];

const money = (s: string) => Number(String(s).replace(/[^\d]/g, "")) || 0;

const emptyGoal = (ownerId: string, start: string, end: string): GoalDraft => {
  const def = CHANNELS[0];
  return { key: `${Date.now()}`, channel: def.key, accountId: def.integrationKey ?? "", executionType: def.executionTypes[0], objective: "", primaryMetric: def.metrics[0], targetValue: "", budget: "", ownerId, startDate: start, endDate: end };
};

export function CampaignWizard({ people, products, accounts, idem, defaultStart, defaultEnd }: Props) {
  const [step, setStep] = useState(0);
  const [stepError, setStepError] = useState<string | null>(null);
  const [state, formAction] = useActionState<CreateCampaignState, FormData>(createCampaignAction, {});

  // Bước 1
  const [name, setName] = useState("");
  const [objective, setObjective] = useState("");
  const [targetMetric, setTargetMetric] = useState("");
  const [targetValue, setTargetValue] = useState("");
  const [description, setDescription] = useState("");
  const [productIds, setProductIds] = useState<string[]>([]);
  const [audience, setAudience] = useState("");
  const [location, setLocation] = useState("");
  const [ownerId, setOwnerId] = useState(people[0]?.id ?? "");
  // Bước 2
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [totalBudget, setTotalBudget] = useState("");
  const [budgetNote, setBudgetNote] = useState("");
  // Bước 3
  const [goals, setGoals] = useState<GoalDraft[]>([]);
  const [editing, setEditing] = useState<GoalDraft | null>(null);

  const budget = useMemo(() => checkBudget(money(totalBudget), goals.map((g) => ({ budget: money(g.budget) }))), [totalBudget, goals]);
  const connected = useMemo(() => Object.fromEntries(accounts.map((a) => [a.key, a])), [accounts]);

  const payload = useMemo(
    () =>
      JSON.stringify({
        name,
        objective,
        targetMetric,
        targetValue: targetValue === "" ? null : money(targetValue),
        description,
        productIds,
        audience,
        location,
        ownerId,
        startDate,
        endDate,
        totalBudget: money(totalBudget),
        budgetNote,
        goals: goals.map((g) => ({ ...g, targetValue: money(g.targetValue), budget: money(g.budget), accountId: g.accountId || null })),
      }),
    [name, objective, targetMetric, targetValue, description, productIds, audience, location, ownerId, startDate, endDate, totalBudget, budgetNote, goals],
  );

  const validateStep = (s: number): string | null => {
    if (s === 0) {
      if (!name.trim()) return "Cần nhập tên chiến dịch.";
      if (!objective.trim()) return "Cần nhập mục tiêu chung.";
      if (productIds.length === 0) return "Cần chọn ít nhất một sản phẩm hoặc dịch vụ.";
      if (!ownerId) return "Cần chọn người quản lý.";
    }
    if (s === 1) {
      if (!isValidDateRange(startDate, endDate)) return "Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.";
      if (money(totalBudget) < 0) return "Tổng ngân sách không hợp lệ.";
    }
    return null;
  };

  const next = () => {
    const err = validateStep(step);
    setStepError(err);
    if (!err) setStep((s) => Math.min(3, s + 1));
  };
  const back = () => {
    setStepError(null);
    setStep((s) => Math.max(0, s - 1));
  };

  const saveGoal = () => {
    if (!editing) return;
    if (!editing.objective.trim()) return setStepError("Mục tiêu kênh cần mô tả mục tiêu.");
    if (money(editing.targetValue) <= 0) return setStepError("Chỉ tiêu cần lớn hơn 0.");
    if (!editing.ownerId) return setStepError("Cần chọn người phụ trách mục tiêu kênh.");
    if (!isValidDateRange(editing.startDate, editing.endDate)) return setStepError("Thời gian mục tiêu kênh không hợp lệ.");
    setStepError(null);
    setGoals((list) => (list.some((g) => g.key === editing.key) ? list.map((g) => (g.key === editing.key ? editing : g)) : [...list, editing]));
    setEditing(null);
  };

  const onChannelChange = (channel: ChannelKey) => {
    if (!editing) return;
    const def = channelDef(channel);
    if (!def) return;
    setEditing({ ...editing, channel, accountId: def.integrationKey ?? "", executionType: def.executionTypes.includes(editing.executionType) ? editing.executionType : def.executionTypes[0], primaryMetric: def.metrics.includes(editing.primaryMetric) ? editing.primaryMetric : def.metrics[0] });
  };

  const canSubmit = goals.length > 0 && !budget.over;

  return (
    <form
      action={formAction}
      className="grid gap-3.5"
      // Enter trong ô nhập ở bước 1–3 không được gửi biểu mẫu (tránh lưu nháp ngoài ý muốn).
      onKeyDown={(e) => {
        if (e.key === "Enter" && step < 3 && (e.target as HTMLElement).tagName !== "TEXTAREA") e.preventDefault();
      }}
    >
      <input type="hidden" name="payload" value={payload} />
      <input type="hidden" name="idem" value={idem} />

      {/* Thanh bước */}
      <ol className="card flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5" aria-label="Các bước">
        {STEPS.map((label, i) => (
          <li key={label} className={cn("flex items-center gap-2 text-[12.5px]", i === step ? "font-semibold text-ink" : i < step ? "text-ink-2" : "text-ink-3")}>
            <span className={cn("num grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold", i < step ? "bg-jade text-white" : i === step ? "border border-jade text-jade" : "border border-border-2")} aria-hidden>
              {i < step ? <Check size={12} /> : i + 1}
            </span>
            <span className={cn(i !== step && "hidden sm:inline")}>{label}</span>
          </li>
        ))}
      </ol>

      {(stepError || state.error) && <FormNotice tone="error">{stepError ?? state.error}</FormNotice>}

      {/* Bước 1 */}
      {step === 0 && (
        <section className="card grid gap-3 p-4 md:grid-cols-2" aria-labelledby="s1">
          <h2 id="s1" className="text-[14px] font-bold text-ink md:col-span-2">Thông tin chung</h2>
          <Field label="Tên chiến dịch" required className="md:col-span-2">
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="VD: Thu hút khách mới cho Mộc Diệp Spa tháng 10" />
          </Field>
          <Field label="Mục tiêu chung" required className="md:col-span-2" hint="Một câu nói rõ kết quả kinh doanh cần đạt.">
            <input value={objective} onChange={(e) => setObjective(e.target.value)} className={inputClass} placeholder="VD: Có 300 khách đăng ký trải nghiệm" />
          </Field>
          <Field label="Chỉ số đo mục tiêu chung" hint="Để tính mức hoàn thành ở tab Kết quả.">
            <input value={targetMetric} onChange={(e) => setTargetMetric(e.target.value)} className={inputClass} placeholder="VD: khách đăng ký" />
          </Field>
          <Field label="Con số cần đạt">
            <input inputMode="numeric" value={targetValue} onChange={(e) => setTargetValue(e.target.value)} className={inputClass} placeholder="VD: 300" />
          </Field>
          <Field label="Mô tả" className="md:col-span-2">
            <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className={textareaClass} placeholder="Cách tiếp cận, lý do chọn sản phẩm đầu vào, điểm cần lưu ý." />
          </Field>
          <div className="md:col-span-2">
            <span className="lbl flex items-center gap-1">Sản phẩm hoặc dịch vụ <span className="text-brick" aria-hidden>*</span></span>
            <p className="mt-0.5 text-[11.5px] text-ink-3">Giá lấy từ danh mục trong Cài đặt, AI không tự đặt giá.</p>
            <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {products.map((p) => {
                const on = productIds.includes(p.id);
                return (
                  <label key={p.id} className={cn("flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2 text-[12.5px]", on ? "border-jade bg-jade-soft/40" : "border-border hover:border-ink-3")}>
                    <input type="checkbox" checked={on} onChange={(e) => setProductIds((ids) => (e.target.checked ? [...ids, p.id] : ids.filter((x) => x !== p.id)))} className="mt-0.5 accent-[var(--jade)]" />
                    <span className="min-w-0">
                      <span className="block font-semibold text-ink">{p.name}</span>
                      <span className="block text-ink-2">{p.brand}{p.price > 0 ? ` · ${formatCurrency(p.price)}/${p.unit}` : ""}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
          <Field label="Nhóm khách hàng mục tiêu">
            <input value={audience} onChange={(e) => setAudience(e.target.value)} className={inputClass} placeholder="VD: Nữ 25–35 tuổi, nhân viên văn phòng" />
          </Field>
          <Field label="Khu vực">
            <input value={location} onChange={(e) => setLocation(e.target.value)} className={inputClass} placeholder="VD: Bến Tre" />
          </Field>
          <Field label="Người quản lý chiến dịch" required>
            <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className={inputClass}>
              {people.map((p) => (
                <option key={p.id} value={p.id}>{p.name} · {p.role}</option>
              ))}
            </select>
          </Field>
        </section>
      )}

      {/* Bước 2 */}
      {step === 1 && (
        <section className="card grid gap-3 p-4 md:grid-cols-2" aria-labelledby="s2">
          <h2 id="s2" className="text-[14px] font-bold text-ink md:col-span-2">Thời gian và ngân sách</h2>
          <Field label="Ngày bắt đầu" required>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Ngày kết thúc" required>
            <input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Tổng ngân sách (₫)" required hint={money(totalBudget) ? formatCurrency(money(totalBudget)) : "Tổng ngân sách của mọi kênh không được vượt con số này."}>
            <input inputMode="numeric" value={totalBudget} onChange={(e) => setTotalBudget(e.target.value)} className={inputClass} placeholder="VD: 30000000" />
          </Field>
          <Field label="Ghi chú ngân sách">
            <input value={budgetNote} onChange={(e) => setBudgetNote(e.target.value)} className={inputClass} placeholder="VD: Ưu tiên Facebook Ads" />
          </Field>
        </section>
      )}

      {/* Bước 3 */}
      {step === 2 && (
        <section className="grid gap-3.5" aria-labelledby="s3">
          <div className="card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 id="s3" className="text-[14px] font-bold text-ink">Mục tiêu từng kênh</h2>
                <p className="mt-0.5 text-[12.5px] text-ink-2">Mỗi kênh một mục tiêu riêng, cùng phục vụ mục tiêu chung ở trên. Tổng ngân sách kênh: <b className={cn("num", budget.over ? "text-brick" : "text-ink")}>{formatCurrency(budget.allocated)}</b> / {formatCurrency(budget.total)}.</p>
              </div>
              {!editing && (
                <Button type="button" variant="primary" onClick={() => setEditing(emptyGoal(ownerId, startDate, endDate))}>
                  Thêm mục tiêu kênh
                </Button>
              )}
            </div>
            {budget.over && (
              <div className="mt-3">
                <FormNotice tone="error">Ngân sách kênh vượt ngân sách tổng {formatCurrency(budget.allocated - budget.total)}. Giảm ngân sách kênh hoặc quay lại bước 2 để tăng tổng ngân sách.</FormNotice>
              </div>
            )}
          </div>

          {editing && (
            <div className="card grid gap-3 border-jade p-4 md:grid-cols-2">
              <h3 className="text-[13px] font-bold text-ink md:col-span-2">{goals.some((g) => g.key === editing.key) ? "Sửa mục tiêu kênh" : "Mục tiêu kênh mới"}</h3>
              <Field label="Kênh" required>
                <select value={editing.channel} onChange={(e) => onChannelChange(e.target.value as ChannelKey)} className={inputClass}>
                  {CHANNELS.map((c) => (
                    <option key={c.key} value={c.key}>{c.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Tài khoản dự kiến" hint={editing.accountId && connected[editing.accountId] && !connected[editing.accountId].connected ? "Tài khoản này chưa kết nối. Kết nối trong Cài đặt trước khi chạy." : undefined}>
                <select value={editing.accountId} onChange={(e) => setEditing({ ...editing, accountId: e.target.value })} className={inputClass}>
                  <option value="">Chọn sau</option>
                  {accounts.map((a) => (
                    <option key={a.key} value={a.key}>{a.name}{a.connected ? "" : " (chưa kết nối)"}</option>
                  ))}
                </select>
              </Field>
              <Field label="Loại thực thi" required>
                <select value={editing.executionType} onChange={(e) => setEditing({ ...editing, executionType: e.target.value as ExecutionType })} className={inputClass}>
                  {(channelDef(editing.channel)?.executionTypes ?? []).map((t) => (
                    <option key={t} value={t}>{executionLabel(t)}</option>
                  ))}
                </select>
              </Field>
              <Field label="Người phụ trách" required>
                <select value={editing.ownerId} onChange={(e) => setEditing({ ...editing, ownerId: e.target.value })} className={inputClass}>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} · {p.role}</option>
                  ))}
                </select>
              </Field>
              <Field label="Mục tiêu" required className="md:col-span-2">
                <input value={editing.objective} onChange={(e) => setEditing({ ...editing, objective: e.target.value })} className={inputClass} placeholder="VD: Thu 200 lead đăng ký gội trải nghiệm" />
              </Field>
              <Field label="Chỉ số chính" required>
                <select value={editing.primaryMetric} onChange={(e) => setEditing({ ...editing, primaryMetric: e.target.value as MetricKey })} className={inputClass}>
                  {(channelDef(editing.channel)?.metrics ?? []).map((m) => (
                    <option key={m} value={m}>{METRICS[m].label}</option>
                  ))}
                </select>
              </Field>
              <Field label={`Chỉ tiêu cần đạt (${metricUnit(editing.primaryMetric)})`} required>
                <input inputMode="numeric" value={editing.targetValue} onChange={(e) => setEditing({ ...editing, targetValue: e.target.value })} className={inputClass} placeholder="VD: 200" />
              </Field>
              <Field label="Ngân sách kênh (₫)" hint={money(editing.budget) ? formatCurrency(money(editing.budget)) : undefined}>
                <input inputMode="numeric" value={editing.budget} onChange={(e) => setEditing({ ...editing, budget: e.target.value })} className={inputClass} placeholder="VD: 15000000" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Bắt đầu">
                  <input type="date" value={editing.startDate} onChange={(e) => setEditing({ ...editing, startDate: e.target.value })} className={inputClass} />
                </Field>
                <Field label="Kết thúc">
                  <input type="date" value={editing.endDate} min={editing.startDate} onChange={(e) => setEditing({ ...editing, endDate: e.target.value })} className={inputClass} />
                </Field>
              </div>
              <div className="flex gap-2 md:col-span-2">
                <Button type="button" variant="primary" onClick={saveGoal}>Lưu mục tiêu kênh</Button>
                <Button type="button" variant="ghost" onClick={() => { setEditing(null); setStepError(null); }}>Hủy</Button>
              </div>
            </div>
          )}

          <div className="card overflow-hidden">
            {goals.length === 0 ? (
              <p className="px-4 py-8 text-center text-[12.5px] text-ink-2">Chưa có mục tiêu kênh nào. Bản nháp có thể lưu không cần kênh, nhưng gửi phê duyệt cần ít nhất một kênh.</p>
            ) : (
              <ul className="m-0 list-none p-0">
                {goals.map((g) => (
                  <li key={g.key} className="grid gap-2 border-b border-border px-4 py-3 last:border-b-0 md:grid-cols-[1fr_auto] md:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-ink">{channelLabel(g.channel)}</span>
                        <Pill>{executionLabel(g.executionType)}</Pill>
                        {g.accountId && connected[g.accountId] && !connected[g.accountId].connected && <Pill tone="amber">Tài khoản chưa kết nối</Pill>}
                      </div>
                      <div className="mt-0.5 text-[12.5px] text-ink-2">{g.objective}</div>
                      <div className="num mt-1 text-[12px] text-ink-2">
                        {metricLabel(g.primaryMetric)}: <b className="text-ink">{formatNumber(money(g.targetValue))}</b> {metricUnit(g.primaryMetric)} · Ngân sách <b className="text-ink">{formatCurrency(money(g.budget))}</b> · {people.find((p) => p.id === g.ownerId)?.name ?? "—"} · {g.startDate} → {g.endDate}
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      <Button type="button" onClick={() => { setEditing(g); setStepError(null); }}>Sửa</Button>
                      <Button type="button" variant="ghost" onClick={() => setGoals((l) => l.filter((x) => x.key !== g.key))}>Xóa</Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {/* Bước 4 */}
      {step === 3 && (
        <section className="grid gap-3.5" aria-labelledby="s4">
          <div className="card p-4">
            <h2 id="s4" className="text-[14px] font-bold text-ink">Kiểm tra và xác nhận</h2>
            <p className="mt-0.5 text-[12.5px] text-ink-2">Chiến dịch không tự kích hoạt sau khi tạo. Sau khi được phê duyệt, bạn bấm “Kích hoạt” ở màn hình chi tiết.</p>
            <dl className="mt-3 grid gap-x-6 gap-y-2 text-[13px] md:grid-cols-2">
              <Review label="Tên chiến dịch" value={name} />
              <Review label="Người quản lý" value={people.find((p) => p.id === ownerId)?.name ?? "—"} />
              <Review label="Mục tiêu chung" value={objective + (targetValue ? ` (${formatNumber(money(targetValue))} ${targetMetric})` : "")} wide />
              <Review label="Sản phẩm / dịch vụ" value={productIds.map((id) => products.find((p) => p.id === id)?.name ?? id).join(", ")} wide />
              <Review label="Khách hàng mục tiêu" value={audience || "—"} />
              <Review label="Khu vực" value={location || "—"} />
              <Review label="Thời gian" value={`${startDate} → ${endDate}`} />
              <Review label="Tổng ngân sách" value={formatCurrency(money(totalBudget)) + (budgetNote ? ` · ${budgetNote}` : "")} />
            </dl>
          </div>
          <div className="card overflow-hidden">
            <header className="flex items-center justify-between border-b border-border px-4 py-3">
              <h3 className="text-[13px] font-bold text-ink">Mục tiêu kênh ({goals.length})</h3>
              <span className={cn("num text-[12px]", budget.over ? "font-semibold text-brick" : "text-ink-2")}>Ngân sách kênh {formatCurrency(budget.allocated)} / {formatCurrency(budget.total)}</span>
            </header>
            {goals.length === 0 ? (
              <p className="px-4 py-6 text-center text-[12.5px] text-ink-2">Chưa có mục tiêu kênh.</p>
            ) : (
              <ul className="m-0 list-none p-0">
                {goals.map((g) => (
                  <li key={g.key} className="grid gap-1 border-b border-border px-4 py-2.5 text-[12.5px] last:border-b-0 md:grid-cols-[180px_1fr_auto]">
                    <span className="font-semibold text-ink">{channelLabel(g.channel)}</span>
                    <span className="text-ink-2">{g.objective} · {metricLabel(g.primaryMetric)} {formatNumber(money(g.targetValue))} · {people.find((p) => p.id === g.ownerId)?.name ?? "—"}</span>
                    <span className="num text-ink">{formatCurrency(money(g.budget))}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {budget.over && <FormNotice tone="error">Ngân sách kênh vượt ngân sách tổng. Bạn vẫn có thể lưu bản nháp, nhưng không gửi phê duyệt được.</FormNotice>}
          {!budget.over && goals.length === 0 && <FormNotice tone="warn">Chưa có mục tiêu kênh nên chỉ lưu được bản nháp.</FormNotice>}
        </section>
      )}

      {/* Điều hướng bước */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          {step > 0 ? (
            <Button type="button" onClick={back} size="md">{step === 3 ? "Quay lại chỉnh sửa" : "Quay lại"}</Button>
          ) : (
            <Link href="/campaigns" className="inline-flex h-8 items-center rounded-full border border-border-2 px-3.5 text-[12.5px] font-medium text-ink hover:border-ink-3">Hủy</Link>
          )}
        </div>
        <div className="flex gap-2">
          {step < 3 ? (
            <Button type="button" variant="primary" size="md" onClick={next}>Tiếp tục</Button>
          ) : (
            <>
              <SubmitButton name="intent" value="draft" variant="outline" size="md" pendingText="Đang lưu…">Lưu bản nháp</SubmitButton>
              <SubmitButton name="intent" value="submit" variant="primary" size="md" disabled={!canSubmit} pendingText="Đang gửi…" title={!canSubmit ? "Cần ít nhất một mục tiêu kênh và ngân sách kênh không vượt tổng" : undefined}>
                Gửi phê duyệt
              </SubmitButton>
            </>
          )}
        </div>
      </div>
    </form>
  );
}

function Review({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={cn("min-w-0", wide && "md:col-span-2")}>
      <dt className="lbl">{label}</dt>
      <dd className="mt-0.5 text-ink">{value || "—"}</dd>
    </div>
  );
}
