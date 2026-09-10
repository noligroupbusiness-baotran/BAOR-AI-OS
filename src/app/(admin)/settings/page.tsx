import { PageHead, Panel, PanelHeader, Rows, Row } from "@/components/ui/card";
import { Breadcrumb, ModuleGroups } from "@/components/shell/module-page";
import { Pill } from "@/components/ui/pill";
import { Button, LinkButton } from "@/components/ui/button";
import { clearSampleData, disconnectIntegration, resetSampleData, saveAccount, saveBrand, saveIntegration, toggleAutomation } from "@/lib/actions/settings";
import { getAutomation, getBrand, listIntegrations } from "@/lib/queries";
import { getAdminEmail } from "@/lib/admin";
import { automationSettings } from "@/lib/data/settings";
import { cn } from "@/lib/format";
import { BackupPanel } from "@/components/settings/backup-panel";
import { PeoplePanel, ProductsPanel } from "@/components/settings/catalog-panels";

export const metadata = { title: "Cài đặt – BAOR AI OS" };

const input = "mt-1 h-8 w-full rounded-md border border-border-2 bg-surface px-2.5 text-[13px] text-ink outline-none focus-visible:outline-2 focus-visible:outline-jade";

// Các trường cần nhập cho từng kết nối
const fields: Record<string, { key: string; label: string; secret?: boolean; hint?: string }[]> = {
  facebook_page: [
    { key: "pageId", label: "Page ID" },
    { key: "pageToken", label: "Page Access Token", secret: true, hint: "Lấy từ Meta for Developers › Graph API Explorer" },
  ],
  meta_ads: [
    { key: "adAccountId", label: "Ad Account ID (act_...)" },
    { key: "accessToken", label: "Access Token", secret: true },
  ],
  instagram: [{ key: "igUserId", label: "Instagram Business ID" }],
  tiktok: [{ key: "accessToken", label: "Access Token", secret: true }],
  zalo_oa: [{ key: "oaId", label: "OA ID" }, { key: "accessToken", label: "Access Token", secret: true }],
  youtube: [{ key: "channelId", label: "Channel ID" }, { key: "accessToken", label: "Access Token", secret: true }],
  website: [{ key: "siteUrl", label: "Địa chỉ website", hint: "https://tenmien.com" }, { key: "gaPropertyId", label: "GA4 Property ID" }],
  email_provider: [
    { key: "smtpUrl", label: "SMTP URL", secret: true, hint: "smtp://user:pass@host:587" },
    { key: "from", label: "Tên và email gửi", hint: "BAOR <hello@tenmien.com>" },
  ],
  claude: [{ key: "apiKey", label: "API key", secret: true, hint: "sk-ant-..." }],
};

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ edit?: string; product?: string; person?: string }> }) {
  const { edit, product, person } = await searchParams;
  const integrations = listIntegrations();
  const automation = getAutomation();
  const brand = getBrand();
  const adminEmail = getAdminEmail();

  return (
    <>
      <Breadcrumb items={[{ label: "Điều hành", href: "/dashboard" }, { label: "Cài đặt hệ thống" }]} />
      <PageHead title="Cài đặt hệ thống" sub="Nguồn dữ liệu chuẩn: sản phẩm và bảng giá, nhân sự, tài khoản nền tảng, thương hiệu, AI Agent." />

      <ProductsPanel editing={product} />
      <PeoplePanel editing={person} />

      <Panel id="integrations">
        <PanelHeader title="Kết nối" sub="Khóa và token được lưu trong cơ sở dữ liệu trên máy chủ của bạn, không hiển thị lại." />
        <Rows>
          {integrations.map((i) => {
            const editing = edit === i.key;
            return (
              <li key={i.key} className="border-b border-border last:border-b-0">
                <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-2.5">
                  <div>{i.connected ? <Pill tone="jade">Đã kết nối</Pill> : <Pill>Chưa kết nối</Pill>}</div>
                  <div className="min-w-0">
                    <div className="font-semibold text-ink">{i.name}</div>
                    <div className="truncate text-[12px] text-ink-2">{i.account ?? i.description}</div>
                  </div>
                  <div className="flex gap-1.5">
                    {!editing && <LinkButton href={`/settings?edit=${i.key}#${i.key}`} variant={i.connected ? "outline" : "primary"}>{i.connected ? "Sửa" : "Kết nối"}</LinkButton>}
                    {i.connected && (
                      <form action={disconnectIntegration}><input type="hidden" name="key" value={i.key} /><Button variant="ghost" type="submit">Ngắt</Button></form>
                    )}
                  </div>
                </div>
                {editing && (
                  <form id={i.key} action={saveIntegration} className="grid gap-3 border-t border-border bg-ground px-4 py-3 md:grid-cols-2">
                    <input type="hidden" name="key" value={i.key} />
                    <label className="block md:col-span-2">
                      <span className="lbl">Tên tài khoản hiển thị</span>
                      <input name="account" defaultValue={i.account ?? ""} className={input} placeholder="VD: Fanpage BAOR" />
                    </label>
                    {(fields[i.key] ?? []).map((f) => (
                      <label key={f.key} className="block">
                        <span className="lbl">{f.label}</span>
                        <input name={`cfg.${f.key}`} type={f.secret ? "password" : "text"} className={input} placeholder={f.hint ?? ""} autoComplete="off" />
                      </label>
                    ))}
                    <div className="flex gap-2 md:col-span-2">
                      <Button variant="primary" type="submit">Lưu kết nối</Button>
                      <LinkButton href="/settings" variant="ghost">Hủy</LinkButton>
                    </div>
                  </form>
                )}
              </li>
            );
          })}
        </Rows>
      </Panel>

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
