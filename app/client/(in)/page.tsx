import Link from "next/link";
import { Briefcase, Gavel, MessageSquare, Receipt } from "lucide-react";
import { requireClient, clientMatterSql } from "@/lib/portal/client-auth";
import { q } from "@/lib/portal/db";
import { fmtDay, today } from "@/lib/portal/format";
import { INVOICE_STATUS, naira } from "@/lib/portal/money";
import { Badge, Card, Empty, Row } from "@/components/portal/ui";
import { MATTER_STATUS } from "@/lib/portal/vocab";

export const metadata = { title: "Your matters" };

export default async function ClientHome() {
  const c = await requireClient();
  const [matters, invoices] = await Promise.all([
    q<{ id: string; number: string; title: string; status: string; next_sitting: string | null; unread: number; last_at: string | null }>(
      `SELECT m.id, m.number, m.title, m.status,
         (SELECT MIN(h.sitting_on) FROM hearings h WHERE h.matter_id = m.id AND h.status = 'scheduled' AND h.sitting_on >= CURRENT_DATE) AS next_sitting,
         (SELECT COUNT(*) FROM client_messages x WHERE x.matter_id = m.id AND NOT x.from_client AND x.read_at IS NULL) AS unread,
         (SELECT MAX(created_at) FROM client_messages x WHERE x.matter_id = m.id) AS last_at
       FROM matters m WHERE ${clientMatterSql()} ORDER BY m.status = 'closed', m.updated_at DESC`, [c.client_id]),
    q<{ id: string; number: string; status: string; total_kobo: number; paid_kobo: number; due_on: string; issued_on: string; pay_token: string; matter_number: string }>(
      `SELECT i.id, i.number, i.status, i.total_kobo, i.paid_kobo, i.due_on, i.issued_on, i.pay_token, m.number AS matter_number
       FROM invoices i JOIN matters m ON m.id = i.matter_id WHERE i.client_id = $1 AND i.status IN ('issued','part_paid','paid') ORDER BY i.issued_on DESC LIMIT 50`, [c.client_id]),
  ]);
  const owed = invoices.filter((i) => i.status !== "paid").reduce((s, i) => s + Number(i.total_kobo) - Number(i.paid_kobo), 0);
  return (
    <>
      <h1 className="font-serif text-3xl font-semibold text-maroon-dark">Welcome, {c.full_name.split(" ")[0]}</h1>
      <p className="mt-1 text-sm text-stone-500">Your matters with the firm, the documents we have shared, and your invoices.</p>
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card title="Your matters" pad={false}>
          {matters.length === 0 ? <Empty icon={<Briefcase className="h-8 w-8" />} title="Nothing shared yet" text="Your lawyer will share matters here as work progresses." /> : matters.map((m) => (
            <Row key={m.id} href={`/client/matters/${m.id}`}>
              <Briefcase className="h-5 w-5 flex-none text-maroon" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{m.title}</div>
                <div className="flex flex-wrap items-center gap-x-2 text-xs text-stone-500">{m.number}{m.next_sitting && <span className="inline-flex items-center gap-1"><Gavel className="h-3 w-3" />Next in court {fmtDay(m.next_sitting)}</span>}</div>
              </div>
              {Number(m.unread) > 0 && <Badge tone="gold"><MessageSquare className="h-3 w-3" />{m.unread} new</Badge>}
              <Badge tone={m.status === "closed" ? "grey" : "green"}>{MATTER_STATUS[m.status as keyof typeof MATTER_STATUS]}</Badge>
            </Row>
          ))}
        </Card>
        <Card title={owed ? `Invoices · ${naira(owed)} due` : "Invoices"} pad={false}>
          {invoices.length === 0 ? <Empty icon={<Receipt className="h-8 w-8" />} title="No invoices" /> : invoices.map((i) => {
            const overdue = i.status !== "paid" && i.due_on < today();
            return (
              <Row key={i.id} href={`/pay/${i.pay_token}`}>
                <Receipt className="h-4 w-4 flex-none text-maroon" />
                <div className="min-w-0 flex-1"><div className="font-medium">{i.number}</div><div className="text-xs text-stone-500">{i.matter_number} · {fmtDay(i.issued_on)}</div></div>
                <div className="text-right text-sm font-semibold tabular-nums">{naira(i.status === "paid" ? i.total_kobo : Number(i.total_kobo) - Number(i.paid_kobo))}</div>
                <Badge tone={overdue ? "red" : INVOICE_STATUS[i.status][1]}>{overdue ? "Overdue" : INVOICE_STATUS[i.status][0]}</Badge>
              </Row>
            );
          })}
        </Card>
      </div>
      <p className="mt-8 text-sm text-stone-500">Need us urgently? Call the office. For anything else, open a matter and send your lawyer a message. <Link href="/" className="font-semibold text-maroon">Firm website</Link></p>
    </>
  );
}
