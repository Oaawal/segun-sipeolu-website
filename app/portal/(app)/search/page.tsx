import Link from "next/link";
import { Briefcase, CalendarDays, FileText, Inbox, Mic, Search, Users } from "lucide-react";
import { requireUser } from "@/lib/portal/auth";
import { searchEverything } from "@/lib/portal/data";
import { audit } from "@/lib/portal/audit";
import { fmtDay } from "@/lib/portal/format";
import { Card, Empty, Note, PageHeader, Row, inputCls } from "@/components/portal/ui";

export const metadata = { title: "Search" };

function Section({ title, icon, count, children }: { title: string; icon: React.ReactNode; count: number; children: React.ReactNode }) {
  if (!count) return null;
  return <Card title={<span className="flex items-center gap-2">{icon}{title} · {count}</span>} pad={false}>{children}</Card>;
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const u = await requireUser();
  const term = ((await searchParams).q || "").trim().slice(0, 100);
  const r = term.length >= 2 ? await searchEverything(u, term) : null;
  if (r) await audit({ userId: u.id, actor: u.email, action: "search", detail: { q: term } });
  const total = r ? r.matters.length + r.clients.length + r.documents.length + r.service.length + r.hearings.length + r.meetings.length : 0;
  const docHref = (d: { id: string }) => `/portal/api/files/${d.id}`;
  return (
    <>
      <PageHeader title="Search" sub="Matters, clients, documents, court dates, served processes and meetings: everything you have access to" />
      <form className="relative mb-6 max-w-2xl">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-400" />
        <input name="q" type="search" defaultValue={term} autoFocus placeholder="Name, suit number, matter number, document title…" className={`${inputCls} py-3.5 pl-11 text-base`} />
      </form>
      {!r ? <Note tone="info">Type at least two letters. Results only include what your role allows you to see.</Note> : total === 0 ? (
        <Card><Empty icon={<Search className="h-8 w-8" />} title={`Nothing found for “${term}”`} text="Results only include what your role allows you to see. If you expected something, ask the matter's partner to add you." /></Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Section title="Matters" icon={<Briefcase className="h-4 w-4" />} count={r.matters.length}>
            {r.matters.map((m) => <Row key={m.id} href={`/portal/matters/${m.id}`}><div className="min-w-0 flex-1"><div className="truncate font-medium">{m.title}</div><div className="truncate text-xs text-stone-500">{m.number} · {m.client_name}{m.suit_number ? ` · ${m.suit_number}` : ""}</div></div></Row>)}
          </Section>
          <Section title="Documents" icon={<FileText className="h-4 w-4" />} count={r.documents.length}>
            {r.documents.map((d) => <Row key={d.id} href={docHref(d)}><div className="min-w-0 flex-1"><div className="truncate font-medium">{d.title}</div><div className="truncate text-xs text-stone-500">{d.file_name}{d.matter_number ? ` · ${d.matter_number}` : ""} · {fmtDay(d.uploaded_at)}</div></div></Row>)}
          </Section>
          <Section title="Clients" icon={<Users className="h-4 w-4" />} count={r.clients.length}>
            {r.clients.map((c) => <Row key={c.id} href={`/portal/clients/${c.id}`}><div className="min-w-0 flex-1"><div className="truncate font-medium">{c.name}</div><div className="truncate text-xs text-stone-500">{c.email || c.kind}</div></div></Row>)}
          </Section>
          <Section title="Served processes and letters" icon={<Inbox className="h-4 w-4" />} count={r.service.length}>
            {r.service.map((s) => <Row key={s.id} href={`/portal/register/${s.id}`}><div className="min-w-0 flex-1"><div className="truncate font-medium">{s.title}</div><div className="truncate text-xs text-stone-500">{s.number} · {s.party} · {fmtDay(s.served_on)}</div></div></Row>)}
          </Section>
          <Section title="Court dates" icon={<CalendarDays className="h-4 w-4" />} count={r.hearings.length}>
            {r.hearings.map((h) => <Row key={h.id} href={u.role === "front_desk" ? "/portal/diary" : `/portal/matters/${h.matter_id}?tab=diary`}><div className="min-w-0 flex-1"><div className="truncate font-medium">{fmtDay(h.sitting_on)} · {h.business}</div><div className="truncate text-xs text-stone-500">{h.matter_title} · {h.court}</div></div></Row>)}
          </Section>
          <Section title="Meetings" icon={<Mic className="h-4 w-4" />} count={r.meetings.length}>
            {r.meetings.map((m) => <Row key={m.id} href={`/portal/meetings/${m.id}`}><div className="min-w-0 flex-1"><div className="truncate font-medium">{m.title}</div><div className="truncate text-xs text-stone-500">{fmtDay(m.held_on)}</div></div></Row>)}
          </Section>
        </div>
      )}
      {r && <p className="mt-6 text-xs text-stone-400"><Link href="/portal/conflicts" className="hover:text-maroon">Checking a new client or opponent? Use the conflict check instead</Link>, which searches every matter, including restricted ones.</p>}
    </>
  );
}
