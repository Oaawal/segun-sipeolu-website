import { FileText, Image as ImageIcon, Lock, Music, ShieldCheck, Upload } from "lucide-react";
import type { DocRow } from "@/lib/portal/data";
import { DOC_CATEGORIES } from "@/lib/portal/vocab";
import { fmtDateTime, fmtSize } from "@/lib/portal/format";
import { removeDocument } from "@/app/portal/docs/actions";
import { Badge, Check, Empty, Field, Select, btn } from "./ui";

export function UploadForm({ ownerType, ownerId, compact, seriesId }: { ownerType: string; ownerId: string; compact?: boolean; seriesId?: string }) {
  return (
    <form action="/portal/api/documents" method="post" encType="multipart/form-data" className={compact ? "flex flex-wrap items-end gap-2" : "grid gap-4 sm:grid-cols-2"}>
      <input type="hidden" name="owner_type" value={ownerType} />
      <input type="hidden" name="owner_id" value={ownerId} />
      {seriesId && <input type="hidden" name="series_id" value={seriesId} />}
      <label className={compact ? "min-w-0 flex-1" : "block sm:col-span-2"}>
        {!compact && <span className="mb-1.5 block text-[13px] font-semibold text-stone-700">File <span className="text-maroon">*</span></span>}
        <input type="file" name="file" required className="block w-full rounded-lg border border-dashed border-stone-300 bg-cream/40 px-3 py-3 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-maroon file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white" />
      </label>
      {!compact && (
        <>
          <Field label="Title" name="title" placeholder="e.g. Statement of claim (filed)" />
          <Select label="Category" name="category" options={DOC_CATEGORIES} defaultValue="other" />
          <div className="sm:col-span-2"><Check name="privileged" label="Privileged / attorney work product" /></div>
          <div className="sm:col-span-2 text-xs text-stone-500">Up to {process.env.PORTAL_MAX_FILE_MB || 100} MB. Files are encrypted at rest and fingerprinted (SHA-256), so tampering is detected when opened.</div>
        </>
      )}
      <div className={compact ? "" : "sm:col-span-2"}><button className={compact ? btn.small : btn.primary}><Upload className="h-4 w-4" />{seriesId ? "Upload new version" : "Upload"}</button></div>
    </form>
  );
}

function iconFor(name: string) {
  if (/\.(png|jpe?g|webp|heic)$/i.test(name)) return <ImageIcon className="h-5 w-5" />;
  if (/\.(mp3|m4a|wav|webm|ogg|aac|mp4)$/i.test(name)) return <Music className="h-5 w-5" />;
  return <FileText className="h-5 w-5" />;
}

export function DocumentList({ docs, ownerType, ownerId, canRemove, canUpload }: { docs: DocRow[]; ownerType: string; ownerId: string; canRemove: boolean; canUpload: boolean }) {
  if (!docs.length) return <Empty icon={<FileText className="h-8 w-8" />} title="No documents yet" />;
  return (
    <div>
      {docs.map((d) => (
        <div key={d.id} className="border-t border-stone-100 px-5 py-3.5 first:border-t-0">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-maroon/10 text-maroon">{iconFor(d.file_name)}</span>
            <div className="min-w-0 flex-1">
              <a href={`/portal/api/files/${d.id}`} target="_blank" rel="noopener" className="block truncate font-semibold text-stone-800 hover:text-maroon">{d.title}</a>
              <div className="truncate text-xs text-stone-500">
                {DOC_CATEGORIES[d.category as keyof typeof DOC_CATEGORIES] || "Other"} · {fmtSize(Number(d.size_bytes))} · {d.uploader_name || "—"} · {fmtDateTime(d.uploaded_at)}
              </div>
            </div>
            <div className="hidden items-center gap-1.5 sm:flex">
              {d.privileged && <Badge tone="maroon"><Lock className="h-3 w-3" />Privileged</Badge>}
              {Number(d.versions) > 1 && <Badge tone="gold">v{d.version}</Badge>}
              <span title={`SHA-256 ${d.sha256}`}><Badge tone="green"><ShieldCheck className="h-3 w-3" />Sealed</Badge></span>
            </div>
          </div>
          {(canUpload || canRemove) && (
            <details className="mt-2 pl-[52px]">
              <summary className="cursor-pointer list-none text-xs font-semibold text-stone-500 hover:text-maroon [&::-webkit-details-marker]:hidden">More…</summary>
              <div className="mt-2 space-y-2">
                <div className="break-all font-mono text-[11px] text-stone-400">SHA-256 {d.sha256}</div>
                <a href={`/portal/api/files/${d.id}?download=1`} className={btn.small}>Download</a>
                {canUpload && <UploadForm ownerType={ownerType} ownerId={ownerId} compact seriesId={d.series_id} />}
                {canRemove && <form action={removeDocument}><input type="hidden" name="id" value={d.id} /><button className="text-xs font-semibold text-red-700 hover:underline">Remove from list</button></form>}
              </div>
            </details>
          )}
        </div>
      ))}
    </div>
  );
}
