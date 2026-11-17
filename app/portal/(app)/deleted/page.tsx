import { redirect } from "next/navigation";
import { Search } from "lucide-react";
import { requireUser } from "@/lib/portal/auth";
import { canRestore } from "@/lib/portal/permissions";
import { q } from "@/lib/portal/db";
import { audit } from "@/lib/portal/audit";
import { fmtDateTime } from "@/lib/portal/format";
import { OFFICE_FOLDERS, type OfficeFolder } from "@/lib/portal/intake";
import { Card, Empty, Flash, PageHeader, Row, btn, inputCls } from "@/components/portal/ui";
import { restoreDocument } from "../../docs/actions";

export const metadata = { title: "Deleted files" };

/**
 * Deleted documents, for the Managing Partner and the IT officer. Nothing is
 * listed until someone searches for it by name; anything deleted in the last
 * 60 days can be brought back.
 */
export default async function Deleted({ searchParams }: { searchParams: Promise<{ q?: string; msg?: string }> }) {
  const u = await requireUser();
  if (!canRestore(u)) redirect("/portal?denied=1");
  const sp = await searchParams;
  const term = (sp.q || "").trim().slice(0, 100);
  const rows = term.length >= 2 ? await q<{ id: string; title: string; file_name: string; owner_type: string; office_folder: string | null; matter_number: string | null; owner_name: string | null; deleted_at: string; deleted_by_name: string | null; days_left: number }>(
    `SELECT DISTINCT ON (d.series_id, d.deleted_at) d.id, d.title, d.file_name, d.owner_type, d.office_folder, m.number AS matter_number, ow.full_name AS owner_name,
            d.deleted_at, db.full_name AS deleted_by_name, (60 - EXTRACT(DAY FROM now() - d.deleted_at))::int AS days_left
     FROM documents d LEFT JOIN matters m ON m.id = d.matter_id LEFT JOIN users db ON db.id = d.deleted_by
       LEFT JOIN users ow ON ow.id = d.owner_id AND d.owner_type IN ('inbox','personal')
     WHERE d.deleted_at IS NOT NULL AND d.purged_at IS NULL AND d.deleted_at > now() - interval '60 days'
       AND (d.title ILIKE $1 OR d.file_name ILIKE $1 OR COALESCE(d.folder, '') ILIKE $1 OR COALESCE(m.number, '') ILIKE $1)
     ORDER BY d.series_id, d.deleted_at, d.version DESC LIMIT 100`,
    [`%${term.replace(/[%_\\]/g, (c) => "\\" + c)}%`]) : null;
  if (rows) await audit({ userId: u.id, actor: u.email, action: "deleted_files.searched", detail: { q: term, found: rows.length } });
  const where = (r: NonNullable<typeof rows>[number]) =>
    r.matter_number ? r.matter_number : r.owner_type === "office" ? `Office files · ${OFFICE_FOLDERS[r.office_folder as OfficeFolder] || ""}` : r.owner_type === "personal" ? `Personal files of ${r.owner_name}` : r.owner_type === "inbox" ? `Inbox of ${r.owner_name}` : r.owner_type;
  return (
    <>
      <PageHeader title="Deleted files" sub="Search by name to find a document deleted in the last 60 days." />
      <Flash msg={sp.msg} />
      <form className="relative mb-6 max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
        <input name="q" type="search" defaultValue={term} autoFocus placeholder="Document or file name" className={`${inputCls} pl-9`} />
      </form>
      {rows && (
        <Card pad={false}>
          {rows.length === 0 ? <Empty title={`Nothing deleted in the last 60 days matches “${term}”`} /> : rows.map((r) => (
            <Row key={r.id}>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{r.title}</div>
                <div className="truncate text-xs text-stone-500">{r.file_name} · {where(r)} · deleted {fmtDateTime(r.deleted_at)}{r.deleted_by_name ? ` by ${r.deleted_by_name}` : ""} · {Math.max(0, r.days_left)} days left</div>
              </div>
              <form action={restoreDocument}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="q" value={term} /><button className={btn.small}>Restore</button></form>
            </Row>
          ))}
        </Card>
      )}
    </>
  );
}
