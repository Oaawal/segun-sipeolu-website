import Link from "next/link";
import { Briefcase, Lock, Plus, Search } from "lucide-react";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/portal/auth";
import { can } from "@/lib/portal/permissions";
import { listMatters } from "@/lib/portal/data";
import { MATTER_STATUS, MATTER_TYPES } from "@/lib/portal/vocab";
import { fmtDay } from "@/lib/portal/format";
import { Badge, Card, Chips, Empty, Flash, PageHeader, btn, inputCls } from "@/components/portal/ui";

export const metadata = { title: "Matters" };

export default async function Matters({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; mine?: string; msg?: string }> }) {
  const u = await requireUser();
  if (u.role === "front_desk") redirect("/portal?denied=1");
  const sp = await searchParams;
  const status = ["open", "intake", "on_hold", "closed", "all"].includes(sp.status || "") ? sp.status! : "open";
  const mine = sp.mine === "1";
  const term = (sp.q || "").trim().slice(0, 100);
  const rows = await listMatters(u, { status, q: term, mine });
  return (
    <>
      <PageHeader
        title="Matters"
        sub={can(u, "matters.view_all") ? "Every matter you can access, including the whole firm's" : "Matters you are on"}
        actions={can(u, "matters.create") && <Link href="/portal/matters/new" className={btn.primary}><Plus className="h-4 w-4" />New matter</Link>}
      />
      <Flash msg={sp.msg} />
      <form className="relative mb-4 max-w-xl">
        <input type="hidden" name="status" value={status} />
        {mine && <input type="hidden" name="mine" value="1" />}
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
        <input name="q" type="search" defaultValue={term} placeholder="Search title, number, client or suit number" className={`${inputCls} pl-9`} />
      </form>
      <Chips active={mine ? "mine" : status} items={[
        { key: "open", label: "Open", href: `/portal/matters?status=open${term ? `&q=${encodeURIComponent(term)}` : ""}` },
        { key: "mine", label: "Mine", href: `/portal/matters?mine=1&status=open` },
        { key: "intake", label: "Intake", href: `/portal/matters?status=intake` },
        { key: "on_hold", label: "On hold", href: `/portal/matters?status=on_hold` },
        { key: "closed", label: "Closed", href: `/portal/matters?status=closed` },
        { key: "all", label: "All", href: `/portal/matters?status=all` },
      ]} />
      <Card pad={false}>
        {rows.length === 0 ? (
          <Empty icon={<Briefcase className="h-8 w-8" />} title="No matters here" text={can(u, "matters.view_all") ? undefined : "You see matters once you are added to the team."} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-left text-xs font-semibold uppercase tracking-wider text-stone-500">
                  <th className="px-5 py-3">Matter</th><th className="px-3 py-3">Client</th><th className="px-3 py-3">Type</th><th className="px-3 py-3">Next in court</th><th className="px-5 py-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id} className="border-t border-stone-100 transition hover:bg-cream/60">
                    <td className="px-5 py-3">
                      <Link href={`/portal/matters/${m.id}`} className="block">
                        <div className="flex items-center gap-1.5 font-semibold text-stone-800">{m.confidential && <Lock className="h-3.5 w-3.5 text-maroon" aria-label="Walled off" />}{m.title}</div>
                        <div className="text-xs text-stone-500">{m.number}{m.suit_number ? ` · ${m.suit_number}` : ""}</div>
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-stone-700">{m.client_name}</td>
                    <td className="px-3 py-3 text-stone-500">{MATTER_TYPES[m.matter_type as keyof typeof MATTER_TYPES]}</td>
                    <td className="px-3 py-3">{m.next_sitting ? <Badge tone="maroon">{fmtDay(m.next_sitting)}</Badge> : <span className="text-stone-400">—</span>}</td>
                    <td className="px-5 py-3 text-right"><Badge tone={m.status === "closed" ? "grey" : m.status === "on_hold" ? "amber" : "green"}>{MATTER_STATUS[m.status as keyof typeof MATTER_STATUS]}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
