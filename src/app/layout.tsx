import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Klubio | Platby a příspěvky vašeho klubu",
  description:
    "Jednoduchá evidence klubových předpisů a úhrad pro správce, trenéry a rodiče.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html data-scroll-behavior="smooth" lang="cs">
      <body>{children}</body>
    </html>
  );
}
