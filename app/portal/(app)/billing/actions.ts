"use server";

import { redirect } from "next/navigation";
import { one, q, tx } from "@/lib/portal/db";
import { audit } from "@/lib/portal/audit";
import { requirePermission } from "@/lib/portal/auth";
import { can } from "@/lib/portal/permissions";
import { dateField, isUuid, oneOf, str, today } from "@/lib/portal/format";
import { amountField, BILLING_TYPES, EXPENSE_KINDS, naira, parseDuration, PAYMENT_METHODS } from "@/lib/portal/money";
import {
  applyPayment, billingMatter, BILLING_SETTINGS, createDraftInvoice, issueInvoice, loadInvoice, recalcInvoice, refreshPaid, releaseInvoiceEntries,
  clientAccountBalance, type BillingSettingKey,
} from "@/lib/portal/billing";

const back = (fd: FormData, fallback: string) => {
  const b = String(fd.get("back") || "");
  return b.startsWith("/portal/") ? b : fallback;
};
const withMsg = (url: string, msg: string) => `${url}${url.includes("?") ? "&" : "?"}msg=${msg}`;

// ── Time ─────────────────────────────────────────────────────────
export async function addTime(fd: FormData) {
  const u = await requirePermission("billing.record_time");
  const to = back(fd, "/portal/billing");
  const m = isUuid(fd.get("matter_id")) ? await billingMatter(u, String(fd.get("matter_id"))) : null;
  const minutes = parseDuration(fd.get("duration"));
  const description = str(fd, "description", 1000);
  if (!m) redirect(withMsg(to, "denied"));
  if (!minutes || minutes > 1440 || !description) redirect(withMsg(to, "time_invalid"));
  const rate = await one<{ hourly_rate_kobo: number | null }>("SELECT hourly_rate_kobo FROM users WHERE id = $1", [u.id]);
  const id = crypto.randomUUID();
  await tx(async (t) => {
    await t.query("INSERT INTO time_entries (id, matter_id, user_id, worked_on, minutes, description, rate_kobo, billable, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$3)",
      [id, m.id, u.id, dateField(fd, "worked_on") || today(), minutes, description, m.billing_type === "pro_bono" ? 0 : Number(rate?.hourly_rate_kobo || 0), fd.get("billable") !== "0" && m.billing_type !== "pro_bono"]);
    await audit({ userId: u.id, actor: u.email, action: "time.recorded", entityType: "time_entry", entityId: id, matterId: m.id, detail: { minutes } }, t);
  });
  redirect(withMsg(to, "time_saved"));
}

export async function deleteTime(fd: FormData) {
  const u = await requirePermission("billing.record_time");
  const to = back(fd, "/portal/billing");
  const id = String(fd.get("id") || "");
  const row = isUuid(id) ? await one<{ user_id: string; matter_id: string; invoice_id: string | null }>("SELECT user_id, matter_id, invoice_id FROM time_entries WHERE id = $1 AND deleted_at IS NULL", [id]) : null;
  if (!row || row.invoice_id || (row.user_id !== u.id && !can(u, "billing.manage")) || !(await billingMatter(u, row.matter_id))) redirect(withMsg(to, "denied"));
  await tx(async (t) => {
    await t.query("UPDATE time_entries SET deleted_at = now() WHERE id = $1", [id]);
    await audit({ userId: u.id, actor: u.email, action: "time.deleted", entityType: "time_entry", entityId: id, matterId: row.matter_id }, t);
  });
  redirect(withMsg(to, "removed"));
}

export async function startTimer(fd: FormData) {
  const u = await requirePermission("billing.record_time");
  const to = back(fd, "/portal/billing");
  const m = isUuid(fd.get("matter_id")) ? await billingMatter(u, String(fd.get("matter_id"))) : null;
  if (!m) redirect(withMsg(to, "denied"));
  await q("INSERT INTO timers (user_id, matter_id, description, started_at) VALUES ($1,$2,$3,now()) ON CONFLICT (user_id) DO UPDATE SET matter_id = $2, description = $3, started_at = now()",
    [u.id, m.id, str(fd, "description", 500)]);
  redirect(withMsg(to, "timer_started"));
}

/** Stop the running timer and turn it into a time entry (rounded up to 6 minutes, the usual unit). */
export async function stopTimer(fd: FormData) {
  const u = await requirePermission("billing.record_time");
  const to = back(fd, "/portal/billing");
  const t0 = await one<{ matter_id: string; description: string | null; started_at: string; elapsed: number }>(
    "SELECT matter_id, description, started_at, EXTRACT(EPOCH FROM now() - started_at)::int AS elapsed FROM timers WHERE user_id = $1", [u.id]);
  if (!t0) redirect(to);
  await q("DELETE FROM timers WHERE user_id = $1", [u.id]);
  if (fd.get("discard") === "1") redirect(withMsg(to, "timer_discarded"));
  const m = await billingMatter(u, t0.matter_id);
  if (!m) redirect(withMsg(to, "denied"));
  const minutes = Math.min(1440, Math.max(6, Math.ceil(Number(t0.elapsed) / 360) * 6));
  const rate = await one<{ hourly_rate_kobo: number | null }>("SELECT hourly_rate_kobo FROM users WHERE id = $1", [u.id]);
  const id = crypto.randomUUID();
  const description = str(fd, "description", 1000) || t0.description || "Work on the matter";
  await tx(async (t) => {
    await t.query("INSERT INTO time_entries (id, matter_id, user_id, worked_on, minutes, description, rate_kobo, billable, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$3)",
      [id, m.id, u.id, today(), minutes, description, m.billing_type === "pro_bono" ? 0 : Number(rate?.hourly_rate_kobo || 0), m.billing_type !== "pro_bono"]);
    await audit({ userId: u.id, actor: u.email, action: "time.recorded", entityType: "time_entry", entityId: id, matterId: m.id, detail: { minutes, timer: true } }, t);
  });
  redirect(withMsg(to, "time_saved"));
}

// ── Disbursements ────────────────────────────────────────────────
export async function addExpense(fd: FormData) {
  const u = await requirePermission("billing.record_time");
  const to = back(fd, "/portal/billing");
  const m = isUuid(fd.get("matter_id")) ? await billingMatter(u, String(fd.get("matter_id"))) : null;
  const amount = amountField(fd, "amount");
  const description = str(fd, "description", 500);
  if (!m) redirect(withMsg(to, "denied"));
  if (!amount || !description) redirect(withMsg(to, "invalid"));
  const id = crypto.randomUUID();
  await tx(async (t) => {
    await t.query("INSERT INTO expenses (id, matter_id, incurred_on, kind, description, amount_kobo, billable, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
      [id, m.id, dateField(fd, "incurred_on") || today(), oneOf(fd, "kind", EXPENSE_KINDS, "other"), description, amount, fd.get("billable") !== "0", u.id]);
    await audit({ userId: u.id, actor: u.email, action: "expense.recorded", entityType: "expense", entityId: id, matterId: m.id, detail: { amount_kobo: amount } }, t);
  });
  redirect(withMsg(to, "saved"));
}

export async function deleteExpense(fd: FormData) {
  const u = await requirePermission("billing.record_time");
  const to = back(fd, "/portal/billing");
  const id = String(fd.get("id") || "");
  const row = isUuid(id) ? await one<{ created_by: string; matter_id: string; invoice_id: string | null }>("SELECT created_by, matter_id, invoice_id FROM expenses WHERE id = $1 AND deleted_at IS NULL", [id]) : null;
  if (!row || row.invoice_id || (row.created_by !== u.id && !can(u, "billing.manage")) || !(await billingMatter(u, row.matter_id))) redirect(withMsg(to, "denied"));
  await tx(async (t) => {
    await t.query("UPDATE expenses SET deleted_at = now() WHERE id = $1", [id]);
    await audit({ userId: u.id, actor: u.email, action: "expense.deleted", entityType: "expense", entityId: id, matterId: row.matter_id }, t);
  });
  redirect(withMsg(to, "removed"));
}

// ── Matter billing terms ─────────────────────────────────────────
export async function saveMatterBilling(fd: FormData) {
  const u = await requirePermission("billing.draft");
  const to = back(fd, "/portal/matters");
  const m = isUuid(fd.get("matter_id")) ? await billingMatter(u, String(fd.get("matter_id"))) : null;
  if (!m) redirect(withMsg(to, "denied"));
  const raw = String(fd.get("agreed_fee") || "").trim();
  const fee = raw ? amountField(fd, "agreed_fee") : null;
  if (raw && fee === null) redirect(withMsg(to, "invalid"));
  await tx(async (t) => {
    await t.query("UPDATE matters SET billing_type = $2, agreed_fee_kobo = $3, billing_note = $4, updated_at = now() WHERE id = $1",
      [m.id, oneOf(fd, "billing_type", BILLING_TYPES, "hourly"), fee, str(fd, "billing_note", 1000)]);
    await audit({ userId: u.id, actor: u.email, action: "matter.billing_terms_set", entityType: "matter", entityId: m.id, matterId: m.id }, t);
  });
  redirect(withMsg(to, "saved"));
}

// ── Invoices ─────────────────────────────────────────────────────
export async function draftInvoice(fd: FormData) {
  const u = await requirePermission("billing.draft");
  const to = back(fd, "/portal/billing");
  const m = isUuid(fd.get("matter_id")) ? await billingMatter(u, String(fd.get("matter_id"))) : null;
  if (!m) redirect(withMsg(to, "denied"));
  const rawFee = String(fd.get("fee") || "").trim();
  const fee = rawFee ? amountField(fd, "fee") : null;
  if (rawFee && fee === null) redirect(withMsg(to, "invalid"));
  const upTo = dateField(fd, "up_to") || today();
  const id = await tx(async (t) => {
    const nid = await createDraftInvoice(t, u, m, { upTo, includeTime: fd.get("include_time") === "1", includeExpenses: fd.get("include_expenses") === "1", feeKobo: fee, feeText: str(fd, "fee_text", 300), notes: str(fd, "notes", 2000) });
    await audit({ userId: u.id, actor: u.email, action: "invoice.drafted", entityType: "invoice", entityId: nid, matterId: m.id }, t);
    return nid;
  });
  redirect(`/portal/billing/invoices/${id}?msg=created`);
}

async function invoiceFor(fd: FormData, { draftOnly = false } = {}) {
  const u = await requirePermission("billing.draft");
  const id = String(fd.get("id") || "");
  const inv = isUuid(id) ? await loadInvoice(u, id) : null;
  if (!inv) redirect("/portal/billing?msg=denied");
  if (draftOnly && inv.status !== "draft") redirect(`/portal/billing/invoices/${inv.id}?msg=not_draft`);
  return { u, inv, url: `/portal/billing/invoices/${inv.id}` };
}

export async function addInvoiceLine(fd: FormData) {
  const { u, inv, url } = await invoiceFor(fd, { draftOnly: true });
  const amount = amountField(fd, "amount");
  const description = str(fd, "description", 500);
  if (!amount || !description) redirect(withMsg(url, "invalid"));
  const kind = fd.get("kind") === "expense" ? "expense" : "fee";
  await tx(async (t) => {
    const pos = (await t.query<{ n: number }>("SELECT COALESCE(MAX(position), -1) + 1 AS n FROM invoice_lines WHERE invoice_id = $1", [inv.id])).rows[0].n;
    await t.query("INSERT INTO invoice_lines (id, invoice_id, position, kind, description, quantity, unit_kobo, amount_kobo, vatable) VALUES ($1,$2,$3,$4,$5,1,$6,$6,$7)",
      [crypto.randomUUID(), inv.id, pos, kind, description, amount, kind === "fee"]);
    await recalcInvoice(t, inv.id);
    await audit({ userId: u.id, actor: u.email, action: "invoice.line_added", entityType: "invoice", entityId: inv.id, matterId: inv.matter_id }, t);
  });
  redirect(withMsg(url, "saved"));
}

export async function removeInvoiceLine(fd: FormData) {
  const { u, inv, url } = await invoiceFor(fd, { draftOnly: true });
  const lineId = String(fd.get("line_id") || "");
  await tx(async (t) => {
    const line = (await t.query<{ kind: string; source_id: string | null }>("SELECT kind, source_id FROM invoice_lines WHERE id = $1 AND invoice_id = $2", [lineId, inv.id])).rows[0];
    if (!line) return;
    if (line.source_id && line.kind === "time") await t.query("UPDATE time_entries SET invoice_id = NULL WHERE id = $1", [line.source_id]);
    if (line.source_id && line.kind === "expense") await t.query("UPDATE expenses SET invoice_id = NULL WHERE id = $1", [line.source_id]);
    await t.query("DELETE FROM invoice_lines WHERE id = $1", [lineId]);
    await recalcInvoice(t, inv.id);
    await audit({ userId: u.id, actor: u.email, action: "invoice.line_removed", entityType: "invoice", entityId: inv.id, matterId: inv.matter_id }, t);
  });
  redirect(withMsg(url, "saved"));
}

export async function saveInvoiceNotes(fd: FormData) {
  const { u, inv, url } = await invoiceFor(fd, { draftOnly: true });
  await q("UPDATE invoices SET notes = $2 WHERE id = $1", [inv.id, str(fd, "notes", 2000)]);
  await audit({ userId: u.id, actor: u.email, action: "invoice.notes_changed", entityType: "invoice", entityId: inv.id, matterId: inv.matter_id });
  redirect(withMsg(url, "saved"));
}

export async function deleteDraft(fd: FormData) {
  const { u, inv } = await invoiceFor(fd, { draftOnly: true });
  await tx(async (t) => {
    await releaseInvoiceEntries(t, inv.id);
    await t.query("DELETE FROM invoice_lines WHERE invoice_id = $1", [inv.id]);
    await t.query("DELETE FROM invoices WHERE id = $1 AND status = 'draft'", [inv.id]);
    await audit({ userId: u.id, actor: u.email, action: "invoice.draft_deleted", entityType: "invoice", entityId: inv.id, matterId: inv.matter_id }, t);
  });
  redirect(`/portal/matters/${inv.matter_id}?tab=billing&msg=removed`);
}

export async function issue(fd: FormData) {
  const { inv, url } = await invoiceFor(fd, { draftOnly: true });
  const u = await requirePermission("billing.manage");
  if (Number(inv.total_kobo) <= 0) redirect(withMsg(url, "invoice_empty"));
  const days = Number(fd.get("due_days"));
  await tx(async (t) => {
    const number = await issueInvoice(t, inv.id, u.id, Number.isInteger(days) && days >= 0 && days <= 120 ? days : undefined);
    await t.query("INSERT INTO matter_notes (id, matter_id, kind, body, created_by) VALUES ($1,$2,'system',$3,$4)",
      [crypto.randomUUID(), inv.matter_id, `Invoice ${number} issued for ${naira(inv.total_kobo)}`, u.id]);
    await audit({ userId: u.id, actor: u.email, action: "invoice.issued", entityType: "invoice", entityId: inv.id, matterId: inv.matter_id, detail: { number, total_kobo: inv.total_kobo } }, t);
  });
  redirect(withMsg(url, "invoice_issued"));
}

export async function recordPayment(fd: FormData) {
  const { inv, url } = await invoiceFor(fd);
  const u = await requirePermission("billing.manage");
  const amount = amountField(fd, "amount");
  const on = dateField(fd, "received_on") || today();
  if (!["issued", "part_paid"].includes(inv.status) || !amount || amount > Number(inv.total_kobo) - Number(inv.paid_kobo)) redirect(withMsg(url, "payment_invalid"));
  const method = oneOf(fd, "method", PAYMENT_METHODS, "transfer");
  const fromClientAccount = fd.get("from_client_account") === "1";
  await tx(async (t) => {
    if (fromClientAccount) {
      // Transfer from money held for the client to pay this bill: the client account must hold enough for this matter
      const bal = Number((await t.query<{ bal: number }>("SELECT COALESCE(SUM(amount_kobo),0)::bigint AS bal FROM client_ledger WHERE client_id = $1 AND matter_id = $2", [inv.client_id, inv.matter_id])).rows[0].bal);
      if (bal < amount) throw new Error("insufficient");
      await t.query("INSERT INTO client_ledger (id, client_id, matter_id, entry_on, kind, amount_kobo, description, reference, invoice_id, created_by) VALUES ($1,$2,$3,$4,'to_office',$5,$6,$7,$8,$9)",
        [crypto.randomUUID(), inv.client_id, inv.matter_id, on, -amount, `Transfer to office account for invoice ${inv.number}`, inv.number, inv.id, u.id]);
    }
    const pid = await applyPayment(t, inv.id, { amountKobo: amount, receivedOn: on, method: fromClientAccount ? "other" : method, reference: fromClientAccount ? "From client account" : str(fd, "reference", 120), userId: u.id });
    await audit({ userId: u.id, actor: u.email, action: "invoice.payment_recorded", entityType: "invoice", entityId: inv.id, matterId: inv.matter_id, detail: { payment: pid, amount_kobo: amount, method, client_account: fromClientAccount } }, t);
  }).catch((e: Error) => {
    if (e.message === "insufficient") redirect(withMsg(url, "client_account_short"));
    throw e;
  });
  redirect(withMsg(url, "payment_recorded"));
}

export async function reversePayment(fd: FormData) {
  const { inv, url } = await invoiceFor(fd);
  const u = await requirePermission("billing.manage");
  const pid = String(fd.get("payment_id") || "");
  await tx(async (t) => {
    const r = await t.query("UPDATE payments SET reversed_at = now(), reversed_by = $3 WHERE id = $1 AND invoice_id = $2 AND reversed_at IS NULL RETURNING id", [pid, inv.id, u.id]);
    if (!r.rows.length) return;
    await refreshPaid(t, inv.id);
    await audit({ userId: u.id, actor: u.email, action: "invoice.payment_reversed", entityType: "invoice", entityId: inv.id, matterId: inv.matter_id, detail: { payment: pid, reason: str(fd, "reason", 300) } }, t);
  });
  redirect(withMsg(url, "saved"));
}

export async function voidInvoice(fd: FormData) {
  const { inv, url } = await invoiceFor(fd);
  const u = await requirePermission("billing.manage");
  const reason = str(fd, "reason", 300);
  if (!reason || !["issued", "part_paid"].includes(inv.status) || Number(inv.paid_kobo) > 0) redirect(withMsg(url, "void_invalid"));
  await tx(async (t) => {
    await releaseInvoiceEntries(t, inv.id);
    await t.query("UPDATE invoices SET status = 'void', voided_at = now(), voided_by = $2, void_reason = $3 WHERE id = $1", [inv.id, u.id, reason]);
    await audit({ userId: u.id, actor: u.email, action: "invoice.voided", entityType: "invoice", entityId: inv.id, matterId: inv.matter_id, detail: { number: inv.number, reason } }, t);
  });
  redirect(withMsg(url, "saved"));
}

// ── Client account ───────────────────────────────────────────────
export async function addLedgerEntry(fd: FormData) {
  const u = await requirePermission("billing.manage");
  const clientId = String(fd.get("client_id") || "");
  const to = `/portal/billing/client-account/${clientId}`;
  if (!isUuid(clientId) || !(await one("SELECT 1 FROM clients WHERE id = $1", [clientId]))) redirect("/portal/billing?msg=denied");
  const matterId = String(fd.get("matter_id") || "");
  const m = isUuid(matterId) ? await billingMatter(u, matterId) : null;
  if (!m || m.client_id !== clientId) redirect(withMsg(to, "invalid"));
  const amount = amountField(fd, "amount");
  const kind = fd.get("kind") === "payment" ? "payment" : "receipt";
  const description = str(fd, "description", 300);
  if (!amount || !description) redirect(withMsg(to, "invalid"));
  // Never pay out more than is held for that matter
  if (kind === "payment" && (await clientAccountBalance(clientId, m.id)) < amount) redirect(withMsg(to, "client_account_short"));
  const id = crypto.randomUUID();
  await tx(async (t) => {
    await t.query("INSERT INTO client_ledger (id, client_id, matter_id, entry_on, kind, amount_kobo, description, reference, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [id, clientId, m.id, dateField(fd, "entry_on") || today(), kind, kind === "payment" ? -amount : amount, description, str(fd, "reference", 120), u.id]);
    await audit({ userId: u.id, actor: u.email, action: `client_account.${kind}`, entityType: "client", entityId: clientId, matterId: m.id, detail: { amount_kobo: amount, entry: id } }, t);
  });
  redirect(withMsg(to, "saved"));
}

export async function reverseLedgerEntry(fd: FormData) {
  const u = await requirePermission("billing.manage");
  const id = String(fd.get("id") || "");
  const e = isUuid(id) ? await one<{ client_id: string; matter_id: string | null; amount_kobo: number; kind: string; description: string }>("SELECT client_id, matter_id, amount_kobo, kind, description FROM client_ledger WHERE id = $1", [id]) : null;
  if (!e || e.kind === "reversal" || e.kind === "to_office") redirect("/portal/billing?msg=denied");
  const to = `/portal/billing/client-account/${e.client_id}`;
  if (await one("SELECT 1 FROM client_ledger WHERE kind = 'reversal' AND reference = $1", [id])) redirect(withMsg(to, "already_reversed"));
  // Reversing a receipt must not take the matter below zero
  if (Number(e.amount_kobo) > 0 && (await clientAccountBalance(e.client_id, e.matter_id)) < Number(e.amount_kobo)) redirect(withMsg(to, "client_account_short"));
  await tx(async (t) => {
    await t.query("INSERT INTO client_ledger (id, client_id, matter_id, entry_on, kind, amount_kobo, description, reference, created_by) VALUES ($1,$2,$3,$4,'reversal',$5,$6,$7,$8)",
      [crypto.randomUUID(), e.client_id, e.matter_id, today(), -Number(e.amount_kobo), `Reversal: ${e.description}`, id, u.id]);
    await audit({ userId: u.id, actor: u.email, action: "client_account.reversal", entityType: "client", entityId: e.client_id, matterId: e.matter_id, detail: { entry: id } }, t);
  });
  redirect(withMsg(to, "saved"));
}

// ── Settings and rates (admin) ───────────────────────────────────
export async function saveBillingSettings(fd: FormData) {
  const u = await requirePermission("billing.settings");
  await tx(async (t) => {
    for (const key of Object.keys(BILLING_SETTINGS) as BillingSettingKey[]) {
      const v = String(fd.get(key) ?? "").trim().slice(0, 1000);
      await t.query("INSERT INTO settings (key, value, updated_by) VALUES ($1,$2,$3) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now(), updated_by = $3", [key, v, u.id]);
    }
    for (const [k, v] of fd.entries()) {
      if (!k.startsWith("rate_") || !isUuid(k.slice(5))) continue;
      const raw = String(v).trim();
      const kobo = raw ? amountField(fd, k) : null;
      if (raw && kobo === null) continue;
      await t.query("UPDATE users SET hourly_rate_kobo = $2 WHERE id = $1", [k.slice(5), kobo]);
    }
    await audit({ userId: u.id, actor: u.email, action: "billing.settings_changed" }, t);
  });
  redirect("/portal/billing/settings?msg=saved");
}
