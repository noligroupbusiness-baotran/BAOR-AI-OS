// CP02: cổng gửi duyệt và duyệt nội dung. Tách khỏi server action để kiểm thử được.
// Kịch bản sinh từ brief nghiên cứu phải qua luật kiểm kịch bản quay; nội dung khác giữ luồng cũ.
import { kindOf } from "./formats";
import { briefScriptQa } from "@/lib/research";

interface Item {
  id: string;
  format: string;
  status: string;
  draft: string | null;
}

/** Lý do không cho gửi duyệt (null = cho phép). */
export function submitBlock(item: Item, draft: string): string | null {
  if (item.status !== "in_progress" && item.status !== "review") return "Chỉ gửi duyệt được nội dung đang viết.";
  const qa = kindOf(item.format) === "script" ? briefScriptQa(item.id, draft) : null;
  if (qa && !qa.ok) return `${qa.blocking[0]}${qa.blocking.length > 1 ? ` (và ${qa.blocking.length - 1} lỗi khác)` : ""}`;
  return null;
}

/** Lý do không cho duyệt (null = cho phép). */
export function approveBlock(item: Item): string | null {
  if (item.status !== "review") return "Chỉ duyệt được nội dung đang chờ duyệt.";
  const qa = kindOf(item.format) === "script" ? briefScriptQa(item.id, item.draft ?? "") : null;
  if (qa && !qa.ok) return qa.blocking[0];
  return null;
}
