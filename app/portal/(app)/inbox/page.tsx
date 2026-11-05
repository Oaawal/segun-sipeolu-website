import Link from "next/link";
import { FileText, FolderInput, Monitor, Smartphone, Trash2 } from "lucide-react";
import { requireUser } from "@/lib/portal/auth";
import { q } from "@/lib/portal/db";
import { pickableMatters } from "@/lib/portal/data";
import { ago, fmtSize } from "@/lib/portal/format";
import { DOC_CATEGORIES } from "@/lib/portal/vocab";
import { SOURCES } from "@/lib/portal/intake";
import { Badge, Card, Empty, Flash, Note, PageHeader, btn, inputCls } from "@/components/portal/ui";
import { Uploader } from "@/components/portal/Uploader";
import { fileDocuments, removeFromInbox } from "./actions";

export const metadata = { title: "Inbox" };

const EXTRA: Record<string, string> = {
  filed: "Filed to the matter. It is now in the matter's documents.",
  shared: "Received from your phone. File it to a matter below.",
  share_partial: "Some shared files could not be saved (type or size). The rest are below.",
  share_nofile: "Nothing was shared. Choose a file in the other app, then Share → SOS&A Portal.",
};

export default async function Inbox({ searchParams }: { searchParams: Promise<{ msg?: string; to?: string; n?: string }> }) {
  const u = await requireUser();
  const sp = await searchParams;
  const [docs, matters] = await Promise.all([
    q<{ id: string; title: string; file_name: string; size_bytes: number; uploaded_at: string; source: keyof typeof SOURCES | null; category: string | null }>(
      "SELECT id, title, file_name, size_bytes, uploaded_at, source, category FROM documents WHERE owner_type = 'inbox' AND owner_id = $1 AND deleted_at IS NULL ORDER BY uploaded_at DESC",
      [u.id],
    ),
    u.role === "front_desk" ? Promise.resolve([]) : pickableMatters(u),
  ]);
  const canFile = u.role !== "front_desk";

  return (
    <>
      <PageHeader title="Inbox" sub="Files from your computer, phone, Windows or anywhere else, waiting to be filed. Only you can see your inbox." />
      <Flash msg={sp.msg} />
      {sp.msg && EXTRA[sp.msg] && <div className="mb-5"><Note tone={sp.msg === "share_partial" || sp.msg === "share_nofile" ? "warn" : "ok"}>{EXTRA[sp.msg]}{sp.msg === "filed" && sp.to && <> <Link href={`/portal/matters/${sp.to}?tab=documents`} className="font-semibold underline">Open the matter</Link></>}</Note></div>}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card title="Add files"><Uploader matters={matters} /></Card>

          <Card title={`Waiting to be filed (${docs.length})`} pad={false}>
            {docs.length === 0 ? <Empty icon={<FolderInput className="h-8 w-8" />} title="Your inbox is empty" text="Files you save without choosing a matter appear here." /> : (
              <form>
                <div className="divide-y divide-stone-100">
                  {docs.map((d) => (
                    <label key={d.id} className="flex cursor-pointer items-center gap-3 px-5 py-3 hover:bg-cream/50">
                      <input type="checkbox" name="doc" value={d.id} className="h-4 w-4 flex-none accent-maroon" />
                      <FileText className="h-5 w-5 flex-none text-maroon" />
                      <div className="min-w-0 flex-1">
                        <a href={`/portal/api/files/${d.id}`} target="_blank" rel="noopener" className="block truncate font-medium text-stone-800 hover:text-maroon">{d.title}</a>
                        <div className="truncate text-xs text-stone-500">{d.file_name} · {fmtSize(Number(d.size_bytes))} · {ago(d.uploaded_at)}</div>
                      </div>
                      {d.source && <span className="hidden sm:block"><Badge>{SOURCES[d.source]}</Badge></span>}
                    </label>
                  ))}
                </div>
                <div className="grid gap-3 border-t border-stone-100 p-5 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                  {canFile ? (
                    <>
                      <select name="matter_id" className={inputCls} aria-label="Matter" defaultValue="">
                        <option value="" disabled>File ticked files to…</option>
                        {matters.map((m) => <option key={m.id} value={m.id}>{m.number} · {m.title}</option>)}
                      </select>
                      <select name="category" className={inputCls} aria-label="Category" defaultValue="">
                        <option value="">Keep category</option>
                        {Object.entries(DOC_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                      <div className="flex flex-wrap gap-2 sm:col-span-2">
                        <button formAction={fileDocuments} className={btn.primary}>File to matter</button>
                        <button formAction={removeFromInbox} className={btn.danger}><Trash2 className="h-4 w-4" />Remove</button>
                      </div>
                    </>
                  ) : (
                    <div className="sm:col-span-2"><Note tone="info">Attach these to a service register entry, or ask a lawyer to file them.</Note></div>
                  )}
                </div>
              </form>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Save from anywhere">
            <div className="space-y-4 text-sm text-stone-700">
              <Link href="/portal/connect#phone" className="flex gap-3 rounded-xl border border-stone-200 p-3 hover:border-maroon/40">
                <Smartphone className="h-5 w-5 flex-none text-maroon" />
                <span><strong className="block text-stone-900">From your phone</strong>Install the portal app, then Share → SOS&amp;A Portal from WhatsApp, email or Files. Or scan paper with the camera.</span>
              </Link>
              <Link href="/portal/connect#windows" className="flex gap-3 rounded-xl border border-stone-200 p-3 hover:border-maroon/40">
                <Monitor className="h-5 w-5 flex-none text-maroon" />
                <span><strong className="block text-stone-900">From Windows</strong>Right-click any file → Send to → SOS&amp;A Portal, or drop files into your Portal Inbox folder.</span>
              </Link>
              <Link href="/portal/word/setup" className="flex gap-3 rounded-xl border border-stone-200 p-3 hover:border-maroon/40">
                <FileText className="h-5 w-5 flex-none text-maroon" />
                <span><strong className="block text-stone-900">From Microsoft Word</strong>The Save to Portal button files straight onto a matter, as a new version.</span>
              </Link>
            </div>
          </Card>
          <Note tone="lock">Everything saved here is encrypted, fingerprinted and recorded in the audit trail, whichever way it arrives.</Note>
        </div>
      </div>
    </>
  );
}
