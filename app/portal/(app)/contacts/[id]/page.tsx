import { notFound } from "next/navigation";
import { Briefcase, Download, Lock, Mail, MessageCircle, Phone } from "lucide-react";
import { requirePermission } from "@/lib/portal/auth";
import { can, canSeeMatter } from "@/lib/portal/permissions";
import { one, q } from "@/lib/portal/db";
import { pickableMatters } from "@/lib/portal/data";
import { normalisePhone } from "@/lib/portal/notify";
import { isUuid } from "@/lib/portal/format";
import { CONTACT_KINDS } from "@/lib/portal/vocab";
import { Avatar, Card, Field, Flash, PageHeader, Row, Select, btn } from "@/components/portal/ui";
import { ContactForm } from "../ContactForm";
import { archiveContact, linkContact } from "../actions";

export const metadata = { title: "Contact" };

export default async function ContactPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string }> }) {
  const u = await requirePermission("contacts.view");
  const { id } = await params;
  const sp = await searchParams;
  if (!isUuid(id)) notFound();
  const c = await one<{ id: string; name: string; organisation: string | null; kind: keyof typeof CONTACT_KINDS; role: string | null; email: string | null; phone: string | null; phone_alt: string | null; address: string | null; website: string | null; notes: string | null; archived_at: string | null }>("SELECT * FROM contacts WHERE id = $1", [id]);
  if (!c || c.archived_at) notFound();
  const links = await q<{ matter_id: string; number: string; title: string; confidential: boolean; is_member: boolean; note: string | null }>(
    `SELECT cm.matter_id, m.number, m.title, m.confidential, cm.note, EXISTS (SELECT 1 FROM matter_members mm WHERE mm.matter_id = m.id AND mm.user_id = $2) AS is_member
     FROM contact_matters cm JOIN matters m ON m.id = cm.matter_id WHERE cm.contact_id = $1 ORDER BY m.number`, [id, u.id]);
  const visible = links.filter((l) => canSeeMatter(u, { confidential: l.confidential, isMember: l.is_member }));
  const edit = can(u, "contacts.edit");
  const matters = edit && u.role !== "front_desk" ? await pickableMatters(u) : [];
  const wa = normalisePhone(c.phone);
  return (
    <>
      <PageHeader back={{ href: "/portal/contacts", label: "Contacts" }} title={<span className="flex items-center gap-3"><Avatar name={c.name} size="lg" />{c.name}</span>} sub={[c.role, c.organisation, CONTACT_KINDS[c.kind]].filter(Boolean).join(" · ")}
        actions={<>
          {c.phone && <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`} className={btn.ghost}><Phone className="h-4 w-4" />Call</a>}
          {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener" className={btn.ghost}><MessageCircle className="h-4 w-4" />WhatsApp</a>}
          {c.email && <a href={`mailto:${c.email}`} className={btn.ghost}><Mail className="h-4 w-4" />Email</a>}
          <a href={`/portal/api/contacts/${c.id}/vcard`} className={btn.ghost}><Download className="h-4 w-4" />Save to phone</a>
        </>} />
      <Flash msg={sp.msg} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card title="Details"><ContactForm c={c} disabled={!edit} /></Card>
        <div className="space-y-6">
          <Card title="Matters" pad={false}>
            {visible.length === 0 && links.length === 0 && <p className="p-5 text-sm text-stone-400">Not linked to any matter.</p>}
            {visible.map((l) => <Row key={l.matter_id} href={`/portal/matters/${l.matter_id}`}><Briefcase className="h-4 w-4 flex-none text-maroon" /><div className="min-w-0 flex-1"><div className="truncate font-medium">{l.title}</div><div className="text-xs text-stone-500">{l.number}{l.note ? ` · ${l.note}` : ""}</div></div></Row>)}
            {links.length > visible.length && <Row><Lock className="h-4 w-4 text-stone-400" /><span className="text-sm text-stone-500">{links.length - visible.length} restricted matter{links.length - visible.length === 1 ? "" : "s"}</span></Row>}
            {edit && matters.length > 0 && (
              <form action={linkContact} className="space-y-3 border-t border-stone-100 p-5">
                <input type="hidden" name="id" value={c.id} />
                <Select label="Link to a matter" name="matter_id" options={matters.map((m) => [m.id, `${m.number} · ${m.title}`])} />
                <Field label="Their part in it" name="note" placeholder="e.g. Counsel to the defendant" />
                <button className={btn.small}>Link</button>
              </form>
            )}
          </Card>
          {edit && <form action={archiveContact}><input type="hidden" name="id" value={c.id} /><button className="text-sm font-semibold text-stone-400 hover:text-red-700">Remove from directory</button></form>}
        </div>
      </div>
    </>
  );
}
