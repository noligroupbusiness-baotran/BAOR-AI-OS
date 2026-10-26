// Mô tả ảnh / clip B-roll (OWNER 27/10/2026: ảnh mới chưa có mô tả thì bộ dựng chỉ chọn theo tên tệp — ai_plan.py › asset_text, Skill
// Phần chung A4.1 "chọn theo nội dung nhìn thấy"). Ghi trường `desc` của đúng mục trong broll/manifest.json (máy chủ / máy đang chạy
// app). Mô tả đi thẳng vào lời nhắc của bộ dựng nên luôn qua cleanDesc: MỘT dòng (không chèn được dòng "Giấy phép:" / "Từ khoá:" giả
// trong tệp .txt kèm theo), bỏ ký tự điều khiển và ngoặc [] {} <> ` (không giả được nhãn "[CÓ SẢN PHẨM …]" của bộ dựng), tối đa DESC_MAX.
// Chỉ node:fs / node:path + import tương đối (kiểm thử / máy dựng gọi thẳng được).
import fs from "node:fs";
import path from "node:path";
import { libraryFile } from "./safe-path";
import { cleanDesc } from "./asset-upload-rules";

export { cleanDesc, DESC_MAX } from "./asset-upload-rules";

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * Đặt / xoá mô tả cho một mục B-roll. `file` = tên trong manifest (vd "anh/a.jpg"); tệp phải nằm trong thư mục thư viện VÀ có trong
 * danh mục. Đọc danh mục MỚI NHẤT ngay trước khi ghi, tệp tạm riêng + rename (không đè lượt xoá / thả vào vừa ghi chen). Danh mục hỏng
 * → báo lỗi, không ghi đè.
 */
export function setBrollDesc(dataDir: string, file: string, desc: string, by: string, now = new Date()): Result<{ desc: string }> {
  const dir = path.join(dataDir, "video-assets", "broll");
  if (!libraryFile(dir, file)) return { ok: false, error: "Không tìm thấy tệp trong thư viện" };
  const mf = path.join(dir, "manifest.json");
  let items: unknown;
  try {
    items = JSON.parse(fs.readFileSync(mf, "utf8"));
  } catch {
    return { ok: false, error: "Không đọc được danh mục B-roll" };
  }
  if (!Array.isArray(items)) return { ok: false, error: "Danh mục B-roll không đúng dạng" };
  const list = items as Record<string, unknown>[];
  const i = list.findIndex((x) => x && typeof x === "object" && x.file === file);
  if (i < 0) return { ok: false, error: "Tệp không có trong danh mục" };
  const clean = cleanDesc(desc);
  const next: Record<string, unknown> = { ...list[i] };
  if (clean) Object.assign(next, { desc: clean, descBy: by.slice(0, 160), descAt: now.toISOString() });
  else for (const k of ["desc", "descBy", "descAt"]) delete next[k];
  list[i] = next;
  const tmp = `${mf}.${process.pid}.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(list, null, 1));
  fs.renameSync(tmp, mf);
  return { ok: true, desc: clean };
}
