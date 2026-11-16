import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: { template: "%s · Client portal · Segun Sipeolu & Associates", default: "Client portal · Segun Sipeolu & Associates" },
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { themeColor: "#2B0D17" };

export default function ClientRoot({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-[#F7F4F1] text-stone-900">{children}</div>;
}
