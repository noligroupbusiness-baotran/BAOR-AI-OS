import Link from "next/link";
import { ArrowRight, Database, FolderOpen, ShieldAlert, UserRound, Zap } from "lucide-react";
import { PageHead, Panel, PanelHeader, Rows, Row } from "@/components/ui/card";
import { IconChip } from "@/components/ui/icon-chip";
import { InfoTip } from "@/components/ui/info-tip";
import { SwitchSubmit } from "@/components/ui/switch";
import { AutomationRules } from "@/components/settings/automation-rules";
import { Breadcrumb } from "@/components/shell/module-page";
import { Pill } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { clearSampleData, resetSampleData, saveAccount, toggleAutomation } from "@/lib/actions/settings";
import { getAutomation } from "@/lib/queries";
import { getAdminEmail } from "@/lib/admin";
import { automationSettings } from "@/lib/data/settings";
import { BackupPanel } from "@/components/settings/backup-panel";
import { PeoplePanel } from "@/components/settings/catalog-panels";
import { AiBudgetPanel, IntegrationsPanel, SystemLogPanel } from "@/components/settings/integration-panels";
import { AiTeamPanel } from "@/components/settings/ai-team-panel";
import { SecondBrainPanel } from "@/components/settings/second-brain-panel";
import { RenderWorkerPanel } from "@/components/settings/render-worker-panel";
import { MoreOptions } from "@/components/settings/setting-item";
import { FaqPanel } from "@/components/settings/faq-panel";
import { AlertsPanel, BrandPanel } from "@/components/settings/brand-panels";
import { AutoEditPanel } from "@/components/settings/auto-edit-panel";
import { SettingsGroup, SettingsTabs } from "@/components/settings/settings-tabs";
import { isSettingsGroup } from "@/config/settings-groups";

export const metadata = { title: "Cài đặt – BAOR AI OS" };

const input = "mt-1 h-8 w-full rounded-md border border-border-2 bg-surface px-2.5 text-[13px] text-ink outline-none focus-visible:outline-2 focus-visible:outline-jade";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ person?: string; faq?: string; tab?: string; rules?: string; add?: string; edit?: string; test?: string }> }) {
  const sp = await searchParams;
  const { person, faq, tab } = sp;
  // Mở thẳng nhóm của biểu mẫu đang sửa; ?tab= chọn nhóm; #mục (liên kết cũ) do SettingsTabs xử lý phía trình duyệt
  const initial = isSettingsGroup(tab) ? tab : person ? "he-thong" : faq ? "thuong-hieu" : "ket-noi";
  const automation = getAutomation();
  const adminEmail = getAdminEmail();

  return (
    <>
      <Breadcrumb items={[{ label: "Tổng quan", href: "/dashboard" }, { label: "Cài đặt" }]} />
      <PageHead title="Cài đặt" sub="Chọn một nhóm để chỉnh." />

      <SettingsTabs initial={initial}>
        <SettingsGroup id="ket-noi">
          <IntegrationsPanel />
        </SettingsGroup>

        <SettingsGroup id="thuong-hieu">
          <BrandPanel />
          <AssetsLink />
          <FaqPanel editing={faq} />
        </SettingsGroup>

        <SettingsGroup id="video">
          <RenderWorkerPanel />
          <AutoEditPanel />
          <AssetsLink />
        </SettingsGroup>

        <SettingsGroup id="ai">
          <AiBudgetPanel />
          <AiTeamPanel />
        </SettingsGroup>

        <SettingsGroup id="tu-dong">
          <Panel id="automation">
            <PanelHeader title="Việc tự chạy" sub="Gạt để bật / tắt" icon={Zap} tone="yellow" info="Bật / tắt từng việc. Việc có nhãn ‘cần duyệt’ luôn chờ anh trước khi làm." />
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
                        <SwitchSubmit on={on} label={s.label} />
                      </form>
                    }
                    title={<span className="flex flex-wrap items-center gap-1.5">{s.label}{s.requiresApproval && <Pill tone="amber"><ShieldAlert size={11} aria-hidden />Cần duyệt</Pill>}<InfoTip label={`Giải thích: ${s.label}`}>{s.description}</InfoTip></span>}
                  />
                );
              })}
            </Rows>
          </Panel>
          <AutomationRules sp={sp} />
          <AlertsPanel />
        </SettingsGroup>

        <SettingsGroup id="he-thong">
          <Panel id="account">
            <PanelHeader title="Tài khoản của anh" sub={adminEmail} icon={UserRound} tone="slate" />
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
            <PanelHeader title="Dữ liệu mẫu" sub="Dữ liệu thử" icon={Database} tone="slate" info="Dữ liệu thử để xem cách hệ thống chạy. Dữ liệu anh tự tạo luôn được giữ." />
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

// Dòng dẫn sang trang Tư liệu (logo, nhạc, B-roll, thư mục thả — đã chuyển khỏi Cài đặt, OWNER 26/10/2026)
function AssetsLink() {
  return (
    <Link href="/assets" className="card chip-host flex items-center gap-3 px-4 py-3 focus-visible:outline-2 focus-visible:outline-jade">
      <IconChip icon={FolderOpen} tone="indigo" size="sm" />
      <span className="flex-1 font-semibold text-ink">Tư liệu</span>
      <span className="text-[12px] text-ink-3">Logo, nhạc, B-roll</span>
      <span className="btn btn-glass inline-flex h-7 items-center gap-1 px-2.5 text-[12px] font-medium">Mở <ArrowRight size={13} aria-hidden /></span>
    </Link>
  );
}
