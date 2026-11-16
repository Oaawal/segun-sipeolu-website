import Link from "next/link";
import { CheckCircle2, Clock } from "lucide-react";
import { settlePaystack } from "@/lib/portal/billing";
import { invoiceIdFromReference } from "@/lib/portal/paystack";
import { one } from "@/lib/portal/db";

export const dynamic = "force-dynamic";

/** Paystack sends the payer back here. The payment is checked with Paystack before anything is recorded. */
export default async function PayDone({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ reference?: string; trxref?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const reference = String(sp.reference || sp.trxref || "");
  const inv = /^[A-Za-z0-9_-]{20,64}$/.test(token) ? await one<{ id: string }>("SELECT id FROM invoices WHERE pay_token = $1", [token]) : null;
  let ok = false;
  if (inv && invoiceIdFromReference(reference) === inv.id) {
    try { ok = (await settlePaystack(reference)).ok; } catch { ok = false; }
  }
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-stone-200 bg-white p-8 text-center shadow-sm">
      {ok ? <CheckCircle2 className="mx-auto h-12 w-12 text-green" /> : <Clock className="mx-auto h-12 w-12 text-amber-600" />}
      <h1 className="mt-4 font-serif text-2xl text-maroon-dark">{ok ? "Thank you, payment received" : "We are confirming your payment"}</h1>
      <p className="mt-2 text-sm text-stone-600">{ok ? "Your payment has been recorded against the invoice. Paystack emails you a receipt." : "If you completed the payment, it will show on the invoice within a few minutes. You have not been charged twice."}</p>
      <Link href={`/pay/${token}`} className="mt-6 inline-block rounded-lg bg-maroon px-5 py-2.5 text-sm font-semibold text-white">Back to the invoice</Link>
    </div>
  );
}
