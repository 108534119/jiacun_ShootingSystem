import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "賈村戰技體驗場｜定點射擊",
  description: "賈村戰技體驗場定點射擊遊玩系統",
  openGraph: {
    title: "賈村戰技體驗場｜定點射擊",
    description: "瞄準目標，留下你的戰績。",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
