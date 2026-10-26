import fs from "node:fs";
import path from "node:path";

/**
 * Đường dẫn tuyệt đối của một tệp NẰM TRONG thư mục thư viện, hoặc null. Chặn: chuỗi rỗng, ký tự NUL, đường dẫn tuyệt đối,
 * "..", liên kết tượng trưng trỏ ra ngoài (so cả realpath), thư mục, tệp không tồn tại. Dùng cho mọi route phát tư liệu.
 */
export function libraryFile(dir: string, rel: string): string | null {
  if (!rel || rel.includes("\0") || path.isAbsolute(rel) || rel.length > 500) return null;
  const root = path.resolve(dir);
  const full = path.resolve(root, rel);
  if (!full.startsWith(root + path.sep)) return null;
  try {
    const realRoot = fs.realpathSync(root);
    const real = fs.realpathSync(full);
    if (!real.startsWith(realRoot + path.sep) || !fs.statSync(real).isFile()) return null;
    return real;
  } catch {
    return null;
  }
}
