import QRCode from "qrcode";
import { pendingTotpSetup } from "@/lib/security";

// Vẽ mã QR (SVG nhúng dạng data URI) cho khóa TOTP đang chờ xác nhận. Chỉ gọi từ Server Component
// của chính chủ tài khoản; cố ý KHÔNG đặt trong tệp "use server" để không thành action gọi được từ trình duyệt.
export async function pendingTotpQr(email: string): Promise<{ secret: string; svgDataUri: string } | null> {
  const p = pendingTotpSetup(email);
  if (!p) return null;
  const svg = await QRCode.toString(p.uri, { type: "svg", margin: 1, width: 200, errorCorrectionLevel: "M" });
  return { secret: p.secret, svgDataUri: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}` };
}
