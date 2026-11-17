import Link from "next/link";
import { Copy, Files, Trash2 } from "lucide-react";
import { requireUser } from "@/lib/portal/auth";
import { can } from "@/lib/portal/permissions";
import { q } from "@/lib/portal/db";
import { describeOriginal } from "@/lib/portal/dedupe";
import { fmtDateTime, fmtSize } from "@/lib/portal/format";
import { Badge, Card, Empty, Flash, Note, PageHeader, btn } from "@/components/portal/ui";
import { keepDuplicate, removeDuplicate, scanDuplicates } from "./actions";

export const metadata = { title: "Duplicates" };

export default async function Duplicates({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const u = await requireUser();
  const sp = await searchParams;
  const admin = u.role === "admin";
  const rows = await q<{ id: string; title: string; file_name: string; size_bytes: number; uploaded_at: string; uploader: string | null; match: string; duplicate_of: string; matter_number: string | null; owner_type: string; storage_shared: boolean }>(
    `SELECT d.id, d.title, d.file_name, d.size_bytes, d.uploaded_at, us.full_name AS uploader, x.match, x.duplicate_of, m.number AS matter_number, d.owner_type,
            EXISTS (SELECT 1 FROM documents o WHERE o.storage_key = d.storage_key AND o.id <> d.id) AS storage_shared
     FROM document_duplicates x JOIN documents d ON d.id = x.document_id LEFT JOIN users us ON us.id = d.uploaded_by LEFT JOIN matters m ON m.id = d.matter_id
     WHERE x.status = 'open' AND d.deleted_at IS NULL ${admin ? "" : "AND d.uploaded_by = $1"}
     ORDER BY x.detected_at DESC LIMIT 300`, admin ? [] : [u.id]);
  const originals = await Promise.all(rows.map((r) => describeOriginal(u, r.duplicate_of)));
  const recent = await q<{ n: number; freed: number }>(
    `SELECT COUNT(*)::int AS n, COALESCE(SUM(CASE WHEN d.purged_at IS NOT NULL THEN d.size_bytes ELSE 0 END), 0)::bigint AS freed
     FROM document_duplicates x JOIN documents d ON d.id = x.document_id WHERE x.status = 'removed' ${admin ? "" : "AND x.reviewed_by = $1"}`, admin ? [] : [u.id]);
  return (
    <>
      <PageHeader title="Duplicates to review" sub="Documents whose contents are exactly the same as one already kept. Anything that differs, even by one word, is never flagged."
        actions={can(u, "system.manage") ? <form action={scanDuplicates}><button className={btn.ghost}><Files className="h-4 w-4" />Check all stored documents</button></form> : undefined} />
      <Flash msg={sp.msg} />
      {rows.length === 0 ? (
        <Card><Empty icon={<Copy className="h-8 w-8" />} title="Nothing to review" text="When a document is saved that is exactly the same as one already in the portal, it appears here for you to decide." /></Card>
      ) : (
        <div className="space-y-3">
          {rows.map((r, i) => {
            const o = originals[i];
            return (
              <Card key={r.id}>
                <div className="flex flex-wrap items-start gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <a href={`/portal/api/files/${r.id}`} target="_blank" rel="noopener" className="font-semibold text-stone-800 hover:text-maroon">{r.title}</a>
                      <Badge tone={r.match === "file" ? "amber" : "blue"}>{r.match === "file" ? "Same file" : "Same words, different file"}</Badge>
                    </div>
                    <div className="mt-0.5 text-xs text-stone-500">{r.file_name} · {fmtSize(Number(r.size_bytes))} · {r.matter_number || (r.owner_type === "inbox" ? "Inbox" : r.owner_type)} · saved by {r.uploader || "—"} on {fmtDateTime(r.uploaded_at)}</div>
                    <div className="mt-2 text-sm text-stone-700">
                      Same as {o.title ? <><a href={`/portal/api/files/${r.duplicate_of}`} target="_blank" rel="noopener" className="font-semibold text-maroon hover:underline">{o.title}</a> in {o.where}</> : <>a document already kept in a file you cannot open (ask the Managing Partner)</>}.
                    </div>
                    <div className="mt-1 text-xs text-stone-500">{r.storage_shared ? "Takes no extra storage: it already shares the original's stored copy." : `Removing it frees ${fmtSize(Number(r.size_bytes))}.`}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <form action={removeDuplicate}><input type="hidden" name="id" value={r.id} /><button className={btn.danger}><Trash2 className="h-4 w-4" />Remove this copy</button></form>
                    <form action={keepDuplicate}><input type="hidden" name="id" value={r.id} /><button className={btn.ghost}>Keep both</button></form>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <div className="mt-6"><Note tone="info">Removing a copy keeps the original and records who removed it and when{Number(recent[0]?.n) ? ` (${recent[0].n} removed so far${Number(recent[0].freed) ? `, ${fmtSize(Number(recent[0].freed))} freed` : ""})` : ""}. Identical files never take extra storage even if kept. <Link href="/portal/search" className="font-semibold underline">Search documents</Link></Note></div>
    </>
  );
}
