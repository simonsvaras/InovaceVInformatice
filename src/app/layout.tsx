import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Klubio — školní demo",
  description:
    "Jednoduchá evidence klubových předpisů a úhrad pro správce, trenéry a rodiče.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="cs">
      <body>{children}</body>
    </html>
  );
}
