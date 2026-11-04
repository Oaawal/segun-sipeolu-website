import Link from "next/link";
import { ScanSearch } from "lucide-react";
import { requirePermission } from "@/lib/portal/auth";
import { can } from "@/lib/portal/permissions";
import { conflictSearch, staffList } from "@/lib/portal/data";
import { audit } from "@/lib/portal/audit";
import { one, q } from "@/lib/portal/db";
import { isUuid, today } from "@/lib/portal/format";
import { COURTS, MATTER_TYPES, PRACTICE_AREAS } from "@/lib/portal/vocab";
import { Card, Check, Field, Flash, Note, PageHeader, Select, TextArea, btn, inputCls } from "@/components/portal/ui";
import { createMatter } from "../actions";
import { ConflictResults } from "../ConflictResults";

export const metadata = { title: "New matter" };

export default async function NewMatter({ searchParams }: { searchParams: Promise<{ client?: string; parties?: string; checked?: string; msg?: string }> }) {
  const u = await requirePermission("matters.create");
  const sp = await searchParams;
  const clients = await q<{ id: string; name: string }>("SELECT id, name FROM clients ORDER BY name LIMIT 1000");
  const client = isUuid(sp.client) ? await one<{ id: string; name: string }>("SELECT id, name FROM clients WHERE id = $1", [sp.client]) : null;
  const parties = String(sp.parties || "").split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 20);
  const checked = sp.checked === "1" && client;
  const groups = checked ? await Promise.all([client.name, ...parties].map(async (name) => ({ query: name, hits: await conflictSearch(u, name) }))) : [];
  if (checked) await audit({ userId: u.id, actor: u.email, action: "conflict.checked", detail: { names: [client.name, ...parties], hits: groups.reduce((n, g) => n + g.hits.length, 0), context: "new_matter" } });
  const staff = await staffList();
  const partners = staff.filter((s) => s.role === "admin" || s.role === "partner");
  const team = staff.filter((s) => s.role !== "front_desk" && s.id !== u.id);

  return (
    <>
      <PageHeader title="Open a new matter" sub="Step 1 checks for conflicts of interest. Step 2 opens the file." back={{ href: "/portal/matters", label: "Matters" }} />
      <Flash msg={sp.msg} />

      <Card title="1 · Client and other parties" className="mb-6">
        <form className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <input type="hidden" name="checked" value="1" />
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-semibold text-stone-700">Client <span className="text-maroon">*</span></span>
            <select name="client" required defaultValue={client?.id || ""} className={inputCls}>
              <option value="">Choose a client…</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <span className="mt-1 block text-xs text-stone-500">Not listed? <Link href="/portal/clients/new?next=matter" className="font-semibold text-maroon">Add a new client</Link> first.</span>
          </label>
          <TextArea label="Other side, counterparties and related people" name="parties" defaultValue={parties.join("\n")} rows={3} hint="One name per line: defendants, counterparties, guarantors, opposing counsel, directors." />
          <div className="md:col-span-2"><button className={btn.ghost}><ScanSearch className="h-4 w-4" />Run conflict check</button></div>
        </form>
      </Card>

      {checked && (
        <>
          <Card title="Conflict check results" className="mb-6">
            <ConflictResults groups={groups} />
            <div className="mt-4"><Note tone="info">Matches on our client&apos;s own earlier matters are normal. A match on the <strong>other side</strong> of any matter needs a partner&apos;s review before you proceed. Restricted matters are searched too, but only their number is shown.</Note></div>
          </Card>

          <Card title="2 · Matter details">
            <form action={createMatter} className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <input type="hidden" name="client_id" value={client.id} />
              <input type="hidden" name="opposing" value={parties.join("\n")} />
              <input type="hidden" name="conflict_query" value={[client.name, ...parties].join("; ")} />
              <Field label="Matter title" name="title" required className="md:col-span-2" defaultValue={parties[0] ? `${client.name} v. ${parties[0]}` : ""} placeholder="e.g. Adeyemi v. Lagos Homes Ltd, or Acquisition of Plot 14 Lekki" />
              <Select label="Type" name="matter_type" options={MATTER_TYPES} defaultValue="litigation" />
              <Select label="Practice area" name="practice_area" options={PRACTICE_AREAS.map((p) => [p, p])} defaultValue="Litigation" />
              <Select label="Responsible partner" name="responsible_partner" options={partners.map((p) => [p.id, p.full_name])} blank="Choose…" defaultValue={u.role === "partner" || u.role === "admin" ? u.id : ""} />
              <Field label="Date opened" name="opened_on" type="date" defaultValue={today()} />
              <Field label="Court" name="court" list="courts" placeholder="If in court" />
              <datalist id="courts">{COURTS.map((c) => <option key={c} value={c} />)}</datalist>
              <Field label="Suit number" name="suit_number" placeholder="e.g. ID/1234/2026" />
              <Field label="Judge" name="judge" placeholder="Hon. Justice …" />
              <div />
              <TextArea label="Instructions and background" name="description" rows={4} className="md:col-span-2" placeholder="What the client wants, key facts, fee agreed, anything promised." />
              {team.length > 0 && (
                <fieldset className="md:col-span-2">
                  <legend className="mb-2 text-[13px] font-semibold text-stone-700">Matter team (you are added automatically)</legend>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {team.map((s) => <Check key={s.id} name="members" value={s.id} label={<>{s.full_name} <span className="text-stone-400">· {s.title || s.role}</span></>} />)}
                  </div>
                </fieldset>
              )}
              {can(u, "matters.set_confidential") && (
                <div className="md:col-span-2"><Check name="confidential" label={<><strong>Walled-off matter.</strong> Only the matter team can see it, not even other partners. Use for sensitive matters or where colleagues are conflicted.</>} /></div>
              )}
              <div className="md:col-span-2 rounded-xl border border-gold/40 bg-gold/10 p-4">
                <Check name="conflict_cleared" required label={<>I have reviewed the conflict check above and there is no conflict that prevents the firm acting (or a partner has cleared it). This is recorded.</>} />
              </div>
              <div className="md:col-span-2"><button className={btn.primary}>Open matter</button></div>
            </form>
          </Card>
        </>
      )}
    </>
  );
}
