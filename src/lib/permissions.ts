import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getAdminEmail } from "@/lib/admin";
import { catalogRepo, permissionLabel, type Permission } from "@/lib/catalog/repository";

// Ai đang thao tác và có quyền gì. Tài khoản quản trị (.env / Cài đặt) luôn là "admin";
// nhân sự trong Cài đặt › Nhân sự đăng nhập bằng email + mật khẩu riêng và mang quyền của mình.
export interface Actor {
  email: string;
  name: string;
  role: string;
  permission: Permission;
  personId: string | null;
}

const rank: Record<Permission, number> = { staff: 0, manager: 1, admin: 2 };

export function actorFor(email: string): Actor {
  const e = email.trim().toLowerCase();
  if (e && e === getAdminEmail().toLowerCase()) {
    const p = catalogRepo.listPeople(true).find((x) => x.email.toLowerCase() === e);
    return { email: e, name: p?.name ?? "Quản trị viên", role: p?.role ?? "Tài khoản quản trị", permission: "admin", personId: p?.id ?? null };
  }
  const p = catalogRepo.listPeople(true).find((x) => x.email.toLowerCase() === e);
  if (p) return { email: e, name: p.name, role: p.role, permission: p.active ? p.permission : "staff", personId: p.id };
  return { email: e, name: e, role: "Chưa có trong Nhân sự", permission: "staff", personId: null };
}

export async function currentActor(): Promise<Actor> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return actorFor(u.email);
}

export function can(actor: Pick<Actor, "permission">, level: Permission): boolean {
  return rank[actor.permission] >= rank[level];
}

// Dùng ở đầu server action: không đủ quyền thì quay về trang kèm thông báo lỗi, không thực hiện.
export async function requirePermission(level: Permission, backPath: string): Promise<Actor> {
  const actor = await currentActor();
  if (!can(actor, level)) {
    const sep = backPath.includes("?") ? "&" : "?";
    redirect(`${backPath}${sep}toast=${encodeURIComponent(`Cần quyền ${permissionLabel[level].label} để thực hiện. Bạn đang là ${permissionLabel[actor.permission].label}.`)}&tone=error`);
  }
  return actor;
}
