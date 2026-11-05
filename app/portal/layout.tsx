import type { Metadata, Viewport } from "next";
import { AppRegister } from "@/components/portal/AppRegister";

export const metadata: Metadata = {
  title: { template: "%s · SOS&A Portal", default: "SOS&A Portal" },
  robots: { index: false, follow: false },
  manifest: "/portal-app/manifest.webmanifest",
  appleWebApp: { capable: true, title: "SOS&A Portal", statusBarStyle: "black-translucent" },
  icons: { apple: "/portal-app/icon-192.png" },
};

export const viewport: Viewport = { themeColor: "#2B0D17" };

export default function PortalRoot({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#F7F4F1] text-stone-900">
      <AppRegister />
      {children}
    </div>
  );
}
