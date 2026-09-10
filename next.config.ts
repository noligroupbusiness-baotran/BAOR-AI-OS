import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Xuất bản dạng standalone để chạy trong Docker với image nhỏ.
  output: "standalone",
};

export default nextConfig;
