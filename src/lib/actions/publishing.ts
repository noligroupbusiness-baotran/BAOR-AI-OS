"use server";

// CP04: lên lịch đăng video đã duyệt, thử lại, huỷ, bật/tắt chế độ thử.
import { requirePermission } from "@/lib/permissions";
import { setSetting } from "@/lib/admin";
import { logActivity } from "@/lib/activity";
import { cancelVideoPost, retryVideoPost, scheduleVideoPosts } from "@/lib/publishing/video";
import { done } from "./common";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const fail = (path: string, msg: string): never => done(`${path}${path.includes("?") ? "&" : "?"}tone=error`, msg);

export async function scheduleVideoAction(fd: FormData) {
  const back = str(fd, "back") || "/video-studio?tab=approved";
  const actor = await requirePermission("manager", back);
  const when = str(fd, "when"); // datetime-local, giờ VN
  if (!when) return fail(back, "Cần chọn giờ đăng");
  const at = new Date(`${when.length === 16 ? `${when}:00` : when}+07:00`);
  if (Number.isNaN(at.getTime())) return fail(back, "Giờ đăng không hợp lệ");
  const r = scheduleVideoPosts({ videoId: str(fd, "id"), platforms: fd.getAll("platform").map(String), whenIso: at.toISOString(), caption: str(fd, "caption"), by: actor.name });
  if (!r.ok) return fail(back, r.error);
  done("/publishing", r.mode === "dry_run" ? `Đã lên lịch ${r.created} bài ở chế độ thử (không đăng thật)` : `Đã lên lịch ${r.created} bài, đăng đúng giờ và xác minh trên nền tảng`);
}

export async function retryVideoPostAction(fd: FormData) {
  const actor = await requirePermission("manager", "/publishing");
  const note = str(fd, "note");
  const r = retryVideoPost(str(fd, "id"), note);
  if (!r.ok) return fail("/publishing", r.error ?? "Không thử lại được");
  logActivity("human", `${actor.name} cho thử đăng lại một bài video${note ? ` (xác nhận: ${note.slice(0, 160)})` : ""}.`, "publishing");
  done("/publishing", "Đã xếp đăng lại");
}

export async function cancelVideoPostAction(fd: FormData) {
  const actor = await requirePermission("manager", "/publishing");
  const r = cancelVideoPost(str(fd, "id"));
  if (!r.ok) return fail("/publishing", r.error ?? "Không huỷ được");
  logActivity("human", `${actor.name} huỷ một bài video đang chờ đăng.`, "publishing");
  done("/publishing", "Đã huỷ bài chờ đăng");
}

export async function setDryRunAction(fd: FormData) {
  const actor = await requirePermission("admin", "/publishing");
  const on = str(fd, "on") === "1";
  setSetting("publishing.dryRun", on ? "1" : "0");
  logActivity("human", `${actor.name} ${on ? "bật" : "tắt"} chế độ thử đăng bài (${on ? "không đăng thật" : "đăng thật khi đã kết nối"}).`, "publishing");
  done("/publishing", on ? "Đã bật chế độ thử: bài mới lên lịch sẽ không đăng thật" : "Đã tắt chế độ thử: bài mới lên lịch sẽ đăng thật khi kênh đã kết nối");
}
