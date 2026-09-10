import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BAOR AI OS – Trung tâm điều hành marketing",
  description:
    "Hệ thống marketing automation cho fanpage: research, insight, nội dung, đăng bài, quảng cáo, khách hàng và email.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className="h-full">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
