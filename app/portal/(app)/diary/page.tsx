import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, Printer } from "lucide-react";
import { requireUser } from "@/lib/portal/auth";
import { can } from "@/lib/portal/permissions";
import { diary, staffList } from "@/lib/portal/data";
import { audit } from "@/lib/portal/audit";
import { addDays, fmtDay, fmtLongDay, isYmd, today } from "@/lib/portal/format";
import { Card, Chips, Empty, Flash, PageHeader, btn } from "@/components/portal/ui";
import { HearingCard } from "@/components/portal/DiaryParts";

export const metadata = { title: "Court diary" };

function monday(ymd: string) {
  const d = new Date(`${ymd}T12:00:00Z`);
  return addDays(ymd, -((d.getUTCDay() + 6) % 7));
}

export default async function Diary({ searchParams }: { searchParams: Promise<{ week?: string; mine?: string; view?: string; day?: string; msg?: string }> }) {
  const u = await requireUser();
  const sp = await searchParams;
  const allowedAll = can(u, "diary.view_all");
  const mine = sp.mine === "1" || !allowedAll;
  const t = today();

  // Cause list: one day, printable
  if (sp.view === "cause") {
    const day = isYmd(sp.day) ? sp.day : t;
    const rows = await diary(u, day, day, { mine });
    await audit({ userId: u.id, actor: u.email, action: "diary.cause_list", detail: { day } });
    return (
      <div className="mx-auto max-w-4xl print:max-w-none">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Link href="/portal/diary" className="text-sm text-stone-500 hover:text-maroon">← Court diary</Link>
          <div className="flex gap-2">
            <Link className={btn.small} href={`/portal/diary?view=cause&day=${addDays(day, -1)}`}><ChevronLeft className="h-3.5 w-3.5" />Previous day</Link>
            <Link className={btn.small} href={`/portal/diary?view=cause&day=${addDays(day, 1)}`}>Next day<ChevronRight className="h-3.5 w-3.5" /></Link>
          </div>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-8 print:border-0 print:p-0">
          <div className="border-b-2 border-maroon pb-4">
            <div className="font-serif text-xl font-semibold text-maroon-dark">Segun Sipeolu &amp; Associates</div>
            <div className="text-xs uppercase tracking-[0.2em] text-stone-500">Daily cause list</div>
            <div className="mt-2 font-serif text-2xl text-stone-900">{fmtLongDay(day)}</div>
          </div>
          {rows.length === 0 ? <p className="py-10 text-center text-stone-500">No matters listed for this day.</p> : (
            <table className="mt-4 w-full text-sm">
              <thead><tr className="border-b border-stone-300 text-left text-xs uppercase tracking-wider text-stone-500"><th className="py-2 pr-3">Time</th><th className="py-2 pr-3">Court</th><th className="py-2 pr-3">Matter</th><th className="py-2 pr-3">Business</th><th className="py-2">Counsel</th></tr></thead>
              <tbody>
                {rows.map((h) => (
                  <tr key={h.id} className="border-b border-stone-100 align-top">
                    <td className="py-2.5 pr-3 font-semibold">{h.sitting_time || "—"}</td>
                    <td className="py-2.5 pr-3">{h.court}{h.judge ? <div className="text-xs text-stone-500">{h.judge}</div> : null}</td>
                    <td className="py-2.5 pr-3"><div className="font-medium">{h.matter_title}</div><div className="text-xs text-stone-500">{h.suit_number || h.matter_number}</div></td>
                    <td className="py-2.5 pr-3">{h.business}</td>
                    <td className="py-2.5">{h.appearing_name || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-6 text-xs text-stone-400">Printed from the SOS&amp;A Practice Portal · Confidential</p>
        </div>
        <p className="mt-4 flex items-center gap-2 text-sm text-stone-500 print:hidden"><Printer className="h-4 w-4" />Use your browser&apos;s Print (Ctrl/⌘ + P) to print or save as PDF.</p>
      </div>
    );
  }

  const start = monday(isYmd(sp.week) ? sp.week : t);
  const end = addDays(start, 13);
  const [rows, staff] = await Promise.all([diary(u, start, end, { mine }), staffList()]);
  const overdue = (await diary(u, addDays(t, -60), addDays(t, -1), { mine })).filter((h) => h.status === "scheduled");
  const days = Array.from({ length: 14 }, (_, i) => addDays(start, i)).filter((d) => rows.some((r) => r.sitting_on === d));
  const base = (o: Record<string, string>) => `/portal/diary?${new URLSearchParams({ week: start, ...(mine && allowedAll ? { mine: "1" } : {}), ...o })}`;

  return (
    <>
      <PageHeader
        title="Court diary"
        sub={`${fmtDay(start)} – ${fmtDay(end)}`}
        actions={
          <>
            <Link className={btn.ghost} href={`/portal/diary?view=cause&day=${t}`}><Printer className="h-4 w-4" />Today&apos;s cause list</Link>
            <Link className={btn.small} href={base({ week: addDays(start, -14) })}><ChevronLeft className="h-3.5 w-3.5" />Earlier</Link>
            <Link className={btn.small} href={`/portal/diary${mine && allowedAll ? "?mine=1" : ""}`}>This week</Link>
            <Link className={btn.small} href={base({ week: addDays(start, 14) })}>Later<ChevronRight className="h-3.5 w-3.5" /></Link>
          </>
        }
      />
      <Flash msg={sp.msg} />
      {allowedAll && <Chips active={mine ? "mine" : "all"} items={[{ key: "all", label: "Whole firm", href: `/portal/diary?week=${start}` }, { key: "mine", label: "My matters", href: `/portal/diary?week=${start}&mine=1` }]} />}

      {overdue.length > 0 && (
        <Card title={`Results not recorded (${overdue.length})`} className="mb-6 border-red-200" pad={false}>
          {overdue.map((h) => <HearingCard key={h.id} h={h} staff={staff} back="/portal/diary" canEdit={can(u, "diary.edit") && u.role !== "front_desk"} showMatter hideOutcome={u.role === "front_desk"} />)}
        </Card>
      )}

      {days.length === 0 ? (
        <Card><Empty icon={<CalendarDays className="h-8 w-8" />} title="Nothing listed in these two weeks" text="Court dates are added from each matter's Court diary tab, and next dates are added automatically when a sitting is adjourned." /></Card>
      ) : (
        <div className="space-y-6">
          {days.map((d) => (
            <Card key={d} title={<span className={d === t ? "text-maroon" : ""}>{fmtDay(d, { weekday: "long", day: "numeric", month: "long" })}{d === t ? " · Today" : ""}</span>} action={<Link href={`/portal/diary?view=cause&day=${d}`} className="text-xs font-semibold text-maroon">Cause list</Link>} pad={false}>
              {rows.filter((r) => r.sitting_on === d).map((h) => <HearingCard key={h.id} h={h} staff={staff} back={base({})} canEdit={can(u, "diary.edit") && u.role !== "front_desk"} showMatter hideOutcome={u.role === "front_desk"} />)}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
