import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Segun Sipeolu & Associates | Barristers & Solicitors",
  description:
    "A full-service Nigerian law firm delivering cutting edge legal solutions since 1993. Litigation, corporate affairs, property law, and more.",
  keywords: "law firm Lagos Nigeria, barristers solicitors, Segun Sipeolu, legal advice Nigeria",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}