import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { template: "%s · SOS&A Portal", default: "SOS&A Portal" },
  robots: { index: false, follow: false },
};

export default function PortalRoot({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-[#F7F4F1] text-stone-900">{children}</div>;
}
