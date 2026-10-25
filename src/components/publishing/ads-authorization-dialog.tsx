"use client";

import { useState } from "react";
import { Pencil, ShieldPlus } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { inputClass } from "@/components/ui/field";
import { SubmitButton } from "@/components/campaigns/submit-button";
import { cn } from "@/lib/format";

export interface AuthorizationDefaults {
  dailyCap: number | "";
  monthlyCap: number | "";
  validUntil: string;
  adAccountId: string;
  autoPauseCplAbove: number;
  allowAutoScale: boolean;
  note: string;
}

const label = "flex items-center gap-1 text-[12px] font-medium text-ink-2";

// Ô số tiền: đơn vị ₫ nằm trong ô. Tên trường giữ nguyên (máy chủ tự bỏ ký tự không phải số).
function Money({ name, defaultValue, placeholder }: { name: string; defaultValue: number | ""; placeholder?: string }) {
  return (
    <span className="relative mt-1 block">
      <input name={name} defaultValue={defaultValue} placeholder={placeholder} inputMode="numeric" className={cn(inputClass, "num pr-7")} />
      <span className="pointer-events-none absolute inset-y-0 right-2.5 grid place-items-center text-[12px] text-ink-3" aria-hidden>₫</span>
    </span>
  );
}

// Ủy quyền ngân sách (OWNER): một nút mở hộp thoại thay cho biểu mẫu 6 ô luôn mở trên trang.
// key ở nơi gọi đổi theo authorizedAt → lưu xong (máy chủ chuyển hướng về /ads) thì hộp thoại tự đóng.
export function AuthorizationDialog({ action, defaults, minDate, hasAuth }: { action: (fd: FormData) => Promise<void>; defaults: AuthorizationDefaults; minDate: string; hasAuth: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant={hasAuth ? "outline" : "primary"} onClick={() => setOpen(true)}>
        {hasAuth ? <Pencil size={13} aria-hidden /> : <ShieldPlus size={13} aria-hidden />}
        {hasAuth ? "Sửa" : "Đặt ủy quyền"}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Ủy quyền ngân sách quảng cáo">
        <form action={action} className="grid grid-cols-2 gap-x-3 gap-y-3">
          <label className="block min-w-0">
            <span className={label}>Trần / ngày / QC</span>
            <Money name="dailyCap" defaultValue={defaults.dailyCap} placeholder="200000" />
          </label>
          <label className="block min-w-0">
            <span className={label}>Trần / tháng</span>
            <Money name="monthlyCap" defaultValue={defaults.monthlyCap} placeholder="5000000" />
          </label>
          <label className="block min-w-0">
            <span className={label}>Hết hạn</span>
            <input type="date" name="validUntil" defaultValue={defaults.validUntil} min={minDate} className={cn(inputClass, "mt-1")} />
          </label>
          <div className="min-w-0">
            <span className={label}>
              <label htmlFor="ads-auth-cpl">Dừng khi CPL &gt;</label>
              <InfoTip label="Giải thích: Dừng khi CPL">Tự tạm dừng quảng cáo khi chi phí mỗi lead vượt mức này (khi đã có từ 10 lead). Dừng / giảm chi tiêu luôn được phép.</InfoTip>
            </span>
            <span className="relative mt-1 block">
              <input id="ads-auth-cpl" name="autoPauseCplAbove" defaultValue={defaults.autoPauseCplAbove} inputMode="numeric" className={cn(inputClass, "num pr-7")} />
              <span className="pointer-events-none absolute inset-y-0 right-2.5 grid place-items-center text-[12px] text-ink-3" aria-hidden>₫</span>
            </span>
          </div>
          <label className="col-span-2 block min-w-0">
            <span className={label}>Tài khoản act_</span>
            <input name="adAccountId" defaultValue={defaults.adAccountId} placeholder="act_123…" className={cn(inputClass, "mt-1")} />
          </label>
          <div className="col-span-2 flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
            <span className="flex items-center gap-1 text-[12.5px] font-medium text-ink">
              <label htmlFor="ads-auth-scale" className="cursor-pointer">AI tự tăng (trong trần)</label>
              <InfoTip label="Giải thích: AI tự tăng">Bật: AI được tự tăng ngân sách quảng cáo hiệu quả, luôn trong trần ngày và trần tháng. Tắt: AI chỉ đề xuất, người duyệt mới đổi.</InfoTip>
            </span>
            <span className="relative inline-flex">
              <input id="ads-auth-scale" type="checkbox" role="switch" name="allowAutoScale" value="1" defaultChecked={defaults.allowAutoScale} className="peer sr-only" />
              <span
                aria-hidden
                className="pointer-events-none relative inline-flex h-5 w-9 items-center rounded-full bg-border-2 transition-colors peer-checked:bg-jade peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-jade after:absolute after:left-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-4"
              />
            </span>
          </div>
          <label className="col-span-2 block min-w-0">
            <span className={label}>Ghi chú</span>
            <input name="note" defaultValue={defaults.note} className={cn(inputClass, "mt-1")} />
          </label>
          <div className="col-span-2 mt-1 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Hủy</Button>
            <SubmitButton>Lưu ủy quyền</SubmitButton>
          </div>
        </form>
      </Dialog>
    </>
  );
}
