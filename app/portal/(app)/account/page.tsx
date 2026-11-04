import Link from "next/link";
import { cookies } from "next/headers";
import { KeyRound, Laptop, MessageSquare, ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/portal/auth";
import { one, q } from "@/lib/portal/db";
import { ROLES } from "@/lib/portal/permissions";
import { ago, fmtDateTime } from "@/lib/portal/format";
import { emailEnabled, smsEnabled } from "@/lib/portal/notify";
import { ActionForm, SubmitButton } from "@/components/portal/ActionForm";
import { Badge, Card, Check, Field, Flash, Note, PageHeader, Row, btn } from "@/components/portal/ui";
import { changePasswordAction, signOutOthersAction } from "../../auth-actions";
import { createWordToken, revokeToken, savePreferences, sendTestReminder } from "./actions";

export const metadata = { title: "Account" };

export default async function Account({ searchParams }: { searchParams: Promise<{ msg?: string; token?: string; test?: string }> }) {
  const u = await requireUser();
  const sp = await searchParams;
  const me = await one<{ phone: string | null; notify_email: boolean; notify_sms: boolean; last_login_at: string | null; password_changed_at: string | null }>("SELECT phone, notify_email, notify_sms, last_login_at, password_changed_at FROM users WHERE id = $1", [u.id]);
  const sessions = await q<{ token_hash: string; created_at: string; last_seen_at: string; ip: string | null; user_agent: string | null }>("SELECT token_hash, created_at, last_seen_at, ip, user_agent FROM sessions WHERE user_id = $1 AND expires_at > now() ORDER BY last_seen_at DESC", [u.id]);
  const tokens = await q<{ token_hash: string; name: string; created_at: string; expires_at: string; last_used_at: string | null }>("SELECT token_hash, name, created_at, expires_at, last_used_at FROM api_tokens WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now() ORDER BY created_at DESC", [u.id]);
  const jar = await cookies();
  const newToken = sp.token ? jar.get("ssa_new_token")?.value : undefined;

  return (
    <>
      <PageHeader title="Your account" sub={`${u.full_name} · ${ROLES[u.role].label} · ${u.email}`} />
      <Flash msg={sp.msg} />
      {sp.test && <div className="mb-5"><Note tone="ok">A test reminder was sent to the channels you have switched on. Check your email{me?.phone ? " and phone" : ""}.</Note></div>}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title={<span className="flex items-center gap-2"><MessageSquare className="h-4 w-4" />Reminders</span>}>
          <form action={savePreferences} className="space-y-4">
            <Field label="Mobile number (for SMS)" name="phone" defaultValue={me?.phone || ""} inputMode="tel" placeholder="0803 000 0000" />
            <Check name="notify_email" defaultChecked={me?.notify_email} label="Email me a morning summary: court, tasks and responses due" />
            <Check name="notify_sms" defaultChecked={me?.notify_sms} label="Text me when I'm in court today or tomorrow, or a deadline is due" />
            <div className="flex flex-wrap gap-2"><button className={btn.primary}>Save</button></div>
          </form>
          <form action={sendTestReminder} className="mt-3"><button className={btn.small}>Send me a test reminder now</button></form>
          <div className="mt-4 space-y-2">
            {!emailEnabled() && <Note tone="warn">Email sending is not set up on the server yet.</Note>}
            {!smsEnabled() && <Note tone="warn">SMS sending is not set up on the server yet.</Note>}
            <p className="text-xs text-stone-500">Texts never include client names or case details, only matter numbers, court and time, because SMS is not private.</p>
          </div>
        </Card>

        <Card title={<span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" />Security</span>}>
          <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
            Two-factor sign-in: {u.totp_enabled ? <Badge tone="green">On</Badge> : <><Badge tone="amber">Off</Badge><Link href="/portal/security/two-factor" className={btn.small}>Turn on</Link></>}
            <span className="text-stone-400">· Password changed {me?.password_changed_at ? ago(me.password_changed_at) : "—"}</span>
          </div>
          <ActionForm action={changePasswordAction} className="space-y-3">
            <Field label="Current password" name="current" type="password" required autoComplete="current-password" />
            <Field label="New password" name="password" type="password" required autoComplete="new-password" hint="At least 12 characters." />
            <Field label="Confirm new password" name="confirm" type="password" required autoComplete="new-password" />
            <SubmitButton className={btn.primary}>Change password</SubmitButton>
          </ActionForm>
        </Card>

        <Card title={<span className="flex items-center gap-2"><Laptop className="h-4 w-4" />Where you are signed in</span>} pad={false}>
          {sessions.map((s) => (
            <Row key={s.token_hash}>
              <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{(s.user_agent || "Unknown device").replace(/\(.*?\)/g, "").slice(0, 70)}</div><div className="text-xs text-stone-500">{s.ip || "—"} · active {ago(s.last_seen_at)}</div></div>
              {s.token_hash === u.token_hash && <Badge tone="green">This device</Badge>}
            </Row>
          ))}
          {sessions.length > 1 && <div className="p-5"><form action={signOutOthersAction}><button className={btn.danger}>Sign out everywhere else</button></form></div>}
        </Card>

        <Card title={<span id="word" className="flex items-center gap-2"><KeyRound className="h-4 w-4" />Save from Microsoft Word</span>}>
          <p className="mb-4 text-sm text-stone-600">Install the SOS&amp;A add-in in Word (see <Link href="/portal/word/setup" className="font-semibold text-maroon">Word setup</Link>), then paste a connection code into it. Saving from Word puts the document on the matter you choose, as a new recorded version.</p>
          {newToken && (
            <div className="mb-4 rounded-xl border-2 border-gold bg-gold/10 p-4">
              <div className="text-sm font-semibold text-maroon-dark">Your new connection code: copy it now, it is shown only once</div>
              <code className="mt-2 block select-all break-all rounded-lg bg-white p-3 font-mono text-sm">{newToken}</code>
            </div>
          )}
          <form action={createWordToken} className="flex flex-wrap items-end gap-2">
            <Field label="Name this computer" name="name" placeholder="e.g. Office desktop" className="min-w-[200px] flex-1" />
            <button className={btn.primary}>Create connection code</button>
          </form>
          {tokens.length > 0 && (
            <div className="mt-4 divide-y divide-stone-100 rounded-xl border border-stone-200">
              {tokens.map((t) => (
                <div key={t.token_hash} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <div className="min-w-0 flex-1"><div className="font-medium">{t.name}</div><div className="text-xs text-stone-500">Created {fmtDateTime(t.created_at)} · last used {t.last_used_at ? ago(t.last_used_at) : "never"} · expires {fmtDateTime(t.expires_at)}</div></div>
                  <form action={revokeToken}><input type="hidden" name="hash" value={t.token_hash} /><button className="text-xs font-semibold text-red-700 hover:underline">Revoke</button></form>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
