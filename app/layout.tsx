import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Segun Sipeolu & Associates",
  description: "Premium law firm website for Segun Sipeolu & Associates.",
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