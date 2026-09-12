import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
export { logActivity } from "@/lib/activity";

// Sau mỗi hành động: làm mới trang và hiện thông báo ngắn.
export function done(path: string, toast: string): never {
  revalidatePath("/", "layout");
  redirect(`${path}${path.includes("?") ? "&" : "?"}toast=${encodeURIComponent(toast)}`);
}

export const nowIso = () => new Date().toISOString();
export const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
