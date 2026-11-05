import { Building2, Plus, Search } from "lucide-react";
import { requirePermission } from "@/lib/portal/auth";
import { can } from "@/lib/portal/permissions";
import { q } from "@/lib/portal/db";
import { daysUntil, dueLabel, fmtDay } from "@/lib/portal/format";
import { ENTITY_TYPES } from "@/lib/portal/vocab";
import { Badge, Card, Check, DueBadge, Empty, Field, Flash, PageHeader, Row, Select, TextArea, btn, inputCls } from "@/components/portal/ui";
import { saveEntity } from "./actions";

export const metadata = { title: "Company secretarial" };

export default async function Cosec({ searchParams }: { searchParams: Promise<{ q?: string; msg?: string; new?: string }> }) {
  const u = await requirePermission("cosec.view");
  const sp = await searchParams;
  const term = (sp.q || "").trim().slice(0, 100);
  const rows = await q<{ id: string; name: string; entity_type: keyof typeof ENTITY_TYPES; rc_number: string | null; status: string; client_name: string | null; next_due: string | null; overdue: number }>(
    `SELECT e.id, e.name, e.entity_type, e.rc_number, e.status, c.name AS client_name,
            (SELECT MIN(f.due_on) FROM entity_filings f WHERE f.entity_id = e.id AND f.status = 'due') AS next_due,
            (SELECT COUNT(*) FROM entity_filings f WHERE f.entity_id = e.id AND f.status = 'due' AND f.due_on < CURRENT_DATE) AS overdue
     FROM entities e LEFT JOIN clients c ON c.id = e.client_id
     ${term ? "WHERE e.name ILIKE $1 OR e.rc_number ILIKE $1" : ""} ORDER BY e.status != 'active', e.name LIMIT 500`,
    term ? [`%${term.replace(/[%_\\]/g, (x) => "\\" + x)}%`] : []);
  const due = await q<{ id: string; entity_id: string; name: string; title: string; due_on: string }>(
    "SELECT f.id, f.entity_id, e.name, f.title, f.due_on FROM entity_filings f JOIN entities e ON e.id = f.entity_id WHERE f.status = 'due' AND f.due_on <= CURRENT_DATE + 45 ORDER BY f.due_on LIMIT 30");
  const clients = can(u, "cosec.edit") ? await q<{ id: string; name: string }>("SELECT id, name FROM clients WHERE kind IN ('company','ngo','other') ORDER BY name") : [];
  return (
    <>
      <PageHeader title="Company secretarial" sub="Client companies, their officers and shareholders, and every filing deadline" actions={can(u, "cosec.edit") && <a href="#new" className={btn.primary}><Plus className="h-4 w-4" />Add a company</a>} />
      <Flash msg={sp.msg} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <form className="relative max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input name="q" type="search" defaultValue={term} placeholder="Search name or RC number" className={`${inputCls} pl-9`} />
          </form>
          <Card pad={false}>
            {rows.length === 0 ? <Empty icon={<Building2 className="h-8 w-8" />} title="No companies yet" text="Add the companies the firm acts as company secretary or filing agent for." /> : rows.map((e) => (
              <Row key={e.id} href={`/portal/cosec/${e.id}`}>
                <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-maroon/10 text-maroon"><Building2 className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1"><div className="truncate font-semibold text-stone-800">{e.name}</div><div className="truncate text-sm text-stone-500">{ENTITY_TYPES[e.entity_type]}{e.rc_number ? ` · ${e.rc_number}` : ""}{e.client_name ? ` · client: ${e.client_name}` : ""}</div></div>
                {e.status !== "active" ? <Badge>{e.status.replace("_", " ")}</Badge> : e.overdue > 0 ? <Badge tone="red">{e.overdue} overdue</Badge> : e.next_due ? <DueBadge days={daysUntil(e.next_due)} label={dueLabel(e.next_due)} /> : null}
              </Row>
            ))}
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Filings due in the next 45 days" pad={false}>
            {due.length === 0 ? <p className="p-5 text-sm text-stone-400">Nothing due.</p> : due.map((f) => <Row key={f.id} href={`/portal/cosec/${f.entity_id}?tab=filings`}><div className="min-w-0 flex-1"><div className="truncate font-medium">{f.title}</div><div className="truncate text-xs text-stone-500">{f.name} · {fmtDay(f.due_on)}</div></div><DueBadge days={daysUntil(f.due_on)} label={dueLabel(f.due_on)} /></Row>)}
          </Card>
          {can(u, "cosec.edit") && (
            <Card title={<span id="new">Add a company</span>}>
              <form action={saveEntity} className="grid gap-4 sm:grid-cols-2">
                <Field label="Name" name="name" required className="sm:col-span-2" placeholder="e.g. Adeyemi Holdings Limited" />
                <Select label="Type" name="entity_type" options={ENTITY_TYPES} defaultValue="private_ltd" />
                <Field label="RC / BN / IT number" name="rc_number" />
                <Field label="Incorporated / registered on" name="incorporated_on" type="date" />
                <Select label="Client" name="client_id" options={clients.map((c) => [c.id, c.name])} blank="Not linked" />
                <Field label="Our role" name="firm_role" list="firm-roles" placeholder="Company secretary" />
                <datalist id="firm-roles"><option value="Company secretary" /><option value="Retained counsel" /><option value="Filing agent" /></datalist>
                <Field label="Share capital" name="share_capital" placeholder="e.g. 1,000,000 ordinary shares of ₦1" />
                <TextArea label="Registered address" name="registered_address" rows={2} className="sm:col-span-2" />
                <div className="sm:col-span-2"><Check name="first_return" defaultChecked label="Add the first annual return as a filing to track (check the date)" /></div>
                <div className="sm:col-span-2"><button className={btn.primary}>Add company</button></div>
              </form>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
