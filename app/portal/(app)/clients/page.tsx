import Link from "next/link";
import { Plus, Search, Users } from "lucide-react";
import { requirePermission } from "@/lib/portal/auth";
import { can } from "@/lib/portal/permissions";
import { q } from "@/lib/portal/db";
import { CLIENT_KINDS } from "@/lib/portal/vocab";
import { ago } from "@/lib/portal/format";
import { Avatar, Badge, Card, Empty, Flash, PageHeader, Row, btn, inputCls } from "@/components/portal/ui";

export const metadata = { title: "Clients" };

export default async function Clients({ searchParams }: { searchParams: Promise<{ q?: string; msg?: string }> }) {
  const u = await requirePermission("clients.view");
  const sp = await searchParams;
  const term = (sp.q || "").trim().slice(0, 100);
  const rows = await q<{ id: string; name: string; kind: keyof typeof CLIENT_KINDS; email: string | null; phone: string | null; matters: number; open_matters: number; updated_at: string; kyc_verified: boolean }>(
    `SELECT c.id, c.name, c.kind, c.email, c.phone, c.updated_at, c.kyc_verified,
            (SELECT COUNT(*) FROM matters m WHERE m.client_id = c.id) AS matters,
            (SELECT COUNT(*) FROM matters m WHERE m.client_id = c.id AND m.status != 'closed') AS open_matters
     FROM clients c ${term ? "WHERE c.name ILIKE $1 OR c.email ILIKE $1 OR c.phone ILIKE $1 OR c.rc_number ILIKE $1" : ""}
     ORDER BY c.updated_at DESC LIMIT 300`,
    term ? [`%${term.replace(/[%_\\]/g, (x) => "\\" + x)}%`] : [],
  );
  return (
    <>
      <PageHeader title="Clients" sub="Everyone the firm acts for" actions={can(u, "clients.create") && <Link href="/portal/clients/new" className={btn.primary}><Plus className="h-4 w-4" />New client</Link>} />
      <Flash msg={sp.msg} />
      <form className="relative mb-4 max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
        <input name="q" type="search" defaultValue={term} placeholder="Search by name, email, phone or RC number" className={`${inputCls} pl-9`} />
      </form>
      <Card pad={false}>
        {rows.length === 0 ? <Empty icon={<Users className="h-8 w-8" />} title={term ? "No clients match" : "No clients yet"} /> : rows.map((c) => (
          <Row key={c.id} href={`/portal/clients/${c.id}`}>
            <Avatar name={c.name} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold text-stone-800">{c.name}</div>
              <div className="truncate text-sm text-stone-500">{[CLIENT_KINDS[c.kind], c.email, c.phone].filter(Boolean).join(" · ")}</div>
            </div>
            <div className="hidden flex-col items-end gap-1 sm:flex">
              {c.open_matters > 0 ? <Badge tone="maroon">{c.open_matters} open</Badge> : <Badge>{c.matters} matter{c.matters === 1 ? "" : "s"}</Badge>}
              <span className="text-xs text-stone-400">{ago(c.updated_at)}</span>
            </div>
          </Row>
        ))}
      </Card>
    </>
  );
}
