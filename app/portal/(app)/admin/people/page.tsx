import { cookies, headers } from "next/headers";
import { UserPlus } from "lucide-react";
import { requirePermission } from "@/lib/portal/auth";
import { q } from "@/lib/portal/db";
import { ROLES, PERMISSIONS, type Role } from "@/lib/portal/permissions";
import { ago } from "@/lib/portal/format";
import { Avatar, Badge, Card, Field, Flash, Note, PageHeader, Select, btn } from "@/components/portal/ui";
import { inviteUser, resetUser, updateUser } from "../actions";

export const metadata = { title: "People & access" };

const PERM_LABELS: Record<string, string> = {
  "users.manage": "Manage people and access", "audit.view": "Audit trail", "system.manage": "Backups and system",
  "matters.view_all": "See all matters (not walled-off ones)", "matters.create": "Open matters", "matters.manage_team": "Manage matter teams",
  "matters.set_confidential": "Place ethical walls", "clients.view": "Client contact details", "clients.create": "Add clients", "clients.edit": "Edit clients",
  "conflicts.check": "Conflict checks", "diary.view_all": "Firm-wide court diary", "diary.edit": "Add court dates and results",
  "service.view_all": "Firm-wide service register", "service.log_inward": "Log documents served on us", "service.edit": "Record service by us",
  "tasks.assign_others": "Give tasks to others", "meetings.use": "Meetings, transcripts and AI minutes",
};

export default async function People({ searchParams }: { searchParams: Promise<{ msg?: string; link?: string }> }) {
  const me = await requirePermission("users.manage");
  const sp = await searchParams;
  const people = await q<{ id: string; email: string; full_name: string; role: Role; title: string | null; phone: string | null; active: boolean; totp_enabled: boolean; last_login_at: string | null; password_hash: string | null; locked_until: string | null }>(
    "SELECT id, email, full_name, role, title, phone, active, totp_enabled, last_login_at, password_hash, locked_until FROM users ORDER BY active DESC, full_name",
  );
  const raw = sp.link ? (await cookies()).get("ssa_new_link")?.value : undefined;
  const h = await headers();
  const origin = process.env.PORTAL_URL?.replace(/\/$/, "") || `${h.get("x-forwarded-proto") || "http"}://${h.get("host")}`;
  const link = raw ? { user: people.find((p) => p.id === raw.split(":")[0]), url: `${origin}/portal/invite/${raw.split(":")[1]}` } : null;

  return (
    <>
      <PageHeader title="People & access" sub="Who can sign in, and what each role can do" />
      <Flash msg={sp.msg} />
      {link?.user && (
        <div className="mb-6 rounded-2xl border-2 border-gold bg-gold/10 p-5">
          <div className="font-semibold text-maroon-dark">Sign-in link for {link.user.full_name}</div>
          <p className="mt-1 text-sm text-stone-700">Send this to {link.user.email} privately (WhatsApp or email). It works once and expires in 72 hours. It is shown only now.</p>
          <code className="mt-3 block select-all break-all rounded-lg bg-white p-3 font-mono text-sm">{link.url}</code>
        </div>
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
                  {!p.active ? <Badge>Deactivated</Badge> : !p.password_hash ? <Badge tone="amber">Invited</Badge> : p.totp_enabled ? <Badge tone="green">2FA on</Badge> : <Badge tone="amber">No 2FA</Badge>}
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
                    <Select label="Role" name="role" options={Object.entries(ROLES).map(([k, v]) => [k, v.label])} defaultValue={p.role} />
                    <Select label="Access" name="active" options={[["1", "Can sign in"], ["0", "Deactivated"]]} defaultValue={p.active ? "1" : "0"} />
                    <div className="flex items-end gap-2"><button className={btn.primary}>Save</button></div>
                  </form>
                  <form action={resetUser} className="mt-2"><input type="hidden" name="id" value={p.id} /><button className={btn.small}>Reset password and 2FA (new sign-in link)</button></form>
                </details>
              )}
            </div>
          ))}
        </Card>
        <div className="space-y-6">
          <Card title="Invite someone">
            <form action={inviteUser} className="space-y-3">
              <Field label="Full name" name="full_name" required />
              <Field label="Work email" name="email" type="email" required />
              <Field label="Title" name="title" placeholder="e.g. Associate, Litigation clerk" />
              <Field label="Mobile (for SMS reminders)" name="phone" inputMode="tel" />
              <Select label="Role" name="role" options={Object.entries(ROLES).map(([k, v]) => [k, v.label])} defaultValue="lawyer" />
              <button className={btn.primary}><UserPlus className="h-4 w-4" />Create sign-in link</button>
            </form>
          </Card>
          <Note tone="lock">Deactivating someone signs them out everywhere and revokes their Word connection at once. Their work, notes and history stay on record.</Note>
        </div>
      </div>
      <Card title="What each role can do" className="mt-6" pad={false}>
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
