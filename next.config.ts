import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Xuất bản dạng standalone để chạy trong Docker với image nhỏ.
  output: "standalone",
  // better-sqlite3 là module native, không bundle vào server.
  serverExternalPackages: ["better-sqlite3"],
  // Tải logo / nhạc / video qua Server Action: nâng giới hạn thân yêu cầu (mặc định 1 MB).
  experimental: { serverActions: { bodySizeLimit: "600mb" } },
  // Đường dẫn cũ
  async redirects() {
    return [{ source: "/research", destination: "/insights", permanent: true }];
  },
};

export default nextConfig;
