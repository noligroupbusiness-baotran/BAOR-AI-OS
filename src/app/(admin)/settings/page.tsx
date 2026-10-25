import { PageHead, Panel, PanelHeader, Rows, Row } from "@/components/ui/card";
import { Breadcrumb } from "@/components/shell/module-page";
import { Pill } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { clearSampleData, resetSampleData, saveAccount, toggleAutomation } from "@/lib/actions/settings";
import { getAutomation } from "@/lib/queries";
import { getAdminEmail } from "@/lib/admin";
import { automationSettings } from "@/lib/data/settings";
import { cn } from "@/lib/format";
import { BackupPanel } from "@/components/settings/backup-panel";
import { PeoplePanel } from "@/components/settings/catalog-panels";
import { AiBudgetPanel, IntegrationsPanel, SystemLogPanel } from "@/components/settings/integration-panels";
import { AiTeamPanel } from "@/components/settings/ai-team-panel";
import { SecondBrainPanel } from "@/components/settings/second-brain-panel";
import { RenderWorkerPanel } from "@/components/settings/render-worker-panel";
import { MoreOptions } from "@/components/settings/setting-item";
import { FaqPanel } from "@/components/settings/faq-panel";
import { AlertsPanel, BrandPanel, MusicPanel } from "@/components/settings/brand-panels";
import { AutoEditPanel } from "@/components/settings/auto-edit-panel";
import { MusicLibraryPanel } from "@/components/settings/music-library-panel";
import { SettingsGroup, SettingsTabs } from "@/components/settings/settings-tabs";
import { isSettingsGroup } from "@/config/settings-groups";

export const metadata = { title: "Cài đặt – BAOR AI OS" };

const input = "mt-1 h-8 w-full rounded-md border border-border-2 bg-surface px-2.5 text-[13px] text-ink outline-none focus-visible:outline-2 focus-visible:outline-jade";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ person?: string; faq?: string; tab?: string }> }) {
  const { person, faq, tab } = await searchParams;
  // Mở thẳng nhóm của biểu mẫu đang sửa; ?tab= chọn nhóm; #mục (liên kết cũ) do SettingsTabs xử lý phía trình duyệt
  const initial = isSettingsGroup(tab) ? tab : person ? "he-thong" : faq ? "thuong-hieu" : "ket-noi";
  const automation = getAutomation();
  const adminEmail = getAdminEmail();

  return (
    <>
      <Breadcrumb items={[{ label: "Điều hành", href: "/dashboard" }, { label: "Cài đặt" }]} />
      <PageHead title="Cài đặt" sub="Chọn một nhóm để chỉnh." />

      <SettingsTabs initial={initial}>
        <SettingsGroup id="ket-noi">
          <IntegrationsPanel />
        </SettingsGroup>

        <SettingsGroup id="thuong-hieu">
          <BrandPanel />
          <FaqPanel editing={faq} />
        </SettingsGroup>

        <SettingsGroup id="video">
          <RenderWorkerPanel />
          <AutoEditPanel />
          <MusicLibraryPanel />
          <MusicPanel />
        </SettingsGroup>

        <SettingsGroup id="ai">
          <AiBudgetPanel />
          <AiTeamPanel />
        </SettingsGroup>

        <SettingsGroup id="tu-dong">
          <Panel id="automation">
            <PanelHeader title="Việc tự chạy" sub="Bật / tắt từng việc. Việc có nhãn ‘cần bạn duyệt’ luôn chờ anh trước khi làm." />
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
          <AlertsPanel />
        </SettingsGroup>

        <SettingsGroup id="he-thong">
          <Panel id="account">
            <PanelHeader title="Tài khoản của anh" sub={`Đăng nhập bằng ${adminEmail}.`} />
            <div className="border-t border-border px-4 py-3">
              <MoreOptions label="Đổi email hoặc mật khẩu">
                <form action={saveAccount} className="grid max-w-[420px] gap-3">
                  <label className="block"><span className="lbl">Email đăng nhập</span><input name="email" type="email" defaultValue={adminEmail} className={input} /></label>
                  <label className="block"><span className="lbl">Mật khẩu hiện tại</span><input name="current" type="password" required className={input} autoComplete="current-password" /></label>
                  <label className="block"><span className="lbl">Mật khẩu mới (để trống nếu không đổi)</span><input name="password" type="password" className={input} autoComplete="new-password" /></label>
                  <div><Button variant="primary" type="submit">Cập nhật</Button></div>
                </form>
              </MoreOptions>
            </div>
          </Panel>
          <PeoplePanel editing={person} />
          <SecondBrainPanel />
          <BackupPanel />
          <SystemLogPanel />
          <Panel id="sample">
            <PanelHeader title="Dữ liệu mẫu" sub="Dữ liệu thử để xem cách hệ thống chạy. Dữ liệu anh tự tạo luôn được giữ." />
            <div className="border-t border-border px-4 py-3">
              <MoreOptions label="Xoá / nạp lại dữ liệu mẫu">
                <div className="flex flex-wrap gap-2">
                  <form action={clearSampleData}><Button type="submit">Xóa dữ liệu mẫu</Button></form>
                  <form action={resetSampleData}><Button type="submit" variant="ghost">Nạp lại dữ liệu mẫu</Button></form>
                </div>
              </MoreOptions>
            </div>
          </Panel>
        </SettingsGroup>
      </SettingsTabs>
    </>
  );
}
