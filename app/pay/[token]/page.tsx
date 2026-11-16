import { notFound } from "next/navigation";
import { CreditCard, Lock } from "lucide-react";
import { one } from "@/lib/portal/db";
import { billingSettings, invoiceLines } from "@/lib/portal/billing";
import { paystackEnabled } from "@/lib/portal/paystack";
import { naira } from "@/lib/portal/money";
import { InvoiceDocument, type InvoiceDocData } from "@/components/portal/InvoiceDocument";
import { PrintButton } from "@/components/portal/CopyButton";
import { payInvoice } from "./actions";

export const dynamic = "force-dynamic";

/** Public invoice page reached from the payment link. The long random token is the only key. */
async function invoiceByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  return one<InvoiceDocData & { id: string; matter_id: string }>(
    `SELECT i.id, i.matter_id, i.number, i.status, i.issued_on, i.due_on, i.vat_rate_bp, i.subtotal_kobo, i.vat_kobo, i.total_kobo, i.paid_kobo, i.notes,
            c.name AS client_name, c.address AS client_address, m.number AS matter_number, m.title AS matter_title
     FROM invoices i JOIN clients c ON c.id = i.client_id JOIN matters m ON m.id = i.matter_id
     WHERE i.pay_token = $1 AND i.status <> 'draft'`, [token]);
}

export default async function PayPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ e?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const inv = await invoiceByToken(token);
  if (!inv) notFound();
  const [lines, s] = await Promise.all([invoiceLines(inv.id), billingSettings()]);
  const due = Number(inv.total_kobo) - Number(inv.paid_kobo);
  const payable = ["issued", "part_paid"].includes(inv.status) && due > 0;
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {payable && (
        <div className="rounded-2xl bg-gradient-to-r from-maroon-dark to-maroon p-6 text-white shadow-lg print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-gold">Amount due</div>
              <div className="font-serif text-4xl">{naira(due)}</div>
              <div className="text-sm text-white/70">Invoice {inv.number}</div>
            </div>
            {paystackEnabled() ? (
              <form action={payInvoice} className="flex w-full flex-col gap-2 sm:w-auto">
                <input type="hidden" name="token" value={token} />
                <input name="email" type="email" required placeholder="Your email, for the receipt" className="rounded-lg border border-white/20 bg-white/10 px-3 py-2.5 text-sm text-white placeholder:text-white/50 focus:border-gold focus:outline-none sm:w-72" />
                <button className="inline-flex items-center justify-center gap-2 rounded-lg bg-gold px-5 py-3 font-semibold text-maroon-dark hover:brightness-95"><CreditCard className="h-4 w-4" />Pay securely</button>
                {sp.e && <span className="text-sm text-gold">The payment could not be started. Please try again, or pay by bank transfer.</span>}
              </form>
            ) : (
              <div className="max-w-sm text-sm text-white/80">Please pay by bank transfer using the details at the foot of the invoice, quoting <strong className="text-white">{inv.number}</strong>.</div>
            )}
          </div>
          {paystackEnabled() && <p className="mt-4 flex items-center gap-1.5 text-xs text-white/60"><Lock className="h-3 w-3" />Card, bank transfer or USSD through Paystack. Your card details never reach us.</p>}
        </div>
      )}
      {inv.status === "paid" && <div className="rounded-2xl border border-green/20 bg-green/5 p-5 text-center font-semibold text-green print:hidden">This invoice is paid in full. Thank you.</div>}
      <InvoiceDocument inv={inv} lines={lines} settings={{ bank: s["billing.bank"], tin: s["billing.tin"], footer: s["billing.footer"] }} />
      <div className="flex justify-center print:hidden"><PrintButton label="Print or save as PDF" /></div>
    </div>
  );
}
