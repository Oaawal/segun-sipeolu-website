import Link from "next/link";
import { notFound } from "next/navigation";
import { Ban, Download, Link2, Mail, Send, Trash2, Undo2 } from "lucide-react";
import { requirePermission } from "@/lib/portal/auth";
import { can } from "@/lib/portal/permissions";
import { billingSettings, clientAccountBalance, invoiceLines, invoicePayments, loadInvoice } from "@/lib/portal/billing";
import { fmtDateTime, fmtDay, isUuid, today } from "@/lib/portal/format";
import { INVOICE_STATUS, naira, PAYMENT_METHODS } from "@/lib/portal/money";
import { paystackEnabled } from "@/lib/portal/paystack";
import { emailEnabled } from "@/lib/portal/notify";
import { siteUrl } from "@/lib/portal/client-mail";
import { audit } from "@/lib/portal/audit";
import { Badge, Card, Check, Field, Flash, Note, PageHeader, Row, Select, TextArea, btn } from "@/components/portal/ui";
import { InvoiceDocument } from "@/components/portal/InvoiceDocument";
import { CopyButton, PrintButton } from "@/components/portal/CopyButton";
import { addInvoiceLine, deleteDraft, issue, recordPayment, removeInvoiceLine, reversePayment, saveInvoiceNotes, sendInvoice, voidInvoice } from "../../actions";

export const metadata = { title: "Invoice" };

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string }> }) {
  const u = await requirePermission("billing.draft");
  const { id } = await params;
  const sp = await searchParams;
  if (!isUuid(id)) notFound();
  const inv = await loadInvoice(u, id);
  if (!inv) notFound();
  const [lines, payments, settings] = await Promise.all([invoiceLines(inv.id), invoicePayments(inv.id), billingSettings()]);
  await audit({ userId: u.id, actor: u.email, action: "invoice.viewed", entityType: "invoice", entityId: inv.id, matterId: inv.matter_id });
  const manage = can(u, "billing.manage");
  const open = ["issued", "part_paid"].includes(inv.status);
  const due = Number(inv.total_kobo) - Number(inv.paid_kobo);
  const payUrl = inv.pay_token ? `${siteUrl()}/pay/${inv.pay_token}` : null;
  const held = manage && open ? await clientAccountBalance(inv.client_id, inv.matter_id) : 0;
  const [label, tone] = INVOICE_STATUS[inv.status] || [inv.status, "grey"];
  const overdue = open && inv.due_on && inv.due_on < today();

  return (
    <>
      <div className="print:hidden">
        <PageHeader back={{ href: `/portal/matters/${inv.matter_id}?tab=billing`, label: inv.matter_number }}
          title={<span className="flex flex-wrap items-center gap-3">{inv.number || "Draft invoice"}<Badge tone={overdue ? "red" : tone}>{overdue ? "Overdue" : label}</Badge></span>}
          sub={`${inv.client_name} · ${inv.matter_title}`}
          actions={<>
            <a href={`/portal/api/export/invoice/${inv.id}`} className={btn.ghost}><Download className="h-4 w-4" />Word</a>
            <PrintButton />
          </>} />
        <Flash msg={sp.msg} />
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <InvoiceDocument inv={inv} lines={lines} settings={{ bank: settings["billing.bank"], tin: settings["billing.tin"], footer: settings["billing.footer"] }} />
        <div className="space-y-6 print:hidden">
          {inv.status === "draft" && (
            <>
              <Card title="Lines" pad={false}>
                {lines.map((l) => (
                  <Row key={l.id}>
                    <div className="min-w-0 flex-1 truncate text-sm">{l.description}</div>
                    <div className="text-sm tabular-nums">{naira(l.amount_kobo)}</div>
                    <form action={removeInvoiceLine}><input type="hidden" name="id" value={inv.id} /><input type="hidden" name="line_id" value={l.id} /><button aria-label="Remove line" className="p-1 text-stone-300 hover:text-red-700"><Trash2 className="h-4 w-4" /></button></form>
                  </Row>
                ))}
                <form action={addInvoiceLine} className="space-y-3 border-t border-stone-100 p-5">
                  <input type="hidden" name="id" value={inv.id} />
                  <Field label="Description" name="description" required placeholder="e.g. Professional fees: perfection of title" />
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Amount (₦)" name="amount" required inputMode="decimal" />
                    <Select label="Kind" name="kind" options={{ fee: "Fee (VAT applies)", expense: "Disbursement (no VAT)" }} />
                  </div>
                  <button className={btn.ghost}>Add line</button>
                </form>
              </Card>
              <Card title="Note on the invoice">
                <form action={saveInvoiceNotes} className="space-y-3">
                  <input type="hidden" name="id" value={inv.id} />
                  <TextArea label="Shown to the client" name="notes" rows={3} defaultValue={inv.notes || ""} />
                  <button className={btn.ghost}>Save note</button>
                </form>
              </Card>
              {manage ? (
                <Card title="Issue">
                  <form action={issue} className="space-y-3">
                    <input type="hidden" name="id" value={inv.id} />
                    <Field label="Days to pay" name="due_days" type="number" min={0} max={120} defaultValue={settings["billing.terms_days"] || "14"} />
                    <button className={btn.primary}><Send className="h-4 w-4" />Issue invoice</button>
                    <p className="text-xs text-stone-500">Issuing gives the invoice its number and locks it. It can then only be cancelled (voided), never edited.</p>
                  </form>
                </Card>
              ) : <Note tone="info">A partner issues invoices. Tell the responsible partner this draft is ready.</Note>}
              <form action={deleteDraft}><input type="hidden" name="id" value={inv.id} /><button className={`${btn.danger} w-full`}><Trash2 className="h-4 w-4" />Delete draft</button></form>
            </>
          )}

          {open && manage && (
            <Card title="Get paid">
              {payUrl && (
                <div className="mb-4 space-y-2">
                  <div className="text-[13px] font-semibold text-stone-700">Payment link for the client</div>
                  <div className="flex gap-2"><input readOnly value={payUrl} className="min-w-0 flex-1 rounded-lg border border-stone-300 bg-stone-50 px-3 py-2 text-xs" /><CopyButton text={payUrl} /></div>
                  <p className="text-xs text-stone-500">{paystackEnabled() ? "The client sees the invoice and can pay by card, bank transfer or USSD (Paystack). Payments are recorded automatically." : "The client sees the invoice and your bank details. Add PAYSTACK_SECRET_KEY to take card payments."}</p>
                </div>
              )}
              <form action={sendInvoice} className="space-y-3 border-t border-stone-100 pt-4">
                <input type="hidden" name="id" value={inv.id} />
                <Field label="Email to" name="to" type="email" defaultValue={inv.billing_email || inv.client_email || ""} required />
                <Check name="reminder" label="Send as a payment reminder" defaultChecked={!!overdue} />
                <button className={btn.ghost} disabled={!emailEnabled()}><Mail className="h-4 w-4" />Email the invoice</button>
                {!emailEnabled() && <p className="text-xs text-stone-500">Email is not set up; copy the link above instead.</p>}
              </form>
            </Card>
          )}

          {open && manage && (
            <Card title="Record a payment">
              <form action={recordPayment} className="space-y-3">
                <input type="hidden" name="id" value={inv.id} />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Amount (₦)" name="amount" required inputMode="decimal" defaultValue={(due / 100).toFixed(2)} />
                  <Field label="Received on" name="received_on" type="date" defaultValue={today()} />
                </div>
                <Select label="How" name="method" options={PAYMENT_METHODS} defaultValue="transfer" />
                <Field label="Reference" name="reference" placeholder="Bank reference / cheque no." />
                {held > 0 && <Check name="from_client_account" label={<>Take from money held for this client on this matter ({naira(held)} held)</>} />}
                <button className={btn.primary}>Record payment</button>
              </form>
            </Card>
          )}

          {payments.length > 0 && (
            <Card title="Payments" pad={false}>
              {payments.map((p) => (
                <Row key={p.id}>
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm font-semibold tabular-nums ${p.reversed_at ? "text-stone-400 line-through" : ""}`}>{naira(p.amount_kobo)}</div>
                    <div className="text-xs text-stone-500">{fmtDay(p.received_on)} · {PAYMENT_METHODS[p.method as keyof typeof PAYMENT_METHODS] || p.method}{p.reference ? ` · ${p.reference}` : ""}{p.created_by_name ? ` · ${p.created_by_name}` : ""}</div>
                    {p.reversed_at && <div className="text-xs text-red-700">Reversed {fmtDateTime(p.reversed_at)}</div>}
                  </div>
                  {manage && !p.reversed_at && (
                    <form action={reversePayment}><input type="hidden" name="id" value={inv.id} /><input type="hidden" name="payment_id" value={p.id} /><button className={btn.small}><Undo2 className="h-3.5 w-3.5" />Reverse</button></form>
                  )}
                </Row>
              ))}
            </Card>
          )}

          {open && manage && Number(inv.paid_kobo) === 0 && (
            <Card title="Cancel this invoice">
              <form action={voidInvoice} className="space-y-3">
                <input type="hidden" name="id" value={inv.id} />
                <Field label="Reason" name="reason" required placeholder="e.g. Issued in error; replaced by a corrected invoice" />
                <button className={btn.danger}><Ban className="h-4 w-4" />Void invoice</button>
                <p className="text-xs text-stone-500">The number stays on record. Its time and disbursements become unbilled again.</p>
              </form>
            </Card>
          )}
          {inv.status === "void" && inv.void_reason && <Note tone="danger">Voided: {inv.void_reason}</Note>}
          <p className="text-xs text-stone-500"><Link2 className="mr-1 inline h-3 w-3" />Created by {inv.created_by_name || "—"} on {fmtDateTime(inv.created_at)}. <Link href={`/portal/billing/client-account/${inv.client_id}`} className="font-semibold text-maroon">Client account</Link></p>
        </div>
      </div>
    </>
  );
}

