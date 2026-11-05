import Link from "next/link";
import { notFound } from "next/navigation";
import { Building2, CheckCircle2 } from "lucide-react";
import { requirePermission } from "@/lib/portal/auth";
import { can } from "@/lib/portal/permissions";
import { one, q } from "@/lib/portal/db";
import { staffList } from "@/lib/portal/data";
import { audit } from "@/lib/portal/audit";
import { daysUntil, dueLabel, fmtDay, isUuid } from "@/lib/portal/format";
import { ENTITY_TYPES, FILING_KINDS, OFFICER_ROLES } from "@/lib/portal/vocab";
import { Badge, Card, Check, DueBadge, Field, Flash, PageHeader, Row, Select, Tabs, TextArea, btn } from "@/components/portal/ui";
import { addFiling, addOfficer, addShareholding, ceaseOfficer, ceaseShareholding, completeFiling, saveEntity } from "../actions";

export const metadata = { title: "Company" };

type Entity = { id: string; client_id: string | null; client_name: string | null; name: string; entity_type: keyof typeof ENTITY_TYPES; rc_number: string | null; incorporated_on: string | null; registered_address: string | null; share_capital: string | null; tin: string | null; firm_role: string | null; status: string; notes: string | null };

export default async function EntityPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; msg?: string }> }) {
  const u = await requirePermission("cosec.view");
  const { id } = await params;
  const sp = await searchParams;
  if (!isUuid(id)) notFound();
  const e = await one<Entity>("SELECT e.*, c.name AS client_name FROM entities e LEFT JOIN clients c ON c.id = e.client_id WHERE e.id = $1", [id]);
  if (!e) notFound();
  await audit({ userId: u.id, actor: u.email, action: "cosec.viewed", entityType: "entity", entityId: id });
  const tab = ["officers", "shares", "filings", "details"].includes(sp.tab || "") ? sp.tab! : "filings";
  const edit = can(u, "cosec.edit");
  const base = `/portal/cosec/${id}`;
  const [officers, holdings, filings, staff] = await Promise.all([
    q<{ id: string; name: string; role: keyof typeof OFFICER_ROLES; nationality: string | null; address: string | null; appointed_on: string | null; ceased_on: string | null; notes: string | null }>("SELECT * FROM entity_officers WHERE entity_id = $1 ORDER BY ceased_on IS NOT NULL, role, name", [id]),
    q<{ id: string; holder: string; share_class: string; shares: number; acquired_on: string | null; ceased_on: string | null }>("SELECT * FROM entity_shareholdings WHERE entity_id = $1 ORDER BY ceased_on IS NOT NULL, shares DESC", [id]),
    q<{ id: string; kind: keyof typeof FILING_KINDS; title: string; due_on: string | null; filed_on: string | null; reference: string | null; status: string; responsible_name: string | null }>(
      "SELECT f.*, u.full_name AS responsible_name FROM entity_filings f LEFT JOIN users u ON u.id = f.responsible WHERE f.entity_id = $1 ORDER BY f.status != 'due', f.due_on NULLS LAST, f.created_at DESC", [id]),
    staffList(),
  ]);
  const current = holdings.filter((h) => !h.ceased_on);
  const total = current.reduce((s, h) => s + Number(h.shares), 0);
  let body: React.ReactNode;

  if (tab === "filings") {
    body = (
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card title="Filings and deadlines" pad={false}>
          {filings.length === 0 ? <p className="p-5 text-sm text-stone-400">No filings recorded.</p> : filings.map((f) => (
            <div key={f.id} className="border-t border-stone-100 px-5 py-3.5 first:border-t-0">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1"><div className={`font-medium ${f.status !== "due" ? "text-stone-500" : "text-stone-800"}`}>{f.title}</div><div className="text-xs text-stone-500">{FILING_KINDS[f.kind]}{f.responsible_name ? ` · ${f.responsible_name}` : ""}{f.filed_on ? ` · filed ${fmtDay(f.filed_on)}` : ""}{f.reference ? ` · ref ${f.reference}` : ""}</div></div>
                {f.status === "due" ? (f.due_on ? <DueBadge days={daysUntil(f.due_on)} label={dueLabel(f.due_on)} /> : <Badge tone="amber">No date</Badge>) : <Badge tone={f.status === "filed" ? "green" : "grey"}>{f.status}</Badge>}
              </div>
              {edit && f.status === "due" && (
                <details className="mt-2"><summary className="cursor-pointer list-none text-xs font-semibold text-maroon [&::-webkit-details-marker]:hidden">Mark as filed →</summary>
                  <form action={completeFiling} className="mt-2 grid gap-2 sm:grid-cols-3">
                    <input type="hidden" name="entity_id" value={id} /><input type="hidden" name="filing_id" value={f.id} />
                    <Field label="Filed on" name="filed_on" type="date" />
                    <Field label="CAC / agency reference" name="reference" />
                    <div className="flex items-end gap-2"><button className={btn.small}><CheckCircle2 className="h-3.5 w-3.5" />Filed</button><button name="waive" value="1" className={btn.small}>Not needed</button></div>
                  </form>
                </details>
              )}
            </div>
          ))}
        </Card>
        {edit && (
          <Card title="Add a filing or deadline">
            <form action={addFiling} className="space-y-3">
              <input type="hidden" name="entity_id" value={id} />
              <Select label="Kind" name="kind" options={FILING_KINDS} defaultValue="annual_return" />
              <Field label="Title" name="title" placeholder="e.g. Annual return 2026" />
              <Field label="Due on" name="due_on" type="date" />
              <Select label="Responsible" name="responsible" options={staff.filter((s) => s.role !== "front_desk").map((s) => [s.id, s.full_name])} defaultValue={u.id} />
              <TextArea label="Notes" name="notes" rows={2} />
              <button className={btn.primary}>Add</button>
              <p className="text-xs text-stone-500">Deadlines go into the responsible person&apos;s morning reminders and calendar. Filing an annual return or AGM adds next year&apos;s automatically.</p>
            </form>
          </Card>
        )}
      </div>
    );
  } else if (tab === "officers") {
    body = (
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card title="Directors, secretary and other officers" pad={false}>
          {officers.length === 0 ? <p className="p-5 text-sm text-stone-400">None recorded.</p> : officers.map((o) => (
            <Row key={o.id} className={o.ceased_on ? "opacity-50" : ""}>
              <div className="min-w-0 flex-1"><div className="font-medium">{o.name}</div><div className="text-xs text-stone-500">{OFFICER_ROLES[o.role]}{o.nationality ? ` · ${o.nationality}` : ""}{o.appointed_on ? ` · appointed ${fmtDay(o.appointed_on)}` : ""}{o.ceased_on ? ` · ceased ${fmtDay(o.ceased_on)}` : ""}</div></div>
              {edit && !o.ceased_on && <form action={ceaseOfficer}><input type="hidden" name="entity_id" value={id} /><input type="hidden" name="officer_id" value={o.id} /><button className={btn.small}>Ceased today</button></form>}
            </Row>
          ))}
        </Card>
        {edit && (
          <Card title="Add an officer">
            <form action={addOfficer} className="space-y-3">
              <input type="hidden" name="entity_id" value={id} />
              <Field label="Full name" name="name" required />
              <Select label="Role" name="role" options={OFFICER_ROLES} defaultValue="director" />
              <Field label="Nationality" name="nationality" defaultValue="Nigerian" />
              <Field label="Appointed on" name="appointed_on" type="date" />
              <TextArea label="Address" name="address" rows={2} />
              <Check name="filing_task" defaultChecked label="Add a CAC notification deadline (14 days)" />
              <button className={btn.primary}>Add</button>
            </form>
          </Card>
        )}
      </div>
    );
  } else if (tab === "shares") {
    body = (
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card title={`Shareholders · ${total.toLocaleString()} shares`} pad={false}>
          {holdings.length === 0 ? <p className="p-5 text-sm text-stone-400">None recorded.</p> : holdings.map((h) => {
            const pct = !h.ceased_on && total ? (Number(h.shares) / total) * 100 : 0;
            return (
              <div key={h.id} className={`border-t border-stone-100 px-5 py-3 first:border-t-0 ${h.ceased_on ? "opacity-50" : ""}`}>
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1"><div className="font-medium">{h.holder}</div><div className="text-xs text-stone-500">{Number(h.shares).toLocaleString()} {h.share_class}{h.acquired_on ? ` · since ${fmtDay(h.acquired_on)}` : ""}{h.ceased_on ? ` · ceased ${fmtDay(h.ceased_on)}` : ""}</div></div>
                  {!h.ceased_on && <span className="font-serif text-lg text-maroon-dark">{pct.toFixed(pct < 10 ? 2 : 1)}%</span>}
                  {edit && !h.ceased_on && <form action={ceaseShareholding}><input type="hidden" name="entity_id" value={id} /><input type="hidden" name="holding_id" value={h.id} /><button className={btn.small}>Transferred</button></form>}
                </div>
                {!h.ceased_on && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-100"><div className="h-full rounded-full bg-maroon" style={{ width: `${pct}%` }} /></div>}
              </div>
            );
          })}
        </Card>
        {edit && (
          <Card title="Add a shareholding">
            <form action={addShareholding} className="space-y-3">
              <input type="hidden" name="entity_id" value={id} />
              <Field label="Holder" name="holder" required />
              <Field label="Number of shares" name="shares" required inputMode="numeric" />
              <Field label="Class" name="share_class" defaultValue="Ordinary" />
              <Field label="Since" name="acquired_on" type="date" />
              <button className={btn.primary}>Add</button>
            </form>
          </Card>
        )}
      </div>
    );
  } else {
    body = (
      <Card>
        <form action={saveEntity}>
          <fieldset disabled={!edit} className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="client_id" value={e.client_id || ""} />
            <Field label="Name" name="name" required defaultValue={e.name} className="sm:col-span-2" />
            <Select label="Type" name="entity_type" options={ENTITY_TYPES} defaultValue={e.entity_type} />
            <Field label="RC / BN / IT number" name="rc_number" defaultValue={e.rc_number || ""} />
            <Field label="Incorporated on" name="incorporated_on" type="date" defaultValue={e.incorporated_on || ""} />
            <Field label="TIN" name="tin" defaultValue={e.tin || ""} />
            <Field label="Our role" name="firm_role" defaultValue={e.firm_role || ""} />
            <Select label="Status" name="status" options={{ active: "Active", dormant: "Dormant", struck_off: "Struck off", dissolved: "Dissolved" }} defaultValue={e.status} />
            <Field label="Share capital" name="share_capital" defaultValue={e.share_capital || ""} className="sm:col-span-2" />
            <TextArea label="Registered address" name="registered_address" rows={2} defaultValue={e.registered_address || ""} className="sm:col-span-2" />
            <TextArea label="Notes" name="notes" rows={3} defaultValue={e.notes || ""} className="sm:col-span-2" />
            {edit && <div className="sm:col-span-2"><button className={btn.primary}>Save</button></div>}
          </fieldset>
        </form>
      </Card>
    );
  }

  const dueCount = filings.filter((f) => f.status === "due").length;
  return (
    <>
      <PageHeader back={{ href: "/portal/cosec", label: "Company secretarial" }} title={<span className="flex items-center gap-3"><Building2 className="h-7 w-7 text-maroon" />{e.name}</span>}
        sub={<>{ENTITY_TYPES[e.entity_type]}{e.rc_number ? ` · ${e.rc_number}` : ""}{e.incorporated_on ? ` · incorporated ${fmtDay(e.incorporated_on)}` : ""}{e.client_id && <> · <Link href={`/portal/clients/${e.client_id}`} className="text-maroon hover:underline">{e.client_name}</Link></>}</>} />
      <Flash msg={sp.msg} />
      <Tabs active={tab} tabs={[
        { key: "filings", label: `Filings${dueCount ? ` (${dueCount} due)` : ""}`, href: `${base}?tab=filings` },
        { key: "officers", label: `Officers (${officers.filter((o) => !o.ceased_on).length})`, href: `${base}?tab=officers` },
        { key: "shares", label: `Shareholders (${current.length})`, href: `${base}?tab=shares` },
        { key: "details", label: "Details", href: `${base}?tab=details` },
      ]} />
      {body}
    </>
  );
}
