import { CheckCircle2, Database, Download, XCircle } from "lucide-react";
import { requirePermission } from "@/lib/portal/auth";
import { dbEngineName, one, q } from "@/lib/portal/db";
import { blobEnabled, directUploads, s3Enabled } from "@/lib/portal/storage";
import { emailEnabled } from "@/lib/portal/notify";
import { transcriptionEnabled } from "@/lib/portal/transcribe";
import { minutesEnabled } from "@/lib/portal/minutes";
import { intakeAddress, intakeEnabled } from "@/lib/portal/mail-intake";
import { fmtDateTime } from "@/lib/portal/format";
import { Badge, Card, Flash, Note, PageHeader, Row, btn } from "@/components/portal/ui";
import { indexStats } from "@/lib/portal/fulltext";
import { backupNow, readDocumentsNow, runRemindersNow } from "../actions";

export const metadata = { title: "System & backups" };

export default async function System({ searchParams }: { searchParams: Promise<{ ran?: string; msg?: string }> }) {
  await requirePermission("system.manage");
  const sp = await searchParams;
  const checks: [string, boolean, string][] = [
    ["Secret key (APP_SECRET)", !!process.env.APP_SECRET && process.env.APP_SECRET.length >= 32, "Encrypts files and two-factor secrets. Keep a copy somewhere safe: without it, stored files cannot be read."],
    ["Database", true, dbEngineName()],
    ["File storage", directUploads() || !process.env.VERCEL, s3Enabled() ? `S3-compatible bucket "${process.env.STORAGE_S3_BUCKET}" (files encrypted before upload; large uploads go straight to the bucket)` : blobEnabled() ? "Vercel Blob, private store (files encrypted before upload; large uploads go straight to the store)" : "This server's disk (PORTAL_DATA_DIR). Back it up nightly."],
    ["Email (Brevo)", emailEnabled(), "BREVO_API_KEY and NOTIFY_FROM_EMAIL. Sends sign-in codes to people without an authenticator app (PORTAL_EMAIL_CODE=off stops them), and plain reminders"],
    ["Daily reminders schedule (CRON_SECRET)", !!process.env.CRON_SECRET, "Call /portal/api/cron/reminders every morning"],
    ["Meeting transcription (Deepgram)", transcriptionEnabled(), "DEEPGRAM_API_KEY"],
    ["AI minutes, assistant and text recognition (Claude)", minutesEnabled(), "ANTHROPIC_API_KEY. Also reads scanned PDFs and photos for search (turn that off with PORTAL_OCR=off)"],
    ["Portal address (PORTAL_URL)", !!process.env.PORTAL_URL, "Used for links in reminders, calendars and the Word and Windows helpers"],
    ["Mail server defaults (MAIL_IMAP_HOST, MAIL_SMTP_HOST)", !!process.env.MAIL_IMAP_HOST && !!process.env.MAIL_SMTP_HOST, "So staff only type their address and password to connect their mailbox"],
    ["Email to the portal (PORTAL_INTAKE_*)", intakeEnabled(), intakeEnabled() ? `Send or forward to ${intakeAddress()}; check it every 5-15 minutes at /portal/api/cron/mail-intake` : "A mailbox such as portal@segunsipeolu.com that the portal empties into staff inboxes"],
  ];
  const counts = await one<Record<string, number>>(`SELECT
    (SELECT COUNT(*) FROM users WHERE active) AS people, (SELECT COUNT(*) FROM clients) AS clients, (SELECT COUNT(*) FROM matters) AS matters,
    (SELECT COUNT(*) FROM documents WHERE deleted_at IS NULL) AS documents, (SELECT COALESCE(SUM(size_bytes),0) FROM documents) AS bytes,
    (SELECT COUNT(*) FROM hearings) AS hearings, (SELECT COUNT(*) FROM service_register) AS service, (SELECT COUNT(*) FROM meetings) AS meetings,
    (SELECT COUNT(*) FROM audit_log) AS audit`);
  const runs = await q<{ run_date: string; ran_at: string; detail: string }>("SELECT run_date, ran_at, detail FROM job_runs WHERE job = 'reminders' ORDER BY run_date DESC LIMIT 7");
  const notes = await q<{ id: string; created_at: string; channel: string; kind: string; recipient: string; status: string; error: string | null; full_name: string }>(
    "SELECT n.id, n.created_at, n.channel, n.kind, n.recipient, n.status, n.error, u.full_name FROM notifications n JOIN users u ON u.id = n.user_id ORDER BY n.created_at DESC LIMIT 30");
  const ran = sp.ran?.split("-").map(Number);
  const [backups, errors, idx] = await Promise.all([
    q<{ id: string; created_at: string; size_bytes: number; rows: number; created_by: string }>("SELECT id, created_at, size_bytes, rows, created_by FROM backups ORDER BY created_at DESC LIMIT 10"),
    q<{ id: number; at: string; path: string | null; message: string; digest: string | null }>("SELECT id, at, path, message, digest FROM error_log ORDER BY at DESC LIMIT 15"),
    indexStats(),
  ]);

  return (
    <>
      <PageHeader title="System & backups" sub="Health, reminders and backups" actions={<a href="/portal/api/backup" className={btn.primary}><Download className="h-4 w-4" />Download a backup now</a>} />
      <Flash msg={sp.msg} />
      {ran && <div className="mb-5"><Note tone="ok">Reminders run: {ran[0]} emails sent{ran[1] ? `, ${ran[1]} failed (see the log below)` : ""}.</Note></div>}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Health" pad={false}>
          {checks.map(([k, ok, note]) => (
            <Row key={k}>{ok ? <CheckCircle2 className="h-5 w-5 flex-none text-green" /> : <XCircle className="h-5 w-5 flex-none text-amber-600" />}<div className="min-w-0 flex-1"><div className="text-sm font-medium">{k}</div><div className="text-xs text-stone-500">{note}</div></div><Badge tone={ok ? "green" : "amber"}>{ok ? "OK" : "Not set"}</Badge></Row>
          ))}
        </Card>
        <div className="space-y-6">
          <Card title="What is stored">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
              {counts && Object.entries({ People: counts.people, Clients: counts.clients, Matters: counts.matters, Documents: counts.documents, "Court sittings": counts.hearings, "Register entries": counts.service, Meetings: counts.meetings, "Audit entries": counts.audit, Storage: `${(Number(counts.bytes) / 1048576).toFixed(1)} MB` }).map(([k, v]) => (
                <div key={k}><dt className="text-xs text-stone-500">{k}</dt><dd className="font-serif text-xl text-maroon-dark">{typeof v === "number" ? v.toLocaleString() : v}</dd></div>
              ))}
            </dl>
          </Card>
          <Card title="Morning reminders">
            <form action={runRemindersNow}><button className={btn.ghost}>Send today&apos;s reminders now</button></form>
            <div className="mt-4 space-y-1 text-sm">{runs.length ? runs.map((r) => <div key={r.run_date} className="flex justify-between gap-3"><span>{fmtDateTime(r.ran_at)}</span><span className="text-stone-500">{Object.entries(JSON.parse(r.detail || "{}")).map(([k, v]) => `${k} ${v}`).join(" · ")}</span></div>) : <span className="text-stone-400">Not run yet.</span>}</div>
          </Card>
          <Card title="Backups (made every night, last 30 kept)" pad={false}>
            {backups.length === 0 ? <p className="p-5 text-sm text-stone-400">None yet. The morning job makes one each day.</p> : backups.map((b) => (
              <Row key={b.id}><div className="min-w-0 flex-1"><div className="text-sm">{fmtDateTime(b.created_at)}</div><div className="text-xs text-stone-500">{b.rows.toLocaleString()} records · {(Number(b.size_bytes) / 1024).toFixed(0)} KB · {b.created_by}</div></div><a href={`/portal/api/backup?id=${b.id}`} className={btn.small}><Download className="h-3.5 w-3.5" />Download</a></Row>
            ))}
            <div className="border-t border-stone-100 p-5"><form action={backupNow}><button className={btn.ghost}>Make a backup now</button></form></div>
          </Card>
          <Card title="Search: reading documents">
            <p className="text-sm text-stone-600">{idx.read.toLocaleString()} read · {idx.waiting.toLocaleString()} waiting · {idx.empty + idx.unsupported} with no readable text · {idx.failed} failed</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <form action={readDocumentsNow}><button className={btn.small}>Read waiting documents now</button></form>
              {idx.failed + idx.empty + idx.unsupported > 0 && <form action={readDocumentsNow}><input type="hidden" name="retry" value="failed" /><button className={btn.small}>Try the unreadable ones again</button></form>}
            </div>
            <p className="mt-2 text-xs text-stone-500">New files are read automatically within minutes. Scanned PDFs and photos are read by text recognition when Claude is switched on.</p>
          </Card>
          <Note tone="lock"><Database className="mb-1 inline h-4 w-4" /> Backups hold every record (not the files) and are encrypted with APP_SECRET where they are stored. A downloaded backup is not encrypted: keep it somewhere safe. Files are stored separately{directUploads() ? " in cloud storage" : " in the data folder on the server: back that up too"}, together with APP_SECRET.</Note>
        </div>
      </div>
      <Card title="Errors (last 90 days)" className="mt-6" pad={false}>
        {errors.length === 0 ? <p className="p-5 text-sm text-green">No errors recorded.</p> : errors.map((e) => (
          <Row key={e.id}><XCircle className="h-4 w-4 flex-none text-red-600" /><div className="min-w-0 flex-1"><div className="truncate text-sm">{e.message}</div><div className="truncate text-xs text-stone-500">{fmtDateTime(e.at)} · {e.path || "—"}{e.digest ? ` · ref ${e.digest}` : ""}</div></div></Row>
        ))}
      </Card>
      <Card title="Recent messages sent" className="mt-6" pad={false}>
        {notes.length === 0 ? <p className="p-5 text-sm text-stone-400">No reminders sent yet.</p> : notes.map((n) => (
          <Row key={n.id}><Badge tone="blue">EMAIL</Badge><div className="min-w-0 flex-1"><div className="truncate text-sm">{n.full_name} · {n.kind} · {n.recipient}</div><div className="truncate text-xs text-stone-500">{fmtDateTime(n.created_at)}{n.error ? ` · ${n.error}` : ""}</div></div><Badge tone={n.status === "sent" ? "green" : "red"}>{n.status}</Badge></Row>
        ))}
      </Card>
    </>
  );
}
