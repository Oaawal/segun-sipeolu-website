import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, Inbox, Plus, Search } from "lucide-react";
import { requireUser } from "@/lib/portal/auth";
import { can } from "@/lib/portal/permissions";
import { listService } from "@/lib/portal/data";
import { daysUntil, dueLabel, fmtDay } from "@/lib/portal/format";
import { SERVICE_KINDS, SERVICE_METHODS } from "@/lib/portal/vocab";
import { Badge, Card, Chips, DueBadge, Empty, Flash, PageHeader, Row, btn, inputCls } from "@/components/portal/ui";

export const metadata = { title: "Service register" };

export default async function Register({ searchParams }: { searchParams: Promise<{ direction?: string; status?: string; q?: string; msg?: string }> }) {
  const u = await requireUser();
  const sp = await searchParams;
  const term = (sp.q || "").trim().slice(0, 100);
  const rows = await listService(u, { direction: sp.direction, status: sp.status, q: term });
  const active = sp.status === "due" ? "due" : sp.status === "open" ? "open" : sp.direction === "in" ? "in" : sp.direction === "out" ? "out" : "all";
  return (
    <>
      <PageHeader
        title="Service register"
        sub="Every process and letter served on the firm, and everything the firm serves: when, how, by whom, with proof"
        actions={
          <>
            {can(u, "service.log_inward") && <Link href="/portal/register/new?direction=in" className={btn.primary}><ArrowDownLeft className="h-4 w-4" />Served on us</Link>}
            {can(u, "service.edit") && <Link href="/portal/register/new?direction=out" className={btn.ghost}><ArrowUpRight className="h-4 w-4" />We served</Link>}
          </>
        }
      />
      <Flash msg={sp.msg} />
      <form className="relative mb-4 max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
        <input name="q" type="search" defaultValue={term} placeholder="Search title, number, party or matter" className={`${inputCls} pl-9`} />
      </form>
      <Chips active={active} items={[
        { key: "all", label: "All", href: "/portal/register" },
        { key: "due", label: "Responses due", href: "/portal/register?status=due" },
        { key: "open", label: "Open", href: "/portal/register?status=open" },
        { key: "in", label: "Served on us", href: "/portal/register?direction=in" },
        { key: "out", label: "We served", href: "/portal/register?direction=out" },
      ]} />
      <Card pad={false}>
        {rows.length === 0 ? <Empty icon={<Inbox className="h-8 w-8" />} title="Nothing here" text="Log every document the moment it arrives, so its deadline is never missed." action={can(u, "service.log_inward") ? <Link href="/portal/register/new?direction=in" className={`${btn.small} mt-2`}><Plus className="h-3.5 w-3.5" />Log a document</Link> : undefined} /> : rows.map((s) => (
          <Row key={s.id} href={`/portal/register/${s.id}`}>
            <span className={`grid h-9 w-9 flex-none place-items-center rounded-xl ${s.direction === "in" ? "bg-maroon/10 text-maroon" : "bg-green/10 text-green"}`}>
              {s.direction === "in" ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold text-stone-800">{s.title}</div>
              <div className="truncate text-sm text-stone-500">
                {s.number} · {SERVICE_KINDS[s.kind as keyof typeof SERVICE_KINDS]} · {s.direction === "in" ? "from" : "on"} {s.party} · {fmtDay(s.served_on)} by {SERVICE_METHODS[s.method as keyof typeof SERVICE_METHODS]?.toLowerCase()}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              {s.status === "open" && s.response_due ? <DueBadge days={daysUntil(s.response_due)} label={dueLabel(s.response_due)} /> : <Badge tone={s.status === "open" ? "blue" : "green"}>{s.status === "open" ? "Open" : s.status === "actioned" ? "Actioned" : "Filed"}</Badge>}
              {s.matter_number && <span className="hidden text-xs text-stone-400 sm:block">{s.matter_number}</span>}
            </div>
          </Row>
        ))}
      </Card>
    </>
  );
}
