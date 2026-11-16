import { AlertTriangle, CalendarClock, CheckCircle2, Scale } from "lucide-react";
import { requireUser } from "@/lib/portal/auth";
import { can } from "@/lib/portal/permissions";
import { one, q } from "@/lib/portal/db";
import { pickableMatters, loadService } from "@/lib/portal/data";
import { computeDeadline } from "@/lib/portal/deadlines";
import { fmtDateTime, fmtDay, isUuid, isYmd, today } from "@/lib/portal/format";
import { Card, Check, Empty, Field, Flash, Note, PageHeader, Row, Select, Tabs, TextArea, btn } from "@/components/portal/ui";
import { addHoliday, addYearHolidays, removeHoliday, retireRule, saveRule, applyDeadline, verifyRule } from "./actions";

export const metadata = { title: "Deadlines" };

interface Rule { id: string; court: string; trigger_event: string; action: string; days: number; count_mode: "calendar" | "working"; authority: string | null; note: string | null; verified_by_name: string | null; verified_at: string | null }

export default async function Deadlines({ searchParams }: { searchParams: Promise<{ tab?: string; msg?: string; rule?: string; from?: string; service?: string }> }) {
  const u = await requireUser();
  const sp = await searchParams;
  const tab = sp.tab === "rules" ? "rules" : sp.tab === "holidays" ? "holidays" : "calc";
  const rules = await q<Rule>(`SELECT r.*, v.full_name AS verified_by_name FROM deadline_rules r LEFT JOIN users v ON v.id = r.verified_by WHERE r.active ORDER BY r.court, r.trigger_event, r.days`);
  const verified = rules.filter((r) => r.verified_at);
  const tabs = [{ key: "calc", label: "Work out a date", href: "/portal/deadlines" }, { key: "rules", label: `Rules of court (${rules.length})`, href: "/portal/deadlines?tab=rules" }, { key: "holidays", label: "Public holidays", href: "/portal/deadlines?tab=holidays" }];
  const header = <PageHeader title="Deadlines" sub="Work out a date from a rule of court the firm has confirmed, skipping weekends and public holidays, and put it straight into tasks." />;

  if (tab === "calc") {
    const service = isUuid(sp.service) && can(u, "service.edit") ? await loadService(u, sp.service) : null;
    const rule = verified.find((r) => r.id === sp.rule);
    const from = isYmd(sp.from) ? sp.from : service ? String(service.served_on).slice(0, 10) : today();
    const result = rule ? await computeDeadline(from, rule.days, rule.count_mode) : null;
    const matters = result && !service ? await pickableMatters(u) : [];
    return (
      <>
        {header}<Flash msg={sp.msg} /><Tabs tabs={tabs} active={tab} />
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Card title="Calculate">
            {service && <div className="mb-4"><Note tone="info">For <strong>{service.number}</strong>: {service.title}, served {fmtDay(service.served_on)}.</Note></div>}
            {verified.length === 0 ? <Empty icon={<Scale className="h-8 w-8" />} title="No confirmed rules yet" text="Add the periods your courts use on the Rules of court tab. A partner confirms each one before it can be used." /> : (
              <form className="space-y-3">
                {service && <input type="hidden" name="service" value={service.id} />}
                <Select label="Rule" name="rule" required defaultValue={rule?.id || ""} blank="Choose a rule" options={verified.map((r) => [r.id, `${r.court}: ${r.action} (${r.days} ${r.count_mode === "working" ? "working days" : "days"} after ${r.trigger_event.toLowerCase()})`])} />
                <Field label="Date of the event (e.g. date of service)" name="from" type="date" required defaultValue={from} />
                <button className={btn.primary}><CalendarClock className="h-4 w-4" />Work it out</button>
              </form>
            )}
          </Card>
          {result && rule && (
            <Card title="Result">
              <div className="rounded-2xl bg-gradient-to-r from-maroon-dark to-maroon p-5 text-white">
                <div className="text-xs font-semibold uppercase tracking-wider text-gold">{rule.action}</div>
                <div className="mt-1 font-serif text-3xl">{fmtDay(result.due, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
                <div className="mt-1 text-sm text-white/75">{rule.days} {rule.count_mode === "working" ? "working " : ""}days after {fmtDay(from)}{rule.authority ? ` · ${rule.authority}` : ""}</div>
              </div>
              {result.skipped.length > 0 && <p className="mt-3 text-sm text-stone-600">Moved past: {result.skipped.join(", ")}.</p>}
              <p className="mt-2 text-xs text-stone-500">Rule confirmed by {rule.verified_by_name} on {fmtDay(rule.verified_at)}. {rule.note}</p>
              <form action={applyDeadline} className="mt-4 space-y-3 border-t border-stone-100 pt-4">
                <input type="hidden" name="rule_id" value={rule.id} /><input type="hidden" name="from" value={from} />
                {service ? <input type="hidden" name="service_id" value={service.id} /> : <Select label="Add to matter" name="matter_id" required options={matters.map((m) => [m.id, `${m.number} · ${m.title}`])} blank="Choose a matter" />}
                <button className={btn.primary}>{service ? `Set as the response date for ${service.number}` : "Add as a deadline task"}</button>
              </form>
              <div className="mt-4"><Note tone="warn">Check the date against the current rules and any order of court before relying on it. Extensions, vacations and special orders are not taken into account.</Note></div>
            </Card>
          )}
        </div>
      </>
    );
  }

  if (tab === "rules") {
    return (
      <>
        {header}<Flash msg={sp.msg} /><Tabs tabs={tabs} active={tab} />
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <Card title="Rules" pad={false}>
            {rules.length === 0 ? <Empty icon={<Scale className="h-8 w-8" />} title="No rules yet" text="Add each period you rely on, with the rule it comes from." /> : rules.map((r) => (
              <Row key={r.id}>
                {r.verified_at ? <CheckCircle2 className="h-4 w-4 flex-none text-green" /> : <AlertTriangle className="h-4 w-4 flex-none text-amber-600" />}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{r.court}: {r.action}</div>
                  <div className="text-xs text-stone-500">{r.days} {r.count_mode === "working" ? "working days" : "days"} after {r.trigger_event.toLowerCase()}{r.authority ? ` · ${r.authority}` : ""}{r.verified_at ? ` · confirmed by ${r.verified_by_name}, ${fmtDateTime(r.verified_at)}` : " · not yet confirmed: cannot be used"}</div>
                </div>
                {can(u, "deadlines.verify") && !r.verified_at && <form action={verifyRule}><input type="hidden" name="id" value={r.id} /><button className={btn.small}>Confirm</button></form>}
                {can(u, "deadlines.verify") && <form action={retireRule}><input type="hidden" name="id" value={r.id} /><button className={btn.small}>Retire</button></form>}
              </Row>
            ))}
          </Card>
          {can(u, "deadlines.edit") && (
            <Card title="Add a rule">
              <form action={saveRule} className="space-y-3">
                <Field label="Court / forum" name="court" required list="dl-courts" placeholder="e.g. High Court of Lagos State" />
                <datalist id="dl-courts">{[...new Set(rules.map((r) => r.court))].map((c) => <option key={c} value={c} />)}</datalist>
                <Field label="Event that starts the clock" name="trigger_event" required placeholder="e.g. Service of the originating process" />
                <Field label="What must be done" name="action" required placeholder="e.g. File statement of defence" />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Days" name="days" type="number" min={1} max={365} required />
                  <Select label="Counting" name="count_mode" options={{ calendar: "Calendar days", working: "Working days" }} />
                </div>
                <Field label="Authority" name="authority" placeholder="e.g. Order and rule number, and edition of the rules" />
                <TextArea label="Note" name="note" rows={2} placeholder="Exceptions, how extensions work, etc." />
                {can(u, "deadlines.verify") && <Check name="verified" label="I have checked this period against the current rules (confirm now)" />}
                <button className={btn.primary}>Add rule</button>
              </form>
              <div className="mt-4"><Note tone="lock">A rule is only offered in the calculator after a partner confirms it. Nothing is pre-loaded: periods differ between courts and editions of the rules.</Note></div>
            </Card>
          )}
        </div>
      </>
    );
  }

  const year = Number(today().slice(0, 4));
  const holidays = await q<{ day: string; name: string }>("SELECT day::text AS day, name FROM holidays WHERE day >= $1 ORDER BY day LIMIT 100", [`${year}-01-01`]);
  const last = await one<{ day: string }>("SELECT MAX(day)::text AS day FROM holidays");
  return (
    <>
      {header}<Flash msg={sp.msg} /><Tabs tabs={tabs} active={tab} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card title="Public holidays" pad={false}>
          {holidays.length === 0 ? <Empty title="None entered" text="Add this year's fixed holidays, then the Eid and Mawlid dates when the Federal Government declares them." /> : holidays.map((h) => (
            <Row key={h.day}>
              <div className="w-28 flex-none text-sm font-semibold tabular-nums">{fmtDay(h.day)}</div>
              <div className="min-w-0 flex-1 text-sm">{h.name}</div>
              {can(u, "deadlines.verify") && <form action={removeHoliday}><input type="hidden" name="day" value={h.day.slice(0, 10)} /><button className="text-xs font-semibold text-stone-400 hover:text-red-700">Remove</button></form>}
            </Row>
          ))}
        </Card>
        {can(u, "deadlines.verify") && (
          <div className="space-y-6">
            <Card title="Add the fixed holidays for a year">
              <form action={addYearHolidays} className="flex items-end gap-2">
                <Field label="Year" name="year" type="number" defaultValue={String(last?.day && Number(last.day.slice(0, 4)) >= year ? Number(last.day.slice(0, 4)) + 1 : year)} className="flex-1" />
                <button className={btn.ghost}>Add</button>
              </form>
              <p className="mt-2 text-xs text-stone-500">New Year, Good Friday, Easter Monday, Workers&apos; Day, Democracy Day, Independence Day, Christmas and Boxing Day.</p>
            </Card>
            <Card title="Add a declared holiday">
              <form action={addHoliday} className="space-y-3">
                <Field label="Date" name="day" type="date" required />
                <Field label="Name" name="name" required placeholder="e.g. Eid-el-Fitr" />
                <button className={btn.ghost}>Add</button>
              </form>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
