import Link from "next/link";
import { notFound } from "next/navigation";
import { Briefcase, Lock, Plus } from "lucide-react";
import { requirePermission } from "@/lib/portal/auth";
import { can, canSeeMatter } from "@/lib/portal/permissions";
import { one, q } from "@/lib/portal/db";
import { audit } from "@/lib/portal/audit";
import { isUuid, fmtDay } from "@/lib/portal/format";
import { CLIENT_KINDS, MATTER_STATUS } from "@/lib/portal/vocab";
import { Avatar, Badge, Card, Check, Empty, Field, Flash, Note, PageHeader, Row, btn } from "@/components/portal/ui";
import { CopyButton } from "@/components/portal/CopyButton";
import { inviteClientUser, setClientUserActive } from "../../matters/client-actions";
import { ClientForm } from "../ClientForm";

export const metadata = { title: "Client" };

export default async function ClientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; link?: string; emailed?: string }> }) {
  const u = await requirePermission("clients.view");
  const { id } = await params;
  const sp = await searchParams;
  if (!isUuid(id)) notFound();
  const c = await one<{ id: string; kind: keyof typeof CLIENT_KINDS; name: string; rc_number: string | null; email: string | null; phone: string | null; address: string | null; contact_person: string | null; source: string | null; notes: string | null; kyc_verified: boolean; created_at: string }>("SELECT * FROM clients WHERE id = $1", [id]);
  if (!c) notFound();
  const matters = await q<{ id: string; number: string; title: string; status: keyof typeof MATTER_STATUS; confidential: boolean; is_member: boolean; opened_on: string }>(
    `SELECT m.id, m.number, m.title, m.status, m.confidential, m.opened_on, EXISTS (SELECT 1 FROM matter_members mm WHERE mm.matter_id = m.id AND mm.user_id = $2) AS is_member
     FROM matters m WHERE m.client_id = $1 ORDER BY m.opened_on DESC`,
    [id, u.id],
  );
  const portalPeople = can(u, "clientportal.invite") ? await q<{ id: string; full_name: string; email: string; active: boolean; has_password: boolean; last_login_at: string | null }>("SELECT id, full_name, email, active, password_hash IS NOT NULL AS has_password, last_login_at FROM client_users WHERE client_id = $1 ORDER BY full_name", [id]) : [];
  await audit({ userId: u.id, actor: u.email, action: "client.viewed", entityType: "client", entityId: id });
  return (
    <>
      <PageHeader
        back={{ href: "/portal/clients", label: "Clients" }}
        title={<span className="flex items-center gap-3"><Avatar name={c.name} size="lg" />{c.name}</span>}
        sub={<>{CLIENT_KINDS[c.kind]}{c.rc_number ? ` · ${c.rc_number}` : ""} · client since {fmtDay(c.created_at)} {c.kyc_verified ? <Badge tone="green">KYC checked</Badge> : <Badge tone="amber">KYC not checked</Badge>}</>}
        actions={can(u, "matters.create") && <Link href={`/portal/matters/new?client=${c.id}`} className={btn.primary}><Plus className="h-4 w-4" />New matter</Link>}
      />
      <Flash msg={sp.msg} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card title="Details"><ClientForm c={c} disabled={!can(u, "clients.edit")} /></Card>
        <Card title="Matters" pad={false}>
          {matters.length === 0 ? <Empty icon={<Briefcase className="h-8 w-8" />} title="No matters yet" /> : matters.map((m) => {
            const open = canSeeMatter(u, { confidential: m.confidential, isMember: m.is_member });
            return (
              <Row key={m.id} href={open ? `/portal/matters/${m.id}` : undefined}>
                {open ? <Briefcase className="h-4 w-4 flex-none text-maroon" /> : <Lock className="h-4 w-4 flex-none text-stone-400" />}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-stone-800">{open ? m.title : "Restricted matter"}</div>
                  <div className="text-xs text-stone-500">{m.number} · opened {fmtDay(m.opened_on)}</div>
                </div>
                <Badge tone={m.status === "closed" ? "grey" : "maroon"}>{MATTER_STATUS[m.status]}</Badge>
              </Row>
            );
          })}
        </Card>
      </div>
      {(can(u, "clientportal.invite") || can(u, "billing.manage")) && (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          {can(u, "clientportal.invite") ? (
            <Card title="Client portal access" pad={false}>
              {sp.link && <div className="p-5 pb-0"><Note tone="ok"><div className="space-y-2"><div>{sp.emailed ? "Invitation emailed. " : "Send this link to the person (it works once, for 7 days):"}</div><div className="flex gap-2"><input readOnly value={sp.link} className="min-w-0 flex-1 rounded border border-stone-300 bg-white px-2 py-1 text-xs text-stone-700" /><CopyButton text={sp.link} /></div></div></Note></div>}
              {portalPeople.map((p) => (
                <Row key={p.id}>
                  <Avatar name={p.full_name} size="sm" />
                  <div className="min-w-0 flex-1"><div className="text-sm font-medium">{p.full_name}</div><div className="text-xs text-stone-500">{p.email} · {p.has_password ? (p.last_login_at ? `last signed in ${fmtDay(p.last_login_at)}` : "never signed in") : "invitation not yet accepted"}</div></div>
                  {!p.active && <Badge>Off</Badge>}
                  <form action={setClientUserActive}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="active" value={p.active ? "0" : "1"} /><button className={btn.small}>{p.active ? "Turn off" : "Turn on"}</button></form>
                </Row>
              ))}
              <form action={inviteClientUser} className="grid grid-cols-1 gap-3 border-t border-stone-100 p-5 sm:grid-cols-2">
                <input type="hidden" name="client_id" value={c.id} />
                <Field label="Name" name="full_name" required defaultValue={portalPeople.length ? "" : c.contact_person || (c.kind === "individual" ? c.name : "")} />
                <Field label="Email" name="email" type="email" required defaultValue={portalPeople.length ? "" : c.email || ""} />
                <div className="sm:col-span-2"><Check name="send" defaultChecked label="Email the invitation now" /></div>
                <div className="sm:col-span-2"><button className={btn.primary}>Give portal access</button></div>
                <p className="text-xs text-stone-500 sm:col-span-2">They see only matters you choose to share (on each matter&apos;s Client portal tab), and only documents you tick. Sending an invite again to the same email gives them a fresh link.</p>
              </form>
            </Card>
          ) : <div />}
          {can(u, "billing.manage") && (
            <Card title="Money">
              <div className="space-y-3 text-sm">
                <Link href={`/portal/billing/client-account/${c.id}`} className={`${btn.ghost} w-full`}>Client account (money held)</Link>
                <Link href={`/portal/billing?tab=invoices&status=all`} className={`${btn.ghost} w-full`}>All invoices</Link>
              </div>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
