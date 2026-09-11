import { PageHead, Panel, PanelHeader, Rows, Row } from "@/components/ui/card";
import { Breadcrumb, ModuleGroups } from "@/components/shell/module-page";
import { Pill } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { clearSampleData, resetSampleData, saveAccount, toggleAutomation } from "@/lib/actions/settings";
import { getAutomation } from "@/lib/queries";
import { getAdminEmail } from "@/lib/admin";
import { automationSettings } from "@/lib/data/settings";
import { cn } from "@/lib/format";
import { BackupPanel } from "@/components/settings/backup-panel";
import { PeoplePanel, ProductsPanel } from "@/components/settings/catalog-panels";
import { AiBudgetPanel, IntegrationsPanel, SystemLogPanel } from "@/components/settings/integration-panels";
import { FaqPanel } from "@/components/settings/faq-panel";
import { AlertsPanel, AppLogoPanel, BrandPanel, MusicPanel } from "@/components/settings/brand-panels";

export const metadata = { title: "Cài đặt – BAOR AI OS" };

const sections = [
  { id: "products", label: "Sản phẩm" },
  { id: "faq", label: "Câu trả lời chuẩn" },
  { id: "people", label: "Nhân sự" },
  { id: "integrations", label: "Kết nối" },
  { id: "automation", label: "Tự động hóa" },
  { id: "brand", label: "Thương hiệu" },
  { id: "app-logo", label: "Logo" },
  { id: "account", label: "Tài khoản" },
  { id: "music", label: "Kho nhạc" },
  { id: "ai", label: "Chi phí AI" },
  { id: "alerts", label: "Cảnh báo" },
  { id: "syslog", label: "Nhật ký" },
  { id: "backup", label: "Sao lưu" },
  { id: "sample", label: "Dữ liệu mẫu" },
];

const input = "mt-1 h-8 w-full rounded-md border border-border-2 bg-surface px-2.5 text-[13px] text-ink outline-none focus-visible:outline-2 focus-visible:outline-jade";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ edit?: string; product?: string; person?: string; faq?: string }> }) {
  const { edit, product, person, faq } = await searchParams;
  const automation = getAutomation();
  const adminEmail = getAdminEmail();

  return (
    <>
      <Breadcrumb items={[{ label: "Điều hành", href: "/dashboard" }, { label: "Cài đặt hệ thống" }]} />
      <PageHead title="Cài đặt hệ thống" sub="Nguồn dữ liệu chuẩn: sản phẩm và bảng giá, nhân sự, tài khoản nền tảng, thương hiệu, AI Agent." />

      {/* Điều hướng theo mục: trang dài, nhảy thẳng tới khối cần chỉnh. Panel có scroll-mt nên không bị thanh trên che. */}
      <nav aria-label="Mục cài đặt" className="sticky top-[calc(var(--topbar-h)+8px)] z-30 -mx-1 mb-1 overflow-x-auto px-1">
        <ul className="m-0 flex list-none gap-1.5 rounded-full border border-border bg-ground/95 p-1 backdrop-blur">
          {sections.map((sct) => (
            <li key={sct.id}>
              <a href={`#${sct.id}`} className="block whitespace-nowrap rounded-full px-3 py-1 text-[12px] font-medium text-ink-2 hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-jade">{sct.label}</a>
            </li>
          ))}
        </ul>
      </nav>

      <ProductsPanel editing={product} />
      <FaqPanel editing={faq} />
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

      <BrandPanel />

      <div className="grid gap-3.5 md:grid-cols-2">
        <AppLogoPanel />
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

      <MusicPanel />
      <AiBudgetPanel />
      <AlertsPanel />
      <SystemLogPanel />

      <Panel id="sample">
        <PanelHeader title="Dữ liệu mẫu" sub="Dữ liệu mẫu giúp bạn xem cách hệ thống vận hành. Xóa khi bắt đầu dùng thật; dữ liệu bạn tự tạo được giữ nguyên." />
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
