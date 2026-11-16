import Link from "next/link";
import { notFound } from "next/navigation";
import { Briefcase, Mail, Phone } from "lucide-react";
import { requirePermission } from "@/lib/portal/auth";
import { can } from "@/lib/portal/permissions";
import { one, q } from "@/lib/portal/db";
import { conflictSearch, staffList } from "@/lib/portal/data";
import { audit } from "@/lib/portal/audit";
import { fmtDateTime, isUuid } from "@/lib/portal/format";
import { naira } from "@/lib/portal/money";
import { nameKey } from "@/lib/portal/vocab";
import { ENQUIRY_SOURCES, ENQUIRY_STATUS } from "@/lib/portal/enquiries";
import { Badge, Card, Field, Flash, Note, PageHeader, Select, TextArea, btn } from "@/components/portal/ui";
import { ConflictResults } from "../../matters/ConflictResults";
import { assignEnquiry, closeEnquiry, convertEnquiry, quoteEnquiry, recordConflict } from "../actions";

export const metadata = { title: "Enquiry" };

export default async function EnquiryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string }> }) {
  const u = await requirePermission("intake.view");
  const { id } = await params;
  const sp = await searchParams;
  if (!isUuid(id)) notFound();
  const e = await one<{ id: string; number: string; name: string; organisation: string | null; email: string | null; phone: string | null; practice_area: string | null; summary: string; other_parties: string | null; source: string; status: string; assigned_to: string | null; conflict_note: string | null; conflict_at: string | null; conflict_by_name: string | null; quote_kobo: number | null; quote_note: string | null; client_id: string | null; matter_id: string | null; decline_reason: string | null; created_at: string; created_by_name: string | null }>(
    `SELECT e.*, cb.full_name AS conflict_by_name, cr.full_name AS created_by_name FROM enquiries e LEFT JOIN users cb ON cb.id = e.conflict_by LEFT JOIN users cr ON cr.id = e.created_by WHERE e.id = $1`, [id]);
  if (!e) notFound();
  const decide = can(u, "intake.decide");
  const names = [e.organisation, e.name, ...(e.other_parties || "").split(/\n|;/)].map((s) => (s || "").trim()).filter(Boolean).slice(0, 10);
  const groups = decide ? await Promise.all(names.map(async (n) => ({ query: n, hits: await conflictSearch(u, n) }))) : [];
  if (decide) await audit({ userId: u.id, actor: u.email, action: "conflict.checked", entityType: "enquiry", entityId: e.id, detail: { names, hits: groups.reduce((s, g) => s + g.hits.length, 0), context: "enquiry" } });
  const staff = await staffList();
  const sameClients = await q<{ id: string; name: string }>("SELECT id, name FROM clients WHERE name_key = $1 OR name_key = $2 OR (email IS NOT NULL AND email = $3) LIMIT 5", [nameKey(e.organisation || e.name), nameKey(e.name), e.email || "-"]);
  const open = !["engaged", "declined", "no_response"].includes(e.status);
  return (
    <>
      <PageHeader back={{ href: "/portal/enquiries", label: "Enquiries" }} title={e.name} sub={<span className="flex flex-wrap items-center gap-2">{e.number}{e.organisation ? ` · ${e.organisation}` : ""} · {ENQUIRY_SOURCES[e.source as keyof typeof ENQUIRY_SOURCES] || e.source} · {fmtDateTime(e.created_at)}<Badge tone={ENQUIRY_STATUS[e.status]?.[1]}>{ENQUIRY_STATUS[e.status]?.[0]}</Badge></span>} />
      <Flash msg={sp.msg} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card title="The enquiry">
            <p className="whitespace-pre-line text-sm text-stone-800">{e.summary}</p>
            <dl className="mt-4 grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 text-sm">
              <dt className="text-stone-500">Area</dt><dd>{e.practice_area || "—"}</dd>
              <dt className="text-stone-500">Phone</dt><dd>{e.phone ? <a href={`tel:${e.phone}`} className="inline-flex items-center gap-1 text-maroon"><Phone className="h-3.5 w-3.5" />{e.phone}</a> : "—"}</dd>
              <dt className="text-stone-500">Email</dt><dd>{e.email ? <a href={`mailto:${e.email}`} className="inline-flex items-center gap-1 text-maroon"><Mail className="h-3.5 w-3.5" />{e.email}</a> : "—"}</dd>
              <dt className="text-stone-500">Other side</dt><dd className="whitespace-pre-line">{e.other_parties || "—"}</dd>
              <dt className="text-stone-500">Logged by</dt><dd>{e.created_by_name || "Website form"}</dd>
            </dl>
          </Card>
          {decide && (
            <Card title="Conflict check (run automatically)">
              <ConflictResults groups={groups} />
              {e.conflict_at && <div className="mt-4"><Note tone={e.status === "conflict_found" ? "danger" : "ok"}>{e.status === "conflict_found" ? "Conflict recorded" : "Cleared"} by {e.conflict_by_name} on {fmtDateTime(e.conflict_at)}{e.conflict_note ? `: ${e.conflict_note}` : "."}</Note></div>}
              {open && (
                <form action={recordConflict} className="mt-4 space-y-3 border-t border-stone-100 pt-4">
                  <input type="hidden" name="id" value={e.id} />
                  <Select label="Result" name="result" options={{ cleared: "No conflict: the firm can act", found: "Conflict: the firm cannot act" }} />
                  <Field label="Note" name="conflict_note" placeholder="Required if there is a conflict" />
                  <button className={btn.ghost}>Record the result</button>
                </form>
              )}
            </Card>
          )}
          {e.matter_id && <Link href={`/portal/matters/${e.matter_id}`} className={`${btn.primary} w-full`}><Briefcase className="h-4 w-4" />Open the matter</Link>}
        </div>
        <div className="space-y-6">
          <Card title="Handled by">
            <form action={assignEnquiry} className="flex gap-2">
              <input type="hidden" name="id" value={e.id} />
              <Select label="" name="assigned_to" className="flex-1" options={staff.filter((s) => s.role !== "front_desk").map((s) => [s.id, s.full_name])} blank="Nobody yet" defaultValue={e.assigned_to || ""} />
              <button className={`${btn.ghost} self-end`}>Save</button>
            </form>
          </Card>
          {decide && open && (
            <Card title="Fee quote">
              {e.quote_kobo && <p className="mb-3 text-sm">Quoted <strong>{naira(e.quote_kobo)}</strong>{e.quote_note ? `: ${e.quote_note}` : ""}</p>}
              <form action={quoteEnquiry} className="space-y-3">
                <input type="hidden" name="id" value={e.id} />
                <Field label="Fee (₦)" name="quote" inputMode="decimal" required defaultValue={e.quote_kobo ? (Number(e.quote_kobo) / 100).toFixed(2) : ""} />
                <TextArea label="Basis / terms" name="quote_note" rows={2} defaultValue={e.quote_note || ""} />
                <button className={btn.ghost}>Save quote</button>
              </form>
            </Card>
          )}
          {decide && open && can(u, "matters.create") && (
            <Card title="Take it on">
              <form action={convertEnquiry} className="space-y-3">
                <input type="hidden" name="id" value={e.id} />
                {sameClients.length > 0 && <Select label="Existing client" name="client_id" options={sameClients.map((c) => [c.id, c.name])} blank="Create a new client record" />}
                <button className={btn.primary} disabled={e.status === "new" || e.status === "conflict_found"}>Create client and open matter</button>
                <p className="text-xs text-stone-500">Opens a new matter with the conflict check and details filled in. Then send the engagement letter from Templates and ask the client to sign it on the matter&apos;s Client portal tab.</p>
              </form>
            </Card>
          )}
          {open && (
            <Card title="Close without acting">
              <form action={closeEnquiry} className="space-y-3">
                <input type="hidden" name="id" value={e.id} />
                <Select label="Why" name="status" options={{ declined: "We declined / they went elsewhere", no_response: "No response from them" }} />
                <Field label="Note" name="reason" />
                <button className={btn.danger}>Close enquiry</button>
              </form>
            </Card>
          )}
          {e.decline_reason && <Note tone="info">Closed: {e.decline_reason}</Note>}
        </div>
      </div>
    </>
  );
}
