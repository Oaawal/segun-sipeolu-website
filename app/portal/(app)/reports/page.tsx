import Link from "next/link";
import { AlertTriangle, Briefcase, Building2, Download, Gavel, Inbox, ListChecks } from "lucide-react";
import { requirePermission } from "@/lib/portal/auth";
import { reportData } from "@/lib/portal/reports";
import { audit } from "@/lib/portal/audit";
import { daysUntil, dueLabel, fmtDay } from "@/lib/portal/format";
import { HEARING_STATUS } from "@/lib/portal/vocab";
import { Card, DueBadge, PageHeader, Row, Stat, btn } from "@/components/portal/ui";
import { Columns, HBars } from "@/components/portal/Charts";

export const metadata = { title: "Reports" };

export default async function Reports() {
  const u = await requirePermission("reports.view");
  const d = await reportData(u);
  await audit({ userId: u.id, actor: u.email, action: "reports.viewed" });
  const k = d.kpi;
  const months = d.monthly.map((m) => ({ label: new Date(`${m.month}-15T12:00:00Z`).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }), value: Number(m.n) }));
  const total12 = months.reduce((s, m) => s + m.value, 0);
  const held = d.outcomes.reduce((s, o) => s + Number(o.n), 0);
  const adjourned = Number(d.outcomes.find((o) => o.status === "adjourned")?.n || 0);
  const diff = Number(k.new_this_month || 0) - Number(k.new_last_month || 0);
  return (
    <>
      <PageHeader title="Reports" sub="How the practice is doing: workload, court, deadlines and compliance. Matters behind an ethical wall you are not on are not counted."
        actions={<a href="/portal/api/reports/export" className={btn.ghost}><Download className="h-4 w-4" />Open matters (CSV)</a>} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Open matters" value={k.open_matters ?? 0} note={`${k.new_this_month ?? 0} new this month (${diff >= 0 ? "+" : ""}${diff} on last month)`} href="/portal/matters" icon={<Briefcase className="h-4 w-4" />} />
        <Stat label="Court, next 30 days" value={k.sittings_30 ?? 0} note={k.results_missing ? `${k.results_missing} past sittings with no result recorded` : "All past results recorded"} href="/portal/diary" icon={<Gavel className="h-4 w-4" />} tone={k.results_missing ? "amber" : "gold"} />
        <Stat label="Overdue" value={Number(k.overdue_tasks ?? 0) + Number(k.overdue_responses ?? 0)} note={`${k.overdue_tasks ?? 0} tasks · ${k.overdue_responses ?? 0} responses to served documents`} href="/portal/tasks?view=overdue" icon={<AlertTriangle className="h-4 w-4" />} tone={Number(k.overdue_tasks) + Number(k.overdue_responses) ? "red" : "green"} />
        <Stat label="Company filings" value={k.filings_30 ?? 0} note={k.overdue_filings ? `Due in 30 days · ${k.overdue_filings} overdue` : "Due in the next 30 days"} href="/portal/cosec" icon={<Building2 className="h-4 w-4" />} tone={k.overdue_filings ? "red" : "blue"} />
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card title={`New matters per month · ${total12} in 12 months`}><Columns rows={months} /></Card>
        <Card title="Open matters by lead lawyer"><HBars rows={d.byLawyer.filter((r) => Number(r.n) > 0).map((r) => ({ label: r.full_name, value: Number(r.n) }))} /></Card>
        <Card title="Open matters by practice area"><HBars rows={d.byArea.map((r) => ({ label: r.practice_area, value: Number(r.n) }))} /></Card>
        <Card title={`Court sittings, last 90 days · ${held} recorded`}>
          <HBars rows={["held", "adjourned", "vacated", "concluded"].map((s) => ({ label: HEARING_STATUS[s as keyof typeof HEARING_STATUS], value: Number(d.outcomes.find((o) => o.status === s)?.n || 0) }))} />
          {held > 0 && <p className="mt-4 text-sm text-stone-600"><strong className="text-stone-900">{Math.round((adjourned / held) * 100)}%</strong> of sittings were adjourned.</p>}
        </Card>
        <Card title="Overdue, by person" pad={false}>
          {d.overdueByPerson.length === 0 ? <p className="p-5 text-sm text-stone-400">Nothing overdue. Well done.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wider text-stone-500"><th className="px-5 py-2.5">Person</th><th className="px-3 py-2.5 text-right"><ListChecks className="ml-auto h-4 w-4" aria-label="Tasks" /></th><th className="px-5 py-2.5 text-right"><Inbox className="ml-auto h-4 w-4" aria-label="Responses" /></th></tr></thead>
              <tbody>{d.overdueByPerson.map((r) => <tr key={r.full_name} className="border-t border-stone-100"><td className="px-5 py-2.5">{r.full_name}</td><td className="px-3 py-2.5 text-right tabular-nums">{r.tasks}</td><td className="px-5 py-2.5 text-right tabular-nums">{r.responses}</td></tr>)}</tbody>
            </table>
          )}
        </Card>
        <Card title="Company filings due in 30 days" pad={false}>
          {d.filings.length === 0 ? <p className="p-5 text-sm text-stone-400">None due.</p> : d.filings.map((f) => <Row key={f.id} href={`/portal/cosec/${f.entity_id}?tab=filings`}><div className="min-w-0 flex-1"><div className="truncate font-medium">{f.title}</div><div className="truncate text-xs text-stone-500">{f.name}{f.responsible ? ` · ${f.responsible}` : ""} · {fmtDay(f.due_on)}</div></div><DueBadge days={daysUntil(f.due_on)} label={dueLabel(f.due_on)} /></Row>)}
        </Card>
      </div>
      <p className="mt-6 text-xs text-stone-400">Figures update live. <Link href="/portal/admin/audit" className="hover:text-maroon">Viewing reports is recorded in the audit trail.</Link></p>
    </>
  );
}
