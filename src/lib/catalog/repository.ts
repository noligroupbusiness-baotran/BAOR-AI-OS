// Nguồn dữ liệu chuẩn của Cài đặt hệ thống: sản phẩm & bảng giá, nhân sự & phân quyền.
// Mọi phân hệ (Chiến dịch, Nội dung, AI...) đọc qua catalogRepo, không giữ bản sao riêng.
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Person, Product } from "@/lib/campaigns/types";

export type Permission = "admin" | "manager" | "staff";

export interface PersonRecord extends Person {
  email: string;
  permission: Permission;
  active: boolean;
}

export interface ProductRecord extends Product {
  active: boolean;
}

export const permissionLabel: Record<Permission, { label: string; hint: string }> = {
  admin: { label: "Quản trị", hint: "Toàn quyền, kể cả phê duyệt ngân sách và kết nối tài khoản." },
  manager: { label: "Quản lý", hint: "Tạo và phê duyệt chiến dịch, nội dung, video." },
  staff: { label: "Nhân viên", hint: "Thực hiện việc được giao, gửi duyệt, không tự phê duyệt." },
};

const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const nowIso = () => new Date().toISOString();

export interface CatalogRepository {
  listProducts(includeInactive?: boolean): ProductRecord[];
  getProduct(id: string): ProductRecord | undefined;
  saveProduct(input: Omit<ProductRecord, "id" | "active"> & { id?: string }): ProductRecord;
  setProductActive(id: string, active: boolean): void;
  listPeople(includeInactive?: boolean): PersonRecord[];
  getPerson(id: string): PersonRecord | undefined;
  savePerson(input: Omit<PersonRecord, "id" | "active"> & { id?: string }): PersonRecord;
  setPersonActive(id: string, active: boolean): void;
}

class SqliteCatalogRepository implements CatalogRepository {
  private get db() {
    return getDb();
  }

  listProducts(includeInactive = false): ProductRecord[] {
    const rows = this.db.select().from(schema.products).orderBy(asc(schema.products.brand), asc(schema.products.name)).all();
    return rows.filter((r) => includeInactive || r.active);
  }

  getProduct(id: string) {
    return this.db.select().from(schema.products).where(eq(schema.products.id, id)).get() ?? undefined;
  }

  saveProduct(input: Omit<ProductRecord, "id" | "active"> & { id?: string }): ProductRecord {
    const id = input.id ?? newId("pr");
    const row = { id, name: input.name, brand: input.brand, price: input.price, unit: input.unit, description: input.description, active: true, updatedAt: nowIso() };
    this.db
      .insert(schema.products)
      .values(row)
      .onConflictDoUpdate({ target: schema.products.id, set: { name: row.name, brand: row.brand, price: row.price, unit: row.unit, description: row.description, updatedAt: row.updatedAt } })
      .run();
    return this.getProduct(id) ?? row;
  }

  setProductActive(id: string, active: boolean) {
    this.db.update(schema.products).set({ active, updatedAt: nowIso() }).where(eq(schema.products.id, id)).run();
  }

  listPeople(includeInactive = false): PersonRecord[] {
    const rows = this.db.select().from(schema.people).orderBy(asc(schema.people.name)).all();
    return rows.filter((r) => includeInactive || r.active).map((r) => ({ ...r, permission: r.permission as Permission }));
  }

  getPerson(id: string) {
    const r = this.db.select().from(schema.people).where(eq(schema.people.id, id)).get();
    return r ? { ...r, permission: r.permission as Permission } : undefined;
  }

  savePerson(input: Omit<PersonRecord, "id" | "active"> & { id?: string }): PersonRecord {
    const id = input.id ?? newId("u");
    const row = { id, name: input.name, role: input.role, email: input.email, permission: input.permission, active: true, updatedAt: nowIso() };
    this.db
      .insert(schema.people)
      .values(row)
      .onConflictDoUpdate({ target: schema.people.id, set: { name: row.name, role: row.role, email: row.email, permission: row.permission, updatedAt: row.updatedAt } })
      .run();
    return this.getPerson(id) ?? row;
  }

  setPersonActive(id: string, active: boolean) {
    this.db.update(schema.people).set({ active, updatedAt: nowIso() }).where(eq(schema.people.id, id)).run();
  }
}

export const catalogRepo: CatalogRepository = new SqliteCatalogRepository();
