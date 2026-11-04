import Link from "next/link";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { requirePermission } from "@/lib/portal/auth";
import { q } from "@/lib/portal/db";
import { verifyAuditChain } from "@/lib/portal/audit";
import { fmtDateTime } from "@/lib/portal/format";
import { Card, Chips, PageHeader, btn } from "@/components/portal/ui";

export const metadata = { title: "Audit trail" };

const FILTERS: Record<string, { label: string; like: string | null }> = {
  all: { label: "All", like: null }, auth: { label: "Sign-ins", like: "auth.%" }, matter: { label: "Matters", like: "matter.%" },
  document: { label: "Documents", like: "document.%" }, denied: { label: "Denied access", like: "%denied%" }, user: { label: "People", like: "user.%" },
  meeting: { label: "Meetings", like: "meeting.%" }, service: { label: "Register", like: "service.%" },
};

export default async function Audit({ searchParams }: { searchParams: Promise<{ f?: string; before?: string; who?: string }> }) {
  await requirePermission("audit.view");
  const sp = await searchParams;
  const f = FILTERS[sp.f || ""] ? sp.f! : "all";
  const before = Number(sp.before) || null;
  const params: unknown[] = [];
  const where: string[] = [];
  if (FILTERS[f].like) { params.push(FILTERS[f].like); where.push(`action LIKE $${params.length}`); }
  if (before) { params.push(before); where.push(`id < $${params.length}`); }
  if (sp.who) { params.push(sp.who); where.push(`actor = $${params.length}`); }
  const rows = await q<{ id: number; at: string; actor: string; action: string; entity_type: string | null; entity_id: string | null; matter_id: string | null; detail: string | null; ip: string | null; hash: string }>(
    `SELECT id, at, actor, action, entity_type, entity_id, matter_id, detail, ip, hash FROM audit_log ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY id DESC LIMIT 101`, params);
  const check = await verifyAuditChain();
  const more = rows.length > 100;
  return (
    <>
      <PageHeader title="Audit trail" sub="Every sign-in, view, download and change. Entries cannot be edited or deleted." />
      <div className={`mb-6 flex items-center gap-3 rounded-2xl border px-5 py-4 ${check.ok ? "border-green/20 bg-green/5 text-green" : "border-red-200 bg-red-50 text-red-800"}`}>
        {check.ok ? <ShieldCheck className="h-6 w-6" /> : <ShieldAlert className="h-6 w-6" />}
        <div className="text-sm">
          <strong>{check.ok ? "Integrity verified." : "Integrity check FAILED."}</strong>{" "}
          {check.ok ? `All ${check.checked.toLocaleString()} entries are linked by unbroken SHA-256 hashes: nothing has been altered or removed.` : `Entry #${check.brokenAt}: ${check.reason} Preserve the database and investigate.`}
        </div>
      </div>
      <Chips active={f} items={Object.entries(FILTERS).map(([k, v]) => ({ key: k, label: v.label, href: `/portal/admin/audit?f=${k}` }))} />
      <Card pad={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wider text-stone-500"><th className="px-5 py-3">#</th><th className="px-3 py-3">When</th><th className="px-3 py-3">Who</th><th className="px-3 py-3">What</th><th className="px-3 py-3">Detail</th><th className="px-5 py-3">Hash</th></tr></thead>
            <tbody>
              {rows.slice(0, 100).map((r) => (
                <tr key={r.id} className={`border-t border-stone-100 align-top ${r.action.includes("denied") || r.action.includes("failed") || r.action.includes("locked") ? "bg-red-50/50" : ""}`}>
                  <td className="px-5 py-2.5 text-stone-400">{r.id}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">{fmtDateTime(r.at)}</td>
                  <td className="px-3 py-2.5"><Link href={`/portal/admin/audit?who=${encodeURIComponent(r.actor)}`} className="hover:text-maroon">{r.actor}</Link>{r.ip && <div className="text-xs text-stone-400">{r.ip}</div>}</td>
                  <td className="px-3 py-2.5 font-medium">{r.action}{r.matter_id && <Link href={`/portal/matters/${r.matter_id}`} className="block text-xs font-normal text-maroon">matter</Link>}</td>
                  <td className="max-w-xs break-words px-3 py-2.5 font-mono text-[11px] text-stone-500">{r.detail}</td>
                  <td className="px-5 py-2.5 font-mono text-[11px] text-stone-400" title={r.hash}>{r.hash.slice(0, 10)}…</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {more && <div className="mt-4"><Link href={`/portal/admin/audit?f=${f}&before=${rows[99].id}${sp.who ? `&who=${encodeURIComponent(sp.who)}` : ""}`} className={btn.ghost}>Older entries</Link></div>}
    </>
  );
}
