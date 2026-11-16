import Link from "next/link";
import { Inbox, Plus } from "lucide-react";
import { requirePermission } from "@/lib/portal/auth";
import { q } from "@/lib/portal/db";
import { staffList } from "@/lib/portal/data";
import { ago } from "@/lib/portal/format";
import { PRACTICE_AREAS } from "@/lib/portal/vocab";
import { ENQUIRY_SOURCES, ENQUIRY_STATUS } from "@/lib/portal/enquiries";
import { Badge, Card, Chips, Empty, Field, Flash, PageHeader, Row, Select, TextArea, btn } from "@/components/portal/ui";
import { logEnquiry } from "./actions";

export const metadata = { title: "Enquiries" };

export default async function Enquiries({ searchParams }: { searchParams: Promise<{ status?: string; msg?: string }> }) {
  await requirePermission("intake.view");
  const sp = await searchParams;
  const status = ["open", "engaged", "closed", "all"].includes(sp.status || "") ? sp.status! : "open";
  const where = { open: "status IN ('new','conflict_cleared','conflict_found','quoted')", engaged: "status = 'engaged'", closed: "status IN ('declined','no_response')", all: "TRUE" }[status];
  const [rows, counts, staff] = await Promise.all([
    q<{ id: string; number: string; name: string; organisation: string | null; practice_area: string | null; source: string; status: string; created_at: string; assignee: string | null }>(
      `SELECT e.id, e.number, e.name, e.organisation, e.practice_area, e.source, e.status, e.created_at, u.full_name AS assignee FROM enquiries e LEFT JOIN users u ON u.id = e.assigned_to WHERE ${where} ORDER BY e.created_at DESC LIMIT 300`),
    q<{ open: number; month: number; engaged: number }>(`SELECT COUNT(*) FILTER (WHERE status IN ('new','conflict_cleared','conflict_found','quoted'))::int AS open,
       COUNT(*) FILTER (WHERE created_at >= date_trunc('month', now()))::int AS month, COUNT(*) FILTER (WHERE status = 'engaged' AND created_at >= date_trunc('month', now()))::int AS engaged FROM enquiries`),
    staffList(),
  ]);
  const c = counts[0];
  return (
    <>
      <PageHeader title="Enquiries" sub={`From first contact to engagement. ${c.month} this month, ${c.engaged} taken on.`} />
      <Flash msg={sp.msg} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div>
          <Chips active={status} items={[{ key: "open", label: "Open", href: "/portal/enquiries", n: c.open }, { key: "engaged", label: "Taken on", href: "/portal/enquiries?status=engaged" }, { key: "closed", label: "Closed", href: "/portal/enquiries?status=closed" }, { key: "all", label: "All", href: "/portal/enquiries?status=all" }]} />
          <Card pad={false}>
            {rows.length === 0 ? <Empty icon={<Inbox className="h-8 w-8" />} title="No enquiries here" text="Messages from the website's contact form arrive here automatically." /> : rows.map((r) => (
              <Row key={r.id} href={`/portal/enquiries/${r.id}`}>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{r.name}{r.organisation ? <span className="font-normal text-stone-500"> · {r.organisation}</span> : null}</div>
                  <div className="text-xs text-stone-500">{r.number} · {r.practice_area || "Area not given"} · {ENQUIRY_SOURCES[r.source as keyof typeof ENQUIRY_SOURCES] || r.source} · {ago(r.created_at)}{r.assignee ? ` · ${r.assignee}` : ""}</div>
                </div>
                <Badge tone={ENQUIRY_STATUS[r.status]?.[1]}>{ENQUIRY_STATUS[r.status]?.[0]}</Badge>
              </Row>
            ))}
          </Card>
        </div>
        <Card title="Log an enquiry">
          <form action={logEnquiry} className="space-y-3">
            <Field label="Name" name="name" required />
            <Field label="Company / organisation" name="organisation" />
            <div className="grid grid-cols-2 gap-3"><Field label="Phone" name="phone" type="tel" /><Field label="Email" name="email" type="email" /></div>
            <div className="grid grid-cols-2 gap-3">
              <Select label="How they reached us" name="source" options={ENQUIRY_SOURCES} defaultValue="walk_in" />
              <Select label="Area" name="practice_area" options={PRACTICE_AREAS.map((p) => [p, p])} blank="Not sure" />
            </div>
            <TextArea label="What they need" name="summary" required rows={4} />
            <TextArea label="Other side / people involved" name="other_parties" rows={2} hint="One name per line. Used for the conflict check." />
            <Select label="Pass to" name="assigned_to" options={staff.filter((s) => s.role !== "front_desk").map((s) => [s.id, s.full_name])} blank="Not yet" />
            <button className={btn.primary}><Plus className="h-4 w-4" />Log enquiry</button>
            <p className="text-xs text-stone-500">Partners and front desk are told by email. <Link href="/contact" className="font-semibold text-maroon">The website form</Link> logs enquiries by itself.</p>
          </form>
        </Card>
      </div>
    </>
  );
}
