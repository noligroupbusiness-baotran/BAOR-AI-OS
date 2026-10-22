import type { Campaign, Person, Product } from "@/lib/campaigns/types";
import { updateCampaign } from "@/lib/actions/campaigns";
import { Panel, PanelHeader } from "@/components/ui/card";
import { Field, FormNotice, inputClass, textareaClass } from "@/components/ui/field";
import { LinkButton } from "@/components/ui/button";
import { SubmitButton } from "./submit-button";
import { formatCurrency, cn } from "@/lib/format";

// Sửa thông tin chung (bước 1–2) của chiến dịch đã tạo. Mục tiêu kênh sửa ở tab riêng.
export function CampaignEditForm({ campaign, people, products, allocated, idem }: { campaign: Campaign; people: Person[]; products: Product[]; allocated: number; idem: string }) {
  const approved = campaign.status === "approved" || campaign.status === "active" || campaign.status === "paused";
  return (
    <Panel>
      <PanelHeader title="Sửa thông tin chung" sub="Mục tiêu kênh chỉnh ở tab “Mục tiêu theo kênh”." />
      <form action={updateCampaign} className="grid gap-3 p-4 md:grid-cols-2">
        <input type="hidden" name="id" value={campaign.id} />
        <input type="hidden" name="idem" value={idem} />
        {approved && (
          <div className="md:col-span-2">
            <FormNotice tone="warn">Chiến dịch đã được phê duyệt. Đổi ngân sách, thời gian hoặc mục tiêu chung sẽ tạo yêu cầu xác nhận lại và được ghi nhật ký.</FormNotice>
          </div>
        )}
        <Field label="Tên chiến dịch" required className="md:col-span-2">
          <input name="name" required defaultValue={campaign.name} className={inputClass} />
        </Field>
        <Field label="Mục tiêu chung" required className="md:col-span-2">
          <input name="objective" required defaultValue={campaign.objective} className={inputClass} />
        </Field>
        <Field label="Chỉ số đo mục tiêu chung">
          <input name="targetMetric" defaultValue={campaign.targetMetric} className={inputClass} placeholder="VD: khách đăng ký" />
        </Field>
        <Field label="Con số cần đạt">
          <input name="targetValue" inputMode="numeric" defaultValue={campaign.targetValue ?? ""} className={inputClass} />
        </Field>
        <Field label="Mô tả" className="md:col-span-2">
          <textarea name="description" rows={3} defaultValue={campaign.description} className={textareaClass} />
        </Field>
        <div className="md:col-span-2">
          <span className="lbl">Sản phẩm hoặc dịch vụ <span className="text-brick" aria-hidden>*</span></span>
          <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
            {products.map((p) => {
              const on = campaign.productIds.includes(p.id);
              return (
                <label key={p.id} className={cn("flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2 text-[12.5px]", on ? "border-jade bg-jade-soft/40" : "border-border hover:border-ink-3")}>
                  <input type="checkbox" name="productIds" value={p.id} defaultChecked={on} className="mt-0.5 accent-[var(--jade)]" />
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
          <input name="audience" defaultValue={campaign.audience} className={inputClass} />
        </Field>
        <Field label="Khu vực">
          <input name="location" defaultValue={campaign.location} className={inputClass} />
        </Field>
        <Field label="Người quản lý" required>
          <select name="ownerId" defaultValue={campaign.ownerId} className={inputClass}>
            {people.map((p) => (
              <option key={p.id} value={p.id}>{p.name} · {p.role}</option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Bắt đầu" required>
            <input type="date" name="startDate" required defaultValue={campaign.startDate} className={inputClass} />
          </Field>
          <Field label="Kết thúc" required>
            <input type="date" name="endDate" required defaultValue={campaign.endDate} className={inputClass} />
          </Field>
        </div>
        <Field label="Tổng ngân sách (₫)" required hint={`Đã phân bổ cho các kênh: ${formatCurrency(allocated)}. Tổng mới không được nhỏ hơn con số này.`}>
          <input name="totalBudget" inputMode="numeric" required defaultValue={campaign.totalBudget} className={inputClass} />
        </Field>
        <Field label="Ghi chú ngân sách">
          <input name="budgetNote" defaultValue={campaign.budgetNote} className={inputClass} />
        </Field>
        <div className="flex gap-2 md:col-span-2">
          <SubmitButton pendingText="Đang lưu…">Lưu thay đổi</SubmitButton>
          <LinkButton href={`/campaigns/${campaign.id}`} variant="ghost">Hủy</LinkButton>
        </div>
      </form>
    </Panel>
  );
}
