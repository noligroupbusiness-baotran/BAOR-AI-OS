// Nguồn dữ liệu chuẩn của Cài đặt hệ thống: nhân sự & phân quyền. (Sản phẩm & bảng giá đã bỏ — chỉ marketing, OWNER 25/10/2026;
// bảng products giữ trong CSDL để bảo toàn dữ liệu, không còn đọc / ghi.)
// Mọi phân hệ (Chiến dịch, Nội dung, AI...) đọc qua catalogRepo, không giữ bản sao riêng.
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { hashPassword, isAdminEmail } from "@/lib/admin";
import type { Person } from "@/lib/campaigns/types";

export type Permission = "admin" | "manager" | "staff";

export interface PersonRecord extends Person {
  email: string;
  permission: Permission;
  active: boolean;
  /** Đã được cấp mật khẩu đăng nhập hay chưa (không bao giờ trả về hash). */
  canLogin: boolean;
}

export const permissionLabel: Record<Permission, { label: string; hint: string }> = {
  admin: { label: "Quản trị", hint: "Toàn quyền, kể cả phê duyệt ngân sách và kết nối tài khoản." },
  manager: { label: "Quản lý", hint: "Tạo và phê duyệt chiến dịch, nội dung, video." },
  staff: { label: "Nhân viên", hint: "Thực hiện việc được giao, gửi duyệt, không tự phê duyệt." },
};

const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const nowIso = () => new Date().toISOString();

export interface CatalogRepository {
  listPeople(includeInactive?: boolean): PersonRecord[];
  getPerson(id: string): PersonRecord | undefined;
  savePerson(input: Omit<PersonRecord, "id" | "active" | "canLogin"> & { id?: string; password?: string }): PersonRecord;
  setPersonActive(id: string, active: boolean): void;
}

class SqliteCatalogRepository implements CatalogRepository {
  private get db() {
    return getDb();
  }

  listPeople(includeInactive = false): PersonRecord[] {
    const rows = this.db.select().from(schema.people).orderBy(asc(schema.people.name)).all();
    return rows.filter((r) => includeInactive || r.active).map(toPerson);
  }

  getPerson(id: string) {
    const r = this.db.select().from(schema.people).where(eq(schema.people.id, id)).get();
    return r ? toPerson(r) : undefined;
  }

  savePerson(input: Omit<PersonRecord, "id" | "active" | "canLogin"> & { id?: string; password?: string }): PersonRecord {
    const block = personEditBlock(input.id, input.email);
    if (block) throw new Error(block);
    const id = input.id ?? newId("u");
    const passwordHash = input.password ? hashPassword(input.password) : undefined;
    const row = { id, name: input.name, role: input.role, email: input.email, permission: input.permission, active: true, updatedAt: nowIso(), ...(passwordHash ? { passwordHash } : {}) };
    this.db
      .insert(schema.people)
      .values(row)
      .onConflictDoUpdate({ target: schema.people.id, set: { name: row.name, role: row.role, email: row.email, permission: row.permission, updatedAt: row.updatedAt, ...(passwordHash ? { passwordHash } : {}) } })
      .run();
    return this.getPerson(id)!;
  }

  setPersonActive(id: string, active: boolean) {
    const block = personEditBlock(id, "");
    if (block) throw new Error(block);
    this.db.update(schema.people).set({ active, updatedAt: nowIso() }).where(eq(schema.people.id, id)).run();
  }
}

/** Nhân sự không được mang email OWNER: đặt mật khẩu / đổi quyền / ngừng hoạt động bản ghi đó sẽ đăng nhập hoặc thu hồi phiên
 *  dưới tên OWNER. Tài khoản OWNER chỉ quản lý ở Cài đặt › Tài khoản quản trị. null = được. */
export function personEditBlock(id: string | undefined, email: string): string | null {
  if (isAdminEmail(email)) return "Email này là tài khoản OWNER (quản trị chính): không thêm vào Nhân sự.";
  const before = id ? getDb().select({ email: schema.people.email }).from(schema.people).where(eq(schema.people.id, id)).get() : undefined;
  if (before && isAdminEmail(before.email)) return "Bản ghi mang email OWNER: quản lý ở Cài đặt › Tài khoản quản trị, không sửa ở Nhân sự.";
  return null;
}

function toPerson(r: typeof schema.people.$inferSelect): PersonRecord {
  return { id: r.id, name: r.name, role: r.role, email: r.email, permission: r.permission as Permission, active: r.active, canLogin: !!r.passwordHash };
}

export const catalogRepo: CatalogRepository = new SqliteCatalogRepository();
