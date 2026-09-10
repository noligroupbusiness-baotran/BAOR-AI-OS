import type { Metadata } from "next";
import "./globals.css";
import { ThemeScript } from "@/components/shell/theme-script";

export const metadata: Metadata = {
  title: "BAOR AI OS",
  description: "Hệ thống marketing automation cho fanpage: research, insight, nội dung, đăng bài, quảng cáo, khách hàng và email.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className="h-full" suppressHydrationWarning>
      <head>
        <ThemeScript />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap"
        />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
