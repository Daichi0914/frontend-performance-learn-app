import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Go + Next.js Clean Architecture Frontend-performance-learn-app",
  description: "General-purpose frontend-performance-learn-app using Go Clean Architecture and Next.js App Router",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0f172a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
