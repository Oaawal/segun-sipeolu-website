import type { Metadata } from "next";

export const metadata: Metadata = { title: "Pay an invoice · Segun Sipeolu & Associates", robots: { index: false, follow: false } };

export default function PayLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-[#F7F4F1] px-4 py-8 text-stone-900 sm:py-12">{children}</div>;
}
