"use server";

// CP04: lên lịch đăng video đã duyệt, thử lại, huỷ, bật/tắt chế độ thử.
import { requirePermission } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { cancelVideoPost, confirmPageChecked, releaseChannelLock, retryVideoPost, scheduleVideoPosts } from "@/lib/publishing/video";
import { cancelTextPost } from "@/lib/publishing/text";
import { setDryRunMode } from "@/lib/publishing/guards";
import { captionIssues, clearCaptionDraft, scriptTextFor } from "@/lib/publishing/caption";
import { generateCaption } from "@/lib/ai";
import { autoPostVideo, postVideoTo, rescheduleVideoPost, setAutoNew, vnLocalToIso } from "@/lib/publishing/auto-post";
import { publishDueVideoPosts } from "@/lib/publishing/video";
import { formatDateTime } from "@/lib/format";
import { after } from "next/server";
import { done } from "./common";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const fail = (path: string, msg: string): never => done(`${path}${path.includes("?") ? "&" : "?"}tone=error`, msg);
/** Ô datetime-local (giờ VN) → ISO; trống → undefined. */
const whenIso = (fd: FormData): string | undefined => {
  const w = str(fd, "when");
  if (!w) return undefined;
  const at = new Date(`${w.length === 16 ? `${w}:00` : w}+07:00`);
  return Number.isNaN(at.getTime()) ? "x" : at.toISOString();
};

export async function scheduleVideoAction(fd: FormData) {
  const back = str(fd, "back") || "/video-library";
  const actor = await requirePermission("manager", back);
  const when = str(fd, "when"); // datetime-local, giờ VN
  if (!when) return fail(back, "Cần chọn giờ đăng");
  const at = new Date(`${when.length === 16 ? `${when}:00` : when}+07:00`);
  if (Number.isNaN(at.getTime())) return fail(back, "Giờ đăng không hợp lệ");
  const platforms = fd.getAll("platform").map(String);
  const r = scheduleVideoPosts({ videoId: str(fd, "id"), platforms, whenIso: at.toISOString(), caption: str(fd, "caption"), title: str(fd, "title"), by: actor.name });
  if (!r.ok) return fail(back, r.error);
  // Luật caption kiểm trên caption THẬT anh gửi (cảnh báo, không chặn — OWNER quyết)
  const warn = captionIssues(str(fd, "caption"), platforms, scriptTextFor(str(fd, "id")));
  const tail = warn.length ? ` · ⚠ ${warn.length} cảnh báo caption: ${warn[0].slice(0, 120)}` : "";
  // Bước 5 → 6: lên lịch xong sang Đăng bài, nêu rõ bài vừa lên lịch của video này
  done(`/publishing?video=${encodeURIComponent(str(fd, "id"))}#video-posts`, (r.mode === "dry_run" ? `Đã lên lịch ${r.created} bài ở chế độ thử (không đăng thật)` : `Đã lên lịch ${r.created} bài, đăng đúng giờ và xác minh trên nền tảng`) + tail);
}

export async function retryVideoPostAction(fd: FormData) {
  const actor = await requirePermission("manager", "/publishing");
  const note = str(fd, "note");
  const r = retryVideoPost(str(fd, "id"), note, whenIso(fd), actor);
  if (!r.ok) return fail("/publishing", r.error ?? "Không thử lại được");
  logActivity("human", `${actor.name} cho thử đăng lại một bài video${note ? ` (xác nhận: ${note.slice(0, 160)})` : ""}.`, "publishing");
  done("/publishing", "Đã xếp đăng lại");
}

export async function cancelVideoPostAction(fd: FormData) {
  const actor = await requirePermission("manager", "/publishing");
  const r = cancelVideoPost(str(fd, "id"), actor);
  if (!r.ok) return fail("/publishing", r.error ?? "Không huỷ được");
  logActivity("human", `${actor.name} huỷ một bài video đang chờ đăng.`, "publishing");
  done("/publishing", "Đã huỷ bài chờ đăng");
}

export async function cancelTextPostAction(fd: FormData) {
  const actor = await requirePermission("manager", "/publishing");
  const r = cancelTextPost(str(fd, "id"), actor);
  if (!r.ok) return fail("/publishing", r.error ?? "Không huỷ được");
  logActivity("human", `${actor.name} huỷ một bài chờ đăng.`, "publishing");
  done("/publishing", "Đã huỷ bài");
}

/** OWNER mở trang kiểm bài "có thể đã lên": có bài → Đã đăng; không thấy → thử lại / huỷ được. Chỉ OWNER (kiểm trong confirmPageChecked). */
export async function confirmPageCheckedAction(fd: FormData) {
  const actor = await requirePermission("admin", "/publishing");
  const r = confirmPageChecked(str(fd, "id"), actor, str(fd, "found") === "1");
  if (!r.ok) return fail("/publishing", r.error ?? "Không ghi được");
  done("/publishing", str(fd, "found") === "1" ? "Đã ghi: bài có trên trang → Đã đăng" : "Đã ghi: không thấy bài — thử lại hoặc huỷ được");
}

/** OWNER gỡ khoá kênh của bài đã lên trang nhập nhầm (bài giữ nguyên, ghi lý do + nhật ký trong releaseChannelLock). Chỉ OWNER. */
export async function releaseChannelLockAction(fd: FormData) {
  const actor = await requirePermission("admin", "/publishing");
  const r = releaseChannelLock(str(fd, "id"), actor);
  if (!r.ok) return fail("/publishing", r.error ?? "Không gỡ được khoá kênh");
  done("/publishing", "Đã gỡ khoá kênh — lên lịch lại được ở kênh này");
}

export async function setDryRunAction(fd: FormData) {
  const actor = await requirePermission("admin", "/publishing");
  const on = str(fd, "on") === "1";
  // Tắt chế độ thử = đăng thật: chỉ OWNER (kiểm trong setDryRunMode); bật lại thì quản trị được
  const r = setDryRunMode(on, actor);
  if (!r.ok) return fail("/publishing", r.error);
  done("/publishing", on ? "Đã bật chế độ thử: bài mới lên lịch sẽ không đăng thật" : "Đã tắt chế độ thử: bài mới lên lịch sẽ đăng thật khi kênh đã kết nối");
}

// Bài đăng theo skill (6.1): AI Viết bài đăng viết caption nháp cho video (qua Đội AI — công tắc / trần / mô hình theo vị trí)
export async function aiCaptionAction(fd: FormData) {
  const back = str(fd, "back") || "/video-library";
  await requirePermission("manager", back);
  const r = await generateCaption(str(fd, "id"));
  if (!r.ok) return fail(back, r.error);
  done(back, `AI đã viết tiêu đề + nội dung theo skill ${r.skill} — sửa rồi lên lịch`);
}

// ---------- Bước 2 · Đăng: nút theo nền tảng + Tự động (OWNER 05/11/2026) ----------
const BOARD = "/publishing";
const backOf = (fd: FormData) => str(fd, "back") || BOARD;
/** Bộ chạy nền gửi bài đến hạn mỗi phút; "Đăng ngay" gọi luôn sau khi trả lời để không chờ phút kế. */
function publishSoon() {
  try {
    after(() => publishDueVideoPosts().catch(() => undefined));
  } catch {
    /* ngoài phạm vi yêu cầu (kiểm thử) */
  }
}

/** Bấm nút nền tảng: đăng ngay (bài viết sẵn; chưa có thì GPT viết trước khi xếp). */
export async function postNowAction(fd: FormData) {
  const back = backOf(fd);
  const actor = await requirePermission("manager", back);
  const r = await postVideoTo({ videoId: str(fd, "id"), platform: str(fd, "platform"), by: actor.name });
  if (!r.ok) return fail(back, r.error);
  publishSoon();
  done(back, r.mode === "dry_run" ? "Đã xếp đăng ngay ở chế độ thử (không đăng thật)" : "Đang đăng — bài sẽ lên trong ít phút, hệ thống đọc lại để xác minh");
}

/** Hẹn giờ cho một nền tảng. */
export async function scheduleAtAction(fd: FormData) {
  const back = backOf(fd);
  const actor = await requirePermission("manager", back);
  const iso = vnLocalToIso(str(fd, "when"));
  if (!iso) return fail(back, "Cần chọn giờ đăng hợp lệ");
  const r = await postVideoTo({ videoId: str(fd, "id"), platform: str(fd, "platform"), whenIso: iso, by: actor.name });
  if (!r.ok) return fail(back, r.error);
  done(back, `${r.mode === "dry_run" ? "Đã hẹn (chế độ thử)" : "Đã hẹn đăng"} lúc ${formatDateTime(iso)}`);
}

/** Đổi giờ bài đang chờ. */
export async function rescheduleAction(fd: FormData) {
  const back = backOf(fd);
  const actor = await requirePermission("manager", back);
  const iso = vnLocalToIso(str(fd, "when"));
  if (!iso) return fail(back, "Cần chọn giờ đăng hợp lệ");
  const r = rescheduleVideoPost(str(fd, "post"), iso, actor);
  if (!r.ok) return fail(back, r.error);
  done(back, `Đã đổi giờ đăng: ${formatDateTime(iso)}`);
}

/** Nút "Tự động": GPT đọc video → viết bài → xếp giờ vàng cho mọi nền tảng còn mở. */
export async function autoPostAction(fd: FormData) {
  const back = backOf(fd);
  const actor = await requirePermission("manager", back);
  const r = await autoPostVideo({ videoId: str(fd, "id"), by: actor.name });
  if (!r.ok) return fail(back, r.error);
  const who = r.source === "ai" ? "GPT đã viết bài" : r.source === "kept" ? "Dùng bài đã viết" : "Bài theo luật (AI chưa viết được)";
  done(back, `${who} · xếp ${r.created} bài (${r.platforms.join(", ")}) lúc ${formatDateTime(r.whenIso)}${r.mode === "dry_run" ? " · chế độ thử" : ""}`);
}

/** Công tắc "Tự động cho video mới" — quản trị (đường tự động đầu tiên lên nền tảng thật khi tắt chế độ thử). */
export async function setAutoNewAction(fd: FormData) {
  const back = backOf(fd);
  const actor = await requirePermission("admin", back);
  const on = str(fd, "on") === "1";
  setAutoNew(on, actor);
  done(back, on ? "Đã bật: video mới vào Kho → GPT viết bài → tự xếp giờ vàng" : "Đã tắt tự động cho video mới");
}

export async function resetCaptionAction(fd: FormData) {
  const back = str(fd, "back") || "/video-library";
  await requirePermission("manager", back);
  clearCaptionDraft(str(fd, "id"));
  done(back, "Đã quay về caption dựng theo skill");
}
