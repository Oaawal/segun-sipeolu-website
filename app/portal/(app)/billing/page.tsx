import Link from "next/link";
import { AlertTriangle, Banknote, Clock, Hourglass, Receipt, Settings, Wallet } from "lucide-react";
import { requirePermission } from "@/lib/portal/auth";
import { can } from "@/lib/portal/permissions";
import { pickableMatters } from "@/lib/portal/data";
import { agedDebt, billingSummary, listInvoices, myTime, runningTimer, timeByPerson } from "@/lib/portal/billing";
import { addDays, today } from "@/lib/portal/format";
import { hoursLabel, naira } from "@/lib/portal/money";
import { Card, Chips, Flash, Note, PageHeader, Stat, Tabs, btn } from "@/components/portal/ui";
import { ExpenseForm, InvoiceRows, TimeForm, TimeList, TimerCard } from "@/components/portal/Billing";
import { HBars } from "@/components/portal/Charts";

export const metadata = { title: "Time & billing" };

export default async function Billing({ searchParams }: { searchParams: Promise<{ tab?: string; status?: string; msg?: string }> }) {
  const u = await requirePermission("billing.record_time");
  const sp = await searchParams;
  const canDraft = can(u, "billing.draft");
  const canManage = can(u, "billing.manage");
  const tab = sp.tab === "invoices" && canDraft ? "invoices" : sp.tab === "firm" && canManage ? "firm" : "time";
  const back = `/portal/billing${tab === "time" ? "" : `?tab=${tab}`}`;
  const tabs = [
    { key: "time", label: "My time", href: "/portal/billing" },
    ...(canDraft ? [{ key: "invoices", label: "Invoices", href: "/portal/billing?tab=invoices" }] : []),
    ...(canManage ? [{ key: "firm", label: "Firm figures", href: "/portal/billing?tab=firm" }] : []),
  ];
  const header = (
    <PageHeader title="Time & billing" sub="For the partners: record time, draft and issue invoices, record payments with numbered receipts. Invoices and receipts are printed or downloaded in Word and given to clients by hand or by your own email."
      actions={<>
        <Link href="/portal/templates?cat=billing" className={btn.ghost}>Invoice & receipt templates</Link>
        {can(u, "billing.settings") && <Link href="/portal/billing/settings" className={btn.ghost}><Settings className="h-4 w-4" />Rates & invoice settings</Link>}
      </>} />
  );

  if (tab === "time") {
    const from = addDays(today(), -13);
    const [timer, matters, mine] = await Promise.all([runningTimer(u.id), pickableMatters(u), myTime(u, from, today())]);
    const week = mine.filter((r) => String(r.worked_on).slice(0, 10) >= addDays(today(), -6));
    const weekMin = week.reduce((s, r) => s + r.minutes, 0);
    const todayMin = mine.filter((r) => String(r.worked_on).slice(0, 10) === today()).reduce((s, r) => s + r.minutes, 0);
    return (
      <>
        {header}
        <Flash msg={sp.msg} />
        <Tabs tabs={tabs} active={tab} />
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Today" value={hoursLabel(todayMin)} icon={<Clock className="h-4 w-4" />} />
              <Stat label="Last 7 days" value={hoursLabel(weekMin)} note={`${hoursLabel(week.filter((r) => r.billable).reduce((s, r) => s + r.minutes, 0))} billable`} icon={<Hourglass className="h-4 w-4" />} tone="gold" />
            </div>
            <Card title="My time, last 14 days" pad={false}>
              <TimeList rows={mine} back={back} me={u.id} canManage={canManage} showMatter />
            </Card>
          </div>
          <div className="space-y-6">
            <Card title="Timer"><TimerCard timer={timer} matters={matters} back={back} /></Card>
            <Card title="Record time"><TimeForm matters={matters} back={back} /></Card>
            <Card title="Record a disbursement"><ExpenseForm matters={matters} back={back} /></Card>
          </div>
        </div>
      </>
    );
  }

  if (tab === "invoices") {
    const status = ["draft", "unpaid", "overdue", "paid", "void", "all"].includes(sp.status || "") ? sp.status! : "unpaid";
    const rows = await listInvoices(u, { status });
    return (
      <>
        {header}
        <Flash msg={sp.msg} />
        <Tabs tabs={tabs} active={tab} />
        <Chips active={status} items={[["unpaid", "Awaiting payment"], ["overdue", "Overdue"], ["draft", "Drafts"], ["paid", "Paid"], ["void", "Void"], ["all", "All"]].map(([k, l]) => ({ key: k, label: l, href: `/portal/billing?tab=invoices&status=${k}` }))} />
        <Card pad={false}><InvoiceRows rows={rows} /></Card>
        <p className="mt-4 text-sm text-stone-500">To bill a matter, open it and go to its <strong>Billing</strong> tab.</p>
      </>
    );
  }

  // Firm figures (partners)
  const monthStart = `${today().slice(0, 7)}-01`;
  const [s, aged, people] = await Promise.all([billingSummary(u, monthStart, today()), agedDebt(u), timeByPerson(monthStart, today())]);
  const yearStart = `${today().slice(0, 4)}-01-01`;
  const ytd = await billingSummary(u, yearStart, today());
  const collectRate = Number(ytd?.billed) ? Math.round((Number(ytd?.collected) / Number(ytd?.billed)) * 100) : null;
  const totals = aged.reduce((a, r) => ({ b0: a.b0 + Number(r.b0), b30: a.b30 + Number(r.b30), b60: a.b60 + Number(r.b60), b90: a.b90 + Number(r.b90) }), { b0: 0, b30: 0, b60: 0, b90: 0 });
  return (
    <>
      {header}
      <Flash msg={sp.msg} />
      <Tabs tabs={tabs} active={tab} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Billed this month" value={naira(s?.billed)} note={`${naira(ytd?.billed)} this year`} icon={<Receipt className="h-4 w-4" />} />
        <Stat label="Collected this month" value={naira(s?.collected)} note={collectRate !== null ? `${collectRate}% of this year's bills collected` : "Nothing billed this year yet"} icon={<Banknote className="h-4 w-4" />} tone="green" />
        <Stat label="Owed to the firm" value={naira(s?.outstanding)} note={`${naira(s?.overdue)} overdue`} href="/portal/billing?tab=invoices&status=overdue" icon={<AlertTriangle className="h-4 w-4" />} tone={Number(s?.overdue) ? "red" : "blue"} />
        <Stat label="Unbilled work" value={naira(Number(s?.wip_fees) + Number(s?.wip_expenses))} note={`${naira(s?.wip_fees)} time · ${naira(s?.wip_expenses)} disbursements`} icon={<Wallet className="h-4 w-4" />} tone="gold" />
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card title="Who owes, and for how long" pad={false}>
          {aged.length === 0 ? <p className="p-5 text-sm text-stone-500">Nothing owed. Every issued invoice is paid.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs uppercase tracking-wider text-stone-500"><th className="px-5 py-2">Client</th><th className="px-2 py-2 text-right">0–30 days</th><th className="px-2 py-2 text-right">31–60</th><th className="px-2 py-2 text-right">61–90</th><th className="px-5 py-2 text-right">Over 90</th></tr></thead>
                <tbody>
                  {aged.map((r) => (
                    <tr key={r.client_id} className="border-t border-stone-100">
                      <td className="px-5 py-2.5"><Link href={`/portal/clients/${r.client_id}`} className="font-medium hover:text-maroon">{r.client_name}</Link>{r.partner_name && <div className="text-xs text-stone-500">{r.partner_name}</div>}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{Number(r.b0) ? naira(r.b0) : "—"}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{Number(r.b30) ? naira(r.b30) : "—"}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-amber-700">{Number(r.b60) ? naira(r.b60) : "—"}</td>
                      <td className="px-5 py-2.5 text-right font-semibold tabular-nums text-red-700">{Number(r.b90) ? naira(r.b90) : "—"}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-stone-200 font-semibold"><td className="px-5 py-2.5">Total</td><td className="px-2 py-2.5 text-right tabular-nums">{naira(totals.b0)}</td><td className="px-2 py-2.5 text-right tabular-nums">{naira(totals.b30)}</td><td className="px-2 py-2.5 text-right tabular-nums">{naira(totals.b60)}</td><td className="px-5 py-2.5 text-right tabular-nums">{naira(totals.b90)}</td></tr>
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card title="Hours recorded this month">
          <HBars rows={people.filter((p) => p.minutes > 0).map((p) => ({ label: `${p.full_name} · ${hoursLabel(p.billable)} billable`, value: Math.round(p.minutes / 6) / 10 }))} />
          {people.some((p) => p.minutes === 0) && <p className="mt-4 text-xs text-stone-500">No time this month: {people.filter((p) => p.minutes === 0).map((p) => p.full_name).join(", ")}.</p>}
        </Card>
      </div>
      <div className="mt-6"><Note tone="info">Matters behind an ethical wall you are not on are not counted. Figures include VAT where charged.</Note></div>
    </>
  );
}
