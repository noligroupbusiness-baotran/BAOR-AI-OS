"use server";

import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getAdminEmail, hashPassword, setSetting, verifyLogin } from "@/lib/admin";
import { currentActor } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { done } from "./common";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

// Ai đăng nhập cũng tự đổi được mật khẩu của mình, cần mật khẩu hiện tại.
// Tài khoản quản trị lưu ở settings; nhân sự lưu ở bảng people. Không đổi email ở đây (quản trị đổi trong Cài đặt › Nhân sự).
export async function changeMyPassword(fd: FormData) {
  const actor = await currentActor();
  const current = str(fd, "current");
  const next = str(fd, "password");
  const confirm = str(fd, "confirm");
  const back = "/account";
  const fail = (msg: string) => done(`${back}?tone=error`, msg);
  if (!current) return fail("Cần nhập mật khẩu hiện tại.");
  if (next.length < 8) return fail("Mật khẩu mới cần ít nhất 8 ký tự.");
  if (next === current) return fail("Mật khẩu mới phải khác mật khẩu hiện tại.");
  if (next !== confirm) return fail("Hai lần nhập mật khẩu mới không khớp.");
  if (!verifyLogin(actor.email, current)) return fail("Mật khẩu hiện tại không đúng.");

  const isAdminAccount = actor.email.toLowerCase() === getAdminEmail().toLowerCase();
  if (isAdminAccount) {
    setSetting("admin.passwordHash", hashPassword(next));
  } else {
    const person = getDb().select().from(schema.people).where(eq(schema.people.email, actor.email)).get();
    if (!person) return fail("Không tìm thấy tài khoản nhân sự tương ứng.");
    getDb().update(schema.people).set({ passwordHash: hashPassword(next), updatedAt: new Date().toISOString() }).where(eq(schema.people.id, person.id)).run();
  }
  logActivity("human", `${actor.name} đổi mật khẩu đăng nhập.`, "security");
  done(back, "Đã đổi mật khẩu. Lần đăng nhập sau dùng mật khẩu mới.");
}
