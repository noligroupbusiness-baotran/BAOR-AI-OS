// Chính sách mật khẩu dùng chung cho mọi nơi đặt mật khẩu (Tài khoản của tôi, Cài đặt › Nhân sự, Tài khoản quản trị).
// Thuần logic, không đụng CSDL, để test được.

export const PASSWORD_MIN_LENGTH = 10;

// Các mật khẩu bị dò đầu tiên trong mọi cuộc tấn công; danh sách ngắn, đủ chặn trường hợp lười nhất.
const COMMON = new Set([
  "1234567890", "12345678910", "0123456789", "password", "password1", "password123", "passw0rd", "qwertyuiop",
  "qwerty123", "abc123456", "iloveyou1", "admin12345", "administrator", "welcome123", "letmein123", "matkhau123",
  "baor123456", "123123123", "111111111", "000000000", "1q2w3e4r5t", "zxcvbnm123",
]);

export interface PasswordCheck {
  ok: boolean;
  /** Lý do đầu tiên không đạt (tiếng Việt, hiện thẳng cho người dùng). */
  reason?: string;
}

export function checkPassword(password: string, ctx: { email?: string; name?: string } = {}): PasswordCheck {
  const p = password ?? "";
  if (p.length < PASSWORD_MIN_LENGTH) return { ok: false, reason: `Mật khẩu cần ít nhất ${PASSWORD_MIN_LENGTH} ký tự.` };
  if (p.length > 128) return { ok: false, reason: "Mật khẩu quá dài (tối đa 128 ký tự)." };
  if (/^(.)\1+$/.test(p)) return { ok: false, reason: "Mật khẩu không được là một ký tự lặp lại." };
  const lower = p.toLowerCase();
  if (COMMON.has(lower)) return { ok: false, reason: "Mật khẩu này quá phổ biến, dễ bị dò." };
  const local = (ctx.email ?? "").toLowerCase().split("@")[0];
  if (local.length >= 4 && lower.includes(local)) return { ok: false, reason: "Mật khẩu không được chứa phần tên trong email." };
  const nameParts = (ctx.name ?? "").toLowerCase().split(/\s+/).filter((w) => w.length >= 4);
  if (nameParts.some((w) => lower.includes(w))) return { ok: false, reason: "Mật khẩu không được chứa họ tên." };
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z0-9]/].filter((re) => re.test(p)).length;
  if (classes < 2) return { ok: false, reason: "Mật khẩu cần ít nhất 2 trong 4 loại: chữ thường, chữ hoa, số, ký tự đặc biệt." };
  return { ok: true };
}
