import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Xuất bản dạng standalone để chạy trong Docker với image nhỏ.
  output: "standalone",
  // better-sqlite3 là module native, không bundle vào server.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
