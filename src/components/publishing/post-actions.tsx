import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/campaigns/confirm-action";
import { WhenPicker } from "@/components/publishing/when-picker";
import { retryPost } from "@/lib/actions/ads";
import { cancelTextPostAction, cancelVideoPostAction, confirmPageCheckedAction, retryVideoPostAction } from "@/lib/actions/publishing";
import { isAmbiguousFailure, isSamplePost, needsPageCheck } from "@/lib/publishing/guards";
import { goldenHours, suggestPostTimes } from "@/lib/publishing/post-times";
import type { schema } from "@/db";

type PostRow = typeof schema.scheduledPosts.$inferSelect;

/** Nút của MỘT bài (chữ hoặc video) — tác động đúng bài đó:
 *  - Cần kiểm trang (có mã bài / lỗi mơ hồ / xác minh quá hạn): OWNER bấm "Có trên trang" / "Không thấy bài".
 *  - Quá hạn: chọn giờ mới rồi "Xếp lại" (không đăng ngay), hoặc Huỷ.
 *  - Lỗi rõ ràng: "Đăng lại" (lượt chạy tới) hoặc Huỷ. Lỗi mơ hồ chưa có mã: đăng lại CHỈ OWNER (ghi đã kiểm tra trang), Huỷ thì được.
 *  - Bài MẪU (không bao giờ đăng — Xếp lại / Đăng lại luôn bị từ chối): không có nút Xếp lại / Đăng lại; chờ đăng hoặc quá hạn chỉ còn Huỷ. */
export function PostActions({ post: p, owner }: { post: PostRow; owner: boolean }) {
  const video = !!p.videoId;
  const retry = video ? retryVideoPostAction : retryPost;
  const cancel = video ? cancelVideoPostAction : cancelTextPostAction;
  const cancelBtn = <ConfirmAction action={cancel} fields={{ id: p.id }} label="Huỷ" title="Huỷ bài này?" message="Bài không được đăng; có thể lên lịch lại sau." confirmLabel="Huỷ bài" danger />;
  if (isSamplePost(p)) return p.status === "scheduled" || p.status === "overdue" ? cancelBtn : null;

  if (p.status === "overdue") {
    const golden = goldenHours(p.platform);
    return (
      <div className="flex flex-wrap items-end justify-end gap-1.5">
        <form action={retry} className="flex items-end gap-1.5">
          <input type="hidden" name="id" value={p.id} />
          <WhenPicker suggestions={suggestPostTimes(golden.hours)} source={golden.source} />
          <Button type="submit">Xếp lại</Button>
        </form>
        {cancelBtn}
      </div>
    );
  }
  if (p.status === "scheduled") return cancelBtn;
  if (p.status !== "failed") return null;

  const pageCheck = needsPageCheck(p);
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {pageCheck && owner && (
        <>
          <ConfirmAction action={confirmPageCheckedAction} fields={{ id: p.id, found: "1" }} label="Có trên trang" title="Bài đã có trên trang?" message="Ghi nhận bài đã đăng (OWNER xác nhận). Không đăng lại." confirmLabel="Có bài, ghi Đã đăng" variant="soft" />
          <ConfirmAction action={confirmPageCheckedAction} fields={{ id: p.id, found: "0" }} label="Không thấy bài" title="Không thấy bài trên trang?" message="Bỏ dấu cần kiểm trang để đăng lại hoặc huỷ được." confirmLabel="Không thấy bài" />
        </>
      )}
      {/* Lỗi mơ hồ chưa có mã bài: đăng lại CHỈ OWNER (kèm ghi chú đã kiểm trang); huỷ thì ai quản lý cũng được (không đăng gì) */}
      {!p.externalId && isAmbiguousFailure(p) && owner && (
        <ConfirmAction action={retry} fields={{ id: p.id }} label="Đăng lại" title="Lần trước không rõ đã đăng chưa" message="Bài CÓ THỂ đã lên. Mở trang kiểm tra trước; chỉ đăng lại khi chắc chắn chưa có bài." confirmLabel="Đã kiểm tra, đăng lại" variant="soft" withNote={{ label: "Xác nhận đã kiểm tra trang", required: true, minLength: 10, placeholder: "VD: Đã mở trang lúc 10:05, không thấy bài" }} />
      )}
      {!pageCheck && <ConfirmAction action={retry} fields={{ id: p.id }} label="Đăng lại" title="Đăng lại?" message="Bài sẽ được đăng ở lượt chạy tới." confirmLabel="Đăng lại" variant="soft" />}
      {(!pageCheck || (!p.externalId && isAmbiguousFailure(p))) && cancelBtn}
    </div>
  );
}

/** Nhãn lỗi ngắn (giao diện ít chữ); câu đầy đủ để ở chú thích khi rê chuột. */
export function postErrorShort(p: Pick<PostRow, "status" | "error" | "externalId">): string | null {
  if (!p.error) return null;
  if (needsPageCheck(p)) return "Cần kiểm trang";
  const first = p.error.split(/(?<=[.:])\s/)[0];
  return first.length > 60 ? `${first.slice(0, 57)}…` : first;
}
