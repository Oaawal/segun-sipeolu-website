import Link from "next/link";
import { Briefcase, CalendarDays, FileText, Inbox, Mic, Search, Users } from "lucide-react";
import { requireUser } from "@/lib/portal/auth";
import { DOC_TYPES, pickableMatters, searchDocuments, searchEverything } from "@/lib/portal/data";
import { audit } from "@/lib/portal/audit";
import { addDays, fmtDay, fmtSize, today } from "@/lib/portal/format";
import { Card, Empty, Note, PageHeader, Row } from "@/components/portal/ui";
import { SearchBox } from "@/components/portal/SearchBox";

export const metadata = { title: "Search" };

function Section({ title, icon, count, children }: { title: string; icon: React.ReactNode; count: number; children: React.ReactNode }) {
  if (!count) return null;
  return <Card title={<span className="flex items-center gap-2">{icon}{title} · {count}</span>} pad={false}>{children}</Card>;
}

const WHEN: Record<string, [string, number]> = { week: ["Last 7 days", 7], month: ["Last 30 days", 30], quarter: ["Last 3 months", 91], year: ["Last 12 months", 365] };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string; when?: string; matter?: string; names?: string }> }) {
  const u = await requireUser();
  const sp = await searchParams;
  const term = (sp.q || "").trim().slice(0, 100);
  const type = sp.type && DOC_TYPES[sp.type] ? sp.type : "";
  const when = sp.when && WHEN[sp.when] ? sp.when : "";
  const matter = /^[0-9a-f-]{36}$/i.test(sp.matter || "") ? sp.matter! : "";
  const namesOnly = sp.names === "1";
  const filtering = !!(type || when || matter || namesOnly);
  const matters = u.role === "front_desk" ? [] : await pickableMatters(u);
  // With document filters chosen, show documents only (like filtering in Windows Explorer)
  const r = term.length >= 2 && !filtering ? await searchEverything(u, term) : null;
  const docs = filtering && (term.length >= 2 || type || when || matter)
    ? await searchDocuments(u, { term, type, since: when ? addDays(today(), -WHEN[when][1]) : undefined, matterId: matter, namesOnly, limit: 200 })
    : r?.documents ?? null;
  if (term.length >= 2 || filtering) await audit({ userId: u.id, actor: u.email, action: "search", detail: { q: term, type, when, matter: matter || undefined } });
  const total = r ? r.matters.length + r.clients.length + r.documents.length + r.service.length + r.hearings.length + r.meetings.length : docs?.length ?? 0;
  const sel = "rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800";
  return (
    <>
      <PageHeader title="Search" sub="Names, matter and suit numbers, document titles, folders, and the words inside documents (including scans). Results appear as you type." />
      <div className="mb-4 max-w-3xl"><SearchBox initial={term} autoFocus={!term} /></div>
      <form className="mb-6 flex flex-wrap items-center gap-2 text-sm">
        <input type="hidden" name="q" value={term} />
        <span className="font-semibold text-stone-600">Documents:</span>
        <select name="type" defaultValue={type} className={sel} aria-label="Type">
          <option value="">Any type</option>
          {Object.entries(DOC_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select name="when" defaultValue={when} className={sel} aria-label="Saved">
          <option value="">Any date</option>
          {Object.entries(WHEN).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
        </select>
        {matters.length > 0 && (
          <select name="matter" defaultValue={matter} className={`${sel} max-w-[16rem]`} aria-label="Matter">
            <option value="">Any matter</option>
            {matters.map((m) => <option key={m.id} value={m.id}>{m.number} · {m.title}</option>)}
          </select>
        )}
        <label className="flex items-center gap-1.5 text-stone-600"><input type="checkbox" name="names" value="1" defaultChecked={namesOnly} className="h-4 w-4 accent-maroon" />File names only</label>
        <button className="rounded-lg bg-maroon px-3.5 py-2 font-semibold text-white">Filter</button>
        {filtering && <Link href={`/portal/search${term ? `?q=${encodeURIComponent(term)}` : ""}`} className="text-stone-500 hover:text-maroon">Clear</Link>}
      </form>

      {!r && !docs ? <Note tone="info">Type at least two letters, or choose a document type, date or matter. Results only include what your role allows you to see.</Note> : total === 0 ? (
        <Card><Empty icon={<Search className="h-8 w-8" />} title={term ? `Nothing found for “${term}”` : "No documents match those filters"} text="Results only include what your role allows you to see. New uploads can take a minute to be read for search." /></Card>
      ) : (
        <div className={`grid grid-cols-1 gap-6 ${r ? "lg:grid-cols-2" : ""}`}>
          {r && (
            <Section title="Matters" icon={<Briefcase className="h-4 w-4" />} count={r.matters.length}>
              {r.matters.map((m) => <Row key={m.id} href={`/portal/matters/${m.id}`}><div className="min-w-0 flex-1"><div className="truncate font-medium">{m.title}</div><div className="truncate text-xs text-stone-500">{m.number} · {m.client_name}{m.suit_number ? ` · ${m.suit_number}` : ""}</div></div></Row>)}
            </Section>
          )}
          {docs && (
            <Section title="Documents" icon={<FileText className="h-4 w-4" />} count={docs.length}>
              {docs.map((d) => (
                <Row key={d.id} href={`/portal/api/files/${d.id}`}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{d.title}</div>
                    <div className="truncate text-xs text-stone-500">{[d.folder, d.file_name, d.matter_number || (d.owner_type === "inbox" ? "Your inbox" : null), fmtDay(d.uploaded_at), fmtSize(Number(d.size_bytes))].filter(Boolean).join(" · ")}</div>
                    {d.snippet && <Snippet text={d.snippet} />}
                  </div>
                </Row>
              ))}
            </Section>
          )}
          {r && (
            <>
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
            </>
          )}
        </div>
      )}
      {r && <p className="mt-6 text-xs text-stone-400"><Link href="/portal/conflicts" className="hover:text-maroon">Checking a new client or opponent? Use the conflict check instead</Link>, which searches every matter, including restricted ones.</p>}
    </>
  );
}

/** A passage from inside the document, with the matched words highlighted (marked « » by the database). */
function Snippet({ text }: { text: string }) {
  const parts = text.replace(/\s+/g, " ").split(/(«[^»]*»)/g);
  return <div className="mt-1 line-clamp-2 text-xs text-stone-600">{parts.map((p, i) => (p.startsWith("«") ? <mark key={i} className="rounded bg-gold/30 px-0.5 text-stone-900">{p.slice(1, -1)}</mark> : <span key={i}>{p}</span>))}</div>;
}
