// Trạng thái "Cần OWNER xác nhận chuyện" của vlog chia sẻ — CHỈ ở máy chủ (phản biện 26/10 lần 5: trạng thái tin cậy từng nằm trong bản chữ
// người dùng sửa được → giả được dấu). Lưu ở bảng settings, khoá `content.ownerReview.<contentId>` (JSON) — không cần migration; bảng
// settings không có đường ghi khoá tuỳ ý từ biểu mẫu nào, và mọi chỗ ghi khoá này đều ở tệp này.
//
// - items: chi tiết trong kịch bản KHÔNG có trong chuyện của OWNER (con số, câu trích, tên riêng) — AI viết thêm hoặc người sửa tay.
// - Xác nhận: chỉ OWNER / quản lý, qua server action riêng (confirmStory); gắn với mã nội dung của bản ĐÃ LƯU (draftHash) và đúng danh sách
//   mục lúc xác nhận. Chữ đổi / thêm mục → hết hiệu lực.
// - Cổng gửi duyệt / duyệt luôn kiểm lại trên bản chữ hiện tại (và chữ gửi lên lúc gửi duyệt).
import { getSetting, setSetting } from "@/lib/admin";
import { kindOf } from "./formats";
import { addedDetails, experienceFromDraft, legacyReviewItems, reviewItemPresent } from "./experience";
import { draftHash, draftTold } from "./vlog-script";
import { reviewSourceText } from "./script-context";

export interface OwnerReviewState {
  items: string[];
  /** Danh sách mục lúc OWNER xác nhận. */
  confirmedItems?: string[];
  confirmedBy?: string;
  confirmedAt?: string;
  /** draftHash của bản đã lưu lúc xác nhận. */
  hash?: string;
}

const key = (contentId: string) => `content.ownerReview.${contentId}`;

export function getOwnerReview(contentId: string): OwnerReviewState {
  try {
    const v = JSON.parse(getSetting(key(contentId)) || "null") as OwnerReviewState | null;
    if (v && Array.isArray(v.items)) return { ...v, items: v.items.map(String) };
  } catch {}
  return { items: [] };
}

function saveOwnerReview(contentId: string, s: OwnerReviewState) {
  setSetting(key(contentId), JSON.stringify(s));
}

const uniq = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];

/** Dấu xác nhận còn hiệu lực với bản chữ `draft` và danh sách `items`. */
export function confirmationValid(s: OwnerReviewState, items: string[], draft: string): boolean {
  return !!s.confirmedBy && !!s.confirmedAt && s.hash === draftHash(draft) && items.every((x) => (s.confirmedItems ?? []).includes(x));
}

/** Nội dung có thuộc diện kiểm (kịch bản có khối KINH NGHIỆM, hoặc đã có trạng thái / mục cũ trong chữ). */
function relevant(item: { id: string; format: string }, draft: string, s: OwnerReviewState): boolean {
  return kindOf(item.format) === "script" && (!!experienceFromDraft(draft) || s.items.length > 0 || legacyReviewItems(draft).length > 0);
}

/** Chi tiết ngoài chuyện trên `draft` (so với câu trả lời + trang OWNER còn sống + căn cứ — câu trả lời lấy từ chính bản chữ đó). */
export function recheckItems(contentId: string, draft: string): string[] {
  return addedDetails(draftTold(draft), reviewSourceText(contentId, experienceFromDraft(draft)));
}

/** Chuyển dòng "Cần xác nhận" cũ trong chữ sang trạng thái máy chủ (dấu xác nhận cũ trong chữ bị bỏ). */
function withLegacy(s: OwnerReviewState, draft: string): OwnerReviewState {
  const legacy = legacyReviewItems(draft);
  return legacy.length ? { ...s, items: uniq([...s.items, ...legacy]) } : s;
}

/**
 * Sau khi LƯU (Lưu nháp / AI viết lưu chữ đang gõ / khôi phục phiên bản): chuyển mục cũ; OWNER / quản lý lưu → bỏ mục không còn trong chữ.
 * Người khác lưu → giữ nguyên. Không bao giờ xoá trạng thái vì chữ trống.
 */
export function afterSave(contentId: string, savedDraft: string, allowed: boolean) {
  const prev = getOwnerReview(contentId);
  let s = withLegacy(prev, savedDraft);
  if (allowed && savedDraft.trim()) {
    const told = draftTold(savedDraft);
    s = { ...s, items: s.items.filter((x) => reviewItemPresent(x, told)) };
  }
  if (JSON.stringify(s) !== JSON.stringify(prev)) saveOwnerReview(contentId, s);
}

/** Sau khi AI viết: danh sách = kiểm lại trên TOÀN BỘ bản AI vừa lưu (cộng mục cũ còn trong chữ); xác nhận chỉ giữ khi còn hiệu lực. */
export function afterAiWrite(contentId: string, finalDraft: string): OwnerReviewState {
  const prev = withLegacy(getOwnerReview(contentId), finalDraft);
  const told = draftTold(finalDraft);
  const items = uniq([...prev.items.filter((x) => reviewItemPresent(x, told)), ...recheckItems(contentId, finalDraft)]);
  const s: OwnerReviewState = confirmationValid(prev, items, finalDraft) ? { ...prev, items } : { items };
  saveOwnerReview(contentId, s);
  return s;
}

/**
 * Cổng gửi duyệt / duyệt: mục máy chủ đang giữ + kiểm lại trên bản chữ hiện tại (và chữ gửi lên); lưu mục mới; chặn khi chưa có xác nhận
 * hợp lệ cho đúng bản chữ đó. Trả về lý do chặn hoặc null.
 */
export function ownerReviewBlock(item: { id: string; format: string }, draft: string, extra: string[] = []): string | null {
  const prev = getOwnerReview(item.id);
  if (!relevant(item, draft, prev)) return null;
  const base = withLegacy(prev, draft);
  const items = uniq([...base.items, ...recheckItems(item.id, draft), ...extra]);
  if (JSON.stringify(items) !== JSON.stringify(prev.items)) saveOwnerReview(item.id, { ...base, items });
  if (!items.length || confirmationValid(base, items, draft)) return null;
  return `Cần OWNER xác nhận chuyện: có chi tiết không có trong chuyện của anh (${items.slice(0, 3).join(", ")}) — sửa hoặc OWNER bấm “Tôi xác nhận chuyện này đúng”.`;
}

/** OWNER / quản lý xác nhận chuyện cho bản ĐÃ LƯU `savedDraft` (gọi sau khi lưu). Trả về các mục đã xác nhận. */
export function confirmOwnerReview(contentId: string, savedDraft: string, email: string, now = new Date().toISOString()): string[] {
  const prev = withLegacy(getOwnerReview(contentId), savedDraft);
  const items = uniq([...prev.items, ...recheckItems(contentId, savedDraft)]);
  saveOwnerReview(contentId, { items, confirmedItems: items, confirmedBy: email, confirmedAt: now, hash: draftHash(savedDraft) });
  return items;
}

/** Cho trình soạn: mục cần xác nhận + dấu (nếu còn hiệu lực với bản đã lưu) + mã bản đã lưu (trình duyệt so với chữ đang soạn). */
export function ownerReviewView(contentId: string, savedDraft: string): { items: string[]; confirmedBy: string | null; confirmedAt: string | null; hash: string | null } {
  const s = withLegacy(getOwnerReview(contentId), savedDraft);
  const valid = s.items.length > 0 && confirmationValid(s, s.items, savedDraft);
  return { items: s.items, confirmedBy: valid ? s.confirmedBy! : null, confirmedAt: valid ? s.confirmedAt! : null, hash: valid ? s.hash! : null };
}
