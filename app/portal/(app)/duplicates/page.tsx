import { Copy, Files, Trash2 } from "lucide-react";
import { requirePermission } from "@/lib/portal/auth";
import { q } from "@/lib/portal/db";
import { reviewableSql } from "@/lib/portal/dedupe";
import { fmtDateTime, fmtSize } from "@/lib/portal/format";
import { Badge, Card, Empty, Flash, Note, PageHeader, btn } from "@/components/portal/ui";
import { keepDuplicate, removeDuplicate, scanDuplicates } from "./actions";

export const metadata = { title: "Duplicates" };

const where = (owner: string, matter: string | null) => matter || (owner === "service" ? "Service register" : owner === "meeting" ? "a meeting" : "—");

export default async function Duplicates({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const u = await requirePermission("documents.review_duplicates");
  const sp = await searchParams;
  const rows = await q<{ id: string; title: string; file_name: string; size_bytes: number; uploaded_at: string; uploader: string | null; match: string; duplicate_of: string; matter_number: string | null; owner_type: string; storage_shared: boolean; of_title: string; of_owner: string; of_matter: string | null; of_uploaded: string }>(
    `SELECT d.id, d.title, d.file_name, d.size_bytes, d.uploaded_at, us.full_name AS uploader, x.match, x.duplicate_of, m.number AS matter_number, d.owner_type,
            EXISTS (SELECT 1 FROM documents o WHERE o.storage_key = d.storage_key AND o.id <> d.id) AS storage_shared,
            o.title AS of_title, o.owner_type AS of_owner, om.number AS of_matter, o.uploaded_at AS of_uploaded
     FROM document_duplicates x
       JOIN documents d ON d.id = x.document_id LEFT JOIN users us ON us.id = d.uploaded_by LEFT JOIN matters m ON m.id = d.matter_id
       JOIN documents o ON o.id = x.duplicate_of LEFT JOIN matters om ON om.id = o.matter_id
     WHERE x.status = 'open' AND d.deleted_at IS NULL AND ${reviewableSql()}
     ORDER BY x.detected_at DESC LIMIT 300`, [u.id]);
  const done = await q<{ n: number; freed: number }>(
    `SELECT COUNT(*)::int AS n, COALESCE(SUM(CASE WHEN d.purged_at IS NOT NULL THEN d.size_bytes ELSE 0 END), 0)::bigint AS freed
     FROM document_duplicates x JOIN documents d ON d.id = x.document_id WHERE x.status = 'removed'`);
  return (
    <>
      <PageHeader title="Duplicates to review" sub="Documents whose contents are exactly the same as one already kept. Anything that differs, even by one word, is never flagged. Reviewed by the litigation team."
        actions={<form action={scanDuplicates}><button className={btn.ghost}><Files className="h-4 w-4" />Check all stored documents</button></form>} />
      <Flash msg={sp.msg} />
      {rows.length === 0 ? (
        <Card><Empty icon={<Copy className="h-8 w-8" />} title="Nothing to review" text="When someone saves a document that is exactly the same as one already in the portal, it appears here." /></Card>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <Card key={r.id}>
              <div className="flex flex-wrap items-start gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <a href={`/portal/api/files/${r.id}?review=1`} target="_blank" rel="noopener" className="font-semibold text-stone-800 hover:text-maroon">{r.title}</a>
                    <Badge tone={r.match === "file" ? "amber" : "blue"}>{r.match === "file" ? "Same file" : "Same words, different file"}</Badge>
                  </div>
                  <div className="mt-0.5 text-xs text-stone-500">{r.file_name} · {fmtSize(Number(r.size_bytes))} · {where(r.owner_type, r.matter_number)} · saved by {r.uploader || "—"} on {fmtDateTime(r.uploaded_at)}</div>
                  <div className="mt-2 text-sm text-stone-700">
                    Same as <a href={`/portal/api/files/${r.duplicate_of}?review=1`} target="_blank" rel="noopener" className="font-semibold text-maroon hover:underline">{r.of_title}</a> in {where(r.of_owner, r.of_matter)}, saved {fmtDateTime(r.of_uploaded)}.
                  </div>
                  <div className="mt-1 text-xs text-stone-500">{r.storage_shared ? "Takes no extra storage: it already shares the original's stored copy." : `Removing it frees ${fmtSize(Number(r.size_bytes))}.`}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <form action={removeDuplicate}><input type="hidden" name="id" value={r.id} /><button className={btn.danger}><Trash2 className="h-4 w-4" />Remove this copy</button></form>
                  <form action={keepDuplicate}><input type="hidden" name="id" value={r.id} /><button className={btn.ghost}>Keep both</button></form>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      <div className="mt-6"><Note tone="info">Removing a copy keeps the original, notes it on the matter and records who removed it{Number(done[0]?.n) ? ` (${done[0].n} removed so far${Number(done[0].freed) ? `, ${fmtSize(Number(done[0].freed))} freed` : ""})` : ""}. Opening a document here to compare is recorded. Copies on walled-off matters only appear to team members of that matter, and private inboxes are never shown. No emails are sent about duplicates.</Note></div>
    </>
  );
}
