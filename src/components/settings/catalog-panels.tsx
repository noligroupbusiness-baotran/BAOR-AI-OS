import { Users } from "lucide-react";
import { Panel, PanelHeader } from "@/components/ui/card";
import { SwitchSubmit } from "@/components/ui/switch";
import { ListFilter } from "@/components/ui/list-filter";
import { Pill } from "@/components/ui/pill";
import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, inputClass } from "@/components/ui/field";
import { SubmitButton } from "@/components/campaigns/submit-button";
import { catalogRepo, permissionLabel, type PersonRecord } from "@/lib/catalog/repository";
import { savePerson, togglePerson } from "@/lib/actions/catalog";
import { cn } from "@/lib/format";

// Cài đặt › Nhân sự. Tham số URL: ?person=new | ?person=<id> để mở biểu mẫu.
export function PeoplePanel({ editing }: { editing?: string }) {
  const items = catalogRepo.listPeople(true);
  const current = editing && editing !== "new" ? items.find((p) => p.id === editing) : undefined;
  return (
    <Panel id="people">
      <PanelHeader
        title="Nhân sự"
        sub="Người phụ trách, quyền đăng nhập"
        icon={Users}
        tone="slate"
        info="Người phụ trách chiến dịch, nội dung và chăm sóc khách; quyền đăng nhập."
        action={<div className="flex items-center gap-2">{items.length > 5 && <ListFilter target="people" placeholder="Lọc tên, vai trò, email…" />}{editing !== "new" && <LinkButton href="/settings?person=new#people" variant="primary">Thêm</LinkButton>}</div>}
      />
      {editing === "new" && <PersonForm />}
      {items.length === 0 && editing !== "new" ? (
        <EmptyState title="Chưa có nhân sự" />
      ) : (
        <ul className="m-0 list-none p-0">
          {items.map((p) => (
            <li key={p.id} data-search={`${p.name} ${p.role} ${p.email}`} className={cn("border-b border-border last:border-b-0", current?.id === p.id && "bg-jade-soft/20")}>
              <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-2.5">
                <span className={cn("grid h-8 w-8 place-items-center rounded-full text-[12px] font-bold", p.active ? "bg-jade-soft text-jade-ink" : "bg-ground-2 text-ink-3")} aria-hidden>
                  {p.name.split(" ").slice(-1)[0]?.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("font-semibold", p.active ? "text-ink" : "text-ink-3")}>{p.name}</span>
                    <Pill tone={p.permission === "admin" ? "jade" : "neutral"}>{permissionLabel[p.permission].label}</Pill>
                    {p.canLogin ? <Pill tone="jade">Đăng nhập được</Pill> : <Pill tone="amber">Chưa có mật khẩu</Pill>}
                    {!p.active && <Pill>Ngừng hoạt động</Pill>}
                  </div>
                  <div className="mt-0.5 truncate text-[12px] text-ink-2">{p.role || "Chưa có vai trò"}{p.email ? ` · ${p.email}` : ""}</div>
                </div>
                <div className="flex items-center gap-2.5">
                  {current?.id !== p.id && <LinkButton href={`/settings?person=${p.id}#people`}>Sửa</LinkButton>}
                  <form action={togglePerson} className="flex items-center">
                    <input type="hidden" name="id" value={p.id} />
                    <SwitchSubmit on={p.active} label={p.active ? `Ngừng ${p.name}` : `Kích hoạt ${p.name}`} />
                  </form>
                </div>
              </div>
              {current?.id === p.id && <PersonForm person={current} />}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function PersonForm({ person }: { person?: PersonRecord }) {
  return (
    <form action={savePerson} className="grid gap-3 border-t border-border bg-ground px-4 py-3 md:grid-cols-2">
      {person && <input type="hidden" name="id" value={person.id} />}
      <Field label="Họ tên" required>
        <input name="name" required defaultValue={person?.name ?? ""} className={inputClass} />
      </Field>
      <Field label="Vai trò">
        <input name="role" defaultValue={person?.role ?? ""} className={inputClass} placeholder="VD: Quản lý Marketing, Nội dung, Quảng cáo" />
      </Field>
      <Field label="Email">
        <input name="email" type="email" defaultValue={person?.email ?? ""} className={inputClass} placeholder="ten@congty.vn" />
      </Field>
      <Field label="Quyền hạn" hint={permissionLabel[person?.permission ?? "staff"].hint}>
        <select name="permission" defaultValue={person?.permission ?? "staff"} className={inputClass}>
          {(Object.keys(permissionLabel) as (keyof typeof permissionLabel)[]).map((k) => (
            <option key={k} value={k}>{permissionLabel[k].label}</option>
          ))}
        </select>
      </Field>
      <Field label={person?.canLogin ? "Mật khẩu mới" : "Mật khẩu đăng nhập"} hint={person?.canLogin ? "Để trống nếu giữ" : "Đăng nhập bằng email ở trên"}>
        <input name="password" type="password" autoComplete="new-password" className={inputClass} placeholder="Ít nhất 10 ký tự, không chứa tên hay email" />
      </Field>
      <div className="flex gap-2 md:col-span-2">
        <SubmitButton pendingText="Đang lưu…">{person ? "Lưu thay đổi" : "Thêm nhân sự"}</SubmitButton>
        <LinkButton href="/settings?tab=he-thong#people" variant="ghost">Hủy</LinkButton>
      </div>
    </form>
  );
}
