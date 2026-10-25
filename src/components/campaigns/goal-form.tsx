import { CHANNELS, EXECUTION_TYPES, METRICS, channelDef } from "@/config/channels";
import type { Campaign, ChannelGoal, Person, PlatformAccount } from "@/lib/campaigns/types";
import { addChannelGoal, updateChannelGoal } from "@/lib/actions/campaigns";
import { Field, inputClass } from "@/components/ui/field";
import { LinkButton } from "@/components/ui/button";
import { SubmitButton } from "./submit-button";

// Biểu mẫu thêm / sửa một mục tiêu kênh ngay trong màn chi tiết chiến dịch (không dùng JS).
// Kênh đã chọn quyết định loại thực thi và chỉ số cho phép, nhưng vì không có JS nên liệt kê
// đầy đủ và ghi rõ kênh áp dụng; máy chủ kiểm tra tính hợp lệ khi lưu.
export function GoalForm({ campaign, goal, people, accounts, idem }: { campaign: Campaign; goal?: ChannelGoal; people: Person[]; accounts: PlatformAccount[]; idem: string }) {
  const editing = !!goal;
  const back = `/campaigns/${campaign.id}?tab=goals`;
  return (
    <form action={editing ? updateChannelGoal : addChannelGoal} className="grid gap-3 border-t border-border bg-ground px-4 py-4 md:grid-cols-2">
      <input type="hidden" name="idem" value={idem} />
      {editing ? <input type="hidden" name="goalId" value={goal.id} /> : <input type="hidden" name="campaignId" value={campaign.id} />}
      <h3 className="text-[13px] font-bold text-ink md:col-span-2">{editing ? `Sửa mục tiêu kênh ${channelDef(goal.channel)?.label ?? goal.channel}` : "Mục tiêu kênh mới"}</h3>

      {editing ? (
        <input type="hidden" name="channel" value={goal.channel} />
      ) : (
        <Field label="Kênh" required>
          <select name="channel" defaultValue={CHANNELS[0].key} className={inputClass}>
            {CHANNELS.map((c) => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Tài khoản dự kiến" hint="Tài khoản chưa kết nối vẫn chọn được, nhưng cần kết nối trước khi chạy.">
        <select name="accountId" defaultValue={goal?.accountId ?? ""} className={inputClass}>
          <option value="">Theo mặc định của kênh</option>
          {accounts.map((a) => (
            <option key={a.key} value={a.key}>{a.name}{a.connected ? "" : " (chưa kết nối)"}</option>
          ))}
        </select>
      </Field>
      <Field label="Loại thực thi" required hint="Mỗi kênh chỉ chấp nhận một số loại; hệ thống sẽ báo nếu không phù hợp.">
        <select name="executionType" defaultValue={goal?.executionType ?? "organic"} className={inputClass}>
          {EXECUTION_TYPES.map((e) => (
            <option key={e.key} value={e.key}>{e.label} · {CHANNELS.filter((c) => c.executionTypes.includes(e.key)).map((c) => c.short).join(", ")}</option>
          ))}
        </select>
      </Field>
      <Field label="Người phụ trách" required>
        <select name="ownerId" defaultValue={goal?.ownerId ?? campaign.ownerId} className={inputClass}>
          {people.map((p) => (
            <option key={p.id} value={p.id}>{p.name} · {p.role}</option>
          ))}
        </select>
      </Field>
      <Field label="Mục tiêu" required className="md:col-span-2">
        <input name="objective" defaultValue={goal?.objective ?? ""} required className={inputClass} placeholder="VD: Đăng 20 bài và đạt 100.000 lượt tiếp cận" />
      </Field>
      <Field label="Chỉ số chính" required>
        <select name="primaryMetric" defaultValue={goal?.primaryMetric ?? "reach"} className={inputClass}>
          {(Object.keys(METRICS) as (keyof typeof METRICS)[]).map((m) => (
            <option key={m} value={m}>{METRICS[m].label} · {CHANNELS.filter((c) => c.metrics.includes(m)).map((c) => c.short).join(", ")}</option>
          ))}
        </select>
      </Field>
      <Field label="Chỉ tiêu cần đạt" required>
        <input name="targetValue" inputMode="numeric" defaultValue={goal?.targetValue ?? ""} required className={inputClass} placeholder="VD: 100000" />
      </Field>
      <Field label="Ngân sách kênh (₫)" hint={`Ngân sách tổng của chiến dịch: ${campaign.totalBudget.toLocaleString("vi-VN")} ₫`}>
        <input name="budget" inputMode="numeric" defaultValue={goal?.budget ?? ""} className={inputClass} placeholder="VD: 3000000" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Bắt đầu">
          <input type="date" name="startDate" defaultValue={goal?.startDate ?? campaign.startDate} className={inputClass} />
        </Field>
        <Field label="Kết thúc">
          <input type="date" name="endDate" defaultValue={goal?.endDate ?? campaign.endDate} className={inputClass} />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2 md:col-span-2">
        <SubmitButton pendingText="Đang lưu…">{editing ? "Lưu thay đổi" : "Thêm mục tiêu kênh"}</SubmitButton>
        <LinkButton href={back} variant="ghost">Hủy</LinkButton>
        {campaign.status !== "draft" && campaign.status !== "needs_changes" && (
          <span className="self-center text-[12px] text-ink-3">Chiến dịch đã qua phê duyệt: thay đổi ngân sách hoặc tài khoản sẽ tạo yêu cầu xác nhận.</span>
        )}
      </div>
    </form>
  );
}
