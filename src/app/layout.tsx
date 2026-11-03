import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Klubové platby — školní demo",
  description: "Evidence klubových předpisů a plateb pro školní demo.",
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
