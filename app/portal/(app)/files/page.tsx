import Link from "next/link";
import { ChevronRight, FileText, Folder, Lock } from "lucide-react";
import { requireUser } from "@/lib/portal/auth";
import { q } from "@/lib/portal/db";
import { matterAccessSql } from "@/lib/portal/permissions";
import { listDocuments } from "@/lib/portal/data";
import { matterFacts } from "@/lib/portal/guards";
import { canSeeMatter } from "@/lib/portal/permissions";
import { fmtDay, fmtSize } from "@/lib/portal/format";
import { OFFICE_FOLDERS, type OfficeFolder } from "@/lib/portal/intake";
import { s3Enabled } from "@/lib/portal/storage";
import { Card, Empty, Flash, PageHeader, Tabs } from "@/components/portal/ui";
import { Uploader } from "@/components/portal/Uploader";
import { DocumentList } from "@/components/portal/Documents";
import { moveOfficeFile, removeDocument } from "../../docs/actions";

export const metadata = { title: "Office files" };

type Folder = OfficeFolder | "personal";
const LABELS: Record<Folder, string> = { ...OFFICE_FOLDERS, personal: "Personal files" };

interface FileRow { id: string; title: string; file_name: string; size_bytes: number; uploaded_at: string; uploaded_by: string | null; uploader: string | null; matter_id: string | null; matter_number: string | null; folder: string | null }

export default async function OfficeFiles({ searchParams }: { searchParams: Promise<{ folder?: string; matter?: string; msg?: string }> }) {
  const u = await requireUser();
  const sp = await searchParams;
  const folder: Folder = sp.folder && sp.folder in LABELS ? (sp.folder as Folder) : "ongoing";
  const here = `/portal/files?folder=${folder}`;
  const tabs = <Tabs active={folder} tabs={(Object.keys(LABELS) as Folder[]).map((k) => ({ key: k, href: `/portal/files?folder=${k}`, label: k === "personal" ? <span className="inline-flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" />{LABELS[k]}</span> : LABELS[k] }))} />;

  // Inside a matter's folder: that matter's documents (only if this person may open the matter)
  if ((folder === "ongoing" || folder === "concluded") && sp.matter) {
    const m = await matterFacts(u, sp.matter);
    const ok = m && canSeeMatter(u, { confidential: m.confidential, isMember: m.is_member });
    const docs = ok ? await listDocuments("matter", m.id) : [];
    return (
      <>
        <PageHeader title="Office files" />
        {tabs}
        <Flash msg={sp.msg} />
        <div className="mb-4 flex items-center gap-1 text-sm text-stone-500"><Link href={here} className="hover:text-maroon">{LABELS[folder]}</Link><ChevronRight className="h-4 w-4" /><span className="text-stone-800">{ok ? `${m.number} · ${m.title}` : "Not available"}</span></div>
        {ok ? (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <Card pad={false}><DocumentList docs={docs} ownerType="matter" ownerId={m.id} canRemove={u.role !== "front_desk"} canUpload /></Card>
            <Card><Uploader fixedMatter={m.id} direct={s3Enabled()} /></Card>
          </div>
        ) : <Card><Empty title="You cannot open this matter's files" /></Card>}
      </>
    );
  }

  const isOffice = folder !== "personal";
  const files = await q<FileRow>(
    isOffice
      ? `SELECT d.id, d.title, d.file_name, d.size_bytes, d.uploaded_at, d.uploaded_by, us.full_name AS uploader, NULL::uuid AS matter_id, NULL AS matter_number, d.folder
         FROM documents d LEFT JOIN users us ON us.id = d.uploaded_by
         WHERE d.owner_type = 'office' AND d.office_folder = $1 AND d.deleted_at IS NULL
           AND d.version = (SELECT MAX(x.version) FROM documents x WHERE x.series_id = d.series_id AND x.deleted_at IS NULL)
         ORDER BY d.uploaded_at DESC LIMIT 500`
      : `SELECT d.id, d.title, d.file_name, d.size_bytes, d.uploaded_at, d.uploaded_by, NULL AS uploader, NULL::uuid AS matter_id, NULL AS matter_number, d.folder
         FROM documents d WHERE d.owner_type = 'personal' AND d.owner_id = $1 AND d.deleted_at IS NULL ORDER BY d.uploaded_at DESC LIMIT 500`,
    [isOffice ? folder : u.id]);

  // Matters as folders: open ones under Ongoing, closed ones under Concluded
  const matters = (folder === "ongoing" || folder === "concluded") && u.role !== "front_desk"
    ? await q<{ id: string; number: string; title: string; n: number }>(
      `SELECT m.id, m.number, m.title, (SELECT COUNT(*)::int FROM documents d WHERE d.matter_id = m.id AND d.owner_type = 'matter' AND d.deleted_at IS NULL) AS n
       FROM matters m WHERE ${matterAccessSql(u)} AND m.status ${folder === "concluded" ? "= 'closed'" : "<> 'closed'"} ORDER BY m.number DESC LIMIT 500`, [u.id])
    : [];
  // Correspondence also gathers the letters filed on matters this person can open
  const letters = folder === "correspondence" && u.role !== "front_desk"
    ? await q<FileRow>(
      `SELECT d.id, d.title, d.file_name, d.size_bytes, d.uploaded_at, d.uploaded_by, us.full_name AS uploader, d.matter_id, m.number AS matter_number, d.folder
       FROM documents d JOIN matters m ON m.id = d.matter_id LEFT JOIN users us ON us.id = d.uploaded_by
       WHERE d.owner_type = 'matter' AND d.category = 'correspondence' AND d.deleted_at IS NULL AND ${matterAccessSql(u)}
       ORDER BY d.uploaded_at DESC LIMIT 300`, [u.id])
    : [];
  const all = [...files, ...letters].sort((a, b) => String(b.uploaded_at).localeCompare(String(a.uploaded_at)));
  const canChange = (f: FileRow) => !f.matter_id && (!isOffice || f.uploaded_by === u.id || u.role === "admin" || u.role === "partner");

  return (
    <>
      <PageHeader title="Office files" />
      {tabs}
      <Flash msg={sp.msg} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card pad={false}>
          {matters.map((m) => (
            <Link key={m.id} href={`${here}&matter=${m.id}`} className="flex items-center gap-3 border-t border-stone-100 px-5 py-3 first:border-t-0 hover:bg-cream/60">
              <Folder className="h-5 w-5 flex-none text-gold" />
              <span className="min-w-0 flex-1 truncate text-sm"><span className="font-medium text-stone-800">{m.number}</span> · {m.title}</span>
              <span className="text-xs text-stone-400">{m.n}</span>
            </Link>
          ))}
          {all.map((f) => (
            <div key={f.id} className="flex items-center gap-3 border-t border-stone-100 px-5 py-3 first:border-t-0">
              <FileText className="h-5 w-5 flex-none text-maroon" />
              <div className="min-w-0 flex-1">
                <a href={`/portal/api/files/${f.id}`} target="_blank" rel="noopener" className="block truncate text-sm font-medium text-stone-800 hover:text-maroon">{f.title}</a>
                <div className="truncate text-xs text-stone-500">{[f.matter_number, f.folder, f.file_name, fmtSize(Number(f.size_bytes)), fmtDay(f.uploaded_at), isOffice ? f.uploader : null].filter(Boolean).join(" · ")}</div>
              </div>
              {canChange(f) && (
                <details className="relative">
                  <summary className="cursor-pointer list-none rounded px-2 py-1 text-xs font-semibold text-stone-500 hover:text-maroon [&::-webkit-details-marker]:hidden">⋯</summary>
                  <div className="absolute right-0 z-10 mt-1 w-48 space-y-1 rounded-lg border border-stone-200 bg-white p-2 text-sm shadow-lg">
                    <a href={`/portal/api/files/${f.id}?download=1`} className="block rounded px-2 py-1 hover:bg-cream">Download</a>
                    {isOffice && (Object.keys(OFFICE_FOLDERS) as OfficeFolder[]).filter((k) => k !== folder).map((k) => (
                      <form key={k} action={moveOfficeFile}><input type="hidden" name="id" value={f.id} /><input type="hidden" name="folder" value={k} /><button className="w-full rounded px-2 py-1 text-left hover:bg-cream">Move to {OFFICE_FOLDERS[k]}</button></form>
                    ))}
                    <form action={removeDocument}><input type="hidden" name="id" value={f.id} /><input type="hidden" name="back" value={here} /><button className="w-full rounded px-2 py-1 text-left text-red-700 hover:bg-red-50">Delete</button></form>
                  </div>
                </details>
              )}
            </div>
          ))}
          {matters.length + all.length === 0 && <Empty title="Nothing here yet" />}
        </Card>
        <Card><Uploader destination={folder === "personal" ? "personal" : `office:${folder}`} direct={s3Enabled()} /></Card>
      </div>
    </>
  );
}
