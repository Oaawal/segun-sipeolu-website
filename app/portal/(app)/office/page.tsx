import Link from "next/link";
import { KeyRound, Laptop, UserMinus } from "lucide-react";
import { requirePermission } from "@/lib/portal/auth";
import { one, q } from "@/lib/portal/db";
import { audit } from "@/lib/portal/audit";
import { daysUntil, dueLabel, fmtDay, isUuid } from "@/lib/portal/format";
import { ASSET_KINDS } from "@/lib/portal/vocab";
import { Avatar, Badge, Card, DueBadge, Empty, Field, Flash, Note, PageHeader, Row, Select, Tabs, TextArea, btn } from "@/components/portal/ui";
import { grantAccess, returnAsset, revokeAccess, saveAsset, saveSystem } from "./actions";

export const metadata = { title: "Office & IT" };

type Asset = { id: string; kind: keyof typeof ASSET_KINDS; name: string; make_model: string | null; serial: string | null; assigned_to: string | null; holder: string | null; location: string | null; purchased_on: string | null; cost: string | null; supplier: string | null; warranty_until: string | null; renews_on: string | null; status: string; notes: string | null };
const STATUS = { in_use: "In use", spare: "Spare", repair: "Being repaired", retired: "Retired", lost: "Lost / stolen" };

function AssetForm({ a, staff }: { a?: Asset; staff: { id: string; full_name: string }[] }) {
  return (
    <form action={saveAsset} className="grid gap-4 sm:grid-cols-2">
      {a && <input type="hidden" name="id" value={a.id} />}
      <Select label="Type" name="kind" options={ASSET_KINDS} defaultValue={a?.kind || "laptop"} />
      <Field label="Name" name="name" required defaultValue={a?.name} placeholder="e.g. Barr. Eze's laptop, Microsoft 365, segunsipeolu.com" />
      <Field label="Make / model / plan" name="make_model" defaultValue={a?.make_model || ""} />
      <Field label="Serial / licence number" name="serial" defaultValue={a?.serial || ""} />
      <Select label="Assigned to" name="assigned_to" options={staff.map((s) => [s.id, s.full_name])} blank="Nobody (office)" defaultValue={a?.assigned_to || ""} />
      <Field label="Location" name="location" defaultValue={a?.location || ""} placeholder="e.g. Ikeja office, server room" />
      <Field label="Bought on" name="purchased_on" type="date" defaultValue={a?.purchased_on || ""} />
      <Field label="Cost" name="cost" defaultValue={a?.cost || ""} placeholder="e.g. ₦850,000 or ₦45,000 / year" />
      <Field label="Supplier" name="supplier" defaultValue={a?.supplier || ""} />
      <Field label="Warranty until" name="warranty_until" type="date" defaultValue={a?.warranty_until || ""} />
      <Field label="Renews / expires on" name="renews_on" type="date" defaultValue={a?.renews_on || ""} hint="Licences, subscriptions, domains: a reminder goes to the administrator." />
      <Select label="Status" name="status" options={STATUS} defaultValue={a?.status || "in_use"} />
      <TextArea label="Notes" name="notes" rows={2} defaultValue={a?.notes || ""} className="sm:col-span-2" placeholder="Never write passwords here." />
      <div className="sm:col-span-2"><button className={btn.primary}>{a ? "Save" : "Add to register"}</button></div>
    </form>
  );
}

export default async function Office({ searchParams }: { searchParams: Promise<{ tab?: string; msg?: string; edit?: string; person?: string }> }) {
  const u = await requirePermission("office.manage");
  const sp = await searchParams;
  const tab = ["access", "people"].includes(sp.tab || "") ? sp.tab! : "assets";
  const staff = await q<{ id: string; full_name: string; active: boolean; role: string }>("SELECT id, full_name, active, role FROM users ORDER BY active DESC, full_name");
  const tabs = <Tabs active={tab} tabs={[{ key: "assets", label: "Equipment & licences", href: "/portal/office" }, { key: "access", label: "Systems & access", href: "/portal/office?tab=access" }, { key: "people", label: "Leavers checklist", href: "/portal/office?tab=people" }]} />;
  let body: React.ReactNode;

  if (tab === "assets") {
    const assets = await q<Asset>("SELECT a.*, u.full_name AS holder FROM assets a LEFT JOIN users u ON u.id = a.assigned_to ORDER BY a.status = 'retired', a.kind, a.name");
    const edit = isUuid(sp.edit) ? assets.find((a) => a.id === sp.edit) : undefined;
    const renewals = assets.filter((a) => a.status !== "retired" && a.renews_on && (daysUntil(a.renews_on) ?? 99) <= 60);
    body = (
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          {renewals.length > 0 && <Card title="Renewals in the next 60 days" pad={false}>{renewals.map((a) => <Row key={a.id} href={`/portal/office?edit=${a.id}`}><div className="min-w-0 flex-1"><div className="truncate font-medium">{a.name}</div><div className="text-xs text-stone-500">{ASSET_KINDS[a.kind]}{a.cost ? ` · ${a.cost}` : ""}</div></div><DueBadge days={daysUntil(a.renews_on)} label={dueLabel(a.renews_on)} /></Row>)}</Card>}
          <Card title={`Register (${assets.length})`} pad={false}>
            {assets.length === 0 ? <Empty icon={<Laptop className="h-8 w-8" />} title="Nothing registered yet" text="Add laptops, phones, printers, the router, software licences, subscriptions and the domain name." /> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead><tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wider text-stone-500"><th className="px-5 py-3">Item</th><th className="px-3 py-3">With</th><th className="px-3 py-3">Warranty / renewal</th><th className="px-5 py-3 text-right">Status</th></tr></thead>
                  <tbody>{assets.map((a) => (
                    <tr key={a.id} className={`border-t border-stone-100 hover:bg-cream/60 ${a.status === "retired" ? "opacity-50" : ""}`}>
                      <td className="px-5 py-3"><Link href={`/portal/office?edit=${a.id}`} className="block"><div className="font-medium text-stone-800">{a.name}</div><div className="text-xs text-stone-500">{ASSET_KINDS[a.kind]}{a.make_model ? ` · ${a.make_model}` : ""}{a.serial ? ` · ${a.serial}` : ""}</div></Link></td>
                      <td className="px-3 py-3 text-stone-700">{a.holder || <span className="text-stone-400">{a.location || "Office"}</span>}</td>
                      <td className="px-3 py-3 text-xs text-stone-500">{a.renews_on ? `Renews ${fmtDay(a.renews_on)}` : a.warranty_until ? `Warranty to ${fmtDay(a.warranty_until)}` : "—"}</td>
                      <td className="px-5 py-3 text-right"><Badge tone={a.status === "in_use" ? "green" : a.status === "lost" ? "red" : a.status === "repair" ? "amber" : "grey"}>{STATUS[a.status as keyof typeof STATUS]}</Badge></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
        <Card title={edit ? `Edit: ${edit.name}` : "Add an item"} action={edit && <Link href="/portal/office" className="text-sm font-semibold text-maroon">New item</Link>}><AssetForm a={edit} staff={staff.filter((s) => s.active)} /></Card>
      </div>
    );
  } else if (tab === "access") {
    const systems = await q<{ id: string; name: string; url: string | null; owner_note: string | null }>("SELECT * FROM systems ORDER BY name");
    const access = await q<{ system_id: string; user_id: string; level: string; granted_on: string; note: string | null; full_name: string; active: boolean }>(
      "SELECT a.*, u.full_name, u.active FROM system_access a JOIN users u ON u.id = a.user_id WHERE a.revoked_on IS NULL ORDER BY u.full_name");
    body = (
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          {systems.length === 0 && <Card><Empty icon={<KeyRound className="h-8 w-8" />} title="No systems listed yet" text="List the accounts the firm depends on: email administration, the bank's internet banking, the CAC portal, court e-filing, the website host, the domain registrar." /></Card>}
          {systems.map((s) => {
            const holders = access.filter((a) => a.system_id === s.id);
            return (
              <Card key={s.id} title={<span className="normal-case tracking-normal text-stone-800">{s.name}</span>} action={s.url && <a href={s.url} target="_blank" rel="noopener" className="text-xs text-maroon">{s.url.replace(/^https?:\/\//, "").slice(0, 40)}</a>} pad={false}>
                {s.owner_note && <p className="px-5 pt-1 text-xs text-stone-500">{s.owner_note}</p>}
                {holders.length === 0 ? <p className="px-5 py-3 text-sm text-stone-400">Nobody listed.</p> : holders.map((h) => (
                  <Row key={h.user_id}><Avatar name={h.full_name} size="sm" /><div className="min-w-0 flex-1"><div className="text-sm font-medium">{h.full_name} {!h.active && <Badge tone="red">Has left</Badge>}</div><div className="text-xs text-stone-500">{h.level} since {fmtDay(h.granted_on)}{h.note ? ` · ${h.note}` : ""}</div></div>
                    <form action={revokeAccess}><input type="hidden" name="system_id" value={s.id} /><input type="hidden" name="user_id" value={h.user_id} /><button className={btn.small}>Removed</button></form></Row>
                ))}
                <form action={grantAccess} className="grid gap-2 border-t border-stone-100 p-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]">
                  <input type="hidden" name="system_id" value={s.id} />
                  <Select label="Person" name="user_id" options={staff.filter((x) => x.active).map((x) => [x.id, x.full_name])} />
                  <Select label="Access" name="level" options={{ user: "User", admin: "Administrator", signatory: "Signatory / approver" }} />
                  <div className="flex items-end"><button className={btn.small}>Add</button></div>
                </form>
              </Card>
            );
          })}
        </div>
        <div className="space-y-4">
          <Card title="Add a system">
            <form action={saveSystem} className="space-y-3">
              <Field label="Name" name="name" required placeholder="e.g. Zenith internet banking" />
              <Field label="Address" name="url" placeholder="https://" />
              <TextArea label="Notes" name="owner_note" rows={2} placeholder="e.g. Two signatories needed; administrator is the Managing Partner" />
              <button className={btn.primary}>Add</button>
            </form>
          </Card>
          <Note tone="lock">Record who has access, never the passwords. Keep passwords in a password manager.</Note>
        </div>
      </div>
    );
  } else {
    const person = isUuid(sp.person) ? staff.find((s) => s.id === sp.person) : undefined;
    if (person) {
      const [assets, access, matters] = await Promise.all([
        q<Asset>("SELECT a.*, NULL AS holder FROM assets a WHERE a.assigned_to = $1 AND a.status != 'retired'", [person.id]),
        q<{ system_id: string; name: string; level: string }>("SELECT a.system_id, s.name, a.level FROM system_access a JOIN systems s ON s.id = a.system_id WHERE a.user_id = $1 AND a.revoked_on IS NULL", [person.id]),
        one<{ lead: number; member: number; tasks: number }>(`SELECT (SELECT COUNT(*) FROM matter_members mm JOIN matters m ON m.id = mm.matter_id WHERE mm.user_id = $1 AND mm.role = 'lead' AND m.status != 'closed') AS lead,
           (SELECT COUNT(*) FROM matter_members mm JOIN matters m ON m.id = mm.matter_id WHERE mm.user_id = $1 AND m.status != 'closed') AS member,
           (SELECT COUNT(*) FROM tasks WHERE assigned_to = $1 AND status = 'open') AS tasks`, [person.id]),
      ]);
      await audit({ userId: u.id, actor: u.email, action: "office.leaver_checklist", entityType: "user", entityId: person.id });
      const items = [
        { done: !person.active, text: "Portal access deactivated (People & access). This also revokes their Word and Windows connections." },
        { done: assets.length === 0, text: `Equipment returned: ${assets.length ? assets.map((a) => a.name).join(", ") : "none outstanding"}` },
        { done: access.length === 0, text: `Access removed from firm systems: ${access.length ? access.map((a) => a.name).join(", ") : "none outstanding"}` },
        { done: (matters?.member ?? 0) === 0, text: `Open matters handed over: ${matters?.member ?? 0} (lead on ${matters?.lead ?? 0})` },
        { done: (matters?.tasks ?? 0) === 0, text: `Open tasks reassigned: ${matters?.tasks ?? 0}` },
      ];
      body = (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <Card title={`Leaving: ${person.full_name}`}>
            <ul className="space-y-3">{items.map((i) => <li key={i.text} className="flex items-start gap-3 text-sm"><span className={`mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-full text-[11px] font-bold ${i.done ? "bg-green text-white" : "border-2 border-amber-400 text-amber-600"}`}>{i.done ? "✓" : "!"}</span><span className={i.done ? "text-stone-500" : "text-stone-800"}>{i.text}</span></li>)}</ul>
            <div className="mt-5 flex flex-wrap gap-2"><Link href="/portal/admin/people" className={btn.small}>People & access</Link><Link href={`/portal/matters?status=open`} className={btn.small}>Matters</Link></div>
          </Card>
          <div className="space-y-6">
            <Card title="Equipment to collect" pad={false}>{assets.length === 0 ? <p className="p-5 text-sm text-stone-400">None.</p> : assets.map((a) => <Row key={a.id}><div className="min-w-0 flex-1"><div className="font-medium">{a.name}</div><div className="text-xs text-stone-500">{a.serial || ASSET_KINDS[a.kind]}</div></div><form action={returnAsset}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="user_id" value={person.id} /><button className={btn.small}>Returned</button></form></Row>)}</Card>
            <Card title="Access to remove" pad={false}>{access.length === 0 ? <p className="p-5 text-sm text-stone-400">None.</p> : access.map((a) => <Row key={a.system_id}><div className="min-w-0 flex-1 text-sm font-medium">{a.name} <span className="font-normal text-stone-500">({a.level})</span></div><form action={revokeAccess}><input type="hidden" name="system_id" value={a.system_id} /><input type="hidden" name="user_id" value={person.id} /><input type="hidden" name="back" value="people" /><button className={btn.small}>Removed</button></form></Row>)}</Card>
          </div>
        </div>
      );
    } else {
      body = (
        <Card title="Choose the person" pad={false}>
          {staff.map((s) => <Row key={s.id} href={`/portal/office?tab=people&person=${s.id}`}><Avatar name={s.full_name} size="sm" /><div className="flex-1 font-medium">{s.full_name}</div>{!s.active && <Badge>Deactivated</Badge>}<UserMinus className="h-4 w-4 text-stone-400" /></Row>)}
        </Card>
      );
    }
  }
  return (
    <>
      <PageHeader title="Office & IT" sub="Equipment, licences, renewals, and who has access to which systems" />
      <Flash msg={sp.msg} />
      {tabs}
      {body}
    </>
  );
}
