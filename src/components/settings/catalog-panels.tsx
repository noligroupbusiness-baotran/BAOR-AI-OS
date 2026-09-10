import { Panel, PanelHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Button, LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, inputClass } from "@/components/ui/field";
import { SubmitButton } from "@/components/campaigns/submit-button";
import { catalogRepo, permissionLabel, type PersonRecord, type ProductRecord } from "@/lib/catalog/repository";
import { savePerson, saveProduct, togglePerson, toggleProduct } from "@/lib/actions/catalog";
import { formatCurrency, cn } from "@/lib/format";

// Cài đặt › Sản phẩm và bảng giá. Tham số URL: ?product=new | ?product=<id> để mở biểu mẫu.
export function ProductsPanel({ editing }: { editing?: string }) {
  const items = catalogRepo.listProducts(true);
  const current = editing && editing !== "new" ? items.find((p) => p.id === editing) : undefined;
  return (
    <Panel id="products">
      <PanelHeader
        title="Sản phẩm và bảng giá"
        sub="Nguồn giá và mô tả chuẩn. AI và các phân hệ chỉ dùng thông tin ở đây, không tự đặt giá."
        action={editing === "new" ? undefined : <LinkButton href="/settings?product=new#products" variant="primary">Thêm sản phẩm</LinkButton>}
      />
      {editing === "new" && <ProductForm />}
      {items.length === 0 && editing !== "new" ? (
        <EmptyState title="Chưa có sản phẩm hoặc dịch vụ" hint="Thêm sản phẩm để Chiến dịch và Nội dung có thể chọn." />
      ) : (
        <ul className="m-0 list-none p-0">
          {items.map((p) => (
            <li key={p.id} className={cn("border-b border-border last:border-b-0", current?.id === p.id && "bg-jade-soft/20")}>
              <div className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("font-semibold", p.active ? "text-ink" : "text-ink-3 line-through")}>{p.name}</span>
                    <Pill>{p.brand || "Chưa có thương hiệu"}</Pill>
                    {!p.active && <Pill tone="neutral">Ngừng dùng</Pill>}
                  </div>
                  <div className="mt-0.5 text-[12px] text-ink-2">
                    <span className="num font-medium text-ink">{p.price > 0 ? `${formatCurrency(p.price)}/${p.unit}` : "Không tính giá"}</span>
                    {p.description ? ` · ${p.description}` : ""}
                  </div>
                </div>
                <div className="flex gap-1.5">
                  {current?.id !== p.id && <LinkButton href={`/settings?product=${p.id}#products`}>Sửa</LinkButton>}
                  <form action={toggleProduct}>
                    <input type="hidden" name="id" value={p.id} />
                    <Button type="submit" variant="ghost">{p.active ? "Ngừng dùng" : "Dùng lại"}</Button>
                  </form>
                </div>
              </div>
              {current?.id === p.id && <ProductForm product={current} />}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function ProductForm({ product }: { product?: ProductRecord }) {
  return (
    <form action={saveProduct} className="grid gap-3 border-t border-border bg-ground px-4 py-3 md:grid-cols-2">
      {product && <input type="hidden" name="id" value={product.id} />}
      <Field label="Tên sản phẩm / dịch vụ" required>
        <input name="name" required defaultValue={product?.name ?? ""} className={inputClass} placeholder="VD: Gội dưỡng sinh" />
      </Field>
      <Field label="Thương hiệu / đơn vị">
        <input name="brand" defaultValue={product?.brand ?? ""} className={inputClass} placeholder="VD: Mộc Diệp Spa" />
      </Field>
      <Field label="Giá (₫)" hint="Để 0 nếu không tính giá (VD: chương trình tuyển dụng).">
        <input name="price" inputMode="numeric" defaultValue={product?.price ?? ""} className={inputClass} placeholder="VD: 39000" />
      </Field>
      <Field label="Đơn vị">
        <input name="unit" defaultValue={product?.unit ?? ""} className={inputClass} placeholder="VD: lượt, chai, bộ" />
      </Field>
      <Field label="Mô tả / công dụng" className="md:col-span-2">
        <input name="description" defaultValue={product?.description ?? ""} className={inputClass} placeholder="AI chỉ dùng mô tả này, không tự bịa công dụng." />
      </Field>
      <div className="flex gap-2 md:col-span-2">
        <SubmitButton pendingText="Đang lưu…">{product ? "Lưu thay đổi" : "Thêm sản phẩm"}</SubmitButton>
        <LinkButton href="/settings#products" variant="ghost">Hủy</LinkButton>
      </div>
    </form>
  );
}

// Cài đặt › Nhân sự và phân quyền. Tham số URL: ?person=new | ?person=<id>.
export function PeoplePanel({ editing }: { editing?: string }) {
  const items = catalogRepo.listPeople(true);
  const current = editing && editing !== "new" ? items.find((p) => p.id === editing) : undefined;
  return (
    <Panel id="people">
      <PanelHeader
        title="Nhân sự và phân quyền"
        sub="Người phụ trách chiến dịch, mục tiêu kênh, nội dung và chăm sóc khách. Chỉ nhân sự đang hoạt động mới được phân công mới."
        action={editing === "new" ? undefined : <LinkButton href="/settings?person=new#people" variant="primary">Thêm nhân sự</LinkButton>}
      />
      {editing === "new" && <PersonForm />}
      {items.length === 0 && editing !== "new" ? (
        <EmptyState title="Chưa có nhân sự" />
      ) : (
        <ul className="m-0 list-none p-0">
          {items.map((p) => (
            <li key={p.id} className={cn("border-b border-border last:border-b-0", current?.id === p.id && "bg-jade-soft/20")}>
              <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-2.5">
                <span className={cn("grid h-8 w-8 place-items-center rounded-full text-[12px] font-bold", p.active ? "bg-jade-soft text-jade-ink" : "bg-ground-2 text-ink-3")} aria-hidden>
                  {p.name.split(" ").slice(-1)[0]?.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("font-semibold", p.active ? "text-ink" : "text-ink-3")}>{p.name}</span>
                    <Pill tone={p.permission === "admin" ? "jade" : "neutral"}>{permissionLabel[p.permission].label}</Pill>
                    {!p.active && <Pill>Ngừng hoạt động</Pill>}
                  </div>
                  <div className="mt-0.5 truncate text-[12px] text-ink-2">{p.role || "Chưa có vai trò"}{p.email ? ` · ${p.email}` : ""}</div>
                </div>
                <div className="flex gap-1.5">
                  {current?.id !== p.id && <LinkButton href={`/settings?person=${p.id}#people`}>Sửa</LinkButton>}
                  <form action={togglePerson}>
                    <input type="hidden" name="id" value={p.id} />
                    <Button type="submit" variant="ghost">{p.active ? "Ngừng" : "Kích hoạt"}</Button>
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
      <div className="flex gap-2 md:col-span-2">
        <SubmitButton pendingText="Đang lưu…">{person ? "Lưu thay đổi" : "Thêm nhân sự"}</SubmitButton>
        <LinkButton href="/settings#people" variant="ghost">Hủy</LinkButton>
      </div>
    </form>
  );
}
