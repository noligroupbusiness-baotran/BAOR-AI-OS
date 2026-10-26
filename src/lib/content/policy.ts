// Luật ngôn từ theo nền tảng (kiểm theo luật, không AI). Hàm THUẦN — không đọc CSDL — để trình soạn kịch bản kiểm ngay trong trình duyệt.
import { VLOG_MAX_SEC } from "./formats";

const MAX_SHORT_SEC = VLOG_MAX_SEC;

// Luật nội bộ tóm từ tiêu chuẩn quảng cáo / cộng đồng CÔNG KHAI của Meta (Facebook, Instagram), TikTok, YouTube: khẳng định tuyệt đối,
// tuyên bố y tế / giảm cân, khẳng định thuộc tính cá nhân người xem (Meta), hứa thu nhập. Là CẢNH BÁO để người sửa — không thay
// cho việc đọc chính sách gốc; OWNER bổ sung / chốt danh sách trong Second Brain.
const W = (re: string) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${re})(?![\\p{L}\\p{N}])`, "iu");
interface PolicyRule {
  id: string;
  platforms: readonly string[] | "all";
  test: RegExp;
  message: string;
}
export const POLICY_RULES: PolicyRule[] = [
  { id: "absolute", platforms: "all", test: W("100\\s*%|chắc chắn|cam kết|đảm bảo|tuyệt đối|số 1|duy nhất"), message: "khẳng định tuyệt đối (100%, cam kết, đảm bảo, số 1…)" },
  { id: "medical", platforms: "all", test: W("chữa (?:khỏi|bệnh|dứt)|điều trị|trị (?:dứt|khỏi)|khỏi hẳn|thay thế thuốc"), message: "tuyên bố chữa / điều trị bệnh" },
  { id: "weight", platforms: "all", test: /(?:giảm|xuống)\s*\d+\s*(?:kg|ký|cân)|\d+\s*(?:kg|ký)\s*trong\s*\d+\s*(?:ngày|tuần)|trước\s*(?:và|-|\/)\s*sau/iu, message: "hứa kết quả giảm cân cụ thể / so sánh trước-sau" },
  { id: "personal", platforms: ["facebook", "instagram"], test: W("bạn (?:đang |có )?(?:béo|mập|thừa cân|nợ nần|nghèo|bị bệnh|trầm cảm|xấu|già)"), message: "khẳng định thuộc tính cá nhân người xem (Meta cấm: “bạn đang béo / nợ…”)" },
  { id: "income", platforms: "all", test: /(?:thu nhập|kiếm|lãi|doanh thu)[^.!?\n]{0,30}\d+\s*(?:triệu|tr\b|tỷ|tỉ|k\b|nghìn)|làm giàu nhanh|việc nhẹ lương cao/iu, message: "hứa thu nhập / doanh thu cụ thể (cần ghi “kết quả cá nhân, không cam kết” và nguồn)" },
];

export function policyIssues(text: string, platforms: readonly string[], durationSec?: number): string[] {
  const out: string[] = [];
  for (const r of POLICY_RULES) {
    const hit = r.platforms === "all" ? platforms : platforms.filter((p) => (r.platforms as readonly string[]).includes(p));
    if (hit.length && r.test.test(text)) out.push(`${r.message} — ${r.platforms === "all" ? "mọi nền tảng" : hit.join(", ")}`);
  }
  if (durationSec !== undefined && durationSec > MAX_SHORT_SEC) out.push(`dài ${durationSec} giây — vượt 1 phút của vlog chia sẻ`);
  return out;
}

