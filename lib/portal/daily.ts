import "server-only";
import { one, q } from "./db";
import { audit } from "./audit";
import { runReminders, portalUrl } from "./reminders";
import { saveBackup } from "./backup";
import { indexPending } from "./fulltext";
import { purgeExpired, scanAllForDuplicates } from "./dedupe";
import { notify, emailLayout } from "./notify";
import { naira } from "./money";
import { today } from "./format";

/**
 * Everything the morning job does, in order: reminders to everyone, the
 * nightly backup, catching up on reading documents for search, and (on
 * Mondays) telling each partner which of their invoices are overdue.
 * Each step is independent: one failing does not stop the others.
 */
export async function runDaily() {
  const day = today();
  const out: Record<string, unknown> = {};
  // Reminder counts stay at the top level (people, emails, failed), as before
  try { Object.assign(out, await runReminders({ day })); } catch (e) { out.reminders = `failed: ${(e as Error).message}`; }

  try {
    const done = await one("SELECT 1 FROM job_runs WHERE job = 'backup' AND run_date = $1", [day]);
    if (!done) {
      const b = await saveBackup("system:nightly");
      await q("INSERT INTO job_runs (job, run_date, detail) VALUES ('backup', $1, $2) ON CONFLICT (job, run_date) DO NOTHING", [day, JSON.stringify(b)]);
      await audit({ actor: "system:backup", action: "system.backup_made", detail: b });
      out.backup = b;
    } else out.backup = "already done today";
  } catch (e) { out.backup = `failed: ${(e as Error).message}`; }

  try { out.documents_read = await indexPending(40, 90_000); } catch (e) { out.documents_read = `failed: ${(e as Error).message}`; }
  try { out.deleted_erased = await purgeExpired(); } catch (e) { out.deleted_erased = `failed: ${(e as Error).message}`; }
  try { out.duplicates = await scanAllForDuplicates(); } catch (e) { out.duplicates = `failed: ${(e as Error).message}`; }

  if (new Date(`${day}T12:00:00Z`).getUTCDay() === 1) {
    try {
      const rows = await q<{ partner: string; email: string; full_name: string; phone: string | null; notify_email: boolean; number: string; client: string; due: number; due_on: string; id: string }>(
        `SELECT u.id AS partner, u.email, u.full_name, u.phone, u.notify_email, i.number, c.name AS client, (i.total_kobo - i.paid_kobo) AS due, i.due_on::text AS due_on, i.id
         FROM invoices i JOIN matters m ON m.id = i.matter_id JOIN clients c ON c.id = i.client_id JOIN users u ON u.id = m.responsible_partner
         WHERE i.status IN ('issued','part_paid') AND i.due_on < CURRENT_DATE AND u.active ORDER BY i.due_on`);
      const byPartner = new Map<string, typeof rows>();
      for (const r of rows) byPartner.set(r.partner, [...(byPartner.get(r.partner) || []), r]);
      for (const [, list] of byPartner) {
        const p = list[0];
        const total = list.reduce((s, r) => s + Number(r.due), 0);
        const href = `${portalUrl()}/billing?tab=invoices&status=overdue`;
        await notify({ id: p.partner, email: p.email, full_name: p.full_name, phone: p.phone, notify_email: p.notify_email }, {
          kind: "overdue_invoices", key: `overdue_invoices:${day}`, subject: `${list.length} overdue invoice${list.length === 1 ? "" : "s"}: ${naira(total)}`,
          html: emailLayout("Overdue invoices on your matters", [{ heading: "Overdue", items: list.slice(0, 30).map((r) => ({ title: `${r.number} · ${r.client}`, detail: `${naira(r.due)} due since ${r.due_on}`, href: `${portalUrl()}/billing/invoices/${r.id}` })) }], "A short reminder to the client, or a call, usually does it. You can email a reminder from each invoice.", href),
          text: `${list.length} overdue invoices on your matters, ${naira(total)} in all. ${href}`,
        });
      }
      out.overdue_partners = byPartner.size;
    } catch (e) { out.overdue = `failed: ${(e as Error).message}`; }
  }
  return out;
}
