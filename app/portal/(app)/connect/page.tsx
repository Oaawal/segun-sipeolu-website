import Link from "next/link";
import { Download, FolderInput, KeyRound, Monitor, MousePointerClick, Smartphone } from "lucide-react";
import { requireUser } from "@/lib/portal/auth";
import { Card, Note, PageHeader, btn } from "@/components/portal/ui";

export const metadata = { title: "Connect your devices" };

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-maroon text-xs font-bold text-gold">{n}</span>
      <div className="min-w-0 text-sm text-stone-700"><div className="font-semibold text-stone-900">{title}</div>{children}</div>
    </li>
  );
}

export default async function Connect() {
  await requireUser();
  return (
    <>
      <PageHeader title="Save from anywhere" sub="Get files into the portal from your phone, from Windows and from Word, safely" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title={<span id="phone" className="flex items-center gap-2"><Smartphone className="h-4 w-4" />Phone</span>}>
          <ol className="space-y-4">
            <Step n={1} title="Open the portal in Chrome on your phone and sign in.">Use the same address as on your computer.</Step>
            <Step n={2} title="Install it as an app.">Android: Chrome menu ⋮ → <i>Add to Home screen</i> → <i>Install</i>. iPhone: Safari → Share → <i>Add to Home Screen</i>.</Step>
            <Step n={3} title="Share any file to the portal (Android).">In WhatsApp, Gmail, Files or Photos: Share → <b>SOS&amp;A Portal</b>. The file lands in your <Link href="/portal/inbox" className="font-semibold text-maroon">Inbox</Link>, ready to file to a matter.</Step>
            <Step n={4} title="Scan paper documents.">In the Inbox, tap <i>Scan with camera</i>. Each photo is saved straight away.</Step>
          </ol>
          <div className="mt-5"><Note tone="info">iPhones do not offer apps in their Share menu for web apps yet. On an iPhone, open the portal and use <i>Choose files</i> or <i>Scan with camera</i> in the Inbox.</Note></div>
        </Card>

        <Card title={<span id="windows" className="flex items-center gap-2"><Monitor className="h-4 w-4" />Windows computer</span>}>
          <ol className="space-y-4">
            <Step n={1} title="Create a connection code.">On your <Link href="/portal/account#codes" className="font-semibold text-maroon">Account page</Link>, under Connection codes, create one named after this computer.</Step>
            <Step n={2} title="Download the Windows helper.">
              <div className="mt-2"><a href="/portal/desktop/ssa-portal.ps1" className={btn.primary}><Download className="h-4 w-4" />Download ssa-portal.ps1</a></div>
            </Step>
            <Step n={3} title="Run it once.">Right-click the downloaded file → <i>Run with PowerShell</i>, and paste the connection code when asked.</Step>
            <Step n={4} title="Use it.">
              <span className="mt-1 flex items-start gap-2"><MousePointerClick className="mt-0.5 h-4 w-4 flex-none text-maroon" /><span>Right-click any file or folder → <b>Send to → SOS&amp;A Portal</b>. Type a matter number, or leave it empty for your inbox.</span></span>
              <span className="mt-2 flex items-start gap-2"><FolderInput className="mt-0.5 h-4 w-4 flex-none text-maroon" /><span>Or drop files into <b>Documents\Portal Inbox</b>. They upload by themselves. A subfolder named like <code className="rounded bg-cream px-1">SSA-LIT-2026-0001</code> files straight onto that matter.</span></span>
            </Step>
          </ol>
          <div className="mt-5"><Note tone="lock">The code is stored encrypted by Windows for your user account only. Revoking it on your Account page stops this computer at once. To remove the helper, run <code>ssa-portal.ps1 -Uninstall</code> from <code>%APPDATA%\SOSA Portal</code>.</Note></div>
        </Card>

        <Card title={<span className="flex items-center gap-2"><KeyRound className="h-4 w-4" />Microsoft Word</span>}>
          <p className="text-sm text-stone-700">The <b>Save to Portal</b> button on Word&apos;s Home tab files the open document onto a matter, as a new recorded version. <Link href="/portal/word/setup" className="font-semibold text-maroon">Set up Word</Link>.</p>
        </Card>

        <Note tone="lock">However a file arrives, it is encrypted, fingerprinted, and recorded in the audit trail with who sent it and from where. People can only save to matters they are allowed to open.</Note>
      </div>
    </>
  );
}
