import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Pill } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { Toggle } from "@/components/ui/toggle";
import { automationSettings, integrations } from "@/lib/data/settings";
import { getAdminCredentials } from "@/lib/auth";

export const metadata = { title: "Cài đặt – BAOR AI OS" };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab = "integrations" } = await searchParams;
  const admin = getAdminCredentials();

  return (
    <>
      <PageHeader
        emoji="⚙️"
        title="Cài đặt hệ thống"
        subtitle="Kết nối nền tảng, bật/tắt từng bước tự động và quản lý tài khoản quản trị."
      />

      <FilterTabs
        basePath="/settings"
        active={tab}
        tabs={[
          { key: "integrations", label: "Kết nối & API", emoji: "🔌", count: integrations.filter((i) => i.connected).length },
          { key: "automation", label: "Tự động hóa", emoji: "⚙️" },
          { key: "account", label: "Tài khoản", emoji: "👤" },
        ]}
      />

      {tab === "integrations" && (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {integrations.map((i) => (
            <Card key={i.key}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[13.5px] font-bold text-ink">{i.name}</h3>
                    {i.connected ? (
                      <Pill tone="green" size="xs">● Đã kết nối</Pill>
                    ) : (
                      <Pill tone="neutral" size="xs">○ Chưa kết nối</Pill>
                    )}
                  </div>
                  <p className="mt-0.5 text-[12px] text-muted">{i.description}</p>
                  {i.account && <div className="mt-1 text-[11.5px] text-faint">{i.account}</div>}
                  {i.scopes && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {i.scopes.map((s) => (
                        <Pill key={s} tone="slate" size="xs" className="font-mono">{s}</Pill>
                      ))}
                    </div>
                  )}
                </div>
                <div className="shrink-0">
                  {i.connected ? (
                    <Button size="xs">Kết nối lại</Button>
                  ) : (
                    <Button size="xs" variant="primary">Kết nối</Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === "automation" && (
        <Card className="mt-4">
          <CardHeader
            icon="⚙️"
            title="Từng bước tự động"
            subtitle="Tắt một bước thì AI vẫn chuẩn bị nhưng không tự thực hiện. Bước có nhãn ‘cần duyệt’ luôn chờ bạn."
          />
          <ul className="divide-y divide-border/70">
            {automationSettings.map((s) => (
              <li key={s.key} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-ink">{s.label}</span>
                    {s.requiresApproval && <Pill tone="gold" size="xs">🙋 cần bạn duyệt</Pill>}
                  </div>
                  <p className="mt-0.5 text-[12px] text-muted">{s.description}</p>
                </div>
                <Toggle defaultChecked={s.enabled} label={s.label} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {tab === "account" && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader icon="👤" title="Tài khoản quản trị" subtitle="Hiện chỉ có một tài khoản chủ fanpage." />
            <div className="space-y-3">
              <label className="block">
                <span className="eyebrow">Email đăng nhập</span>
                <input
                  defaultValue={admin.email}
                  className="mt-1 h-9 w-full rounded-md border border-border-strong bg-bg-elevated px-3 text-[13px]"
                />
              </label>
              <label className="block">
                <span className="eyebrow">Mật khẩu mới</span>
                <input
                  type="password"
                  placeholder="••••••••"
                  className="mt-1 h-9 w-full rounded-md border border-border-strong bg-bg-elevated px-3 text-[13px]"
                />
              </label>
              <Button variant="primary">Lưu thay đổi</Button>
              <p className="text-[11.5px] text-faint">
                Ở phiên bản này, email/mật khẩu được đặt trong tệp <code className="font-mono">.env.local</code>{" "}
                (ADMIN_EMAIL, ADMIN_PASSWORD). Khi nối cơ sở dữ liệu, form này sẽ lưu trực tiếp.
              </p>
            </div>
          </Card>
          <Card>
            <CardHeader icon="🏷️" title="Thương hiệu & giọng văn" subtitle="AI dùng thông tin này khi viết nội dung và trả lời khách." />
            <div className="space-y-3">
              <label className="block">
                <span className="eyebrow">Tên thương hiệu</span>
                <input placeholder="VD: BAOR Skincare" className="mt-1 h-9 w-full rounded-md border border-border-strong bg-bg-elevated px-3 text-[13px]" />
              </label>
              <label className="block">
                <span className="eyebrow">Sản phẩm / dịch vụ chính</span>
                <input placeholder="VD: Serum vitamin C, combo 3 bước…" className="mt-1 h-9 w-full rounded-md border border-border-strong bg-bg-elevated px-3 text-[13px]" />
              </label>
              <label className="block">
                <span className="eyebrow">Giọng văn</span>
                <textarea
                  rows={3}
                  placeholder="VD: Gần gũi, xưng ‘em’ với khách, không dùng từ đao to búa lớn, luôn có bằng chứng…"
                  className="mt-1 w-full rounded-md border border-border-strong bg-bg-elevated px-3 py-2 text-[13px]"
                />
              </label>
              <Button variant="primary">Lưu</Button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
