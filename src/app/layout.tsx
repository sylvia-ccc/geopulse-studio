import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GeoPulse Studio — 智引 GEO 生成式引擎内容设计与发布系统",
  description:
    "面向中小企业与个人的商用 GEO 发布系统：按豆包、DeepSeek、Kimi、ChatGPT Search、Perplexity 与 Google AI Overviews 收录权重自动架构、评分与多渠道发布高引用率内容。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
