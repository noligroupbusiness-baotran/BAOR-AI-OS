import { PageHead, Panel, PanelHeader, Rows, Row } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { automationSettings, integrations } from "@/lib/data/settings";
import { getAdminCredentials } from "@/lib/auth";

export const metadata = { title: "Cài đặt – BAOR AI OS" };

const input = "mt-1 h-8 w-full rounded-md border border-border-2 bg-surface px-2.5 text-[13px] text-ink outline-none focus-visible:outline-2 focus-visible:outline-jade";

export default function SettingsPage() {
  const admin = getAdminCredentials();
  return (
    <>
      <PageHead title="Cài đặt" sub="Kết nối nền tảng, bật tắt từng bước tự động, tài khoản quản trị." />

      <Panel className="mt-0">
        <PanelHeader title="Kết nối" />
        <Rows>
          {integrations.map((i) => (
            <Row
              key={i.key}
              lead={i.connected ? <Pill tone="jade">Đã kết nối</Pill> : <Pill>Chưa kết nối</Pill>}
              title={i.name}
              sub={i.account ?? i.description}
              action={i.connected ? <Button>Kết nối lại</Button> : <Button variant="primary">Kết nối</Button>}
            />
          ))}
        </Rows>
      </Panel>

      <Panel>
        <PanelHeader title="Tự động hóa" sub="Bước có nhãn ‘cần bạn duyệt’ luôn chờ bạn trước khi thực hiện." />
        <Rows>
          {automationSettings.map((s) => (
            <Row
              key={s.key}
              lead={<Toggle defaultChecked={s.enabled} label={s.label} />}
              title={
                <span className="flex items-center gap-2">
                  {s.label}
                  {s.requiresApproval && <Pill tone="amber">cần bạn duyệt</Pill>}
                </span>
              }
              sub={s.description}
            />
          ))}
        </Rows>
      </Panel>

      <Panel>
        <PanelHeader title="Tài khoản quản trị" sub="Đọc từ tệp .env.local (ADMIN_EMAIL, ADMIN_PASSWORD)." />
        <div className="grid gap-3 p-4 md:grid-cols-2">
          <label className="block">
            <span className="lbl">Email đăng nhập</span>
            <input defaultValue={admin.email} className={input} />
          </label>
          <label className="block">
            <span className="lbl">Mật khẩu mới</span>
            <input type="password" placeholder="••••••••" className={input} />
          </label>
          <div>
            <Button variant="primary">Lưu thay đổi</Button>
          </div>
        </div>
      </Panel>
    </>
  );
}
