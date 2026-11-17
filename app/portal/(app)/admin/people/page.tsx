import { cookies, headers } from "next/headers";
import Link from "next/link";
import { KeyRound } from "lucide-react";
import { requirePermission } from "@/lib/portal/auth";
import { q } from "@/lib/portal/db";
import { can, DESIGNATIONS, LOCKED_PERMISSIONS, parseRights, PERMISSIONS, roleCan, ROLES, type Designation, type Permission, type Role } from "@/lib/portal/permissions";
import { ago } from "@/lib/portal/format";
import { Avatar, Badge, Card, Field, Flash, Note, PageHeader, Select, btn } from "@/components/portal/ui";
import { fmtDateTime } from "@/lib/portal/format";
import { approveUser, rejectUser, resetUser, updateUser } from "../actions";

export const metadata = { title: "People & access" };

const PERM_LABELS: Record<string, string> = {
  "users.manage": "Manage people and access", "audit.view": "Audit trail", "system.manage": "Backups and system",
  "matters.view_all": "See all matters (not walled-off ones)", "matters.create": "Open matters", "matters.manage_team": "Manage matter teams",
  "matters.set_confidential": "Place ethical walls", "clients.view": "Client contact details", "clients.create": "Add clients", "clients.edit": "Edit clients",
  "conflicts.check": "Conflict checks", "diary.view_all": "Firm-wide court diary", "diary.edit": "Add court dates and results",
  "service.view_all": "Firm-wide service register", "service.log_inward": "Log documents served on us", "service.edit": "Record service by us",
  "tasks.assign_others": "Give tasks to others", "meetings.use": "Meetings, transcripts and AI minutes",
  "contacts.view": "Contacts directory", "contacts.edit": "Add and edit contacts", "templates.use": "Generate documents from templates",
  "templates.manage": "Manage precedents and templates", "cosec.view": "Company secretarial register", "cosec.edit": "Edit company secretarial records",
  "reports.view": "Partner reports", "office.manage": "Office and IT register", "mail.use": "Own mailbox in the portal",
  "templates.view": "Browse and preview templates and reference documents",
  "billing.record_time": "Record time and disbursements", "billing.draft": "Draft invoices", "billing.manage": "Issue invoices, record payments and receipts, client account",
  "billing.settings": "Hourly rates and invoice settings", "intake.view": "See enquiries", "intake.log": "Log enquiries", "intake.decide": "Clear conflicts, quote and take on enquiries",
  "workflows.manage": "Manage matter checklists", "deadlines.edit": "Add court-rule periods", "deadlines.verify": "Confirm court-rule periods and holidays",
  "assistant.use": "Ask the assistant", "documents.review_duplicates": "Review duplicate documents",
};

export default async function People({ searchParams }: { searchParams: Promise<{ msg?: string; link?: string }> }) {
  const me = await requirePermission("users.manage");
  const sp = await searchParams;
  const all = await q<{ id: string; email: string; full_name: string; role: Role; title: string | null; phone: string | null; active: boolean; totp_enabled: boolean; last_login_at: string | null; has_password: boolean; locked_until: string | null; designation: Designation | null; account_status: string; requested_role: Role | null; signup_note: string | null; created_at: string; perm_grants: string | null; perm_denies: string | null }>(
    "SELECT id, email, full_name, role, title, phone, active, totp_enabled, last_login_at, password_hash IS NOT NULL AS has_password, locked_until, designation, account_status, requested_role, signup_note, created_at, perm_grants, perm_denies FROM users WHERE account_status <> 'rejected' ORDER BY active DESC, full_name",
  );
  const pending = all.filter((p) => p.account_status === "pending");
  const people = all.filter((p) => p.account_status === "active");
  const raw = sp.link ? (await cookies()).get("ssa_new_link")?.value : undefined;
  const h = await headers();
  const origin = process.env.PORTAL_URL?.replace(/\/$/, "") || `${h.get("x-forwarded-proto") || "http"}://${h.get("host")}`;
  const link = raw ? { user: people.find((p) => p.id === raw.split(":")[0]), url: `${origin}/portal/invite/${raw.split(":")[1]}` } : null;
  const roleOpts = Object.entries(ROLES).map(([k, v]) => [k, v.label]);
  const desigOpts = [["", "None"], ...Object.entries(DESIGNATIONS).map(([k, v]) => [k, v.forRole ? `${v.label} (${ROLES[v.forRole].label})` : v.label])];

  return (
    <>
      <PageHeader title="People & access" sub="Who can sign in, and what each role can do" />
      <Flash msg={sp.msg} />
      {link?.user && (
        <div className="mb-6 rounded-2xl border-2 border-gold bg-gold/10 p-5">
          <div className="font-semibold text-maroon-dark">Password reset link for {link.user.full_name}</div>
          <p className="mt-1 text-sm text-stone-700">Give this to {link.user.email} privately. It works once and expires in 72 hours. It is shown only now.</p>
          <code className="mt-3 block select-all break-all rounded-lg bg-white p-3 font-mono text-sm">{link.url}</code>
        </div>
      )}
      {pending.length > 0 && (
        <Card title={`Waiting for approval (${pending.length})`} className="mb-6" pad={false}>
          {pending.map((p) => (
            <div key={p.id} className="border-t border-stone-100 px-5 py-4 first:border-t-0">
              <div className="flex flex-wrap items-center gap-3">
                <Avatar name={p.full_name} />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{p.full_name}</div>
                  <div className="text-xs text-stone-500">{[p.email, p.title, p.phone].filter(Boolean).join(" · ")} · asked {fmtDateTime(p.created_at)} as {p.requested_role ? ROLES[p.requested_role]?.label : "—"}</div>
                  {p.signup_note && <div className="mt-1 text-sm text-stone-700">&ldquo;{p.signup_note}&rdquo;</div>}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-end gap-2 pl-12">
                <form action={approveUser} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="id" value={p.id} />
                  <Select label="Role" name="role" options={roleOpts} defaultValue={p.requested_role || "front_desk"} />
                  <Select label="Designation" name="designation" options={desigOpts} defaultValue="" />
                  <button className={btn.primary}>Approve</button>
                </form>
                <form action={rejectUser}><input type="hidden" name="id" value={p.id} /><button className={btn.danger}>Refuse</button></form>
              </div>
            </div>
          ))}
        </Card>
      )}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card title={`Team (${people.filter((p) => p.active).length} active)`} pad={false}>
          {people.map((p) => (
            <div key={p.id} className={`border-t border-stone-100 px-5 py-4 first:border-t-0 ${p.active ? "" : "opacity-60"}`}>
              <div className="flex items-center gap-3">
                <Avatar name={p.full_name} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{p.full_name} {p.id === me.id && <span className="text-xs font-normal text-stone-400">(you)</span>}</div>
                  <div className="truncate text-xs text-stone-500">{[p.title, p.email, p.phone].filter(Boolean).join(" · ")}</div>
                </div>
                <div className="flex flex-wrap justify-end gap-1.5">
                  <Badge tone={p.role === "admin" ? "maroon" : p.role === "partner" ? "gold" : "grey"}>{ROLES[p.role].label}</Badge>
                  {p.designation && <Badge tone="blue">{DESIGNATIONS[p.designation].label}</Badge>}
                  {p.role !== "admin" && (parseRights(p.perm_grants).length + parseRights(p.perm_denies).length > 0) && <Badge tone="gold">Own rights</Badge>}
                  {!p.active ? <Badge>Deactivated</Badge> : !p.has_password ? <Badge tone="amber">Invited</Badge> : p.totp_enabled ? <Badge tone="green">2FA on</Badge> : <Badge tone="amber">No 2FA</Badge>}
                  {p.locked_until && new Date(p.locked_until) > new Date() && <Badge tone="red">Locked</Badge>}
                </div>
              </div>
              {p.id !== me.id && (
                <details className="mt-2 pl-12">
                  <summary className="cursor-pointer list-none text-xs font-semibold text-maroon [&::-webkit-details-marker]:hidden">Edit · last sign-in {p.last_login_at ? ago(p.last_login_at) : "never"}</summary>
                  <form action={updateUser} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <input type="hidden" name="id" value={p.id} />
                    <Field label="Name" name="full_name" defaultValue={p.full_name} required />
                    <Field label="Title" name="title" defaultValue={p.title || ""} />
                    <Field label="Phone" name="phone" defaultValue={p.phone || ""} />
                    <Select label="Role" name="role" options={roleOpts} defaultValue={p.role} />
                    <Select label="Designation" name="designation" options={desigOpts} defaultValue={p.designation || ""} hint="Lets them issue invitation codes" />
                    <Select label="Access" name="active" options={[["1", "Can sign in"], ["0", "Deactivated"]]} defaultValue={p.active ? "1" : "0"} />
                    {p.role === "admin" ? (
                      <p className="text-xs text-stone-500 sm:col-span-2">The Managing Partner has every right; they cannot be taken away.</p>
                    ) : (
                      <fieldset className="sm:col-span-2">
                        <legend className="mb-1.5 text-[13px] font-semibold text-stone-700">Rights</legend>
                        <p className="mb-2 text-xs text-stone-500">Ticked boxes are what {p.full_name.split(" ")[0]} can do. Untick to take a right away, tick to give one their role does not have. <span className="text-stone-400">Role default ●</span>. If you change the role, the rights go back to that role&apos;s defaults.</p>
                        <div className="grid grid-cols-1 gap-x-4 gap-y-1 rounded-lg border border-stone-200 p-3 sm:grid-cols-2">
                          {(Object.keys(PERMISSIONS) as Permission[]).filter((k) => !LOCKED_PERMISSIONS.includes(k)).map((k) => {
                            const rights = { role: p.role, grants: parseRights(p.perm_grants), denies: parseRights(p.perm_denies) };
                            return (
                              <label key={k} className="flex items-start gap-2 text-sm">
                                <input type="checkbox" name="perm" value={k} defaultChecked={can(rights, k)} className="mt-0.5 h-4 w-4 accent-maroon" />
                                <span>{PERM_LABELS[k] || k}{roleCan(p.role, k) && <span className="ml-1 text-[10px] text-stone-400">●</span>}</span>
                              </label>
                            );
                          })}
                        </div>
                        <p className="mt-1.5 text-xs text-stone-500">Managing people, the audit trail and backups stay with the Managing Partner.</p>
                        <input type="hidden" name="rights" value="1" />
                      </fieldset>
                    )}
                    <div className="flex items-end gap-2"><button className={btn.primary}>Save</button></div>
                  </form>
                  <form action={resetUser} className="mt-2"><input type="hidden" name="id" value={p.id} /><button className={btn.small}>Reset password and 2FA (new link)</button></form>
                </details>
              )}
            </div>
          ))}
        </Card>
        <div className="space-y-6">
          <Card title="Bringing someone in">
            <p className="text-sm text-stone-600">New colleagues create their own account at <strong>/portal/signup</strong>. With an invitation code their account is ready at once; without one it waits here for your approval.</p>
            <Link href="/portal/invitations" className={`${btn.primary} mt-4`}><KeyRound className="h-4 w-4" />Make an invitation code</Link>
            <p className="mt-3 text-xs text-stone-500">Partners, Senior Counsel and the Head of Litigation can also make codes, for roles with no more access than their own. Set designations when editing a person.</p>
          </Card>
          <Note tone="lock">Deactivating someone signs them out everywhere and revokes their Word connection at once. Their work, notes and history stay on record.</Note>
        </div>
      </div>
      <Card title="What each role can do by default" className="mt-6" pad={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wider text-stone-500"><th className="px-5 py-3">Permission</th>{Object.values(ROLES).map((r) => <th key={r.label} className="px-3 py-3 text-center">{r.label.split(" /")[0]}</th>)}</tr></thead>
            <tbody>
              {Object.entries(PERMISSIONS).map(([k, roles]) => (
                <tr key={k} className="border-t border-stone-100"><td className="px-5 py-2.5">{PERM_LABELS[k] || k}</td>{(Object.keys(ROLES) as Role[]).map((r) => <td key={r} className="px-3 py-2.5 text-center">{(roles as readonly string[]).includes(r) ? <span className="text-green">●</span> : <span className="text-stone-300">–</span>}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-5 pb-4 pt-2 text-xs text-stone-500">On top of these, lawyers and the litigation team open only the matters they are on, and nobody outside the team opens a walled-off matter.</p>
      </Card>
    </>
  );
}
