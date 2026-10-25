import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
export { logActivity } from "@/lib/activity";
import { withSettingsTab } from "@/config/settings-groups";

// Sau mỗi hành động: làm mới trang và hiện thông báo ngắn.
export function done(path: string, toast: string): never {
  revalidatePath("/", "layout");
  redirect(withToast(path, toast));
}

export const nowIso = () => new Date().toISOString();
export const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Gắn ?toast= vào trước phần #neo (nếu có): tham số đặt sau # thì trình duyệt coi là neo và thông báo không hiện. */
export function withToast(path: string, toast: string): string {
  const i = path.indexOf("#");
  let base = i >= 0 ? path.slice(0, i) : path;
  let hash = i >= 0 ? path.slice(i) : "";
  // Dạng cũ "/x#neo?tone=error": đưa phần tham số lên trước neo.
  const q = hash.indexOf("?");
  if (q >= 0) {
    base += (base.includes("?") ? "&" : "?") + hash.slice(q + 1);
    hash = hash.slice(0, q);
  }
  // Cài đặt chia nhóm: /settings#neo → thêm ?tab=<nhóm> để sau khi lưu vẫn ở đúng nhóm
  return withSettingsTab(`${base}${base.includes("?") ? "&" : "?"}toast=${encodeURIComponent(toast)}${hash}`);
}
