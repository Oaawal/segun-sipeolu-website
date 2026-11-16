import "server-only";
import { one, q, nextNumber, type Queryable } from "./db";
import { can, canSeeMatter, matterAccessSql, type Actor } from "./permissions";
import { randomToken } from "./crypto";
import { addDays, today } from "./format";
import { feeFor, vatOn, VAT_BP } from "./money";

/**
 * Billing: time and disbursements recorded against matters become lines on a
 * draft invoice; a partner issues it (it gets its number then), records
 * payments against it (or the client pays online with Paystack), and the
 * reports show work in progress, what is owed and for how long.
 */

// ── Firm billing settings (admin) ────────────────────────────────
export const BILLING_SETTINGS = {
  "billing.bank": "Bank details printed on invoices (bank, account name, account number)",
  "billing.terms_days": "Days to pay",
  "billing.tin": "Firm's TIN / VAT number",
  "billing.footer": "Note at the foot of every invoice",
  "billing.vat_registered": "Charge VAT (yes/no)",
} as const;
export type BillingSettingKey = keyof typeof BILLING_SETTINGS;

export async function billingSettings(): Promise<Record<BillingSettingKey, string>> {
  const rows = await q<{ key: string; value: string }>("SELECT key, value FROM settings WHERE key LIKE 'billing.%'");
  const out = { "billing.bank": "", "billing.terms_days": "14", "billing.tin": "", "billing.footer": "", "billing.vat_registered": "yes" } as Record<BillingSettingKey, string>;
  for (const r of rows) if (r.key in out) out[r.key as BillingSettingKey] = r.value;
  return out;
}

// ── Access ───────────────────────────────────────────────────────
/** Matter facts plus whether this person may open it. */
export async function billingMatter(u: Actor, matterId: string) {
  const m = await one<{ id: string; number: string; title: string; client_id: string; client_name: string; confidential: boolean; is_member: boolean; billing_type: string; agreed_fee_kobo: number | null; status: string; responsible_partner: string | null }>(
    `SELECT m.id, m.number, m.title, m.client_id, c.name AS client_name, m.confidential, m.billing_type, m.agreed_fee_kobo, m.status, m.responsible_partner,
            EXISTS (SELECT 1 FROM matter_members mm WHERE mm.matter_id = m.id AND mm.user_id = $2) AS is_member
     FROM matters m JOIN clients c ON c.id = m.client_id WHERE m.id = $1`,
    [matterId, u.id],
  );
  if (!m || !canSeeMatter(u, { confidential: m.confidential, isMember: m.is_member })) return null;
  return m;
}

export interface InvoiceRow {
  id: string; number: string | null; matter_id: string; client_id: string; status: string; issued_on: string | null; due_on: string | null;
  vat_rate_bp: number; subtotal_kobo: number; vat_kobo: number; total_kobo: number; paid_kobo: number; notes: string | null; pay_token: string | null;
  created_at: string; matter_number: string; matter_title: string; client_name: string; client_email: string | null; client_address: string | null;
  billing_email: string | null; confidential: boolean; is_member: boolean; created_by_name: string | null; void_reason: string | null;
}

const INVOICE_SELECT = `SELECT i.*, m.number AS matter_number, m.title AS matter_title, m.confidential, c.name AS client_name, c.email AS client_email,
    c.address AS client_address, c.billing_email, cu.full_name AS created_by_name,
    EXISTS (SELECT 1 FROM matter_members mm WHERE mm.matter_id = m.id AND mm.user_id = $2) AS is_member
  FROM invoices i JOIN matters m ON m.id = i.matter_id JOIN clients c ON c.id = i.client_id LEFT JOIN users cu ON cu.id = i.created_by`;

/** An invoice this person may see: they can open the matter and their role works with bills. */
export async function loadInvoice(u: Actor, id: string): Promise<InvoiceRow | null> {
  if (!can(u, "billing.draft")) return null;
  const inv = await one<InvoiceRow>(`${INVOICE_SELECT} WHERE i.id = $1`, [id, u.id]);
  if (!inv || !canSeeMatter(u, { confidential: inv.confidential, isMember: inv.is_member })) return null;
  return inv;
}

export async function invoiceLines(invoiceId: string) {
  return q<{ id: string; kind: string; description: string; quantity: string; unit_kobo: number; amount_kobo: number; vatable: boolean }>(
    "SELECT id, kind, description, quantity, unit_kobo, amount_kobo, vatable FROM invoice_lines WHERE invoice_id = $1 ORDER BY position", [invoiceId]);
}

export async function invoicePayments(invoiceId: string) {
  return q<{ id: string; received_on: string; amount_kobo: number; method: string; reference: string | null; reversed_at: string | null; created_by_name: string | null }>(
    "SELECT p.id, p.received_on, p.amount_kobo, p.method, p.reference, p.reversed_at, u.full_name AS created_by_name FROM payments p LEFT JOIN users u ON u.id = p.created_by WHERE p.invoice_id = $1 ORDER BY p.received_on, p.created_at", [invoiceId]);
}

export async function listInvoices(u: Actor, opts: { status?: string; matterId?: string; clientId?: string } = {}) {
  if (!can(u, "billing.draft")) return [];
  const params: unknown[] = [u.id];
  const where = [matterAccessSql(u)];
  if (opts.status === "unpaid") where.push("i.status IN ('issued','part_paid')");
  else if (opts.status === "overdue") where.push("i.status IN ('issued','part_paid') AND i.due_on < CURRENT_DATE");
  else if (opts.status && opts.status !== "all") { params.push(opts.status); where.push(`i.status = $${params.length}`); }
  if (opts.matterId) { params.push(opts.matterId); where.push(`i.matter_id = $${params.length}`); }
  if (opts.clientId) { params.push(opts.clientId); where.push(`i.client_id = $${params.length}`); }
  return q<InvoiceRow>(
    `SELECT i.*, m.number AS matter_number, m.title AS matter_title, c.name AS client_name
     FROM invoices i JOIN matters m ON m.id = i.matter_id JOIN clients c ON c.id = i.client_id
     WHERE ${where.join(" AND ")} ORDER BY COALESCE(i.issued_on, i.created_at::date) DESC, i.created_at DESC LIMIT 300`,
    params,
  );
}

// ── Time and disbursements ───────────────────────────────────────
export interface TimeRow { id: string; matter_id: string; user_id: string; worked_on: string; minutes: number; description: string; rate_kobo: number; billable: boolean; invoice_id: string | null; full_name: string; matter_number?: string; matter_title?: string }

export async function matterTime(matterId: string) {
  return q<TimeRow>(
    "SELECT t.*, u.full_name FROM time_entries t JOIN users u ON u.id = t.user_id WHERE t.matter_id = $1 AND t.deleted_at IS NULL ORDER BY t.worked_on DESC, t.created_at DESC",
    [matterId]);
}

export async function matterExpenses(matterId: string) {
  return q<{ id: string; incurred_on: string; kind: string; description: string; amount_kobo: number; billable: boolean; invoice_id: string | null; created_by: string; full_name: string | null }>(
    "SELECT e.*, u.full_name FROM expenses e LEFT JOIN users u ON u.id = e.created_by WHERE e.matter_id = $1 AND e.deleted_at IS NULL ORDER BY e.incurred_on DESC",
    [matterId]);
}

/** A person's own time, newest first. */
export async function myTime(u: Actor, from: string, to: string) {
  return q<TimeRow>(
    `SELECT t.*, u.full_name, m.number AS matter_number, m.title AS matter_title FROM time_entries t JOIN users u ON u.id = t.user_id JOIN matters m ON m.id = t.matter_id
     WHERE t.user_id = $1 AND t.deleted_at IS NULL AND t.worked_on BETWEEN $2 AND $3 ORDER BY t.worked_on DESC, t.created_at DESC`,
    [u.id, from, to]);
}

export async function runningTimer(userId: string) {
  return one<{ matter_id: string; description: string | null; started_at: string; number: string; title: string }>(
    "SELECT t.matter_id, t.description, t.started_at, m.number, m.title FROM timers t JOIN matters m ON m.id = t.matter_id WHERE t.user_id = $1", [userId]);
}

/** Work in progress for a matter: billable, not yet on an invoice. */
export async function matterWip(matterId: string) {
  return one<{ minutes: number; fees: number; expenses: number }>(
    `SELECT COALESCE((SELECT SUM(minutes) FROM time_entries WHERE matter_id = $1 AND billable AND invoice_id IS NULL AND deleted_at IS NULL), 0)::int AS minutes,
            COALESCE((SELECT SUM(ROUND(minutes * rate_kobo / 60.0)) FROM time_entries WHERE matter_id = $1 AND billable AND invoice_id IS NULL AND deleted_at IS NULL), 0)::bigint AS fees,
            COALESCE((SELECT SUM(amount_kobo) FROM expenses WHERE matter_id = $1 AND billable AND invoice_id IS NULL AND deleted_at IS NULL), 0)::bigint AS expenses`,
    [matterId]);
}

// ── Invoices ─────────────────────────────────────────────────────
/** Re-add the lines and put the totals on the invoice. */
export async function recalcInvoice(t: Queryable, invoiceId: string) {
  const inv = (await t.query<{ vat_rate_bp: number }>("SELECT vat_rate_bp FROM invoices WHERE id = $1", [invoiceId])).rows[0];
  const lines = (await t.query<{ amount_kobo: number; vatable: boolean }>("SELECT amount_kobo, vatable FROM invoice_lines WHERE invoice_id = $1", [invoiceId])).rows;
  const subtotal = lines.reduce((s, l) => s + Number(l.amount_kobo), 0);
  const vat = vatOn(lines.filter((l) => l.vatable).reduce((s, l) => s + Number(l.amount_kobo), 0), inv.vat_rate_bp);
  await t.query("UPDATE invoices SET subtotal_kobo = $2, vat_kobo = $3, total_kobo = $4 WHERE id = $1", [invoiceId, subtotal, vat, subtotal + vat]);
}

/**
 * A draft invoice for a matter from its unbilled time and disbursements up
 * to a date, plus an optional fixed fee. Entries are linked to the draft so
 * they cannot be billed twice; deleting the draft releases them.
 */
export async function createDraftInvoice(t: Queryable, u: Actor, m: { id: string; client_id: string; agreed_fee_kobo: number | null }, opts: { upTo: string; includeTime: boolean; includeExpenses: boolean; feeKobo?: number | null; feeText?: string | null; notes?: string | null }) {
  const settings = await billingSettings();
  const id = crypto.randomUUID();
  await t.query("INSERT INTO invoices (id, matter_id, client_id, vat_rate_bp, notes, created_by) VALUES ($1,$2,$3,$4,$5,$6)",
    [id, m.id, m.client_id, settings["billing.vat_registered"] === "no" ? 0 : VAT_BP, opts.notes ?? null, u.id]);
  let pos = 0;
  const line = (kind: string, description: string, quantity: number, unit: number, amount: number, vatable: boolean, source: string | null) =>
    t.query("INSERT INTO invoice_lines (id, invoice_id, position, kind, description, quantity, unit_kobo, amount_kobo, vatable, source_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [crypto.randomUUID(), id, pos++, kind, description, quantity, unit, amount, vatable, source]);

  if (opts.feeKobo && opts.feeKobo > 0) await line("fee", opts.feeText || "Professional fees as agreed", 1, opts.feeKobo, opts.feeKobo, true, null);
  if (opts.includeTime) {
    const rows = (await t.query<{ id: string; worked_on: string; minutes: number; rate_kobo: number; description: string; full_name: string }>(
      `SELECT t.id, t.worked_on, t.minutes, t.rate_kobo, t.description, u.full_name FROM time_entries t JOIN users u ON u.id = t.user_id
       WHERE t.matter_id = $1 AND t.billable AND t.invoice_id IS NULL AND t.deleted_at IS NULL AND t.worked_on <= $2 ORDER BY t.worked_on, t.created_at FOR UPDATE OF t`,
      [m.id, opts.upTo])).rows;
    for (const r of rows) {
      await line("time", `${String(r.worked_on).slice(0, 10)} · ${r.full_name}: ${r.description}`, Math.round((r.minutes / 60) * 100) / 100, Number(r.rate_kobo), feeFor(r.minutes, Number(r.rate_kobo)), true, r.id);
      await t.query("UPDATE time_entries SET invoice_id = $2 WHERE id = $1", [r.id, id]);
    }
  }
  if (opts.includeExpenses) {
    const rows = (await t.query<{ id: string; incurred_on: string; description: string; amount_kobo: number }>(
      "SELECT id, incurred_on, description, amount_kobo FROM expenses WHERE matter_id = $1 AND billable AND invoice_id IS NULL AND deleted_at IS NULL AND incurred_on <= $2 ORDER BY incurred_on FOR UPDATE",
      [m.id, opts.upTo])).rows;
    for (const r of rows) {
      // Disbursements are passed on at cost, outside VAT
      await line("expense", `${String(r.incurred_on).slice(0, 10)} · ${r.description}`, 1, Number(r.amount_kobo), Number(r.amount_kobo), false, r.id);
      await t.query("UPDATE expenses SET invoice_id = $2 WHERE id = $1", [r.id, id]);
    }
  }
  await recalcInvoice(t, id);
  return id;
}

export async function releaseInvoiceEntries(t: Queryable, invoiceId: string) {
  await t.query("UPDATE time_entries SET invoice_id = NULL WHERE invoice_id = $1", [invoiceId]);
  await t.query("UPDATE expenses SET invoice_id = NULL WHERE invoice_id = $1", [invoiceId]);
}

export async function issueInvoice(t: Queryable, invoiceId: string, userId: string, dueDays?: number) {
  const settings = await billingSettings();
  const days = dueDays ?? (Number(settings["billing.terms_days"]) || 14);
  const number = await nextNumber(t, "SSA/INV");
  const issued = today();
  await t.query("UPDATE invoices SET status = 'issued', number = $2, issued_on = $3, due_on = $4, pay_token = $5, issued_by = $6 WHERE id = $1 AND status = 'draft'",
    [invoiceId, number, issued, addDays(issued, days), randomToken(24), userId]);
  return number;
}

/** Record money received and move the invoice to part paid / paid. */
export async function applyPayment(t: Queryable, invoiceId: string, p: { amountKobo: number; receivedOn: string; method: string; reference?: string | null; providerRef?: string | null; userId?: string | null }) {
  const id = crypto.randomUUID();
  await t.query("INSERT INTO payments (id, invoice_id, received_on, amount_kobo, method, reference, provider_ref, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
    [id, invoiceId, p.receivedOn, p.amountKobo, p.method, p.reference ?? null, p.providerRef ?? null, p.userId ?? null]);
  await refreshPaid(t, invoiceId);
  return id;
}

export async function refreshPaid(t: Queryable, invoiceId: string) {
  await t.query(
    `UPDATE invoices SET paid_kobo = s.paid,
       status = CASE WHEN status IN ('draft','void') THEN status WHEN s.paid >= total_kobo THEN 'paid' WHEN s.paid > 0 THEN 'part_paid' ELSE 'issued' END
     FROM (SELECT COALESCE(SUM(amount_kobo), 0) AS paid FROM payments WHERE invoice_id = $1 AND reversed_at IS NULL) s WHERE id = $1`,
    [invoiceId]);
}

// ── Client account (money held for clients) ─────────────────────
export async function clientAccountBalance(clientId: string, matterId?: string | null) {
  const r = await one<{ bal: number }>(
    `SELECT COALESCE(SUM(amount_kobo), 0)::bigint AS bal FROM client_ledger WHERE client_id = $1 ${matterId ? "AND matter_id = $2" : ""}`,
    matterId ? [clientId, matterId] : [clientId]);
  return Number(r?.bal || 0);
}

export async function clientLedger(clientId: string) {
  return q<{ id: string; entry_on: string; kind: string; amount_kobo: number; description: string; reference: string | null; matter_number: string | null; full_name: string | null; created_at: string }>(
    `SELECT l.id, l.entry_on, l.kind, l.amount_kobo, l.description, l.reference, m.number AS matter_number, u.full_name, l.created_at
     FROM client_ledger l LEFT JOIN matters m ON m.id = l.matter_id LEFT JOIN users u ON u.id = l.created_by WHERE l.client_id = $1 ORDER BY l.entry_on, l.created_at`,
    [clientId]);
}

// ── Firm-wide figures (partners) ─────────────────────────────────
export async function agedDebt(u: Actor) {
  return q<{ client_id: string; client_name: string; partner_name: string | null; b0: number; b30: number; b60: number; b90: number; total: number }>(
    `SELECT c.id AS client_id, c.name AS client_name, MAX(p.full_name) AS partner_name,
       SUM(CASE WHEN CURRENT_DATE - i.issued_on <= 30 THEN i.total_kobo - i.paid_kobo ELSE 0 END)::bigint AS b0,
       SUM(CASE WHEN CURRENT_DATE - i.issued_on BETWEEN 31 AND 60 THEN i.total_kobo - i.paid_kobo ELSE 0 END)::bigint AS b30,
       SUM(CASE WHEN CURRENT_DATE - i.issued_on BETWEEN 61 AND 90 THEN i.total_kobo - i.paid_kobo ELSE 0 END)::bigint AS b60,
       SUM(CASE WHEN CURRENT_DATE - i.issued_on > 90 THEN i.total_kobo - i.paid_kobo ELSE 0 END)::bigint AS b90,
       SUM(i.total_kobo - i.paid_kobo)::bigint AS total
     FROM invoices i JOIN matters m ON m.id = i.matter_id JOIN clients c ON c.id = i.client_id LEFT JOIN users p ON p.id = m.responsible_partner
     WHERE i.status IN ('issued','part_paid') AND ${matterAccessSql(u)}
     GROUP BY c.id, c.name ORDER BY total DESC`,
    [u.id]);
}

export async function billingSummary(u: Actor, from: string, to: string) {
  const access = matterAccessSql(u);
  return one<{ billed: number; collected: number; outstanding: number; overdue: number; wip_fees: number; wip_expenses: number; minutes: number; billable_minutes: number }>(
    `SELECT
       (SELECT COALESCE(SUM(i.total_kobo), 0) FROM invoices i JOIN matters m ON m.id = i.matter_id WHERE i.status NOT IN ('draft','void') AND i.issued_on BETWEEN $2 AND $3 AND ${access})::bigint AS billed,
       (SELECT COALESCE(SUM(p.amount_kobo), 0) FROM payments p JOIN invoices i ON i.id = p.invoice_id JOIN matters m ON m.id = i.matter_id WHERE p.reversed_at IS NULL AND p.received_on BETWEEN $2 AND $3 AND ${access})::bigint AS collected,
       (SELECT COALESCE(SUM(i.total_kobo - i.paid_kobo), 0) FROM invoices i JOIN matters m ON m.id = i.matter_id WHERE i.status IN ('issued','part_paid') AND ${access})::bigint AS outstanding,
       (SELECT COALESCE(SUM(i.total_kobo - i.paid_kobo), 0) FROM invoices i JOIN matters m ON m.id = i.matter_id WHERE i.status IN ('issued','part_paid') AND i.due_on < CURRENT_DATE AND ${access})::bigint AS overdue,
       (SELECT COALESCE(SUM(ROUND(t.minutes * t.rate_kobo / 60.0)), 0) FROM time_entries t JOIN matters m ON m.id = t.matter_id WHERE t.billable AND t.invoice_id IS NULL AND t.deleted_at IS NULL AND ${access})::bigint AS wip_fees,
       (SELECT COALESCE(SUM(e.amount_kobo), 0) FROM expenses e JOIN matters m ON m.id = e.matter_id WHERE e.billable AND e.invoice_id IS NULL AND e.deleted_at IS NULL AND ${access})::bigint AS wip_expenses,
       (SELECT COALESCE(SUM(t.minutes), 0) FROM time_entries t JOIN matters m ON m.id = t.matter_id WHERE t.deleted_at IS NULL AND t.worked_on BETWEEN $2 AND $3 AND ${access})::int AS minutes,
       (SELECT COALESCE(SUM(t.minutes), 0) FROM time_entries t JOIN matters m ON m.id = t.matter_id WHERE t.deleted_at IS NULL AND t.billable AND t.worked_on BETWEEN $2 AND $3 AND ${access})::int AS billable_minutes`,
    [u.id, from, to]);
}

/** Hours recorded per person in a period (partners' view). */
export async function timeByPerson(from: string, to: string) {
  return q<{ user_id: string; full_name: string; minutes: number; billable: number; value: number }>(
    `SELECT u.id AS user_id, u.full_name, COALESCE(SUM(t.minutes), 0)::int AS minutes,
            COALESCE(SUM(CASE WHEN t.billable THEN t.minutes ELSE 0 END), 0)::int AS billable,
            COALESCE(SUM(CASE WHEN t.billable THEN ROUND(t.minutes * t.rate_kobo / 60.0) ELSE 0 END), 0)::bigint AS value
     FROM users u LEFT JOIN time_entries t ON t.user_id = u.id AND t.deleted_at IS NULL AND t.worked_on BETWEEN $1 AND $2
     WHERE u.active AND u.role <> 'front_desk' GROUP BY u.id, u.full_name ORDER BY minutes DESC`,
    [from, to]);
}

// ── Online payments ──────────────────────────────────────────────
/**
 * Record a Paystack payment once it is verified with Paystack. Safe to call
 * twice for the same reference (callback and webhook both arrive): the
 * unique provider_ref means the second call records nothing.
 */
export async function settlePaystack(reference: string): Promise<{ ok: boolean; invoiceId?: string; already?: boolean; message?: string }> {
  const { verifyPayment, invoiceIdFromReference } = await import("./paystack");
  const { tx } = await import("./db");
  const { audit } = await import("./audit");
  const invoiceId = invoiceIdFromReference(reference);
  if (!invoiceId) return { ok: false, message: "Unknown reference" };
  const v = await verifyPayment(reference);
  if (v.status !== "success" || v.currency !== "NGN" || !(v.amount > 0)) return { ok: false, invoiceId, message: `Payment ${v.status}` };
  return tx(async (t) => {
    const seen = (await t.query("SELECT 1 FROM payments WHERE provider_ref = $1", [reference])).rows.length;
    if (seen) return { ok: true, invoiceId, already: true };
    const inv = (await t.query<{ id: string; status: string; number: string; matter_id: string }>("SELECT id, status, number, matter_id FROM invoices WHERE id = $1 FOR UPDATE", [invoiceId])).rows[0];
    if (!inv || inv.status === "draft") return { ok: false, invoiceId, message: "Invoice not found" };
    await applyPayment(t, inv.id, { amountKobo: v.amount, receivedOn: (v.paid_at || new Date().toISOString()).slice(0, 10), method: "paystack", reference: v.channel ? `Paystack (${v.channel})` : "Paystack", providerRef: reference });
    await audit({ actor: "system:paystack", action: "invoice.paid_online", entityType: "invoice", entityId: inv.id, matterId: inv.matter_id, detail: { number: inv.number, amount_kobo: v.amount, reference } }, t);
    return { ok: true, invoiceId };
  });
}
