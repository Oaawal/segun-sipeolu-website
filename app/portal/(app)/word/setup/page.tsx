import Link from "next/link";
import { Download, FileText } from "lucide-react";
import { requireUser } from "@/lib/portal/auth";
import { Card, Note, PageHeader, btn } from "@/components/portal/ui";

export const metadata = { title: "Word setup" };

export default async function WordSetup() {
  await requireUser();
  return (
    <>
      <PageHeader title="Save from Microsoft Word" sub="A “Save to Portal” button on Word's Home tab. Each save files the document on the matter, as a new recorded version." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card title="Set up (once per computer)">
          <ol className="space-y-5 text-sm text-stone-700">
            <li><strong className="text-maroon-dark">1. Download the add-in file.</strong><div className="mt-2"><a href="/word/manifest.xml" className={btn.primary}><Download className="h-4 w-4" />Download add-in (.xml)</a></div></li>
            <li><strong className="text-maroon-dark">2. Add it to Word.</strong>
              <ul className="mt-1.5 list-disc space-y-1 pl-5">
                <li><b>Word for Microsoft 365 (Windows / Mac) or Word on the web:</b> Home → Add-ins → More Add-ins → My Add-ins → <i>Upload My Add-in</i>, and choose the file.</li>
                <li><b>Whole firm at once:</b> the Microsoft 365 administrator uploads the same file in the Microsoft 365 admin centre → Settings → Integrated apps. It then appears for everyone automatically.</li>
              </ul>
            </li>
            <li><strong className="text-maroon-dark">3. Connect it.</strong> Click <i>Save to Portal</i> on the Home tab, then paste a connection code from <Link href="/portal/account#word" className="font-semibold text-maroon">your Account page</Link>.</li>
            <li><strong className="text-maroon-dark">4. Save.</strong> Pick the matter, give the document a title and save. Next time you open that document, <i>Save as a new version</i> files your changes as v2, v3 and so on, with the full history kept.</li>
          </ol>
        </Card>
        <div className="space-y-4">
          <Card title="Going the other way"><p className="text-sm text-stone-700"><FileText className="mb-0.5 mr-1 inline h-4 w-4 text-maroon" />Any document in the portal can be downloaded and edited in Word. Saving it back with the add-in (choose “New version of…”) keeps one history instead of scattered copies. Matter summaries, meeting minutes and cause lists can be exported to Word too.</p></Card>
          <Note tone="lock">The add-in only reaches matters you can already open. Connection codes expire after 180 days, and you can revoke one at any time. Deactivated staff lose access straight away.</Note>
          <Note tone="info">Microsoft requires the portal to be on a secure (https) address before Word accepts the add-in. This is in place once the site is hosted.</Note>
        </div>
      </div>
    </>
  );
}
