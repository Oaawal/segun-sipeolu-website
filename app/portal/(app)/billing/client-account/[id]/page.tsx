import Link from "next/link";
import { notFound } from "next/navigation";
import { Landmark, Undo2 } from "lucide-react";
import { requirePermission } from "@/lib/portal/auth";
import { one, q } from "@/lib/portal/db";
import { matterAccessSql } from "@/lib/portal/permissions";
import { clientLedger } from "@/lib/portal/billing";
import { fmtDay, isUuid, today } from "@/lib/portal/format";
import { naira } from "@/lib/portal/money";
import { audit } from "@/lib/portal/audit";
import { Badge, Card, Empty, Field, Flash, Note, PageHeader, Row, Select, Stat, btn } from "@/components/portal/ui";
import { addLedgerEntry, reverseLedgerEntry } from "../../actions";

export const metadata = { title: "Client account" };

const KIND: Record<string, string> = { receipt: "Received", payment: "Paid out", to_office: "To office (fees)", reversal: "Reversal" };

export default async function ClientAccount({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string }> }) {
  const u = await requirePermission("billing.manage");
  const { id } = await params;
  const sp = await searchParams;
  if (!isUuid(id)) notFound();
  const client = await one<{ id: string; name: string }>("SELECT id, name FROM clients WHERE id = $1", [id]);
  if (!client) notFound();
  const [rows, matters] = await Promise.all([
    clientLedger(id),
    q<{ id: string; number: string; title: string }>(`SELECT m.id, m.number, m.title FROM matters m WHERE m.client_id = $2 AND ${matterAccessSql(u)} ORDER BY m.opened_on DESC`, [u.id, id]),
  ]);
  await audit({ userId: u.id, actor: u.email, action: "client_account.viewed", entityType: "client", entityId: id });
  const withBal = rows.reduce<(typeof rows[number] & { bal: number })[]>((acc, r) => [...acc, { ...r, bal: (acc.at(-1)?.bal ?? 0) + Number(r.amount_kobo) }], []);
  const running = withBal.at(-1)?.bal ?? 0;
  const reversed = new Set(rows.filter((r) => r.kind === "reversal").map((r) => r.reference));
  const byMatter = new Map<string, number>();
  for (const r of rows) byMatter.set(r.matter_number || "—", (byMatter.get(r.matter_number || "—") || 0) + Number(r.amount_kobo));
  return (
    <>
      <PageHeader back={{ href: `/portal/clients/${id}`, label: client.name }} title="Client account" sub="Money held for this client (deposits, settlement sums, filing fees in advance). It is not the firm's money until billed and transferred." />
      <Flash msg={sp.msg} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Held in total" value={naira(running)} icon={<Landmark className="h-4 w-4" />} tone={running > 0 ? "green" : "grey"} />
        {[...byMatter.entries()].filter(([, v]) => v !== 0).slice(0, 3).map(([k, v]) => <Stat key={k} label={k} value={naira(v)} />)}
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card title="Ledger" pad={false}>
          {withBal.length === 0 ? <Empty icon={<Landmark className="h-8 w-8" />} title="Nothing held for this client" /> : [...withBal].reverse().map((r) => (
            <Row key={r.id}>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{r.description}</div>
                <div className="text-xs text-stone-500">{fmtDay(r.entry_on)} · {KIND[r.kind]}{r.matter_number ? ` · ${r.matter_number}` : ""}{r.reference && r.kind !== "reversal" ? ` · ${r.reference}` : ""}{r.full_name ? ` · ${r.full_name}` : ""}</div>
              </div>
              <div className="text-right">
                <div className={`text-sm font-semibold tabular-nums ${Number(r.amount_kobo) < 0 ? "text-red-700" : "text-green"}`}>{Number(r.amount_kobo) < 0 ? "−" : "+"}{naira(Math.abs(Number(r.amount_kobo)))}</div>
                <div className="text-xs tabular-nums text-stone-400">bal {naira(r.bal)}</div>
              </div>
              {(r.kind === "receipt" || r.kind === "payment") && (reversed.has(r.id) ? <Badge>Reversed</Badge> : (
                <form action={reverseLedgerEntry}><input type="hidden" name="id" value={r.id} /><button aria-label="Reverse entry" className="p-1 text-stone-300 hover:text-red-700"><Undo2 className="h-4 w-4" /></button></form>
              ))}
            </Row>
          ))}
        </Card>
        <div className="space-y-6">
          <Card title="Record money in or out">
            {matters.length === 0 ? <p className="text-sm text-stone-500">This client has no matter you can open.</p> : (
              <form action={addLedgerEntry} className="space-y-3">
                <input type="hidden" name="client_id" value={id} />
                <Select label="Matter" name="matter_id" options={matters.map((m) => [m.id, `${m.number} · ${m.title}`])} />
                <Select label="Entry" name="kind" options={{ receipt: "Money received from or for the client", payment: "Money paid out for the client" }} />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Amount (₦)" name="amount" required inputMode="decimal" />
                  <Field label="Date" name="entry_on" type="date" defaultValue={today()} />
                </div>
                <Field label="Description" name="description" required placeholder="e.g. Deposit towards purchase price" />
                <Field label="Reference" name="reference" placeholder="Bank reference" />
                <button className={btn.primary}>Record</button>
              </form>
            )}
          </Card>
          <Note tone="lock">Entries can never be edited or deleted; a mistake is put right with a reversing entry. Paying out more than is held for a matter is refused. To pay a bill from this money, record the payment on the invoice and tick &ldquo;Take from money held&rdquo;. <Link href="/portal/billing?tab=invoices" className="font-semibold underline">Invoices</Link></Note>
        </div>
      </div>
    </>
  );
}
