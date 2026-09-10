import { PageHead, Panel, PanelHeader, Rows, Row } from "@/components/ui/card";
import { Breadcrumb, ModuleGroups } from "@/components/shell/module-page";
import { Pill } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { clearSampleData, resetSampleData, saveAccount, saveBrand, toggleAutomation } from "@/lib/actions/settings";
import { getAutomation, getBrand } from "@/lib/queries";
import { getAdminEmail } from "@/lib/admin";
import { automationSettings } from "@/lib/data/settings";
import { cn } from "@/lib/format";
import { BackupPanel } from "@/components/settings/backup-panel";
import { PeoplePanel, ProductsPanel } from "@/components/settings/catalog-panels";
import { AiBudgetPanel, IntegrationsPanel, SystemLogPanel } from "@/components/settings/integration-panels";

export const metadata = { title: "Cài đặt – BAOR AI OS" };

const input = "mt-1 h-8 w-full rounded-md border border-border-2 bg-surface px-2.5 text-[13px] text-ink outline-none focus-visible:outline-2 focus-visible:outline-jade";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ edit?: string; product?: string; person?: string }> }) {
  const { edit, product, person } = await searchParams;
  const automation = getAutomation();
  const brand = getBrand();
  const adminEmail = getAdminEmail();

  return (
    <>
      <Breadcrumb items={[{ label: "Điều hành", href: "/dashboard" }, { label: "Cài đặt hệ thống" }]} />
      <PageHead title="Cài đặt hệ thống" sub="Nguồn dữ liệu chuẩn: sản phẩm và bảng giá, nhân sự, tài khoản nền tảng, thương hiệu, AI Agent." />

      <ProductsPanel editing={product} />
      <PeoplePanel editing={person} />

      <IntegrationsPanel editing={edit} />

      <Panel id="automation">
        <PanelHeader title="Tự động hóa" sub="Bước có nhãn ‘cần bạn duyệt’ luôn chờ bạn trước khi thực hiện." />
        <Rows>
          {automationSettings.map((s) => {
            const on = automation[s.key] ?? s.enabled;
            return (
              <Row
                key={s.key}
                lead={
                  <form action={toggleAutomation}>
                    <input type="hidden" name="key" value={s.key} />
                    <input type="hidden" name="on" value={on ? "1" : "0"} />
                    <button
                      type="submit"
                      role="switch"
                      aria-checked={on}
                      aria-label={s.label}
                      className={cn("relative inline-flex h-5 w-9 cursor-pointer items-center rounded-full transition-colors", on ? "bg-jade" : "bg-border-2")}
                    >
                      <span className={cn("inline-block h-4 w-4 rounded-full bg-white shadow transition-transform", on ? "translate-x-[18px]" : "translate-x-[2px]")} />
                    </button>
                  </form>
                }
                title={<span className="flex items-center gap-2">{s.label}{s.requiresApproval && <Pill tone="amber">cần bạn duyệt</Pill>}</span>}
                sub={s.description}
              />
            );
          })}
        </Rows>
      </Panel>

      <div className="grid gap-3.5 md:grid-cols-2">
        <Panel id="brand">
          <PanelHeader title="Thương hiệu & giọng văn" sub="AI dùng thông tin này khi viết nội dung và trả lời khách." />
          <form action={saveBrand} className="grid gap-3 p-4">
            <label className="block"><span className="lbl">Tên thương hiệu</span><input name="name" defaultValue={brand.name} className={input} placeholder="VD: BAOR Skincare" /></label>
            <label className="block"><span className="lbl">Sản phẩm / dịch vụ chính</span><input name="products" defaultValue={brand.products} className={input} placeholder="VD: Serum vitamin C, combo 3 bước…" /></label>
            <label className="block"><span className="lbl">Giọng văn</span><textarea name="voice" rows={3} defaultValue={brand.voice} className={cn(input, "h-auto py-2")} /></label>
            <div><Button variant="primary" type="submit">Lưu</Button></div>
          </form>
        </Panel>

        <Panel id="account">
          <PanelHeader title="Tài khoản quản trị" sub="Đổi email hoặc mật khẩu đăng nhập. Cần mật khẩu hiện tại để xác nhận." />
          <form action={saveAccount} className="grid gap-3 p-4">
            <label className="block"><span className="lbl">Email đăng nhập</span><input name="email" type="email" defaultValue={adminEmail} className={input} /></label>
            <label className="block"><span className="lbl">Mật khẩu hiện tại</span><input name="current" type="password" required className={input} autoComplete="current-password" /></label>
            <label className="block"><span className="lbl">Mật khẩu mới (để trống nếu không đổi)</span><input name="password" type="password" className={input} autoComplete="new-password" /></label>
            <div><Button variant="primary" type="submit">Cập nhật</Button></div>
          </form>
        </Panel>
      </div>

      <AiBudgetPanel />
      <SystemLogPanel />

      <Panel>
        <PanelHeader title="Dữ liệu" sub="Dữ liệu mẫu giúp bạn xem cách hệ thống vận hành. Xóa khi bắt đầu dùng thật." />
        <div className="flex flex-wrap gap-2 p-4">
          <form action={clearSampleData}><Button type="submit">Xóa dữ liệu mẫu</Button></form>
          <form action={resetSampleData}><Button type="submit" variant="ghost">Nạp lại dữ liệu mẫu</Button></form>
        </div>
      </Panel>

      <BackupPanel />
      <ModuleGroups moduleKey="settings" />
    </>
  );
}
