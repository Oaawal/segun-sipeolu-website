import Link from "next/link";
import { Briefcase, CalendarDays, Gavel, Inbox, ListChecks, Mic, Plus } from "lucide-react";
import { requireUser } from "@/lib/portal/auth";
import { dashboard } from "@/lib/portal/data";
import { can } from "@/lib/portal/permissions";
import { daysUntil, dueLabel, fmtLongDay, fmtDay, today } from "@/lib/portal/format";
import { Badge, Card, DueBadge, Empty, Flash, Note, PageHeader, Row, Stat, btn } from "@/components/portal/ui";

export const metadata = { title: "Today" };

export default async function Today({ searchParams }: { searchParams: Promise<{ msg?: string; denied?: string }> }) {
  const u = await requireUser();
  const sp = await searchParams;
  const d = await dashboard(u);
  const hour = Number(new Date().toLocaleString("en-GB", { timeZone: "Africa/Lagos", hour: "2-digit", hour12: false }));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const t = today();
  const todaySittings = d.sittings.filter((s) => s.sitting_on === t);
  const byDay = new Map<string, typeof d.sittings>();
  for (const s of d.sittings) byDay.set(s.sitting_on, [...(byDay.get(s.sitting_on) || []), s]);
  const overdue = d.myTasks.filter((x) => (daysUntil(x.due_on) ?? 1) < 0).length;

  return (
    <>
      <PageHeader
        title={`${greeting}, ${u.full_name.split(" ")[0]}`}
        sub={fmtLongDay(t)}
        actions={
          <>
            {can(u, "matters.create") && <Link href="/portal/matters/new" className={btn.primary}><Plus className="h-4 w-4" />New matter</Link>}
            {can(u, "service.log_inward") && <Link href="/portal/register/new?direction=in" className={btn.ghost}><Inbox className="h-4 w-4" />Log a document served</Link>}
          </>
        }
      />
      <Flash msg={sp.msg} />
      {sp.denied && <div className="mb-5"><Note tone="danger">Your role does not allow that page. If you need access, ask the Managing Partner.</Note></div>}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="In court today" value={todaySittings.length} note={todaySittings.length ? todaySittings.map((s) => s.court.split(",")[0]).slice(0, 2).join(" · ") : "No sittings"} href="/portal/diary" icon={<Gavel className="h-4 w-4" />} />
        <Stat label="My tasks" value={d.myTasks.length} note={overdue ? `${overdue} overdue` : "None overdue"} href="/portal/tasks" icon={<ListChecks className="h-4 w-4" />} tone={overdue ? "red" : "green"} />
        <Stat label="Service deadlines" value={d.serviceDue.length} note="Due within 7 days" href="/portal/register?status=due" icon={<Inbox className="h-4 w-4" />} tone={d.serviceDue.length ? "amber" : "green"} />
        <Stat label={u.role === "front_desk" ? "Sittings this week" : "My open matters"} value={u.role === "front_desk" ? d.sittings.length : d.counts?.my_matters ?? 0} note={u.role === "front_desk" ? "Next 7 days" : `${d.counts?.open_matters ?? 0} open you can access`} href={u.role === "front_desk" ? "/portal/diary" : "/portal/matters?mine=1"} icon={u.role === "front_desk" ? <CalendarDays className="h-4 w-4" /> : <Briefcase className="h-4 w-4" />} tone="gold" />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card title="Court this week" action={<Link href="/portal/diary" className="text-sm font-semibold text-maroon">Full diary</Link>} pad={false}>
            {d.sittings.length === 0 ? (
              <Empty icon={<CalendarDays className="h-8 w-8" />} title="No sittings in the next 7 days" />
            ) : (
              [...byDay.entries()].map(([day, rows]) => (
                <div key={day}>
                  <div className="flex items-center justify-between border-t border-stone-100 bg-cream/60 px-5 py-2 text-xs font-semibold uppercase tracking-wider text-stone-500 first:border-t-0">
                    <span>{fmtDay(day, { weekday: "long", day: "numeric", month: "short" })}</span>
                    <span>{dueLabel(day)}</span>
                  </div>
                  {rows.map((s) => (
                    <Row key={s.id} href={u.role === "front_desk" ? "/portal/diary" : `/portal/matters/${s.matter_id}?tab=diary`}>
                      <div className="w-14 flex-none text-center font-serif text-lg font-semibold text-maroon">{s.sitting_time || "—"}</div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold text-stone-800">{s.matter_title}</div>
                        <div className="truncate text-sm text-stone-500">{s.business} · {s.court}{s.suit_number ? ` · ${s.suit_number}` : ""}</div>
                      </div>
                      <div className="hidden text-right text-xs text-stone-500 sm:block">{s.appearing_name || <Badge tone="amber">No counsel</Badge>}</div>
                    </Row>
                  ))}
                </div>
              ))
            )}
          </Card>

          <Card title="My tasks" action={<Link href="/portal/tasks" className="text-sm font-semibold text-maroon">All tasks</Link>} pad={false}>
            {d.myTasks.length === 0 ? (
              <Empty icon={<ListChecks className="h-8 w-8" />} title="Nothing on your list" />
            ) : (
              d.myTasks.slice(0, 8).map((x) => (
                <Row key={x.id} href={x.matter_id ? `/portal/matters/${x.matter_id}?tab=tasks` : "/portal/tasks"}>
                  <span className={`h-2 w-2 flex-none rounded-full ${x.priority === "high" ? "bg-red-500" : x.priority === "low" ? "bg-stone-300" : "bg-gold"}`} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-stone-800">{x.kind === "deadline" && <Badge tone="red">Deadline</Badge>} {x.title}</div>
                    <div className="truncate text-xs text-stone-500">{x.matter_number || "No matter"}</div>
                  </div>
                  <DueBadge days={daysUntil(x.due_on)} label={dueLabel(x.due_on)} />
                </Row>
              ))
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Deadlines from service" action={<Link href="/portal/register?status=due" className="text-sm font-semibold text-maroon">Register</Link>} pad={false}>
            {d.serviceDue.length === 0 ? (
              <Empty icon={<Inbox className="h-8 w-8" />} title="No responses due this week" />
            ) : (
              d.serviceDue.slice(0, 6).map((s) => (
                <Row key={s.id} href={`/portal/register/${s.id}`}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-stone-800">{s.title}</div>
                    <div className="truncate text-xs text-stone-500">{s.number} · from {s.party}</div>
                  </div>
                  <DueBadge days={daysUntil(s.response_due)} label={dueLabel(s.response_due)} />
                </Row>
              ))
            )}
          </Card>

          {u.role !== "front_desk" && (
            <Card title="My matters" action={<Link href="/portal/matters?mine=1" className="text-sm font-semibold text-maroon">All</Link>} pad={false}>
              {d.recent.length === 0 ? (
                <Empty icon={<Briefcase className="h-8 w-8" />} title="You are not on any open matter" />
              ) : (
                d.recent.map((m) => (
                  <Row key={m.id} href={`/portal/matters/${m.id}`}>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-stone-800">{m.title}</div>
                      <div className="truncate text-xs text-stone-500">{m.number} · {m.client_name}</div>
                    </div>
                    {m.next_sitting && <Badge tone="maroon">Court {fmtDay(m.next_sitting, { day: "numeric", month: "short" })}</Badge>}
                  </Row>
                ))
              )}
            </Card>
          )}

          {can(u, "meetings.use") && d.meetings.length > 0 && (
            <Card title="Meetings to finish" pad={false}>
              {d.meetings.map((m) => (
                <Row key={m.id} href={`/portal/meetings/${m.id}`}>
                  <Mic className="h-4 w-4 flex-none text-maroon" />
                  <div className="min-w-0 flex-1"><div className="truncate font-medium">{m.title}</div><div className="text-xs text-stone-500">{fmtDay(m.held_on)}</div></div>
                  <Badge tone={m.status === "failed" ? "red" : "amber"}>{m.status}</Badge>
                </Row>
              ))}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
