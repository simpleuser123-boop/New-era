import type { Metadata } from "next";
import { Noto_Sans_SC } from "next/font/google";
import { ThemeController } from "@/components/theme/ThemeController";
import { getSiteUrl } from "@/lib/site-url";
import "./globals.css";

const notoSansSC = Noto_Sans_SC({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-noto-sans-sc",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
  title: {
    default: "New Era",
    template: "%s | New Era",
  },
  description: "New Era AI 求职助手，提供 AI 岗位评估、简历解析、简历优化和风险扫描。",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "New Era",
    description: "AI 岗位评估、简历解析、简历优化和风险扫描。",
    url: "/",
    siteName: "New Era",
    locale: "zh_CN",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className={`${notoSansSC.variable} new-era-root`}>
        <ThemeController />
        {children}
      </body>
    </html>
  );
}
