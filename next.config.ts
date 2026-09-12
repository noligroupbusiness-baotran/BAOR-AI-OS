import type { NextConfig } from "next";

const dev = process.env.NODE_ENV !== "production";

// Chính sách nội dung: chỉ cho tải mã, font, ảnh từ chính hệ thống và Google Fonts.
// 'unsafe-inline' cho script là bắt buộc với Next.js khi không dùng nonce; 'unsafe-eval' chỉ ở dev (HMR).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob:",
  `connect-src 'self'${dev ? " ws: wss:" : ""}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  // Chỉ có tác dụng khi chạy qua HTTPS (trình duyệt bỏ qua trên HTTP).
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // Xuất bản dạng standalone để chạy trong Docker với image nhỏ.
  output: "standalone",
  // better-sqlite3 là module native, không bundle vào server.
  serverExternalPackages: ["better-sqlite3"],
  // Tải logo / nhạc / video qua Server Action: nâng giới hạn thân yêu cầu (mặc định 1 MB).
  experimental: { serverActions: { bodySizeLimit: "600mb" } },
  // Header bảo mật cho mọi đường dẫn (webhook API cũng nhận, không ảnh hưởng vì chỉ trả JSON).
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  // Đường dẫn cũ
  async redirects() {
    return [{ source: "/research", destination: "/insights", permanent: true }];
  },
};

export default nextConfig;
