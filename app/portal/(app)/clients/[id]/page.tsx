import Link from "next/link";
import { notFound } from "next/navigation";
import { Briefcase, Lock, Plus } from "lucide-react";
import { requirePermission } from "@/lib/portal/auth";
import { can, canSeeMatter } from "@/lib/portal/permissions";
import { one, q } from "@/lib/portal/db";
import { audit } from "@/lib/portal/audit";
import { isUuid, fmtDay } from "@/lib/portal/format";
import { CLIENT_KINDS, MATTER_STATUS } from "@/lib/portal/vocab";
import { Avatar, Badge, Card, Empty, Flash, PageHeader, Row, btn } from "@/components/portal/ui";
import { ClientForm } from "../ClientForm";

export const metadata = { title: "Client" };

export default async function ClientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string }> }) {
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
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
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
    </>
  );
}
