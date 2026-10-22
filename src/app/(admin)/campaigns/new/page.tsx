import { randomBytes } from "node:crypto";
import { Breadcrumb } from "@/components/shell/module-page";
import { CampaignWizard } from "@/components/campaigns/campaign-wizard";
import { campaignRepo } from "@/lib/campaigns/repository";

export const metadata = { title: "Tạo chiến dịch – BAOR AI OS" };

export default function NewCampaignPage() {
  const today = new Date();
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 2, 0));
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  // Khóa chống lặp: mỗi lần mở biểu mẫu một khóa; gửi hai lần cùng khóa chỉ tạo một chiến dịch.
  const idem = `create_${randomBytes(8).toString("hex")}`;
  return (
    <>
      <Breadcrumb items={[{ label: "Điều hành", href: "/dashboard" }, { label: "Chiến dịch", href: "/campaigns" }, { label: "Tạo chiến dịch" }]} />
      <div className="mb-4">
        <h1 className="text-[20px] font-bold tracking-[-0.01em] text-ink">Tạo chiến dịch</h1>
        <p className="mt-1 max-w-[64ch] text-ink-2">Một chiến dịch là một mục tiêu kinh doanh cụ thể. Các kênh Facebook, TikTok, Zalo, Email là mục tiêu con của cùng chiến dịch, không tách thành chiến dịch riêng.</p>
      </div>
      <CampaignWizard people={campaignRepo.people()} products={campaignRepo.products()} accounts={campaignRepo.accounts()} idem={idem} defaultStart={fmt(start)} defaultEnd={fmt(end)} />
    </>
  );
}
