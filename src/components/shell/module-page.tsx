import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { menu } from "@/config/menu";
import { moduleGroups } from "@/config/modules";
import { Panel, PanelHeader } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status";
import { EmptyState } from "@/components/ui/empty-state";

// Breadcrumb dùng cho các trang phân hệ.
export function Breadcrumb({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Vị trí" className="mb-2 flex items-center gap-1 text-[12px] text-ink-3">
      {items.map((it, i) => (
        <span key={it.label} className="flex items-center gap-1">
          {i > 0 && <ChevronRight size={12} aria-hidden />}
          {it.href ? <Link href={it.href} className="hover:text-ink hover:underline">{it.label}</Link> : <span className="text-ink-2">{it.label}</span>}
        </span>
      ))}
    </nav>
  );
}

// Danh sách nhóm chức năng của một phân hệ, kèm trạng thái. Dùng ở cả trang khung và trang đã có nghiệp vụ.
export function ModuleGroups({ moduleKey, title = "Nhóm chức năng" }: { moduleKey: string; title?: string }) {
  const groups = moduleGroups[moduleKey] ?? [];
  const active = groups.filter((g) => g.status === "active").length;
  return (
    <Panel>
      <PanelHeader title={title} sub={active === groups.length ? `Cả ${groups.length} nhóm đã có màn hình làm việc.` : `${active}/${groups.length} nhóm đã có màn hình làm việc. Phần còn lại sẽ triển khai ở giai đoạn sau.`} />
      {groups.length === 0 ? (
        <EmptyState title="Chưa xác định nhóm chức năng" />
      ) : (
        <ul className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g, i) => (
            <li key={g.name} className="flex items-center justify-between gap-3 bg-surface px-4 py-3">
              <span className="flex min-w-0 items-center gap-2.5 text-[13px] text-ink">
                <span className="num w-5 shrink-0 text-[11px] font-semibold text-ink-3">{i + 1}</span>
                {g.status === "active" && g.href ? <Link href={g.href} className="font-medium hover:underline">{g.name}</Link> : <span>{g.name}</span>}
              </span>
              <StatusPill status={g.status === "active" ? "active" : "planned"} label={g.status === "active" ? "Đang hoạt động" : undefined} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// Trang khung thống nhất cho phân hệ chưa có nghiệp vụ.
export function ModulePage({ moduleKey, action }: { moduleKey: string; action?: React.ReactNode }) {
  const m = menu.find((x) => x.key === moduleKey);
  if (!m) return <EmptyState title="Không tìm thấy phân hệ" />;
  return (
    <>
      <Breadcrumb items={[{ label: "Điều hành", href: "/dashboard" }, { label: m.label }]} />
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[20px] font-bold tracking-[-0.01em] text-ink">{m.label}</h1>
            <StatusPill status="planned" />
          </div>
          <p className="mt-1 max-w-[64ch] text-ink-2">{m.description}</p>
        </div>
        {action}
      </div>
      <ModuleGroups moduleKey={moduleKey} title="Các nhóm chức năng sẽ phát triển" />
      <div className="card mt-3.5">
        <EmptyState title="Phân hệ này chưa có dữ liệu" hint="Khi phân hệ được triển khai, danh sách và số liệu sẽ hiển thị ở đây. Bố cục giữ nguyên để tiếp tục xây dựng." />
      </div>
    </>
  );
}
