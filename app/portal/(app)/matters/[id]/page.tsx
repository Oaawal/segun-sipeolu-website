import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, FileDown, Gavel, Inbox, Lock, Mic, Plus, ShieldAlert, UserMinus } from "lucide-react";
import { requireUser } from "@/lib/portal/auth";
import { can } from "@/lib/portal/permissions";
import { listDocuments, listMeetings, listService, listTasks, loadMatter, matterHearings, matterTeam, staffList } from "@/lib/portal/data";
import { q } from "@/lib/portal/db";
import { ago, daysUntil, dueLabel, fmtDateTime, fmtDay, isUuid } from "@/lib/portal/format";
import { MATTER_STATUS, MATTER_TYPES, MEETING_STATUS, PARTY_ROLES, PRACTICE_AREAS } from "@/lib/portal/vocab";
import { Avatar, Badge, Card, Check, DueBadge, Empty, Field, Flash, Note, PageHeader, Row, Select, Tabs, TextArea, btn } from "@/components/portal/ui";
import { DocumentList, UploadForm } from "@/components/portal/Documents";
import { HearingCard, HearingForm } from "@/components/portal/DiaryParts";
import { TaskForm, TaskList } from "@/components/portal/Tasks";
import { addMember, addNote, addParty, removeMember, removeParty, updateMatter } from "../actions";

export const metadata = { title: "Matter" };

const TABS = ["overview", "diary", "documents", "tasks", "notes", "meetings", "register", "parties", "team", "details", "activity"] as const;
type Tab = (typeof TABS)[number];

export default async function MatterPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; msg?: string }> }) {
  const u = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  if (!isUuid(id)) notFound();
  const m = await loadMatter(u, id);
  if (!m) notFound();
  if (m === "denied") {
    return (
      <div className="mx-auto max-w-lg py-16">
        <Card>
          <div className="flex flex-col items-center gap-3 text-center">
            <ShieldAlert className="h-10 w-10 text-maroon" />
            <h1 className="font-serif text-2xl text-maroon-dark">Restricted matter</h1>
            <p className="text-sm text-stone-600">You are not on this matter&apos;s team. If you need access, ask the responsible partner to add you. This attempt has been recorded.</p>
            <Link href="/portal/matters" className={btn.ghost}>Back to matters</Link>
          </div>
        </Card>
      </div>
    );
  }
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab || "") ? (sp.tab as Tab) : "overview";
  const base = `/portal/matters/${m.id}`;
  const [team, hearings, staff] = await Promise.all([matterTeam(m.id), matterHearings(m.id), staffList()]);
  const isLead = team.some((t) => t.user_id === u.id && t.role === "lead");
  const next = hearings.filter((h) => h.status === "scheduled" && (daysUntil(h.sitting_on) ?? -1) >= 0).sort((a, b) => a.sitting_on.localeCompare(b.sitting_on))[0];

  const header = (
    <PageHeader
      back={{ href: "/portal/matters", label: "Matters" }}
      title={<span className="flex items-center gap-2">{m.confidential && <Lock className="h-6 w-6 text-maroon" aria-label="Walled off" />}{m.title}</span>}
      sub={
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-stone-700">{m.number}</span>·
          <Link href={`/portal/clients/${m.client_id}`} className="hover:text-maroon">{m.client_name}</Link>·
          <span>{MATTER_TYPES[m.matter_type as keyof typeof MATTER_TYPES]}</span>
          <Badge tone={m.status === "closed" ? "grey" : m.status === "on_hold" ? "amber" : "green"}>{MATTER_STATUS[m.status as keyof typeof MATTER_STATUS]}</Badge>
          {m.confidential && <Badge tone="maroon"><Lock className="h-3 w-3" />Ethical wall</Badge>}
        </span>
      }
      actions={<a href={`/portal/api/export/matter/${m.id}`} className={btn.ghost}><FileDown className="h-4 w-4" />Matter summary (.docx)</a>}
    />
  );
  const tabs = (
    <Tabs active={tab} tabs={TABS.filter((t) => t !== "activity" || can(u, "audit.view") || isLead || u.role === "partner").map((t) => ({
      key: t, href: t === "overview" ? base : `${base}?tab=${t}`,
      label: { overview: "Overview", diary: "Court diary", documents: "Documents", tasks: "Tasks", notes: "Notes", meetings: "Meetings", register: "Service", parties: "Parties", team: "Team", details: "Details", activity: "Activity" }[t],
    }))} />
  );

  let body: React.ReactNode = null;

  if (tab === "overview") {
    const [tasks, notes, service] = await Promise.all([
      listTasks(u, { view: "open", matterId: m.id }),
      q<{ id: string; kind: string; body: string; created_at: string; full_name: string | null }>("SELECT n.id, n.kind, n.body, n.created_at, u.full_name FROM matter_notes n LEFT JOIN users u ON u.id = n.created_by WHERE n.matter_id = $1 ORDER BY n.created_at DESC LIMIT 8", [m.id]),
      listService(u, { matterId: m.id, status: "open" }),
    ]);
    body = (
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          {next ? (
            <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-gradient-to-r from-maroon-dark to-maroon p-5 text-white">
              <Gavel className="h-8 w-8 text-gold" />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold uppercase tracking-wider text-gold">Next in court · {dueLabel(next.sitting_on)}</div>
                <div className="font-serif text-xl">{fmtDay(next.sitting_on, { weekday: "long", day: "numeric", month: "long" })}{next.sitting_time ? ` at ${next.sitting_time}` : ""}</div>
                <div className="text-sm text-white/75">{next.business} · {next.court}{next.appearing_name ? ` · ${next.appearing_name}` : ""}</div>
              </div>
              <Link href={`${base}?tab=diary`} className={btn.gold}>Court diary</Link>
            </div>
          ) : m.matter_type === "litigation" && m.status !== "closed" ? <Note tone="warn">No upcoming court date. Add one on the Court diary tab.</Note> : null}
          <Card title="Open tasks" action={<Link href={`${base}?tab=tasks`} className="text-sm font-semibold text-maroon">All</Link>} pad={false}><TaskList tasks={tasks.slice(0, 6)} back={base} showMatter={false} /></Card>
          <Card title="Recent activity" action={<Link href={`${base}?tab=notes`} className="text-sm font-semibold text-maroon">Notes</Link>}>
            <ol className="space-y-4">{notes.map((n) => (
              <li key={n.id} className="flex gap-3 text-sm"><span className="mt-1.5 h-2 w-2 flex-none rounded-full bg-gold" /><div className="min-w-0"><div className="whitespace-pre-line text-stone-800">{n.body.length > 300 ? `${n.body.slice(0, 300)}…` : n.body}</div><div className="text-xs text-stone-400">{n.full_name || "System"} · {ago(n.created_at)}</div></div></li>
            ))}</ol>
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="At a glance">
            <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 text-sm">
              <dt className="text-stone-500">Client</dt><dd><Link href={`/portal/clients/${m.client_id}`} className="font-medium text-maroon hover:underline">{m.client_name}</Link></dd>
              <dt className="text-stone-500">Practice area</dt><dd>{m.practice_area}</dd>
              <dt className="text-stone-500">Partner</dt><dd>{m.partner_name || "—"}</dd>
              <dt className="text-stone-500">Court</dt><dd>{m.court || "—"}</dd>
              <dt className="text-stone-500">Suit number</dt><dd>{m.suit_number || "—"}</dd>
              <dt className="text-stone-500">Judge</dt><dd>{m.judge || "—"}</dd>
              <dt className="text-stone-500">Opened</dt><dd>{fmtDay(m.opened_on)}</dd>
            </dl>
          </Card>
          <Card title="Team" action={<Link href={`${base}?tab=team`} className="text-sm font-semibold text-maroon">Manage</Link>}>
            <div className="flex flex-wrap gap-2">{team.map((t) => <span key={t.user_id} className="inline-flex items-center gap-2 rounded-full bg-cream py-1 pl-1 pr-3 text-sm"><Avatar name={t.full_name} size="sm" />{t.full_name}{t.role === "lead" && <span className="text-xs text-gold">Lead</span>}</span>)}</div>
          </Card>
          {service.length > 0 && (
            <Card title="Open service items" pad={false}>
              {service.map((s) => <Row key={s.id} href={`/portal/register/${s.id}`}><Inbox className="h-4 w-4 flex-none text-maroon" /><div className="min-w-0 flex-1 truncate text-sm font-medium">{s.title}</div>{s.response_due && <DueBadge days={daysUntil(s.response_due)} label={dueLabel(s.response_due)} />}</Row>)}
            </Card>
          )}
          {m.description && <Card title="Instructions"><p className="whitespace-pre-line text-sm text-stone-700">{m.description}</p></Card>}
        </div>
      </div>
    );
  }

  if (tab === "diary") {
    const canEdit = can(u, "diary.edit");
    body = (
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card title="Sittings" pad={false}>
          {hearings.length === 0 ? <Empty icon={<CalendarDays className="h-8 w-8" />} title="No court dates yet" /> : hearings.map((h) => <HearingCard key={h.id} h={h} staff={staff} back={`${base}?tab=diary`} canEdit={canEdit} />)}
        </Card>
        {canEdit && <Card title="Add a court date"><HearingForm matter={m} staff={staff} back={`${base}?tab=diary`} /></Card>}
      </div>
    );
  }

  if (tab === "documents") {
    const docs = await listDocuments("matter", m.id);
    body = (
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card title={`Documents (${docs.length})`} pad={false}><DocumentList docs={docs} ownerType="matter" ownerId={m.id} canRemove canUpload /></Card>
        <div className="space-y-6">
          <Card title="Upload"><UploadForm ownerType="matter" ownerId={m.id} /></Card>
          <Note tone="info">Working in Word? With the SOS&amp;A Word add-in you can save straight into this matter. Each save becomes a new version. See your Account page.</Note>
        </div>
      </div>
    );
  }

  if (tab === "tasks") {
    const tasks = await listTasks(u, { view: "all", matterId: m.id });
    body = (
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card title="Tasks" pad={false}><TaskList tasks={tasks} back={`${base}?tab=tasks`} showMatter={false} /></Card>
        <Card title="Add a task"><TaskForm back={`${base}?tab=tasks`} matterId={m.id} staff={team.map((t) => ({ id: t.user_id, full_name: t.full_name, role: t.user_role }))} me={u.id} canAssign={can(u, "tasks.assign_others")} /></Card>
      </div>
    );
  }

  if (tab === "notes") {
    const notes = await q<{ id: string; kind: string; body: string; created_at: string; full_name: string | null }>("SELECT n.id, n.kind, n.body, n.created_at, u.full_name FROM matter_notes n LEFT JOIN users u ON u.id = n.created_by WHERE n.matter_id = $1 ORDER BY n.created_at DESC", [m.id]);
    body = (
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card title="File notes and history">
          <ol className="space-y-5">{notes.map((n) => (
            <li key={n.id} className="flex gap-3">
              <span className={`mt-1 grid h-7 w-7 flex-none place-items-center rounded-full text-[11px] font-bold ${n.kind === "system" ? "bg-stone-100 text-stone-500" : "bg-maroon/10 text-maroon"}`}>{n.kind === "attendance" ? "A" : n.kind === "call" ? "C" : n.kind === "system" ? "•" : "N"}</span>
              <div className="min-w-0 flex-1">
                <div className={`whitespace-pre-line text-sm ${n.kind === "system" ? "text-stone-500" : "text-stone-800"}`}>{n.body}</div>
                <div className="mt-0.5 text-xs text-stone-400">{n.kind === "system" ? "Automatic" : { note: "File note", attendance: "Attendance note", call: "Call note" }[n.kind]} · {n.full_name || "System"} · {fmtDateTime(n.created_at)}</div>
              </div>
            </li>
          ))}</ol>
        </Card>
        <Card title="Add a note">
          <form action={addNote} className="space-y-3">
            <input type="hidden" name="matter_id" value={m.id} />
            <Select label="Kind" name="kind" options={{ note: "File note", attendance: "Attendance note (meeting)", call: "Call note" }} defaultValue="note" />
            <TextArea label="Note" name="body" required rows={6} placeholder="e.g. Called client: confirmed instructions to file a counter-claim." />
            <button className={btn.primary}>Add note</button>
            <p className="text-xs text-stone-500">Notes cannot be edited or deleted afterwards, so the file always shows what was known and when.</p>
          </form>
        </Card>
      </div>
    );
  }

  if (tab === "meetings") {
    const meetings = can(u, "meetings.use") ? await listMeetings(u, m.id) : [];
    body = (
      <Card title="Meetings" action={can(u, "meetings.use") && <Link href={`/portal/meetings/new?matter=${m.id}`} className={btn.small}><Plus className="h-3.5 w-3.5" />New meeting</Link>} pad={false}>
        {meetings.length === 0 ? <Empty icon={<Mic className="h-8 w-8" />} title="No meetings recorded" /> : meetings.map((x) => (
          <Row key={x.id} href={`/portal/meetings/${x.id}`}><Mic className="h-4 w-4 text-maroon" /><div className="min-w-0 flex-1"><div className="truncate font-medium">{x.title}</div><div className="text-xs text-stone-500">{fmtDay(x.held_on)}</div></div><Badge tone={MEETING_STATUS[x.status]?.[1]}>{MEETING_STATUS[x.status]?.[0]}</Badge></Row>
        ))}
      </Card>
    );
  }

  if (tab === "register") {
    const rows = await listService(u, { matterId: m.id });
    body = (
      <Card title="Served on us and by us" action={<Link href={`/portal/register/new?direction=in&matter=${m.id}`} className={btn.small}><Plus className="h-3.5 w-3.5" />Log a document</Link>} pad={false}>
        {rows.length === 0 ? <Empty icon={<Inbox className="h-8 w-8" />} title="Nothing logged for this matter" /> : rows.map((s) => (
          <Row key={s.id} href={`/portal/register/${s.id}`}><Badge tone={s.direction === "in" ? "maroon" : "green"}>{s.direction === "in" ? "IN" : "OUT"}</Badge><div className="min-w-0 flex-1"><div className="truncate font-medium">{s.title}</div><div className="text-xs text-stone-500">{s.number} · {fmtDay(s.served_on)} · {s.party}</div></div>{s.status === "open" && s.response_due && <DueBadge days={daysUntil(s.response_due)} label={dueLabel(s.response_due)} />}</Row>
        ))}
      </Card>
    );
  }

  if (tab === "parties") {
    const parties = await q<{ id: string; name: string; role: string; contact: string | null; notes: string | null }>("SELECT id, name, role, contact, notes FROM parties WHERE matter_id = $1 ORDER BY created_at", [m.id]);
    body = (
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card title="Parties" pad={false}>
          <Row><Avatar name={m.client_name} size="sm" /><div className="flex-1"><div className="font-medium">{m.client_name}</div><div className="text-xs text-stone-500">Our client</div></div></Row>
          {parties.map((p) => (
            <Row key={p.id}>
              <Avatar name={p.name} size="sm" />
              <div className="min-w-0 flex-1"><div className="font-medium">{p.name}</div><div className="text-xs text-stone-500">{PARTY_ROLES[p.role as keyof typeof PARTY_ROLES] || p.role}{p.contact ? ` · ${p.contact}` : ""}</div></div>
              <form action={removeParty}><input type="hidden" name="matter_id" value={m.id} /><input type="hidden" name="party_id" value={p.id} /><button className="text-xs font-semibold text-stone-400 hover:text-red-700">Remove</button></form>
            </Row>
          ))}
        </Card>
        <Card title="Add a party">
          <form action={addParty} className="space-y-3">
            <input type="hidden" name="matter_id" value={m.id} />
            <Field label="Name" name="name" required />
            <Select label="Role" name="role" options={PARTY_ROLES} defaultValue="defendant" />
            <Field label="Contact / address for service" name="contact" />
            <button className={btn.primary}>Add party</button>
            <p className="text-xs text-stone-500">Every party is included in future conflict checks.</p>
          </form>
        </Card>
      </div>
    );
  }

  if (tab === "team") {
    const manage = can(u, "matters.manage_team");
    const candidates = staff.filter((s) => s.role !== "front_desk" && !team.some((t) => t.user_id === s.id));
    body = (
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card title="Matter team" pad={false}>
          {team.map((t) => (
            <Row key={t.user_id}>
              <Avatar name={t.full_name} />
              <div className="min-w-0 flex-1"><div className="font-medium">{t.full_name} {t.role === "lead" && <Badge tone="gold">Lead</Badge>}</div><div className="text-xs text-stone-500">{t.title || t.user_role}</div></div>
              {manage && <form action={removeMember}><input type="hidden" name="matter_id" value={m.id} /><input type="hidden" name="user_id" value={t.user_id} /><button className={btn.small}><UserMinus className="h-3.5 w-3.5" />Remove</button></form>}
            </Row>
          ))}
        </Card>
        <div className="space-y-4">
          {manage && candidates.length > 0 && (
            <Card title="Add to the team">
              <form action={addMember} className="space-y-3">
                <input type="hidden" name="matter_id" value={m.id} />
                <Select label="Person" name="user_id" options={candidates.map((s) => [s.id, `${s.full_name}${s.title ? ` · ${s.title}` : ""}`])} />
                <Select label="Role on matter" name="role" options={{ member: "Member", lead: "Lead" }} defaultValue="member" />
                <button className={btn.primary}>Add</button>
              </form>
            </Card>
          )}
          <Note tone="lock">{m.confidential ? "This matter is walled off: only these people can open it." : "Team members get this matter's reminders and can open its file. Partners can also open it."}</Note>
        </div>
      </div>
    );
  }

  if (tab === "details") {
    const partners = staff.filter((s) => s.role === "admin" || s.role === "partner");
    body = (
      <Card>
        <form action={updateMatter} className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <input type="hidden" name="id" value={m.id} />
          <Field label="Title" name="title" required defaultValue={m.title} className="md:col-span-2" />
          <Select label="Practice area" name="practice_area" options={PRACTICE_AREAS.map((p) => [p, p])} defaultValue={m.practice_area} />
          <Select label="Status" name="status" options={MATTER_STATUS} defaultValue={m.status} />
          <Select label="Responsible partner" name="responsible_partner" options={partners.map((p) => [p.id, p.full_name])} blank="None" defaultValue={m.responsible_partner || ""} />
          <Field label="Court" name="court" defaultValue={m.court || ""} />
          <Field label="Suit number" name="suit_number" defaultValue={m.suit_number || ""} />
          <Field label="Judge" name="judge" defaultValue={m.judge || ""} />
          <TextArea label="Instructions and background" name="description" defaultValue={m.description || ""} rows={5} className="md:col-span-2" />
          {can(u, "matters.set_confidential") && <div className="md:col-span-2"><Check name="confidential" defaultChecked={m.confidential} label={<><strong>Ethical wall:</strong> only the matter team can see this matter.</>} /></div>}
          <div className="md:col-span-2"><button className={btn.primary}>Save</button></div>
        </form>
      </Card>
    );
  }

  if (tab === "activity") {
    const rows = await q<{ id: number; at: string; actor: string; action: string; detail: string | null }>("SELECT id, at, actor, action, detail FROM audit_log WHERE matter_id = $1 ORDER BY id DESC LIMIT 300", [m.id]);
    body = (
      <Card title="Who did what on this matter" pad={false}>
        {rows.map((r) => <Row key={r.id}><div className="min-w-0 flex-1"><div className="text-sm font-medium text-stone-800">{r.action.replace(/[._]/g, " ")}</div><div className="text-xs text-stone-500">{r.actor} · {fmtDateTime(r.at)}</div></div></Row>)}
      </Card>
    );
  }

  return (
    <>
      {header}
      <Flash msg={sp.msg} />
      {tabs}
      {body}
    </>
  );
}
