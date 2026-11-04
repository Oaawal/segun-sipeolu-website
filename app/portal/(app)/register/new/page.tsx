import { requireUser } from "@/lib/portal/auth";
import { can } from "@/lib/portal/permissions";
import { pickableMatters, staffList } from "@/lib/portal/data";
import { today } from "@/lib/portal/format";
import { DEADLINE_PRESETS, SERVICE_KINDS, SERVICE_METHODS } from "@/lib/portal/vocab";
import { Card, Field, Flash, Note, PageHeader, Select, TextArea, btn } from "@/components/portal/ui";
import { createEntry } from "../actions";
import { redirect } from "next/navigation";

export const metadata = { title: "Log a document" };

export default async function NewEntry({ searchParams }: { searchParams: Promise<{ direction?: string; matter?: string; msg?: string }> }) {
  const u = await requireUser();
  const sp = await searchParams;
  const dir = sp.direction === "out" ? "out" : "in";
  if (dir === "in" ? !can(u, "service.log_inward") : !can(u, "service.edit")) redirect("/portal/register?msg=denied");
  const [matters, staff] = await Promise.all([u.role === "front_desk" ? Promise.resolve([]) : pickableMatters(u), staffList()]);
  const lawyers = staff.filter((s) => s.role !== "front_desk");
  return (
    <>
      <PageHeader title={dir === "in" ? "Document served on us" : "Document we served"} sub={dir === "in" ? "Log it as it arrives: who brought it, how, when, and who signed for it." : "Record service with its proof, so it can be proved later."} back={{ href: "/portal/register", label: "Service register" }} />
      <Flash msg={sp.msg} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <form action={createEntry} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <input type="hidden" name="direction" value={dir} />
            <Select label="What it is" name="kind" options={SERVICE_KINDS} defaultValue={dir === "in" ? "hearing_notice" : "letter"} />
            <Field label="Title" name="title" required placeholder={dir === "in" ? "e.g. Statement of defence, Suit ID/1234/2026" : "e.g. Letter of demand to Lagos Homes Ltd"} />
            <Field label={dir === "in" ? "Served by (sender)" : "Served on (recipient)"} name="party" required placeholder={dir === "in" ? "e.g. Bailiff, High Court Ikeja / Aluko & Oyebode" : "e.g. Lagos Homes Ltd, 4 Adeola Odeku St"} className="sm:col-span-2" />
            <Select label="How" name="method" options={SERVICE_METHODS} defaultValue={dir === "in" ? "bailiff" : "courier"} />
            <Field label={dir === "in" ? "Date received" : "Date served"} name="served_on" type="date" required defaultValue={today()} />
            <Field label="Time" name="served_at" type="time" />
            <Field label={dir === "in" ? "Delivered by (name)" : "Served by (name)"} name="served_by" placeholder={dir === "in" ? "Name of bailiff or courier" : "Our clerk or bailiff"} />
            <Field label={dir === "in" ? "Received by" : "Received / acknowledged by"} name="received_by" defaultValue={dir === "in" ? u.full_name : ""} />
            <Field label="Proof" name="proof" placeholder={dir === "in" ? "e.g. Stamped acknowledgement copy" : "e.g. Affidavit of service, DHL waybill 123…"} />
            {u.role === "front_desk" ? (
              <Field label="Suit or matter number on the document" name="reference" placeholder="e.g. ID/1234/2026" hint="If it matches one of our matters, the entry is linked and the lawyer is told." className="sm:col-span-2" />
            ) : (
              <>
                <Select label="Matter" name="matter_id" options={matters.map((m) => [m.id, `${m.number} · ${m.title}`])} blank="Not linked yet" defaultValue={sp.matter || ""} />
                <Field label="…or suit / matter number" name="reference" placeholder="Links automatically if it matches" />
              </>
            )}
            <div className="sm:col-span-2 grid grid-cols-1 gap-4 rounded-xl border border-gold/40 bg-gold/10 p-4 sm:grid-cols-3">
              <Select label="Response due in" name="due_days" options={DEADLINE_PRESETS.map((p) => [String(p.days), p.label])} blank="No deadline" />
              <Field label="…or on this date" name="response_due" type="date" />
              <Select label="Lawyer responsible" name="handled_by" options={lawyers.map((s) => [s.id, s.full_name])} blank="Matter lead (automatic)" />
              <p className="sm:col-span-3 text-xs text-stone-600">A deadline creates a high-priority task for the responsible lawyer. Always confirm the period against the applicable court rules.</p>
            </div>
            <TextArea label="Notes" name="notes" rows={3} className="sm:col-span-2" />
            <div className="sm:col-span-2"><button className={btn.primary}>Save to register</button></div>
          </form>
        </Card>
        <div className="space-y-4">
          <Note tone="info">After saving, scan or photograph the document and attach it to the entry. The scan is encrypted and fingerprinted.</Note>
          <Note tone="lock">The register keeps who logged each entry and when. Entries cannot be deleted, only marked as actioned or filed.</Note>
        </div>
      </div>
    </>
  );
}
