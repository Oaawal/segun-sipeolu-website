import Link from "next/link";
import { cookies, headers } from "next/headers";
import { CalendarDays, KeyRound, Laptop, MessageSquare, Monitor, ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/portal/auth";
import { one, q } from "@/lib/portal/db";
import { ROLES } from "@/lib/portal/permissions";
import { ago, fmtDateTime } from "@/lib/portal/format";
import { emailEnabled, smsEnabled } from "@/lib/portal/notify";
import { ActionForm, SubmitButton } from "@/components/portal/ActionForm";
import { Badge, Card, Check, Field, Flash, Note, PageHeader, Row, btn } from "@/components/portal/ui";
import { changePasswordAction, signOutOthersAction } from "../../auth-actions";
import { createWordToken, resetCalendar, revokeToken, savePreferences, sendTestReminder, setCalendarDetail, stopCalendar } from "./actions";
import { ASSET_KINDS } from "@/lib/portal/vocab";

export const metadata = { title: "Account" };

export default async function Account({ searchParams }: { searchParams: Promise<{ msg?: string; token?: string; test?: string; calendar?: string }> }) {
  const u = await requireUser();
  const sp = await searchParams;
  const me = await one<{ phone: string | null; notify_email: boolean; notify_sms: boolean; last_login_at: string | null; password_changed_at: string | null }>("SELECT phone, notify_email, notify_sms, last_login_at, password_changed_at FROM users WHERE id = $1", [u.id]);
  const sessions = await q<{ token_hash: string; created_at: string; last_seen_at: string; ip: string | null; user_agent: string | null }>("SELECT token_hash, created_at, last_seen_at, ip, user_agent FROM sessions WHERE user_id = $1 AND expires_at > now() ORDER BY last_seen_at DESC", [u.id]);
  const tokens = await q<{ token_hash: string; name: string; created_at: string; expires_at: string; last_used_at: string | null }>("SELECT token_hash, name, created_at, expires_at, last_used_at FROM api_tokens WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now() ORDER BY created_at DESC", [u.id]);
  const jar = await cookies();
  const newToken = sp.token ? jar.get("ssa_new_token")?.value : undefined;
  const newCal = sp.calendar ? jar.get("ssa_new_calendar")?.value : undefined;
  const feed = await one<{ detail: string; created_at: string; last_used_at: string | null }>("SELECT detail, created_at, last_used_at FROM calendar_feeds WHERE user_id = $1", [u.id]);
  const h = await headers();
  const origin = process.env.PORTAL_URL?.replace(/\/$/, "") || `${h.get("x-forwarded-proto") || "http"}://${h.get("host")}`;
  const calUrl = newCal ? `${origin}/portal/calendar/${newCal}.ics` : null;
  const mine = await q<{ id: string; name: string; kind: keyof typeof ASSET_KINDS; serial: string | null }>("SELECT id, name, kind, serial FROM assets WHERE assigned_to = $1 AND status != 'retired' ORDER BY name", [u.id]);
  const myAccess = await q<{ name: string; level: string }>("SELECT s.name, a.level FROM system_access a JOIN systems s ON s.id = a.system_id WHERE a.user_id = $1 AND a.revoked_on IS NULL ORDER BY s.name", [u.id]);

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


        <Card title={<span id="calendar" className="flex items-center gap-2"><CalendarDays className="h-4 w-4" />Calendar on your phone</span>}>
          <p className="mb-4 text-sm text-stone-600">Your court dates, deadlines, tasks, responses due and filings, in Google Calendar, Outlook or your iPhone, updated every hour.</p>
          {calUrl && (
            <div className="mb-4 rounded-xl border-2 border-gold bg-gold/10 p-4">
              <div className="text-sm font-semibold text-maroon-dark">Your private calendar address: copy it now, it is shown only once</div>
              <code className="mt-2 block select-all break-all rounded-lg bg-white p-3 font-mono text-xs">{calUrl}</code>
              <div className="mt-3 flex flex-wrap gap-2">
                <a href={calUrl.replace(/^https?:/, "webcal:")} className={btn.small}>Open in iPhone / Mac Calendar</a>
                <a href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(calUrl.replace(/^https?:/, "webcal:"))}`} target="_blank" rel="noopener" className={btn.small}>Add to Google Calendar</a>
              </div>
              <p className="mt-2 text-xs text-stone-600">Outlook: Add calendar → Subscribe from web → paste the address. Google only reaches the address once the portal is on the internet.</p>
            </div>
          )}
          {feed ? (
            <>
              <div className="mb-3 text-sm text-stone-600">Connected {fmtDateTime(feed.created_at)} · last read by your calendar {feed.last_used_at ? ago(feed.last_used_at) : "not yet"}</div>
              <form action={setCalendarDetail} className="flex flex-wrap items-end gap-2">
                <label className="min-w-[200px] flex-1 text-sm"><span className="mb-1.5 block text-[13px] font-semibold text-stone-700">Detail shown in the calendar</span>
                  <select name="detail" defaultValue={feed.detail} className="w-full rounded-lg border border-stone-300 px-3 py-2.5"><option value="minimal">Matter numbers only (recommended)</option><option value="full">Matter titles and task names</option></select></label>
                <button className={btn.small}>Save</button>
              </form>
              <div className="mt-3 flex flex-wrap gap-2">
                <form action={resetCalendar}><input type="hidden" name="detail" value={feed.detail} /><button className={btn.small}>New address (stops the old one)</button></form>
                <form action={stopCalendar}><button className="text-xs font-semibold text-red-700 hover:underline">Turn off</button></form>
              </div>
            </>
          ) : (
            <form action={resetCalendar}><input type="hidden" name="detail" value="minimal" /><button className={btn.primary}><CalendarDays className="h-4 w-4" />Create my calendar address</button></form>
          )}
          <p className="mt-3 text-xs text-stone-500">Calendar companies keep a copy of what they show, so by default events carry matter numbers, courts and times, not client names.</p>
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

        <Card title={<span id="codes" className="flex items-center gap-2"><KeyRound className="h-4 w-4" />Connection codes (Word and Windows)</span>}>
          <p className="mb-4 text-sm text-stone-600">A connection code lets the <Link href="/portal/word/setup" className="font-semibold text-maroon">Word add-in</Link> and the <Link href="/portal/connect#windows" className="font-semibold text-maroon">Windows helper</Link> save files for you, without your password. Create one per computer; revoke it if the computer is lost or replaced.</p>
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

        <Card title={<span className="flex items-center gap-2"><Monitor className="h-4 w-4" />Equipment and access in your name</span>}>
          {mine.length === 0 && myAccess.length === 0 ? <p className="text-sm text-stone-400">Nothing recorded.</p> : (
            <ul className="space-y-1.5 text-sm">
              {mine.map((a) => <li key={a.id}>{a.name} <span className="text-stone-500">· {ASSET_KINDS[a.kind]}{a.serial ? ` · ${a.serial}` : ""}</span></li>)}
              {myAccess.map((a) => <li key={a.name}>{a.name} <span className="text-stone-500">· {a.level} access</span></li>)}
            </ul>
          )}
          <p className="mt-3 text-xs text-stone-500">If anything here is wrong, tell the Managing Partner.</p>
        </Card>
      </div>
    </>
  );
}
