import Link from "next/link";
import { BookUser, Mail, Phone, Search } from "lucide-react";
import { requirePermission } from "@/lib/portal/auth";
import { can } from "@/lib/portal/permissions";
import { q } from "@/lib/portal/db";
import { pickableMatters } from "@/lib/portal/data";
import { CONTACT_KINDS } from "@/lib/portal/vocab";
import { Avatar, Badge, Card, Chips, Empty, Flash, PageHeader, Row, inputCls } from "@/components/portal/ui";
import { ContactForm } from "./ContactForm";

export const metadata = { title: "Contacts" };

export default async function Contacts({ searchParams }: { searchParams: Promise<{ q?: string; kind?: string; msg?: string }> }) {
  const u = await requirePermission("contacts.view");
  const sp = await searchParams;
  const term = (sp.q || "").trim().slice(0, 100);
  const kind = Object.prototype.hasOwnProperty.call(CONTACT_KINDS, sp.kind || "") ? sp.kind! : "";
  const params: unknown[] = [];
  const where = ["archived_at IS NULL"];
  if (term) { params.push(`%${term.replace(/[%_\\]/g, (c) => "\\" + c)}%`); where.push(`(name ILIKE $1 OR organisation ILIKE $1 OR email ILIKE $1 OR phone ILIKE $1 OR role ILIKE $1)`); }
  if (kind) { params.push(kind); where.push(`kind = $${params.length}`); }
  const rows = await q<{ id: string; name: string; organisation: string | null; kind: keyof typeof CONTACT_KINDS; role: string | null; phone: string | null; email: string | null }>(
    `SELECT id, name, organisation, kind, role, phone, email FROM contacts WHERE ${where.join(" AND ")} ORDER BY lower(name) LIMIT 500`, params);
  const matters = can(u, "contacts.edit") && u.role !== "front_desk" ? await pickableMatters(u) : [];
  return (
    <>
      <PageHeader title="Contacts" sub="Courts, registries, counsel, bailiffs, agencies and experts the firm deals with" />
      <Flash msg={sp.msg} />
      <form className="relative mb-4 max-w-xl">
        {kind && <input type="hidden" name="kind" value={kind} />}
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
        <input name="q" type="search" defaultValue={term} placeholder="Search name, organisation, phone or email" className={`${inputCls} pl-9`} />
      </form>
      <Chips active={kind || "all"} items={[{ key: "all", label: "All", href: "/portal/contacts" }, ...Object.entries(CONTACT_KINDS).map(([k, v]) => ({ key: k, label: v.split(" /")[0], href: `/portal/contacts?kind=${k}` }))]} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card pad={false}>
          {rows.length === 0 ? <Empty icon={<BookUser className="h-8 w-8" />} title={term ? "No contacts match" : "No contacts yet"} /> : rows.map((c) => (
            <Row key={c.id} href={`/portal/contacts/${c.id}`}>
              <Avatar name={c.name} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold text-stone-800">{c.name}</div>
                <div className="truncate text-sm text-stone-500">{[c.role, c.organisation].filter(Boolean).join(", ") || CONTACT_KINDS[c.kind]}</div>
              </div>
              <div className="hidden flex-col items-end gap-1 text-xs text-stone-500 sm:flex">
                {c.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{c.phone}</span>}
                {c.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{c.email}</span>}
              </div>
              <span className="hidden md:block"><Badge>{CONTACT_KINDS[c.kind].split(" /")[0]}</Badge></span>
            </Row>
          ))}
        </Card>
        {can(u, "contacts.edit") && <Card title="Add a contact"><ContactForm matters={matters} /></Card>}
      </div>
      <p className="mt-4 text-xs text-stone-400"><Link href="/portal/api/contacts/all/vcard" className="hover:text-maroon">Download all contacts for your phone (.vcf)</Link></p>
    </>
  );
}
